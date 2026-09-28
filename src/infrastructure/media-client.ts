import type { MediaProcessor } from '../domain/contracts.js'
import { db } from '../database/client.js'
import { jobs,transactionalQueue } from './jobs.js'
import { blobs } from './blob-store.js'
import { currentOperation } from '../application/operation-context.js'
import { randomUUID } from 'node:crypto'
const allowed=new Set(['ffmpeg','ffmpeg.raw','audio.upload','probe','download.xMedia','download.tiktokMedia','download.facebookMedia','download.instagramMedia','download.pinterestMedia','download.downloadPinterestVideo','download.youtubeMedia','download.downloadFromUrl','download.downloadVideoFromUrl','download.downloadInstagramMedia','download.downloadInstagramImage','download.downloadYouTubeAudio','download.downloadYouTubeVideo','voice.transcribe','intent.openjev','intent.direct','sticker.create','sticker.image','video.profile','image.quote'])
export const shouldQueueWork=()=>['gateway','web'].includes(process.env.ELYSIUM_ROLE || '') && process.env.ELYSIUM_TEST_MODE!=='true'
export async function pack(value:any):Promise<any>{
    if(Buffer.isBuffer(value)||value instanceof Uint8Array)return {__blob:(await blobs.put(value,'application/octet-stream')).key}
    if(Array.isArray(value))return Promise.all(value.map(pack))
    if(value && typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).filter(([,item])=>typeof item!=='function'&&item!==undefined).map(async([key,item])=>[key,await pack(item)])))
    return value
}
export async function unpack(value:any):Promise<any>{
    if(value && typeof value==='object'&&typeof value.__blob==='string')return blobs.read(value.__blob)
    if(Array.isArray(value))return Promise.all(value.map(unpack))
    if(value && typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([key,item])=>[key,await unpack(item)])))
    return value
}
export async function submitWork(operation:string,args:unknown[],ownerId:string,ttlSeconds=300):Promise<string>{
    if(!allowed.has(operation))throw new Error('Operação de mídia não permitida.')
    const input=await pack(args)
    const boss=await jobs()
    return db.transaction(async()=>{
        await db.prepare('SELECT pg_advisory_xact_lock(hashtextextended(?,0))').get('media-admission')
        const count=await db.prepare("SELECT count(*) AS n FROM media_jobs WHERE status IN ('queued','running') AND expires_at>now()").get()
        if(count.n>=24)throw new Error('Fila de processamento cheia; tente novamente em alguns instantes.')
        const id=randomUUID()
        const operationId=currentOperation()?.id
        await db.prepare(`INSERT INTO media_jobs(id,owner_id,operation,input,expires_at) VALUES(?,?,?,?,now()+(?*interval '1 second'))`).run(id,ownerId,operation,JSON.stringify(input),ttlSeconds)
        await boss.send(operation.startsWith('voice.')||operation.startsWith('intent.')?'inference':'media',{id,operationId},{id,db:transactionalQueue,retryLimit:2,retryDelay:2,retryBackoff:true,expireInSeconds:ttlSeconds})
        await db.prepare("INSERT INTO audit_events(operation_id,event,stage,details) VALUES(?,'work.accepted',?,?)").run(operationId || null,operation,JSON.stringify({jobId:id}))
        return id
    })
}
export async function cancelWork(id:string,ownerId:string,admin=false){
    const row=await db.prepare("UPDATE media_jobs SET status='cancelled',updated_at=now() WHERE id=? AND (owner_id=? OR ?) AND status IN ('queued','running') RETURNING id,operation").get(id,ownerId,admin)
    if(row)await (await jobs()).cancel(row.operation.startsWith('voice.')||row.operation.startsWith('intent.')?'inference':'media',id)
    return row
}
export class QueuedMediaProcessor implements MediaProcessor {
    async execute<T>(operation:string,args:unknown[],options:{ownerId?:string;signal?:AbortSignal;timeoutMs?:number;onProgress?:(percent:number)=>void|Promise<void>}={}):Promise<T>{
        const timeout=Math.min(options.timeoutMs || 180_000,300_000)
        const owner=options.ownerId || currentOperation()?.id || 'gateway'
        const id=await submitWork(operation,args,owner,Math.ceil(timeout/1000)+30)
        const deadline=Date.now()+timeout
        let lastProgress=0
        while(Date.now()<deadline){
            if(options.signal?.aborted){await cancelWork(id,owner);options.signal.throwIfAborted()}
            const row=await db.prepare('SELECT status,result,error,progress FROM media_jobs WHERE id=?').get(id)
            if(row.status==='completed'){
                await options.onProgress?.(100)
                return unpack(row.result)
            }
            if(['failed','cancelled','expired'].includes(row.status))throw new Error(row.error || 'Processamento cancelado ou expirado.')
            if(row.progress>lastProgress){
                lastProgress=row.progress
                await options.onProgress?.(row.progress)
            }
            await new Promise(resolve=>setTimeout(resolve,200))
        }
        await cancelWork(id,owner)
        throw new Error('O processamento excedeu o tempo limite.')
    }
}
export const mediaProcessor=new QueuedMediaProcessor()
