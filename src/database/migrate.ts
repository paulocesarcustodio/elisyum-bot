import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { PgBoss } from 'pg-boss'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export async function migrateDatabase(connectionString:string) {
    const pool=new Pool({connectionString,max:2})
    const boss=new PgBoss({connectionString,supervise:false,schedule:false})
    boss.on('error',error=>console.error('[Migration queue]',error.message))
    try {
        await migrate(drizzle(pool),{migrationsFolder:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../migrations')})
        await pool.query("INSERT INTO bot_accounts (id,config) VALUES ('default','{}') ON CONFLICT DO NOTHING")
        await boss.start()
        for (const name of ['gateway-default','media','inference','maintenance']) {
            await boss.createQueue(name,{retryLimit:3,retryDelay:5,retryBackoff:true,expireInSeconds:name==='media'?300:120,retentionSeconds:86_400})
        }
        const roles=(await pool.query("SELECT rolname FROM pg_roles WHERE rolname IN ('elysium_gateway','elysium_worker','elysium_web')")).rows.map(row=>row.rolname as string)
        for (const role of roles) {
            // Identifiers come exclusively from the fixed role allowlist above.
            await pool.query(`GRANT USAGE ON SCHEMA public,pgboss TO ${role}`)
            await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public,pgboss TO ${role}`)
            await pool.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public,pgboss TO ${role}`)
            await pool.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO ${role}`)
            await pool.query(`REVOKE ALL ON SCHEMA auth_private FROM ${role}`)
        }
        await pool.query('REVOKE ALL ON SCHEMA auth_private FROM PUBLIC')
        if(roles.includes('elysium_gateway')) {
            await pool.query('GRANT USAGE ON SCHEMA auth_private TO elysium_gateway')
            await pool.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA auth_private TO elysium_gateway')
        }
    } finally {
        await boss.stop({graceful:true,timeout:5000}).catch(()=>{})
        await pool.end()
    }
}
