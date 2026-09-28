import {auth} from './auth'
import {db} from '@/db'
import {user} from '@/db/schema'
import {eq} from '@/db/expressions'
import {NextResponse} from 'next/server'
export class HttpError extends Error {constructor(message:string,readonly status=400){super(message)}}
export async function requireSession(request:Request,admin=false){
    const session=await auth.api.getSession({headers:request.headers})
    if(!session)throw new HttpError('Entre no painel para continuar.',401)
    const [current]=await db.select().from(user).where(eq(user.id,session.user.id)).limit(1)
    if(!current || current.banned)throw new HttpError('Acesso indisponível.',403)
    if(admin && current.role!=='admin')throw new HttpError('Acesso restrito à administração.',403)
    if(!['GET','HEAD'].includes(request.method)){
        const origin=request.headers.get('origin')
        const allowed=new URL(process.env.BETTER_AUTH_URL || request.url).origin
        if(origin && origin!==allowed)throw new HttpError('Origem da solicitação não autorizada.',403)
    }
    return {...session,user:current}
}
export function actorFor(session:{user:{id:string;role?:string|null}}){return {id:`web:${session.user.id}`,admin:session.user.role==='admin'}}
export function apiError(error:unknown){
    if(error instanceof HttpError)return NextResponse.json({error:error.message},{status:error.status})
    const value=error as {message?:string;code?:string;cause?:{code?:string}}
    if(value.code==='23505'||value.cause?.code==='23505')return NextResponse.json({error:'Esse nome já está em uso.'},{status:409})
    // SQL errors can contain private values; never return database diagnostics.
    if(value.cause?.code || value.code)return NextResponse.json({error:'Não foi possível concluir a operação.'},{status:500})
    return NextResponse.json({error:value.message || 'Não foi possível concluir a operação.'},{status:400})
}
