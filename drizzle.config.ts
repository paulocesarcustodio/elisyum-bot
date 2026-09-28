import { defineConfig } from 'drizzle-kit'
export default defineConfig({dialect:'postgresql',schema:'./src/database/schema.ts',out:'./migrations',dbCredentials:{url:process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL || ''},strict:true})
