import {migrateDatabase} from '../../../src/database/migrate'
if(!process.env.MIGRATION_DATABASE_URL)throw new Error('Use o executor local ou informe MIGRATION_DATABASE_URL.')
await migrateDatabase(process.env.MIGRATION_DATABASE_URL)
