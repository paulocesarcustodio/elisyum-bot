import { db } from '../database/client.js'
import { initAuthCreds, BufferJSON, proto, type AuthenticationCreds, type AuthenticationState, type SignalDataTypeMap } from '@whiskeysockets/baileys'

let pending: Promise<void> = Promise.resolve()
let persistenceFailure:unknown
const accountId = () => process.env.BOT_ACCOUNT_ID || 'default'
function serialize(action:()=>Promise<void>):Promise<void> {
    const result=pending.then(action)
    // Fail the caller, but allow a subsequent write to retry after a transient error.
    pending=result.catch(error=>{persistenceFailure=error})
    return result
}
async function read(key:string) {
    const row=await db.prepare('SELECT data FROM auth_private.session_keys WHERE account_id = ? AND key = ?').get(accountId(),key)
    return row?.data ? JSON.parse(row.data,BufferJSON.reviver) : null
}
async function write(key:string,value:unknown) {
    if(value===undefined || value===null) await db.prepare('DELETE FROM auth_private.session_keys WHERE account_id = ? AND key = ?').run(accountId(),key)
    else await db.prepare('INSERT INTO auth_private.session_keys (account_id,key,data) VALUES (?,?,?) ON CONFLICT(account_id,key) DO UPDATE SET data=excluded.data')
        .run(accountId(),key,JSON.stringify(value,BufferJSON.replacer))
}
export async function usePostgresAuthState():Promise<{state:AuthenticationState;saveCreds:()=>Promise<void>}> {
    await pending
    const creds:AuthenticationCreds=await read('creds') || initAuthCreds()
    return {
        state:{creds,keys:{
            get:async<T extends keyof SignalDataTypeMap>(type:T,ids:string[])=>{
                await pending
                const data:{[id:string]:SignalDataTypeMap[T]}={}
                for(const id of ids){
                    let value=await read(`${type}-${id}`)
                    if(type==='app-state-sync-key'&&value)value=proto.Message.AppStateSyncKeyData.create(value)
                    if(value!=null)data[id]=value
                }
                return data
            },
            set:async values=>serialize(()=>db.transaction(async()=>{
                for(const [category,entries] of Object.entries(values)) {
                    for(const [id,value] of Object.entries(entries || {})) await write(`${category}-${id}`,value)
                }
            }))
        }},
        saveCreds:()=>serialize(async()=>{
            if(creds?.noiseKey?.private) await db.transaction(()=>write('creds',creds))
        })
    }
}
export async function cleanCreds() {
    await serialize(()=>db.transaction(async()=>{
        await db.prepare('DELETE FROM auth_private.session_keys WHERE account_id = ?').run(accountId())
    }))
}
export async function waitForAuthPersistence() {await pending;if(persistenceFailure)throw persistenceFailure}
