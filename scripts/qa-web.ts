/** Real HTTP/worker integration against disposable PostgreSQL accounts only. */
import assert from 'node:assert/strict'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import {tmpdir} from 'node:os'
import {randomUUID,randomBytes} from 'node:crypto'
import {createTestDatabase} from './testing/database.js'
const root=path.resolve(import.meta.dir,'..'),sandbox=await fs.mkdtemp(path.join(tmpdir(),'elysium-web-qa-'))
const test=await createTestDatabase()
const {db}=await import('../src/database/client.js')
const {hashPassword}=await import('../web/node_modules/better-auth/dist/crypto/password.mjs')
const password='LocalOnly-QA-2026-Scenario',hash=await hashPassword(password)
const base='http://127.0.0.1:3301'
const environment={...process.env,BETTER_AUTH_URL:base,BETTER_AUTH_SECRET:randomBytes(48).toString('hex'),BLOB_STORAGE_PATH:path.join(sandbox,'blobs'),ELYSIUM_TEST_MODE:'false',NEXT_TELEMETRY_DISABLED:'1'}
const children:Array<ReturnType<typeof Bun.spawn>>=[]
const users:Record<string,string>={}
async function stop(child:ReturnType<typeof Bun.spawn>){
 if(child.exitCode!==null)return
 child.kill('SIGTERM')
 const timer=setTimeout(()=>child.kill('SIGKILL'),25_000)
 try{await child.exited}finally{clearTimeout(timer)}
}
async function request(url:string,cookie='',options:RequestInit={}){
 return fetch(base+url,{...options,headers:{...options.headers,origin:base,...cookie?{cookie}:{}}})
}
async function login(role:string){
 const response=await request('/api/auth/sign-in/email','',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`test.${role}@elysium.invalid`,password})})
 assert.equal(response.status,200,await response.clone().text())
 return response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')
}
async function poll(id:string,cookie:string){
 for(let i=0;i<100;i++){const response=await request('/api/jobs/'+id,cookie);assert.equal(response.status,200);const data=await response.json();if(['completed','failed','cancelled','expired'].includes(data.status))return data;await Bun.sleep(100)}
 throw new Error('Upload did not finish')
}
try{
 for(const role of ['admin','member','other']){
  const id=randomUUID();users[role]=id
  await db.prepare('INSERT INTO "user"(id,name,email,email_verified,role) VALUES(?,?,?,true,?)').run(id,'QA '+role,`test.${role}@elysium.invalid`,role==='admin'?'admin':'user')
  await db.prepare('INSERT INTO account(id,account_id,provider_id,user_id,password) VALUES(?,?,\'credential\',?,?)').run(randomUUID(),id,id,hash)
 }
 const server=Bun.spawn([process.execPath,'next','start','--hostname','127.0.0.1','--port','3301'],{cwd:path.join(root,'web'),env:{...environment,DATABASE_URL:test.roleUrl('web'),ELYSIUM_ROLE:'web'},stdout:Bun.file(path.join(sandbox,'web.log')),stderr:Bun.file(path.join(sandbox,'web-error.log'))});children.push(server)
 const worker=Bun.spawn([process.execPath,'src/workers/media.worker.ts'],{cwd:root,env:{...environment,DATABASE_URL:test.roleUrl('worker'),ELYSIUM_ROLE:'media-worker'},stdout:Bun.file(path.join(sandbox,'worker.log')),stderr:Bun.file(path.join(sandbox,'worker-error.log'))});children.push(worker)
 let ready=false
 for(let i=0;i<100;i++){
  if(server.exitCode!==null)throw new Error(await fs.readFile(path.join(sandbox,'web-error.log'),'utf8'))
  try{ready=(await request('/login')).status===200}catch{}
  if(ready)break;await Bun.sleep(100)
 }
 assert(ready,'Next server did not start')
 assert.equal((await request('/api/audio')).status,401)
 const member=await login('member'),admin=await login('admin'),other=await login('other')
 assert.equal((await request('/api/admin/users',member)).status,403)
 assert.equal((await request('/api/admin/users/'+users.admin,member,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'user'})})).status,403)
 assert.equal((await db.prepare('SELECT role FROM "user" WHERE id=?').get(users.admin)).role,'admin')
 assert.equal((await request('/api/admin/users',admin)).status,200)
 assert.equal((await request('/api/operations',member)).status,403)
 assert.equal((await request('/api/operations',admin)).status,200)
 console.log('PASS Real login; anonymous/member/admin boundaries; no role escalation')
 const fixture=path.join(sandbox,'audio.wav')
 const ffmpeg=Bun.spawn(['ffmpeg','-loglevel','error','-f','lavfi','-i','sine=frequency=330:duration=1','-y',fixture],{stderr:'pipe'})
 assert.equal(await ffmpeg.exited,0)
 const form=new FormData();form.set('name','http-test');form.set('file',new File([await fs.readFile(fixture)],'test.wav',{type:'audio/wav'}))
 const began=performance.now(),upload=await request('/api/audio',member,{method:'POST',body:form})
 assert.equal(upload.status,202,await upload.clone().text())
 const uploadMs=Math.round(performance.now()-began),job=(await upload.json()).jobId
 assert.equal((await request('/api/jobs/'+job,other)).status,404)
 assert.equal((await poll(job,member)).status,'completed')
 const listing=await (await request('/api/audio',member)).json()
 assert.equal(listing.audios[0].audioName,'http-test');assert.equal(listing.audios[0].canEdit,true)
 assert(!('filePath' in listing.audios[0]))
 const audio=await request('/api/audio/http-test',member)
 assert.equal(audio.status,200);assert.match(audio.headers.get('content-type') || '',/audio\/mpeg/)
 assert((await audio.arrayBuffer()).byteLength>1000)
 const denied=await request('/api/audio?name=http-test',other,{method:'DELETE'})
 assert.equal(denied.status,400)
 assert.equal((await request('/api/audio/http-test',member,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({newName:'http-renamed'})})).status,200)
 console.log(`PASS Upload returns 202 in ${uploadMs}ms; worker publishes valid media; ownership enforced`)
 const invalid=new FormData();invalid.set('name','invalid');invalid.set('file',new File(['not media'],'fake.mp3',{type:'audio/mpeg'}))
 const badResponse=await request('/api/audio',member,{method:'POST',body:invalid});assert.equal(badResponse.status,202)
 assert.equal((await poll((await badResponse.json()).jobId,member)).status,'failed')
 assert.equal((await request('/api/audio/invalid',member)).status,404)
 console.log('PASS Invalid upload has a visible failure and no counterfeit audio file')
 console.log(JSON.stringify({suite:'web',passed:3,uploadMs,sandbox,url:base}))
 if(process.argv.includes('--hold')){
  console.log('QA_BROWSER_READY')
  await new Promise<void>(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve)})
 }
}finally{for(const child of children.reverse())await stop(child);await test.close()}
process.exit(0)
