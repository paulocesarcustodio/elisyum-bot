/** Offline import only: use a verified snapshot, never the live SQLite file. */
import { Database } from 'bun:sqlite'
import { Pool } from 'pg'
import { BufferJSON } from '@whiskeysockets/baileys'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { databaseUrl,localEnvironment,projectRoot } from './testing/local-env.js'
import { migrateDatabase } from '../src/database/migrate.js'

const source=path.resolve(process.argv[2] || '')
const name=process.argv[3] || 'elysium_stage'
if(!source.endsWith('.db') || !fs.existsSync(source)) throw new Error('Provide a SQLite snapshot path and target database name.')
if(source===path.join(projectRoot,'storage/bot.db')) throw new Error('Use a consistent snapshot, not the live database.')
if(!/^[a-z][a-z0-9_]+$/.test(name))throw new Error('Invalid database name')
const env=localEnvironment(),url=databaseUrl(env.MIGRATION_DATABASE_URL,name)
await migrateDatabase(url)
const sqlite=new Database(source,{readonly:true}),pool=new Pool({connectionString:url,max:1}),client=await pool.connect()
const tables=['contacts','users','groups_data','participants','command_logs','saved_audios','ask_cache','user','session','account','verification']
const present=new Set((sqlite.query("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[]).map(row=>row.name))
const report:{table:string;rows:number;sha256:string}[]=[]
const quote=(value:string)=>'"'+value.replaceAll('"','""')+'"'
function normalize(value:unknown,column:string,table:string) {
    if(value==null)return null
    if(['command_rate_expire_limited','command_rate_expire_cmds','antiflood_expire'].includes(column))return Number(value)
    if(['user'].includes(table)&&['banned','email_verified'].includes(column))return !!value
    if(value instanceof Date)return value.toISOString()
    if((/(?:_at|_expires)$/.test(column)||column==='timestamp') && !['registered_since'].includes(column)) {
        const text=String(value)
        return new Date(/Z$|[+-]\d\d:?\d\d$/.test(text)?text:text.replace(' ','T')+'Z').toISOString()
    }
    return value
}
function digest(rows:any[],columns:string[],table:string) {
    return createHash('sha256').update(JSON.stringify(rows.map(row=>columns.map(column=>normalize(row[column],column,table))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))).digest('hex')
}
try {
    if(sqlite.query('PRAGMA integrity_check').get()?.integrity_check!=='ok')throw new Error('Snapshot integrity check failed')
    await client.query('BEGIN')
    for(const table of [...tables,'auth_private.session_keys']) {
        const target=table.includes('.')?table.split('.').map(quote).join('.'):quote(table)
        const total=Number((await client.query(`SELECT count(*) FROM ${target}`)).rows[0].count)
        if(total)throw new Error(`Refusing to overwrite non-empty target table ${table}`)
    }
    for(const table of tables) {
        if(!present.has(table))continue
        const rows=sqlite.query(`SELECT * FROM ${quote(table)}`).all() as Record<string,unknown>[]
        const columns=(sqlite.query(`PRAGMA table_info(${quote(table)})`).all() as {name:string}[]).map(column=>column.name)
        const available=new Set((await client.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2',['public',table])).rows.map(row=>row.column_name))
        if(columns.some(column=>!available.has(column)))throw new Error(`Unmapped columns in ${table}`)
        for(let offset=0;offset<rows.length;offset+=250) {
            const values:unknown[]=[]
            const placeholders=rows.slice(offset,offset+250).map(row=>'('+columns.map(column=>{values.push(normalize(row[column],column,table));return '$'+values.length}).join(',')+')')
            await client.query(`INSERT INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES ${placeholders.join(',')}`,values)
        }
        const imported=(await client.query(`SELECT ${columns.map(quote).join(',')} FROM ${quote(table)}`)).rows
        const originalHash=digest(rows,columns,table), importedHash=digest(imported,columns,table)
        if(rows.length!==imported.length||originalHash!==importedHash)throw new Error(`Content comparison failed: ${table}`)
        report.push({table,rows:rows.length,sha256:originalHash})
        if(['command_logs','saved_audios','ask_cache'].includes(table))await client.query(`SELECT setval(pg_get_serial_sequence($1,'id'),COALESCE((SELECT MAX(id) FROM ${quote(table)}),1),EXISTS(SELECT 1 FROM ${quote(table)}))`,[table])
    }
    const keys=sqlite.query('SELECT key,data FROM session_store').all() as {key:string;data:string|null}[]
    for(let offset=0;offset<keys.length;offset+=250) {
        const values:unknown[]=[],placeholders=keys.slice(offset,offset+250).map(row=>{
            // Check BufferJSON can restore every credential category before accepting it.
            if(row.data)JSON.parse(row.data,BufferJSON.reviver)
            values.push('default',row.key,row.data)
            return `($${values.length-2},$${values.length-1},$${values.length})`
        })
        await client.query(`INSERT INTO auth_private.session_keys(account_id,key,data) VALUES ${placeholders.join(',')}`,values)
    }
    const importedKeys=(await client.query("SELECT key,data FROM auth_private.session_keys WHERE account_id='default'")).rows
    const keyHash=digest(keys,['key','data'],'session_store')
    if(keyHash!==digest(importedKeys,['key','data'],'session_store'))throw new Error('Authentication content mismatch')
    report.push({table:'auth_private.session_keys',rows:keys.length,sha256:keyHash})
    const configPath=path.join(path.dirname(source),'bot.json')
    if(fs.existsSync(configPath))await client.query("UPDATE bot_accounts SET config=$1::jsonb WHERE id='default'",[fs.readFileSync(configPath,'utf8')])
    // Stable identities begin with existing users; no user primary key is rewritten.
    await client.query(`INSERT INTO identities(account_id,primary_jid)
        SELECT 'default',id FROM users UNION SELECT 'default',user_id FROM participants UNION SELECT 'default',jid FROM contacts
        ON CONFLICT DO NOTHING`)
    await client.query(`INSERT INTO identity_aliases(account_id,alias,identity_id,source)
        SELECT account_id,primary_jid,id,'sqlite-import' FROM identities ON CONFLICT DO NOTHING`)
    await client.query(`INSERT INTO role_grants(account_id,identity_id,scope,role)
        SELECT i.account_id,i.id,'global','owner' FROM users u JOIN identities i ON i.primary_jid=u.id WHERE u.owner=1 ON CONFLICT DO NOTHING`)
    await client.query(`INSERT INTO role_grants(account_id,identity_id,scope,role)
        SELECT i.account_id,i.id,p.group_id,'group_moderator' FROM participants p JOIN identities i ON i.primary_jid=p.user_id WHERE p.admin=1 ON CONFLICT DO NOTHING`)
    await client.query('COMMIT')
    const output=path.join(projectRoot,'codex-scripts',`migration-${name}.json`)
    fs.writeFileSync(output,JSON.stringify({source:path.basename(source),target:name,integrity:'ok',content:'equal',tables:report},null,2)+'\n')
    console.log(JSON.stringify({target:name,verifiedTables:report.length,rows:report.reduce((sum,row)=>sum+row.rows,0),authenticationKeys:keys.length,report:output}))
} catch(error) {
    await client.query('ROLLBACK')
    console.error('Importação interrompida e revertida. Código:',(error as {code?:string}).code || 'validation')
    process.exitCode=1
} finally {sqlite.close();client.release();await pool.end()}
