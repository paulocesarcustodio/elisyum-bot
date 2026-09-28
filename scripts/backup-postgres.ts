/** Consistent PostgreSQL snapshot plus immutable media; verification never restores over production. */
import {Pool,type PoolClient} from 'pg'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import {createHash,randomBytes} from 'node:crypto'
import {localEnvironment,databaseUrl,projectRoot} from './testing/local-env.js'
const environment=localEnvironment()
const action=process.argv[2] || 'create'
const target=process.env.BACKUP_DATABASE || 'elysium'
if(!/^[a-z][a-z0-9_]+$/.test(target))throw new Error('Invalid database name')
const url=databaseUrl(environment.MIGRATION_DATABASE_URL,target)
const pg=path.join(projectRoot,'codex-scripts/postgres/bin')
const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"'
async function run(binary:string,args:string[],database:string){
    const parsed=new URL(database)
    const child=Bun.spawn([path.join(pg,binary),...args],{env:{...process.env,PGHOST:parsed.hostname,PGPORT:parsed.port,PGUSER:decodeURIComponent(parsed.username),PGPASSWORD:decodeURIComponent(parsed.password),PGDATABASE:parsed.pathname.slice(1)},stdout:'ignore',stderr:'pipe'})
    const error=await new Response(child.stderr).text()
    if(await child.exited!==0)throw new Error(binary+' failed: '+error.replaceAll(decodeURIComponent(parsed.password),'[redacted]').slice(-800))
}
async function fingerprint(client:PoolClient){
    const tables=(await client.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','auth_private','pgboss','drizzle') ORDER BY schemaname,tablename")).rows
    const result=[]
    for(const {schemaname,tablename} of tables){
        const table=quote(schemaname)+'.'+quote(tablename)
        const row=(await client.query(`SELECT count(*)::int AS rows,md5(coalesce(string_agg(hash,'' ORDER BY hash),'')) AS content FROM (SELECT md5(to_jsonb(t)::text) AS hash FROM ${table} t) x`)).rows[0]
        result.push({table:schemaname+'.'+tablename,...row})
    }
    return result
}
async function digest(file:string){return createHash('sha256').update(await fs.readFile(file)).digest('hex')}
const pool=new Pool({connectionString:url,max:1})
const client=await pool.connect()
let folder=''
try{
    if(action==='create'){
        folder=path.resolve(process.argv[3] || path.join(projectRoot,'codex-scripts/backups','postgres-'+new Date().toISOString().replace(/[:.]/g,'-')))
        await fs.mkdir(folder,{recursive:false,mode:0o700})
        // GC takes the shared form of this lock. Writers may still add immutable blobs.
        await client.query("SELECT pg_advisory_lock(hashtextextended('blob-backup',0))")
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
        const snapshot=(await client.query('SELECT pg_export_snapshot() AS id')).rows[0].id
        await run('pg_dump',['--format=custom','--no-owner','--no-privileges','--snapshot='+snapshot,'--file='+path.join(folder,'database.dump')],url)
        const tables=await fingerprint(client)
        const files:Array<{path:string;sha256:string}>=[]
        const copy=async(source:string,destination:string)=>{
            const output=path.join(folder,destination);await fs.mkdir(path.dirname(output),{recursive:true,mode:0o700});await fs.copyFile(source,output);await fs.chmod(output,0o600)
            files.push({path:destination,sha256:await digest(output)})
        }
        for(const {key} of (await client.query('SELECT key FROM media_assets')).rows){
            if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Invalid blob key')
            await copy(path.join(projectRoot,'storage/blobs',key.slice(0,2),key),'blobs/'+key.slice(0,2)+'/'+key)
        }
        for(const row of (await client.query('SELECT id,file_path FROM saved_audios WHERE blob_key IS NULL')).rows)await copy(row.file_path,'legacy-media/'+row.id)
        for(const name of ['database.env','web.env'])await copy(path.join(projectRoot,'codex-scripts',name),'configuration/'+name)
        await copy(path.join(projectRoot,'.env'),'configuration/bot.env')
        await client.query('COMMIT')
        await client.query("SELECT pg_advisory_unlock(hashtextextended('blob-backup',0))")
        const report={createdAt:new Date().toISOString(),database:target,postgres:'18.6',schema:tables,files,dumpSha256:await digest(path.join(folder,'database.dump'))}
        await fs.writeFile(path.join(folder,'manifest.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600})
        await fs.chmod(path.join(folder,'database.dump'),0o600)
        console.log(JSON.stringify({event:'backup.created',path:folder,tables:tables.length,files:files.length}))
    }else if(action==='verify'){
        folder=path.resolve(process.argv[3] || '')
        const report=JSON.parse(await fs.readFile(path.join(folder,'manifest.json'),'utf8'))
        if(await digest(path.join(folder,'database.dump'))!==report.dumpSha256)throw new Error('Backup checksum mismatch')
        for(const file of report.files){
            const resolved=path.resolve(folder,file.path)
            if(!resolved.startsWith(folder+path.sep) || await digest(resolved)!==file.sha256)throw new Error('Backup file checksum mismatch')
        }
        const name='elysium_restore_qa_'+randomBytes(6).toString('hex')
        const restoredUrl=databaseUrl(url,name)
        await client.query('CREATE DATABASE '+name)
        try{
            await run('pg_restore',['--exit-on-error','--no-owner','--no-privileges','--dbname='+name,path.join(folder,'database.dump')],restoredUrl)
            const restoredPool=new Pool({connectionString:restoredUrl,max:1}),restored=await restoredPool.connect()
            try{
                const actual=await fingerprint(restored)
                if(JSON.stringify(actual)!==JSON.stringify(report.schema))throw new Error('Restored table fingerprints differ from snapshot')
                console.log(JSON.stringify({event:'backup.restore-verified',tables:actual.length,files:report.files.length,authentication:'content-identical'}))
            }finally{restored.release();await restoredPool.end()}
        }finally{await client.query('DROP DATABASE '+name+' WITH (FORCE)')}
    }else throw new Error('Use create [new-directory] or verify <backup-directory>')
}finally{client.release(true);await pool.end()}
