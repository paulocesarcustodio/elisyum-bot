import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {tmpdir} from 'node:os'
import {createTestDatabase} from './testing/database.js'
const root=path.resolve(import.meta.dir,'..')
const sandbox=await fs.mkdtemp(path.join(tmpdir(),'elysium-media-qa-'))
process.env.BLOB_STORAGE_PATH=path.join(sandbox,'blobs')
process.env.JOB_SUPERVISION_SECONDS='1'
const test=await createTestDatabase()
const {db}=await import('../src/database/client.js')
const {submitWork,cancelWork}=await import('../src/infrastructure/media-client.js')
const {stopJobs}=await import('../src/infrastructure/jobs.js')
const {runProcess}=await import('../src/infrastructure/subprocess.js')
const {blobs}=await import('../src/infrastructure/blob-store.js')
const {deleteAudio,renameAudio}=await import('../src/application/audio-library.js')
const children:Array<ReturnType<typeof Bun.spawn>>=[]
const workerEnv={...process.env,DATABASE_URL:test.roleUrl('worker'),ELYSIUM_ROLE:'media-worker',WORK_QUEUE:'media'}
const startWorker=()=>{const child=Bun.spawn([process.execPath,'src/workers/media.worker.ts'],{cwd:root,env:workerEnv,stdout:Bun.file(path.join(sandbox,'worker.log')),stderr:Bun.file(path.join(sandbox,'worker-error.log'))});children.push(child);return child}
async function waitFor(id:string,states=['completed','failed','cancelled','expired'],timeout=30_000){
 const deadline=Date.now()+timeout
 while(Date.now()<deadline){const row=await db.prepare('SELECT * FROM media_jobs WHERE id=?').get(id);if(states.includes(row.status))return row;await Bun.sleep(100)}
 throw new Error('Work timeout: '+id+' '+await fs.readFile(path.join(sandbox,'worker-error.log'),'utf8').catch(()=>''))
}
try{
 const fixture=path.join(sandbox,'input.wav')
 await runProcess('ffmpeg',['-f','lavfi','-i','sine=frequency=440:duration=1','-y',fixture])
 const buffer=await fs.readFile(fixture)
 const cancelled=await submitWork('audio.upload',['cancelled',buffer,false],'web:member')
 await cancelWork(cancelled,'web:member')
 const crash=await submitWork('audio.upload',['recovered',buffer,false],'web:member')
 await db.prepare("UPDATE pgboss.job SET expire_seconds=2 WHERE id=?").run(crash)
 const marker=path.join(sandbox,'claimed')
 const claimant=Bun.spawn([process.execPath,'scripts/testing/claim-job.ts',marker],{cwd:root,env:workerEnv,stdout:'ignore',stderr:Bun.file(path.join(sandbox,'claim-error.log'))});children.push(claimant)
 const claimedDeadline=Date.now()+10_000
 while(!await fs.access(marker).then(()=>true,()=>false) && Date.now()<claimedDeadline)await Bun.sleep(100)
 assert(await fs.access(marker).then(()=>true,()=>false),await fs.readFile(path.join(sandbox,'claim-error.log'),'utf8').catch(()=>''))
 assert.equal(await fs.readFile(marker,'utf8'),crash)
 claimant.kill('SIGKILL');await claimant.exited
 const retryDeadline=Date.now()+15_000
 while(Date.now()<retryDeadline){const row=await db.prepare('SELECT state FROM pgboss.job WHERE id=?').get(crash);if(row.state==='retry')break;await Bun.sleep(200)}
 assert.equal((await db.prepare('SELECT state FROM pgboss.job WHERE id=?').get(crash)).state,'retry')
 await db.prepare('UPDATE pgboss.job SET expire_seconds=120 WHERE id=?').run(crash)
 startWorker()
 assert.equal((await waitFor(crash)).status,'completed')
 assert.equal((await waitFor(cancelled)).status,'cancelled')
 console.log('PASS Accepted job survives a killed claimant; cancellation prevents publication')
 const invalid=await submitWork('audio.upload',['invalid',Buffer.from('not audio'),false],'web:member')
 assert.equal((await waitFor(invalid)).status,'failed')
 assert.equal(await db.prepare("SELECT id FROM saved_audios WHERE audio_name='invalid'").get(),undefined)
 console.log('PASS Invalid media fails without fake MP3 or library entry')
 const ids=await Promise.all(['same-a','same-b','duplicate','duplicate'].map(name=>submitWork('audio.upload',[name,buffer,false],'web:member')))
 const rows=await Promise.all(ids.map(id=>waitFor(id)))
 assert.equal(rows.filter(row=>row.status==='completed').length,3)
 assert.equal(rows.filter(row=>row.status==='failed').length,1)
 const entries=await db.prepare("SELECT blob_key FROM saved_audios WHERE audio_name IN ('same-a','same-b')").all()
 assert.equal(entries[0].blob_key,entries[1].blob_key)
 await assert.rejects(()=>deleteAudio('same-a',{id:'web:intruder'}),/permissão/)
 await deleteAudio('same-a',{id:'web:member'})
 assert((await blobs.read(entries[1].blob_key)).length>0)
 await renameAudio('same-b','renamed',{id:'web:admin',admin:true})
 assert.equal((await db.prepare("SELECT count(*) AS n FROM saved_audios WHERE audio_name='renamed'").get()).n,1)
 console.log('PASS Concurrent uploads enforce name uniqueness, ownership and shared immutable files')
 // Reserve all capacity without a worker claiming these jobs while checking admission.
 for(const child of children)if(child.exitCode===null){child.kill('SIGTERM');await child.exited}
 await db.prepare("INSERT INTO media_jobs(owner_id,operation,input,expires_at) SELECT 'qa','probe','[]',now()+interval '1 minute' FROM generate_series(1,24)").run()
 await assert.rejects(()=>submitWork('probe',[buffer],'qa'),/Fila.*cheia/)
 console.log('PASS Persistent queue capacity rejects excess work')
 console.log(JSON.stringify({suite:'media-worker',passed:4,sandbox}))
}finally{
 for(const child of children)if(child.exitCode===null){child.kill('SIGTERM');await child.exited}
 await stopJobs();await test.close()
}
process.exit(0)
