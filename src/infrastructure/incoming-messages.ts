import { createHash, randomUUID } from 'node:crypto'
import { BufferJSON, type WAMessage } from '@whiskeysockets/baileys'
import { db } from '../database/client.js'
import { jobs, transactionalQueue } from './jobs.js'
import { operationContext, UncertainEffect } from '../application/operation-context.js'
import { admit } from '../application/admission.js'
const account=()=>process.env.BOT_ACCOUNT_ID || 'default'
const encode=(value:unknown)=>JSON.stringify(value,BufferJSON.replacer)
export async function rememberTransportMessage(message:WAMessage){
    if(!message.key.id || !message.key.remoteJid || !message.message)return
    await db.prepare(`INSERT INTO transport_messages(account_id,conversation_id,id,payload,expires_at) VALUES(?,?,?,?,now()+interval '24 hours')
        ON CONFLICT(account_id,conversation_id,id) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at`).run(account(),message.key.remoteJid,message.key.id,encode(message.message))
}
export async function storedTransportMessage(chat:string,id:string){
    const row=await db.prepare('SELECT payload FROM transport_messages WHERE account_id=? AND conversation_id=? AND id=? AND expires_at>now()').get(account(),chat,id)
    return row ? JSON.parse(row.payload,BufferJSON.reviver) : undefined
}
export async function acceptIncoming(message:WAMessage,type:string,requestId?:string):Promise<string | null>{
    await rememberTransportMessage(message)
    const chat=message.key.remoteJid
    if(type!=='notify' || message.key.fromMe || !chat || !message.key.id || !message.message || chat.endsWith('@newsletter') || chat.endsWith('@broadcast'))return null
    const timestamp=Number(message.messageTimestamp || 0)*1000
    if(timestamp && (Date.now()-timestamp>300_000 || timestamp>Date.now()+60_000))return null
    const key=createHash('sha256').update(encode([account(),chat,message.key.id,message.key.participant || '',!!message.key.fromMe])).digest('hex')
    if(await db.prepare('SELECT key FROM inbox WHERE key=?').get(key))return null
    const actor=message.key.participant || chat
    if(!await admit([{key:`inbox:${account()}:${actor}`,limit:120}]))return null
    const boss=await jobs()
    return db.transaction(async()=>{
        await db.prepare('SELECT pg_advisory_xact_lock(hashtextextended(?,0))').get(`inbox:${account()}`)
        if(await db.prepare('SELECT key FROM inbox WHERE key=?').get(key))return null
        const waiting=await db.prepare("SELECT count(*) AS total FROM command_operations WHERE account_id=? AND status IN ('pending','running')").get(account())
        if(waiting.total>=1000)return null
        const id=randomUUID()
        await db.prepare(`INSERT INTO command_operations(id,account_id,conversation_id,actor_id,source,expires_at) VALUES(?,?,?,?,'whatsapp',now()+interval '5 minutes')`).run(id,account(),chat,actor)
        await db.prepare('INSERT INTO inbox(key,operation_id,account_id,conversation_id,message_id,payload) VALUES(?,?,?,?,?,?)').run(key,id,account(),chat,message.key.id,encode({message,requestId}))
        await boss.send(`gateway-${account()}`,{operationId:id},{db:transactionalQueue,group:{id:chat},retryLimit:30,retryDelay:2,retryBackoff:false,expireInSeconds:300})
        return id
    })
}
export async function runIncoming(operationId:string,action:(message:WAMessage,requestId?:string)=>Promise<void>){
    const operation=await db.prepare('SELECT * FROM command_operations WHERE id=?').get(operationId)
    if(!operation || ['succeeded','failed','rejected','expired','uncertain'].includes(operation.status))return
    if(operation.effects_started){
        await db.prepare("UPDATE command_operations SET status='uncertain',error='Processo interrompido depois de iniciar efeitos',updated_at=now() WHERE id=?").run(operationId)
        await db.prepare("UPDATE outbox SET status='uncertain',updated_at=now() WHERE operation_id=? AND status='sending'").run(operationId)
        return
    }
    if(new Date(operation.expires_at).getTime()<Date.now()){
        await db.prepare("UPDATE command_operations SET status='expired',updated_at=now() WHERE id=?").run(operationId);return
    }
    const earlier=await db.prepare(`SELECT id FROM command_operations WHERE account_id=? AND conversation_id=? AND status IN ('pending','running') AND created_at<? ORDER BY created_at LIMIT 1`).get(operation.account_id,operation.conversation_id,operation.created_at)
    if(earlier)throw new Error('Aguardando operação anterior na conversa.')
    await db.prepare("UPDATE command_operations SET status='running',attempts=attempts+1,updated_at=now() WHERE id=?").run(operationId)
    const row=await db.prepare('SELECT payload FROM inbox WHERE operation_id=?').get(operationId)
    const input=JSON.parse(row.payload,BufferJSON.reviver)
    const started=performance.now()
    const context={id:operationId,sequence:0,error:undefined as string | undefined,rejected:false}
    try{
        await operationContext.run(context,()=>action(input.message,input.requestId))
        const status=context.rejected?'rejected':context.error?'failed':'succeeded'
        await db.prepare("UPDATE command_operations SET status=?,error=?,updated_at=now() WHERE id=? AND status!='uncertain'").run(status,context.error || null,operationId)
    }catch(error){
        const current=await db.prepare('SELECT effects_started FROM command_operations WHERE id=?').get(operationId)
        const uncertain=current.effects_started || error instanceof UncertainEffect
        await db.prepare('UPDATE command_operations SET status=?,error=?,updated_at=now() WHERE id=?').run(uncertain?'uncertain':'pending',(error as Error).message.slice(0,1000),operationId)
        if(!uncertain)throw error
    }finally{
        const duration=Math.round(performance.now()-started)
        await db.prepare("INSERT INTO audit_events(operation_id,event,stage,duration_ms) VALUES(?,'operation.finished','gateway',?)").run(operationId,duration)
        console.info(JSON.stringify({event:'operation.finished',operationId,durationMs:duration}))
    }
}
let consumerStarted=false
export async function startIncomingConsumer(ready:()=>boolean,action:(message:WAMessage,requestId?:string)=>Promise<void>){
    if(consumerStarted)return
    const boss=await jobs()
    await boss.work<{operationId:string}>(`gateway-${account()}`,{localConcurrency:3,groupConcurrency:1,pollingIntervalSeconds:1},async batch=>{
        for(const job of batch){
            const deadline=Date.now()+240_000
            while(!ready() && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,500))
            if(!ready())throw new Error('Gateway aguardando conexão.')
            await runIncoming(job.data.operationId,action)
        }
    })
    consumerStarted=true
}
