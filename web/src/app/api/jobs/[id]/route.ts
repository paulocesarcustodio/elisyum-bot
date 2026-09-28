import {NextResponse} from 'next/server'
import {queries,cancelWork} from '@/lib/bot-services'
import {requireSession,actorFor,apiError,HttpError} from '@/lib/access'
type Context={params:Promise<{id:string}>}
async function access(request:Request,context:Context){
    const session=await requireSession(request)
    const actor=actorFor(session),{id}=await context.params
    if(!/^[a-f0-9-]{36}$/i.test(id))throw new HttpError('Identificação inválida.')
    const job=await queries.prepare('SELECT id,owner_id,status,progress,error,result,expires_at FROM media_jobs WHERE id=? AND (owner_id=? OR ?)').get(id,actor.id,actor.admin)
    if(!job)throw new HttpError('Tarefa não encontrada.',404)
    if(['queued','running'].includes(job.status)&&Date.parse(job.expires_at)<Date.now())job.status='expired'
    return {job,actor,id}
}
export async function GET(request:Request,context:Context){
    try{
        const {job}=await access(request,context)
        // Do not expose SQL diagnostics, file paths or another user's task input.
        return NextResponse.json({id:job.id,status:job.status,progress:job.progress,error:job.status==='failed'?'Não foi possível processar esse arquivo. Verifique o formato e tente novamente.':null,result:job.status==='completed'?job.result:null})
    }catch(error){return apiError(error)}
}
export async function DELETE(request:Request,context:Context){
    try{const {id,actor}=await access(request,context);await cancelWork(id,actor.id,actor.admin);return NextResponse.json({success:true})}catch(error){return apiError(error)}
}
