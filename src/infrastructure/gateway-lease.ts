import {pack,unpack} from './media-client.js'
import { cacheGroup, cachedGroup } from './group-metadata.js'
import { rememberTransportMessage } from './incoming-messages.js'
import { Pool, type PoolClient } from 'pg'
import type { WhatsAppGateway } from '../domain/contracts.js'
import { currentOperation, UncertainEffect } from '../application/operation-context.js'
import { db } from '../database/client.js'
import { BufferJSON, type WASocket } from '@whiskeysockets/baileys'
import { randomUUID } from 'node:crypto'
const externalMethods = new Set(['sendMessage','relayMessage','groupParticipantsUpdate','groupSettingUpdate','groupUpdateSubject','groupUpdateDescription','groupLeave','updateBlockStatus','groupRevokeInvite','groupAcceptInvite','chatModify'])
const encode=(value:unknown)=>JSON.stringify(value ?? null,BufferJSON.replacer)

export class GatewayLease implements WhatsAppGateway {
    readonly accountId=process.env.BOT_ACCOUNT_ID || 'default'
    generation=0
    private pool:Pool
    private connection?:PoolClient
    private active=false
    private socket?:WASocket
    private timer?:ReturnType<typeof setInterval>
    constructor(){this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,application_name:'elysium-gateway-lease'})}
    async acquire(){
        this.connection=await this.pool.connect()
        this.connection.on('error',()=>this.lose())
        const lock=await this.connection.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired',[`gateway:${this.accountId}`])
        if(!lock.rows[0].acquired){await this.close();throw new Error('Já existe um gateway ativo para esta conta.')}
        const result=await this.connection.query('UPDATE bot_accounts SET generation=generation+1,updated_at=now() WHERE id=$1 RETURNING generation',[this.accountId])
        if(!result.rows.length){await this.close();throw new Error('Conta não inicializada.')}
        this.generation=result.rows[0].generation
        this.active=true
        this.timer=setInterval(()=>void this.assertActive().catch(()=>this.lose()),2000)
        this.timer.unref()
    }
    isActive(){return this.active}
    private lose(){this.active=false;this.socket?.end(new Error('gateway_lease_lost'))}
    async assertActive(){
        if(!this.active || !this.connection)throw new Error('Gateway sem propriedade da sessão.')
        try {
            const result=await this.connection.query('SELECT generation FROM bot_accounts WHERE id=$1',[this.accountId])
            if(result.rows[0]?.generation!==this.generation)throw new Error('Geração da conexão substituída.')
        }catch(error){this.lose();throw error}
    }
    wrap(socket:WASocket):WASocket {
        this.socket=socket
        return new Proxy(socket,{get:(target,key,receiver)=>{
            const value=Reflect.get(target,key,receiver)
            if(key==='groupMetadata')return async(jid:string)=>cachedGroup(jid) || cacheGroup(await target.groupMetadata(jid))
            if(typeof key==='string'&&['sendPresenceUpdate','sendReceipt','updateMediaMessage'].includes(key)&&typeof value==='function'){
                return async(...args:unknown[])=>{await this.assertActive();if(socket!==this.socket)throw new Error('Conexão WhatsApp substituída.');return value.apply(target,args)}
            }
            if(typeof key==='string'&&externalMethods.has(key)&&typeof value==='function'){
                return (...args:unknown[])=>this.deliver(currentOperation()?.id || '',key,args,socket)
            }
            return typeof value==='function' ? value.bind(target) : value
        }})
    }
    async deliver(operationId:string,method:string,args:unknown[],expectedSocket=this.socket):Promise<any>{
        await this.assertActive()
        if(!expectedSocket || expectedSocket!==this.socket)throw new Error('Conexão WhatsApp substituída.')
        const context=currentOperation()
        if(!operationId){
            operationId=randomUUID()
            await db.prepare(`INSERT INTO command_operations(id,account_id,conversation_id,actor_id,source,expires_at) VALUES(?,?,?,'system','system',now()+interval '5 minutes')`).run(operationId,this.accountId,String(args[0] || 'system'))
        }
        const sequence=context ? context.sequence++ : 0
        const payload=encode(await pack(args))
        const row=await db.transaction(async()=>{
            await db.prepare(`INSERT INTO outbox(operation_id,sequence,method,payload) VALUES(?,?,?,?) ON CONFLICT DO NOTHING`).run(operationId,sequence,method,payload)
            const item=await db.prepare('SELECT * FROM outbox WHERE operation_id=? AND sequence=? FOR UPDATE').get(operationId,sequence)
            if(item.method!==method || item.payload!==payload)throw new UncertainEffect('Saída divergente durante recuperação.')
            if(item.status==='sent')return item
            if(item.status!=='prepared'){
                await db.prepare("UPDATE outbox SET status='uncertain',updated_at=now() WHERE id=?").run(item.id)
                return {...item,status:'uncertain'}
            }
            await db.prepare("UPDATE command_operations SET effects_started=true,updated_at=now() WHERE id=?").run(operationId)
            await db.prepare("UPDATE outbox SET status='sending',updated_at=now() WHERE id=?").run(item.id)
            return item
        })
        if(row.status==='sent')return unpack(JSON.parse(row.result,BufferJSON.reviver))
        if(row.status==='uncertain')throw new UncertainEffect('Envio anterior sem resultado confirmado; não foi reenviado.')
        try{
            await this.assertActive()
            if(this.socket!==expectedSocket)throw new Error('Conexão substituída antes do envio.')
            const result=await (expectedSocket as any)[method](...args)
            await db.prepare("UPDATE outbox SET status='sent',result=?,updated_at=now() WHERE id=?").run(encode(await pack(result)),row.id)
            if(method==='sendMessage' && result?.key)await rememberTransportMessage(result)
            if(!context)await db.prepare("UPDATE command_operations SET status='succeeded',updated_at=now() WHERE id=?").run(operationId)
            return result
        }catch(error){
            await db.prepare("UPDATE outbox SET status='uncertain',error=?,updated_at=now() WHERE id=?").run((error as Error).message.slice(0,1000),row.id)
            await db.prepare("UPDATE command_operations SET status='uncertain',error='Resultado externo não confirmado',updated_at=now() WHERE id=?").run(operationId)
            throw new UncertainEffect('O resultado do envio não pôde ser confirmado. A ação não será repetida automaticamente.')
        }
    }
    async close(){
        this.active=false
        if(this.timer)clearInterval(this.timer)
        this.socket?.end(new Error('gateway_shutdown'))
        if(this.connection){this.connection.release(true);this.connection=undefined}
        await this.pool.end()
    }
}
