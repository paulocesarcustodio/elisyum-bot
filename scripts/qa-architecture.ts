/** PostgreSQL integration and failure tests, with no real WhatsApp connection. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { createTestDatabase } from './testing/database.js'
const test=await createTestDatabase()
const {db}=await import('../src/database/client.js')
const {jobs,stopJobs}=await import('../src/infrastructure/jobs.js')
const {acceptIncoming,runIncoming,storedTransportMessage}=await import('../src/infrastructure/incoming-messages.js')
const {operationContext,UncertainEffect}=await import('../src/application/operation-context.js')
const {GatewayLease}=await import('../src/infrastructure/gateway-lease.js')
const {admit}=await import('../src/application/admission.js')
const {saveConfirmation,pendingConfirmation,consumeConfirmation,cancelConfirmation}=await import('../src/application/confirmations.js')
const {IdentityService}=await import('../src/services/identity.service.js')
const {usePostgresAuthState,waitForAuthPersistence}=await import('../src/helpers/session.auth.helper.js')
const {SchedulerService}=await import('../src/services/scheduler.service.js')
const {connectionClose}=await import('../src/events/connection.event.js')
const {Boom}=await import('@hapi/boom')
const report:string[]=[]
const pass=(label:string)=>{report.push(label);console.log(`PASS ${label}`)}
const chat='120000000000009999@g.us',sender='5511999994444@s.whatsapp.net'
const incoming=(id:string)=>({key:{id,remoteJid:chat,participant:sender,fromMe:false},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:'!menu'}})
const leases:any[]=[]
try{
    const ids=await Promise.all(Array.from({length:8},()=>acceptIncoming(incoming('duplicate') as any,'notify')))
    assert.equal(ids.filter(Boolean).length,1)
    const operationId=ids.find(Boolean)!
    assert.equal((await db.prepare('SELECT count(*) AS n FROM inbox').get()).n,1)
    assert.equal((await db.prepare("SELECT count(*) AS n FROM pgboss.job WHERE name='gateway-default'").get()).n,1)
    assert.equal((await db.prepare('SELECT status FROM command_operations WHERE id=?').get(operationId)).status,'pending')
    assert.equal((await storedTransportMessage(chat,'duplicate')).conversation,'!menu')
    assert.equal(await acceptIncoming(incoming('history') as any,'append'),null)
    assert.equal(await acceptIncoming({...incoming('old'),messageTimestamp:1} as any,'notify'),null)
    pass('Concurrent duplicate + notification during startup persists once; history/expired ignored')
    let calls=0
    await runIncoming(operationId,async()=>{calls++;await db.prepare("INSERT INTO users(id,commands) VALUES('qa',1)").run()})
    await runIncoming(operationId,async()=>{calls++;await db.prepare("UPDATE users SET commands=commands+1 WHERE id='qa'").run()})
    assert.equal(calls,1);assert.equal((await db.prepare("SELECT commands FROM users WHERE id='qa'").get()).commands,1)
    pass('Repeated delivery does not repeat local changes')
    const retry=await acceptIncoming(incoming('retry') as any,'notify')
    await assert.rejects(()=>runIncoming(retry!,async()=>{throw new Error('temporary before effects')}))
    await runIncoming(retry!,async()=>{})
    assert.equal((await db.prepare('SELECT attempts FROM command_operations WHERE id=?').get(retry)).attempts,2)
    const crash=await acceptIncoming(incoming('local-crash') as any,'notify')
    await runIncoming(crash!,async()=>{await db.prepare("UPDATE users SET commands=commands+1 WHERE id='qa'").run();throw new Error('crash after local mutation')})
    await runIncoming(crash!,async()=>{throw new Error('must not run again')})
    assert.equal((await db.prepare('SELECT status FROM command_operations WHERE id=?').get(crash)).status,'uncertain')
    assert.equal((await db.prepare("SELECT commands FROM users WHERE id='qa'").get()).commands,2)
    pass('Safe retry before effects; interrupted local changes stop for review')
    const admitted=await Promise.all(Array.from({length:12},()=>admit([{key:'limit',limit:3}])))
    assert.equal(admitted.filter(Boolean).length,3)
    assert.equal(await admit([{key:'another',limit:1},{key:'limit',limit:3}]),false)
    assert.equal(await admit([{key:'another',limit:1}]),true)
    pass('Concurrent admission limits reserve atomically')
    const identity=new IdentityService()
    const phone=await identity.resolve(sender)
    const lid=await identity.resolve('99994444@lid',[sender],'fixture')
    assert.equal(phone.id,lid.id)
    const message:any={sender,chat_id:chat,args:['fixed'],mentioned:['551122223333@s.whatsapp.net']}
    const confirmation=await saveConfirmation(message,'ban')
    assert.equal((await pendingConfirmation({...message,sender:'99994444@lid'}))?.id,confirmation.id)
    const request:any={accountId:'default',conversationId:chat,actor:{id:sender},command:'ban',args:['fixed'],targetIds:message.mentioned,confirmationId:confirmation.id}
    assert.equal(await consumeConfirmation({...request,actor:{id:'551188887777@s.whatsapp.net'}}),false)
    assert.equal(await consumeConfirmation(request),true)
    assert.equal(await consumeConfirmation(request),false)
    const expiring=await saveConfirmation(message,'ban')
    await db.prepare("UPDATE confirmations SET expires_at=now()-interval '1 second' WHERE id=?").run(expiring.id)
    assert.equal(await consumeConfirmation({...request,confirmationId:expiring.id}),false)
    assert.equal(await pendingConfirmation(message),undefined)
    const cancelled=await saveConfirmation(message,'ban');await cancelConfirmation(cancelled.id)
    assert.equal(await consumeConfirmation({...request,confirmationId:cancelled.id}),false)
    pass('Confirmation survives lookup by LID; binds actor, arguments, target, expiry and one use')
    const auth=await usePostgresAuthState()
    await auth.saveCreds()
    const keys:any={'lid-mapping':{'lid':sender},'device-list':{[sender]:['1','2']},'tctoken':{[sender]:{token:Buffer.from([1,2,3]),timestamp:123}},'session':{fixture:Buffer.from([4,5,6])}}
    await auth.state.keys.set(keys);await waitForAuthPersistence()
    const reopened=await usePostgresAuthState()
    for(const [category,values] of Object.entries(keys))assert.deepEqual(await reopened.state.keys.get(category as any,Object.keys(values as object)),values)
    await assert.rejects(()=>db.prepare('INSERT INTO auth_private.session_keys(account_id,key,data) VALUES(?,?,?)').run('default','creds','private-auth-marker'),error=>{
        assert.equal((error as any).code,'23505')
        assert(!String(error).includes('private-auth-marker'))
        assert(!JSON.stringify(error).includes('private-auth-marker'))
        return true
    })
    const before=(await db.prepare('SELECT count(*) AS n FROM auth_private.session_keys').get()).n
    assert.equal(await connectionClose({lastDisconnect:{error:new Boom('generic 405',{statusCode:405}),date:new Date()}}),true)
    assert.equal((await db.prepare('SELECT count(*) AS n FROM auth_private.session_keys').get()).n,before)
    for(const role of ['worker','web'] as const){
        const pool=new Pool({connectionString:test.roleUrl(role),max:1})
        try{await assert.rejects(()=>pool.query('SELECT * FROM auth_private.session_keys'),/permission denied/)}finally{await pool.end()}
    }
    pass('BufferJSON auth round trip; generic 405 preserves keys; worker/web denied auth')
    const lease=new GatewayLease();leases.push(lease);await lease.acquire()
    const duplicate=new GatewayLease();await assert.rejects(()=>duplicate.acquire(),/Já existe/)
    let sends=0
    const socket:any={sendMessage:async()=>{sends++;return {key:{id:'sent',remoteJid:chat}}},end:()=>{}}
    lease.wrap(socket)
    const sendOp=randomUUID()
    await db.prepare("INSERT INTO command_operations(id,account_id,conversation_id,actor_id,source,expires_at) VALUES(?,'default',?,?,'test',now()+interval '1 minute')").run(sendOp,chat,sender)
    for(let i=0;i<2;i++)await operationContext.run({id:sendOp,sequence:0},()=>lease.deliver(sendOp,'sendMessage',[chat,{text:'test'}]))
    assert.equal(sends,1)
    const uncertain=randomUUID()
    await db.prepare("INSERT INTO command_operations(id,account_id,conversation_id,actor_id,source,expires_at) VALUES(?,'default',?,?,'test',now()+interval '1 minute')").run(uncertain,chat,sender)
    const flaky:any={sendMessage:async()=>{sends++;throw new Error('connection lost after write')},end:()=>{}}
    lease.wrap(flaky)
    for(let i=0;i<2;i++)await assert.rejects(()=>operationContext.run({id:uncertain,sequence:0},()=>lease.deliver(uncertain,'sendMessage',[chat,{text:'uncertain'}])),UncertainEffect)
    assert.equal(sends,2)
    assert.equal((await db.prepare('SELECT status FROM outbox WHERE operation_id=?').get(uncertain)).status,'uncertain')
    await db.prepare("UPDATE bot_accounts SET generation=generation+1 WHERE id='default'").run()
    await assert.rejects(()=>lease.deliver(sendOp,'sendMessage',[chat,{text:'stale'}]),/Geração/)
    assert.equal(sends,2);assert.equal(lease.isActive(),false)
    pass('Exclusive gateway, generation fence, saved output replay and no uncertain resend')
    await new SchedulerService().init();await new SchedulerService().init()
    assert.equal((await db.prepare("SELECT count(*) AS n FROM pgboss.schedule WHERE name='maintenance'").get()).n,1)
    pass('Repeated startup does not duplicate schedule')
    console.log(JSON.stringify({suite:'architecture',passed:report.length,tests:report},null,2))
}finally{
    await stopJobs()
    for(const lease of leases)await lease.close()
    await test.close()
}
process.exit(0)
