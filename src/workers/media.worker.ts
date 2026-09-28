import { promises as fs } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { db } from '../database/client.js'
import { jobs,stopJobs } from '../infrastructure/jobs.js'
import { pack,unpack } from '../infrastructure/media-client.js'
import { workSignal } from '../infrastructure/subprocess.js'
import { createJobProgress } from '../infrastructure/job-progress.js'
import { ffmpegPool,probeFile } from '../utils/worker-pool.util.js'
import { prepareAudio,persistAudio } from '../application/audio-library.js'
import type { Job } from 'pg-boss'
export async function handleWork(job:Job<{id:string;operationId?:string}>){
    const row=await db.prepare('SELECT * FROM media_jobs WHERE id=?').get(job.data.id)
    if(!row || ['completed','failed','cancelled','expired'].includes(row.status))return
    if(Date.parse(row.expires_at)<Date.now()){await db.prepare("UPDATE media_jobs SET status='expired',updated_at=now() WHERE id=?").run(row.id);return}
    const claim=await db.prepare("UPDATE media_jobs SET status='running',attempt=attempt+1,progress=0,updated_at=now() WHERE id=? AND status IN ('queued','running') AND expires_at>now() RETURNING attempt").get(row.id)
    if(!claim)return
    const progress=createJobProgress(row.id,claim.attempt)
    const controller=new AbortController()
    let checking=false
    const monitor=setInterval(async()=>{
        if(checking)return;checking=true
        try{
            const latest=await db.prepare('SELECT status,attempt FROM media_jobs WHERE id=?').get(row.id)
            if(!latest || latest.status!=='running' || latest.attempt!==claim.attempt || Date.parse(row.expires_at)<Date.now())controller.abort()
        }catch{controller.abort()}finally{checking=false}
    },500)
    const started=performance.now()
    try{
        const args=await unpack(row.input)
        const result=await workSignal.run(controller.signal,async()=>{
            if(row.operation==='ffmpeg')return ffmpegPool.exec({...args[0],onProgress:progress.report})
            if(row.operation==='ffmpeg.raw')return ffmpegPool.execRaw({...args[0],onProgress:progress.report})
            if(row.operation==='audio.upload')return prepareAudio(args[1])
            if(row.operation==='probe'){
                const directory=await fs.mkdtemp(path.join(tmpdir(),'elysium-probe-'))
                try{const file=path.join(directory,'input');await fs.writeFile(file,args[0]);return await probeFile(file)}finally{await fs.rm(directory,{recursive:true,force:true})}
            }
            if(row.operation.startsWith('download.')){
                const name=row.operation.slice(9)
                const module=await import('../utils/download.util.js')
                const allowed=new Set(['xMedia','tiktokMedia','facebookMedia','instagramMedia','pinterestMedia','downloadPinterestVideo','youtubeMedia','downloadFromUrl','downloadVideoFromUrl','downloadInstagramMedia','downloadInstagramImage','downloadYouTubeAudio','downloadYouTubeVideo'])
                if(!allowed.has(name))throw new Error('Download não permitido.')
                const reportsProgress=['downloadFromUrl','downloadVideoFromUrl','downloadPinterestVideo','downloadInstagramMedia','downloadYouTubeAudio','downloadYouTubeVideo'].includes(name)
                return (module as any)[name](...args,...(reportsProgress?[progress.report]:[]))
            }
            if(row.operation==='sticker.create')return (await import('../utils/sticker.util.js')).createSticker(args[0],args[1])
            if(row.operation==='sticker.image')return (await import('../utils/sticker.util.js')).stickerToImage(args[0])
            if(row.operation==='image.quote')return (await import('../utils/quote.util.js')).createWhatsAppBubble(args[0])
            if(row.operation==='video.profile')return (await import('../utils/video.util.js')).createProfileBubbleVideo(args[0],args[1])
            if(row.operation==='voice.transcribe')return (await import('../services/voice-transcription.service.js')).transcribeBuffer(args[0])
            if(row.operation==='intent.direct')return new (await import('../infrastructure/intent-parser.js')).LlamaJsonIntentParser().parse(args[0],args[1],args[2])
            if(row.operation==='intent.openjev')return new (await import('../services/semantic-command.service.js')).SemanticCommandService().classify(args[0],args[1],args[2])
            throw new Error('Operação desconhecida.')
        })
        controller.signal.throwIfAborted()
        await progress.close()
        const packed=await pack(result)
        await db.transaction(async()=>{
            const locked=await db.prepare('SELECT status,attempt,expires_at FROM media_jobs WHERE id=? FOR UPDATE').get(row.id)
            if(!locked || locked.status!=='running' || locked.attempt!==claim.attempt || Date.parse(locked.expires_at)<Date.now())return
            const output=row.operation==='audio.upload' ? await persistAudio(args[0],row.owner_id,result,args[2]):packed
            await db.prepare("UPDATE media_jobs SET status='completed',result=?,progress=100,updated_at=now() WHERE id=?").run(JSON.stringify(output ?? null),row.id)
        })
    }catch(error){
        const retryable=(row.operation.startsWith('download.') || row.operation.startsWith('voice.') || row.operation.startsWith('intent.')) && ((job as any).retryCount || 0)<2 && !controller.signal.aborted
        await db.prepare("UPDATE media_jobs SET status=CASE WHEN expires_at<now() THEN 'expired' ELSE ? END,error=?,updated_at=now() WHERE id=? AND status='running' AND attempt=?").run(retryable?'queued':'failed',(error as Error).message.slice(0,1000),row.id,claim.attempt)
        // Invalid files are terminal; a process death is recovered by pg-boss.
        throw error
    }finally{
        clearInterval(monitor)
        await progress.close()
        const durationMs=Math.round(performance.now()-started),queueMs=Math.max(0,Date.now()-Date.parse(row.created_at)-durationMs)
        const details={jobId:row.id,attempt:claim.attempt,queueMs}
        await db.prepare("INSERT INTO audit_events(operation_id,event,stage,duration_ms,details) VALUES(?,'work.finished',?,?,?)").run(job.data.operationId || null,row.operation,durationMs,JSON.stringify(details))
        console.info(JSON.stringify({event:'work.finished',operationId:job.data.operationId,...details,operation:row.operation,durationMs}))
    }
}
async function main(){
    process.env.ELYSIUM_ROLE ||= 'media-worker'
    const boss=await jobs()
    const queue=process.env.WORK_QUEUE || 'media'
    if(!['media','inference'].includes(queue))throw new Error('WORK_QUEUE inválida.')
    await boss.work<{id:string;operationId?:string}>(queue,{localConcurrency:queue==='media'?2:1,pollingIntervalSeconds:0.5,includeMetadata:true},async batch=>{for(const job of batch)await handleWork(job)})
    console.log(JSON.stringify({event:'worker.ready',queue}))
}
if(import.meta.main){
    for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>void stopJobs().then(()=>db.close()).then(()=>process.exit(0)))
    main().catch(error=>{console.error('[Worker]',error.message);process.exit(1)})
}
