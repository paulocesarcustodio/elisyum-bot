import { PgBoss } from 'pg-boss'
import { query } from '../database/client.js'
let instance:PgBoss | undefined
let starting:Promise<PgBoss> | undefined
export const transactionalQueue = {executeSql:async(text:string,values?:unknown[])=>query(text,values)}
export async function jobs():Promise<PgBoss> {
    if(starting)return starting
    instance = new PgBoss({connectionString:process.env.DATABASE_URL!,migrate:false,supervise:true,schedule:true,superviseIntervalSeconds:Number(process.env.JOB_SUPERVISION_SECONDS || 10),monitorIntervalSeconds:Number(process.env.JOB_SUPERVISION_SECONDS || 10),max:4,application_name:`elysium-${process.env.ELYSIUM_ROLE || 'gateway'}-queue`})
    instance.on('error',error=>console.error(JSON.stringify({event:'queue.error',message:error.message})))
    starting=instance.start().then(()=>instance!)
    return starting
}
export async function stopJobs(){if(instance)await instance.stop({graceful:true,timeout:20_000});instance=undefined;starting=undefined}
