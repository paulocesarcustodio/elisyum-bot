import {db} from '@/db'
import {savedAudios} from '@/db/schema'
import {like,desc,count} from '@/db/expressions'
import {NextResponse} from 'next/server'
import {queueAudio,deleteAudio} from '@/lib/bot-services'
import {requireSession,actorFor,apiError,HttpError} from '@/lib/access'
export const runtime='nodejs'
export async function GET(request:Request){
    try{
        const session=await requireSession(request)
        const params=new URL(request.url).searchParams
        const page=Math.max(1,Math.min(100_000,Number(params.get('page')) || 1))
        const limit=Math.max(1,Math.min(100,Number(params.get('limit')) || 50))
        const search=(params.get('search') || '').slice(0,100)
        const where=search?like(savedAudios.audioName,`%${search}%`):undefined
        const [totals,audios]=await Promise.all([
            db.select({count:count()}).from(savedAudios).where(where),
            db.select({id:savedAudios.id,audioName:savedAudios.audioName,ownerJid:savedAudios.ownerJid,mimeType:savedAudios.mimeType,seconds:savedAudios.seconds,ptt:savedAudios.ptt,createdAt:savedAudios.createdAt}).from(savedAudios).where(where).orderBy(desc(savedAudios.createdAt)).limit(limit).offset((page-1)*limit),
        ])
        const actor=actorFor(session)
        return NextResponse.json({audios:audios.map(audio=>({...audio,canEdit:actor.admin || audio.ownerJid===actor.id})),total:totals[0].count,page,totalPages:Math.ceil(totals[0].count/limit)})
    }catch(error){return apiError(error)}
}
export async function POST(request:Request){
    try{
        const session=await requireSession(request)
        if(Number(request.headers.get('content-length'))>25*1024*1024)throw new HttpError('O arquivo deve ter no máximo 24 MB.',413)
        const form=await request.formData()
        const file=form.get('file'),name=form.get('name')
        if(!(file instanceof File) || typeof name!=='string')throw new HttpError('Informe o arquivo e o nome.')
        if(file.size>24*1024*1024 || !file.size)throw new HttpError('O arquivo deve ter entre 1 byte e 24 MB.',413)
        const id=await queueAudio(name,Buffer.from(await file.arrayBuffer()),actorFor(session))
        return NextResponse.json({jobId:id,status:'queued'},{status:202,headers:{Location:`/api/jobs/${id}`}})
    }catch(error){return apiError(error)}
}
export async function DELETE(request:Request){
    try{
        const session=await requireSession(request)
        await deleteAudio(new URL(request.url).searchParams.get('name') || '',actorFor(session))
        return NextResponse.json({success:true})
    }catch(error){return apiError(error)}
}
