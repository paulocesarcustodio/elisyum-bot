import { db } from '../database/client.js'
export interface AdmissionLimit {key:string;limit:number;seconds?:number}
/** One short transaction reserves every limit, or none. */
export async function admit(limits:AdmissionLimit[]):Promise<boolean> {
    const blocked=new Error('ADMISSION_REJECTED')
    try {
        return await db.transaction(async()=>{
            for(const entry of [...limits].sort((a,b)=>a.key.localeCompare(b.key))){
                const window=Math.floor(Date.now()/((entry.seconds || 60)*1000))
                const row=await db.prepare(`INSERT INTO admission_windows(key,"window",count) VALUES(?,?,1)
                    ON CONFLICT(key,"window") DO UPDATE SET count=admission_windows.count+1
                    WHERE admission_windows.count < ? RETURNING count`).get(entry.key,window,entry.limit)
                if(!row)throw blocked
            }
            return true
        })
    }catch(error){if(error===blocked)return false;throw error}
}
