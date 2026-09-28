import { Pool } from 'pg'
import { randomBytes } from 'node:crypto'
import { migrateDatabase } from '../../src/database/migrate.js'
import { databaseUrl,localEnvironment } from './local-env.js'

export async function createTestDatabase() {
    const env=localEnvironment()
    const name=`elysium_qa_${process.pid}_${randomBytes(4).toString('hex')}`
    const admin=new Pool({connectionString:databaseUrl(env.MIGRATION_DATABASE_URL,'postgres'),max:1})
    const url=databaseUrl(env.MIGRATION_DATABASE_URL,name)
    process.env.DATABASE_URL=url
    process.env.ELYSIUM_TEST_MODE='true'
    process.env.ELYSIUM_ROLE='test'
    await admin.query(`CREATE DATABASE ${name}`)
    try {await migrateDatabase(url)} catch(error) {
        await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);await admin.end();throw error
    }
    let closed=false
    return {
        name,url,
        roleUrl(role:'gateway'|'worker'|'web') {return databaseUrl(env[role==='gateway'?'DATABASE_URL':role==='worker'?'WORKER_DATABASE_URL':'WEB_DATABASE_URL'],name)},
        async close() {
            if(closed)return;closed=true
            await (await import('../../src/database/client.js')).db.close()
            await admin.query(`DROP DATABASE ${name} WITH (FORCE)`)
            await admin.end()
        }
    }
}
