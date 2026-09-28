import { db } from '../database/client.js'
import { BufferJSON } from '@whiskeysockets/baileys'
import { IdentityService } from '../services/identity.service.js'
import type { Message } from '../interfaces/message.interface.js'
import type { CommandRequest } from '../domain/contracts.js'
const account=()=>process.env.BOT_ACCOUNT_ID || 'default'
async function actor(sender:string){return (await new IdentityService().resolve(sender)).id}
export async function pendingConfirmation(message:Message){
    const id=await actor(message.sender)
    await db.prepare("UPDATE confirmations SET status='expired' WHERE account_id=? AND conversation_id=? AND actor_id=? AND status='pending' AND expires_at<=now()").run(account(),message.chat_id,id)
    const row=await db.prepare("SELECT * FROM confirmations WHERE account_id=? AND conversation_id=? AND actor_id=? AND status='pending' AND expires_at>now()").get(account(),message.chat_id,id)
    return row ? {id:row.id,command:row.command as string,message:JSON.parse(row.payload,BufferJSON.reviver) as Message} : undefined
}
export async function cancelConfirmation(id:string){await db.prepare("UPDATE confirmations SET status='cancelled' WHERE id=? AND status='pending'").run(id)}
export async function saveConfirmation(message:Message,command:string){
    const id=await actor(message.sender)
    return db.transaction(async()=>{
        await db.prepare('SELECT pg_advisory_xact_lock(hashtextextended(?,0))').get(`confirmation:${account()}:${message.chat_id}:${id}`)
        await db.prepare("UPDATE confirmations SET status='cancelled' WHERE account_id=? AND conversation_id=? AND actor_id=? AND status='pending'").run(account(),message.chat_id,id)
        return db.prepare(`INSERT INTO confirmations(account_id,conversation_id,actor_id,command,payload,operation_id,expires_at) VALUES(?,?,?,?,?,?,now()+interval '30 seconds') RETURNING id`).get(account(),message.chat_id,id,command,JSON.stringify(message,BufferJSON.replacer),message.operationId || null)
    })
}
export async function consumeConfirmation(request:CommandRequest):Promise<boolean>{
    const id=await actor(request.actor.id)
    const row=await db.prepare(`UPDATE confirmations SET status='consumed' WHERE id=? AND account_id=? AND conversation_id=? AND actor_id=? AND command=? AND status='pending' AND expires_at>now() RETURNING payload`).get(request.confirmationId,request.accountId,request.conversationId,id,request.command)
    if(!row)return false
    const saved=JSON.parse(row.payload,BufferJSON.reviver) as Message
    const targets=saved.mentioned.length ? saved.mentioned : saved.quotedMessage ? [saved.quotedMessage.sender] : []
    return JSON.stringify(saved.args)===JSON.stringify(request.args) && JSON.stringify(targets)===JSON.stringify(request.targetIds)
}
