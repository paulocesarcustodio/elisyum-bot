/** Compact local evidence, without message text, JIDs, cookies or session material. */
import {localEnvironment} from './testing/local-env.js'
process.env.DATABASE_URL=localEnvironment().DATABASE_URL
const {db}=await import('../src/database/client.js')
try{
 const migration=await Bun.file('codex-scripts/migration-elysium.json').json()
 const state=await Bun.file('codex-scripts/local-runtime.json').json()
 const commands=await db.prepare("SELECT command,success,count(*) AS runs FROM command_logs WHERE chat_id=? AND timestamp>='2026-09-28T00:00:00Z' GROUP BY command,success ORDER BY command,success").all('120363419491183757@g.us')
 const audit=await db.prepare("SELECT stage,count(*) AS samples,round(avg(duration_ms)) AS mean_ms FROM audit_events WHERE duration_ms IS NOT NULL GROUP BY stage ORDER BY stage").all()
 const account=await db.prepare("SELECT generation FROM bot_accounts WHERE id='default'").get()
 const leases=await db.prepare("SELECT count(*) AS n FROM pg_stat_activity WHERE application_name='elysium-gateway-lease'").get()
 const roleChecks=[]
 const {Pool}=await import('pg')
 const env=localEnvironment()
 for(const [role,url] of [['web',env.WEB_DATABASE_URL],['worker',env.WORKER_DATABASE_URL]]){
  const pool=new Pool({connectionString:url,max:1})
  try{await pool.query('SELECT 1 FROM auth_private.session_keys LIMIT 1');roleChecks.push({role,authDenied:false})}catch(error){roleChecks.push({role,authDenied:(error as {code?:string}).code==='42501'})}finally{await pool.end()}
 }
 const summary={migration:{tables:migration.tables.length,rows:migration.tables.reduce((n:number,row:{rows:number})=>n+row.rows,0),content:migration.content},processes:Object.keys(state).filter(key=>key!=='supervisor'),gatewayGeneration:account.generation,gatewayLeaseConnections:leases.n,privateAuthentication:roleChecks,groupTestCommands:commands,stageMetrics:audit,recordedAt:new Date().toISOString()}
 await Bun.write('codex-scripts/architecture-final-summary.json',JSON.stringify(summary,null,2)+'\n')
 console.log(JSON.stringify(summary,null,2))
}finally{await db.close()}
