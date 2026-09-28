import { Pool, types } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { sql, type SQL } from 'drizzle-orm'
import { AsyncLocalStorage } from 'node:async_hooks'
import * as schema from './schema.js'
import { currentOperation } from '../application/operation-context.js'

// Application counts/epoch seconds fit JavaScript's safe integer range.
types.setTypeParser(20, value => {
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed)) throw new RangeError('Database integer exceeds the supported range')
    return parsed
})
types.setTypeParser(1184, value => new Date(value).toISOString())
export const pool = new Pool({
    connectionString:process.env.DATABASE_URL || 'postgresql://unconfigured@127.0.0.1:1/unconfigured',
    max:Number(process.env.DATABASE_POOL_SIZE || 8), idleTimeoutMillis:10_000,
    connectionTimeoutMillis:5_000, application_name:process.env.ELYSIUM_ROLE || 'elysium',
})
pool.on('error', error => console.error('[Database] Idle connection failed:',error.message))
export const orm = drizzle(pool,{schema})
type Executor = Pick<typeof orm,'execute'>
const transaction = new AsyncLocalStorage<Executor>()

/** Bind values through Drizzle; SQL text is internal, never request-provided. */
function bind(statement: string, values: unknown[]): SQL {
    const parts: SQL[] = []
    let offset=0, questionIndex=0
    for (const match of statement.matchAll(/\?|\$(\d+)/g)) {
        parts.push(sql.raw(statement.slice(offset,match.index)))
        const index=match[1] ? Number(match[1])-1 : questionIndex++
        if (index >= values.length) throw new Error('Missing SQL parameter')
        parts.push(sql`${sql.param(values[index] ?? null)}`)
        offset=match.index!+match[0].length
    }
    parts.push(sql.raw(statement.slice(offset)))
    return sql.join(parts,sql.raw(''))
}
export function assertDatabaseConfigured() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Start with scripts/local-runtime.py or the test database helper.')
}
async function executeSafe(executor:Executor,statement:string,values:unknown[]){
    try{return await executor.execute(bind(statement,values))}catch(error){
        // Drizzle diagnostics include bound values, including session keys. Keep
        // only PostgreSQL's public error code at the application boundary.
        const source=error as {code?:string;cause?:{code?:string}}
        const code=source.cause?.code || source.code || 'XX000'
        const safe=new Error(code==='23505'?'Esse registro já existe.':`Não foi possível acessar o armazenamento (${code}).`) as Error & {code:string}
        safe.code=code
        throw safe
    }
}
export async function query(statement:string,values:unknown[] = []) {
    assertDatabaseConfigured()
    const operation=currentOperation()
    // Record the start of local business effects in the SAME transaction. A
    // crashed gateway never blindly repeats increments or partially applied work.
    const businessWrite=/^\s*(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:users|groups_data|participants|saved_audios|bot_accounts|role_grants|confirmations)\b/i.test(statement)
    if(operation && businessWrite){
        return db.transaction(async()=>{
            const executor=transaction.getStore()!
            await executeSafe(executor,'UPDATE command_operations SET effects_started=true WHERE id=?',[operation.id])
            return executeSafe(executor,statement,values)
        })
    }
    return executeSafe(transaction.getStore() || orm,statement,values)
}
export const db = {
    prepare(statement:string) {
        return {
            async get(...values:unknown[]):Promise<any | undefined> {return (await query(statement,values)).rows[0]},
            async all(...values:unknown[]):Promise<any[]> {return (await query(statement,values)).rows},
            async run(...values:unknown[]) {const result=await query(statement,values);return {changes:result.rowCount || 0,rows:result.rows}},
        }
    },
    async run(statement:string,...values:unknown[]) {return query(statement,values)},
    async transaction<T>(action:()=>Promise<T>):Promise<T> {
        if (transaction.getStore()) return action()
        return orm.transaction(tx => transaction.run(tx,action))
    },
    async close() {await pool.end()},
}
export default db
