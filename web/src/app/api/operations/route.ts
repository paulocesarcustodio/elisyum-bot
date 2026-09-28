import {NextResponse} from 'next/server'
import {requireSession,apiError} from '@/lib/access'
import {queries} from '@/lib/bot-services'
export async function GET(request:Request){
    try{
        await requireSession(request,true)
        const [operations,counts]=await Promise.all([
            queries.prepare('SELECT id,command,source,status,attempts,created_at,updated_at FROM command_operations ORDER BY created_at DESC LIMIT 100').all(),
            queries.prepare("SELECT status,count(*) AS total FROM media_jobs WHERE created_at>now()-interval '24 hours' GROUP BY status").all(),
        ])
        return NextResponse.json({operations,jobs:counts})
    }catch(error){return apiError(error)}
}
