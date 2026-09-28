import { jobs } from '../infrastructure/jobs.js'
import { performCacheMaintenance } from '../helpers/ask.cache.helper.js'
import { db } from '../database/client.js'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {tmpdir} from 'node:os'
import {blobs} from '../infrastructure/blob-store.js'
let initialized=false
export class SchedulerService {
    async init(){
        if(initialized)return
        const boss=await jobs()
        await boss.schedule('maintenance','0 3 * * *',{}, {tz:'America/Sao_Paulo',singletonKey:'daily-maintenance'})
        await boss.work('maintenance',async()=>this.run())
        initialized=true
    }
    async run(){
        await performCacheMaintenance()
        await db.prepare("DELETE FROM transport_messages WHERE expires_at<now()").run()
        await db.prepare("UPDATE confirmations SET status='expired' WHERE status='pending' AND expires_at<now()").run()
        await db.prepare("DELETE FROM confirmations WHERE created_at<now()-interval '7 days'").run()
        await db.prepare('DELETE FROM admission_windows WHERE "window"<?').run(Math.floor(Date.now()/60_000)-1440)
        await db.prepare("UPDATE command_operations SET status=CASE WHEN effects_started THEN 'uncertain' ELSE 'expired' END,updated_at=now() WHERE status IN ('pending','running') AND expires_at<now()").run()
        await db.prepare("DELETE FROM audit_events WHERE created_at<now()-interval '30 days'").run()
        await db.prepare("UPDATE media_jobs SET status='expired',updated_at=now() WHERE status IN ('queued','running') AND expires_at<now()").run()
        await db.prepare("DELETE FROM media_jobs WHERE updated_at<now()-interval '7 days' AND status IN ('completed','failed','cancelled','expired')").run()
        await db.transaction(async()=>{
            const old="SELECT id FROM command_operations WHERE updated_at<now()-interval '30 days' AND status IN ('succeeded','failed','rejected','expired')"
            await db.prepare(`DELETE FROM outbox WHERE operation_id IN (${old})`).run()
            await db.prepare(`DELETE FROM inbox WHERE operation_id IN (${old})`).run()
            await db.prepare(`DELETE FROM command_operations WHERE id IN (${old})`).run()
        })
        await blobs.collectExpired()
        for(const dir of ['/tmp/lbot-whatsapp','/tmp/lbot-whatsapp-workers']){
            for(const file of await fs.readdir(dir).catch(()=>[])){
                const candidate=path.join(dir,file)
                const stat=await fs.stat(candidate).catch(()=>null)
                if(stat?.isFile()&&stat.mtimeMs<Date.now()-3600_000)await fs.unlink(candidate).catch(()=>{})
            }
        }
        for(const name of await fs.readdir(tmpdir())){
            if(!/^elysium-(?:download|probe|media)-[A-Za-z0-9]{6}$/.test(name))continue
            const candidate=path.join(tmpdir(),name),stat=await fs.lstat(candidate).catch(()=>null)
            if(stat?.isDirectory() && stat.uid===process.getuid?.() && stat.mtimeMs<Date.now()-3600_000)await fs.rm(candidate,{recursive:true,force:true})
        }
    }
}
