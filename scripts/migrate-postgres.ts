import { migrateDatabase } from '../src/database/migrate.js'
import { databaseUrl,localEnvironment } from './testing/local-env.js'
const name=process.argv[2] || 'elysium_stage'
if(!/^[a-z][a-z0-9_]+$/.test(name))throw new Error('Invalid database name')
const env=localEnvironment()
await migrateDatabase(databaseUrl(env.MIGRATION_DATABASE_URL,name))
console.log(`Migrations applied to ${name}; WhatsApp keys restricted to gateway role.`)
