import assert from 'node:assert/strict'
import {promises as fs} from 'node:fs'
import {createServer} from 'node:http'
import path from 'node:path'
import {tmpdir} from 'node:os'
import {createTestDatabase} from './testing/database.js'
process.env.BLOB_STORAGE_PATH=await fs.mkdtemp(path.join(tmpdir(),'elysium-faults-'))
process.env.OPENJEV_TIMEOUT_MS='150'
process.env.WHISPER_TIMEOUT_MS='150'
const test=await createTestDatabase()
const {db}=await import('../src/database/client.js')
const {blobs}=await import('../src/infrastructure/blob-store.js')
const {submitWork}=await import('../src/infrastructure/media-client.js')
const {handleWork}=await import('../src/workers/media.worker.js')
const {stopJobs}=await import('../src/infrastructure/jobs.js')
const {runProcess}=await import('../src/infrastructure/subprocess.js')
let requests=0
const server=createServer((request,response)=>{
 const number=++requests
 setTimeout(()=>{if(!response.destroyed){response.setHeader('Content-Type','application/octet-stream');response.end('response'+number)}},number===1?800:30)
})
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
const endpoint='http://127.0.0.1:'+(server.address() as {port:number}).port
try{
 const data=Buffer.from('immutable-concurrency-fixture')
 const reference=await blobs.put(data,'application/octet-stream')
 for(let i=0;i<12;i++){
  await db.prepare("UPDATE media_assets SET expires_at=now()-interval '1 second' WHERE key=?").run(reference.key)
  await Promise.all([blobs.remove(reference.key,true),blobs.put(data,'application/octet-stream')])
  assert.deepEqual(await blobs.read(reference.key),data)
  assert(await db.prepare('SELECT key FROM media_assets WHERE key=?').get(reference.key))
 }
 const original=fs.statfs
 try{
  fs.statfs=(async()=>({bavail:0,bsize:4096})) as any
  await assert.rejects(()=>blobs.put(Buffer.from('low-disk'),'application/octet-stream'),/Espaço/)
 }finally{fs.statfs=original}
 console.log('PASS Concurrent GC/upload keeps the referenced blob; disk admission rejects before writing')
 const id=await submitWork('download.downloadFromUrl',[endpoint],'qa')
 const first=handleWork({data:{id},retryCount:2} as any).catch(()=>{})
 while(requests<1)await Bun.sleep(10)
 await handleWork({data:{id},retryCount:2} as any)
 await first
 const row=await db.prepare('SELECT status,attempt,result FROM media_jobs WHERE id=?').get(id)
 assert.equal(row.status,'completed');assert.equal(row.attempt,2)
 assert.equal((await blobs.read(row.result.__blob)).toString(),'response2')
 console.log('PASS A superseded worker cannot overwrite the result of a newer attempt')
 const controller=new AbortController(),began=performance.now()
 const child=runProcess(process.execPath,['-e','setTimeout(()=>{},30000)'],{signal:controller.signal})
 setTimeout(()=>controller.abort(),100)
 await assert.rejects(()=>child,/cancelado/)
 assert(performance.now()-began<3000)
 await assert.rejects(()=>runProcess(process.execPath,['-e',"process.stdout.write('x'.repeat(10000))"],{maxOutputBytes:500}),/limite/)
 console.log('PASS Subprocess cancellation and output limits terminate bounded work')
 process.env.WHISPER_URL='http://127.0.0.1:1'
 const unavailable=await submitWork('voice.transcribe',[Buffer.from('fixture')],'qa')
 await assert.rejects(()=>handleWork({data:{id:unavailable},retryCount:2} as any))
 assert.equal((await db.prepare('SELECT status FROM media_jobs WHERE id=?').get(unavailable)).status,'failed')
 // A direct parser request against a deliberately slow endpoint must stop at its deadline.
 process.env.LLAMA_URL=endpoint;process.env.INTENT_TIMEOUT_MS='10'
 const slow=await submitWork('intent.direct',['bot tire João',[{name:'ban',description:'remover uma pessoa'}],'grupo'],'qa')
 await assert.rejects(()=>handleWork({data:{id:slow},retryCount:2} as any))
 assert.equal((await db.prepare('SELECT status FROM media_jobs WHERE id=?').get(slow)).status,'failed')
 console.log('PASS Unavailable Whisper and model deadline produce terminal inspectable failures')
 const {SchedulerService}=await import('../src/services/scheduler.service.js')
 await new SchedulerService().run()
 console.log(JSON.stringify({suite:'faults',passed:5}))
}finally{
 server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))
 await stopJobs();await test.close()
}
process.exit(0)
