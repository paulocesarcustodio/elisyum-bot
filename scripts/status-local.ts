import {localEnvironment} from './testing/local-env.js'
process.env.DATABASE_URL=localEnvironment().DATABASE_URL
const {db}=await import('../src/database/client.js')
try{
 const [operations,work,stages]=await Promise.all([
  db.prepare('SELECT status,count(*) AS total FROM command_operations GROUP BY status ORDER BY status').all(),
  db.prepare('SELECT status,count(*) AS total FROM media_jobs GROUP BY status ORDER BY status').all(),
  db.prepare("SELECT stage,count(*) AS samples,round(avg(duration_ms)) AS mean_ms,percentile_cont(0.95) WITHIN GROUP(ORDER BY duration_ms) AS p95_ms FROM audit_events WHERE duration_ms IS NOT NULL AND created_at>now()-interval '24 hours' GROUP BY stage ORDER BY stage").all(),
 ])
 const endpoints=await Promise.all([['qwen',8081],['openjev',8080],['whisper',8090],['web',3000]].map(async([name,port])=>{
  try{const result=await fetch(`http://127.0.0.1:${port}/${name==='web'?'login':'health'}`,{signal:AbortSignal.timeout(2000)});return {name,status:result.status}}catch{return {name,status:'unavailable'}}
 }))
 console.log(JSON.stringify({operations,work,stages,endpoints},null,2))
}finally{await db.close()}
