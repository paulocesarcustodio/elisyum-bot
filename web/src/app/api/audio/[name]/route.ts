import {db} from '@/db'
import {savedAudios} from '@/db/schema'
import {eq} from '@/db/expressions'
import {NextResponse} from 'next/server'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import {blobs,renameAudio} from '@/lib/bot-services'
import {requireSession,actorFor,apiError,HttpError} from '@/lib/access'
export const runtime='nodejs'
type Context={params:Promise<{name:string}>}
export async function PATCH(request:Request,{params}:Context){
    try{
        const session=await requireSession(request)
        const {name}=await params
        const {newName}=await request.json()
        await renameAudio(name,newName,actorFor(session))
        return NextResponse.json({success:true,newName:String(newName).trim().toLowerCase()})
    }catch(error){return apiError(error)}
}
export async function GET(request:Request,{params}:Context){
    try{
        await requireSession(request)
        const {name}=await params
        const [audio]=await db.select().from(savedAudios).where(eq(savedAudios.audioName,name.toLowerCase())).limit(1)
        if(!audio)throw new HttpError('Áudio não encontrado.',404)
        const file=audio.blobKey?blobs.path(audio.blobKey):path.resolve(audio.filePath)
        const legacyRoot=path.resolve(process.env.AUDIO_STORAGE_PATH || '../storage/audios')
        if(!audio.blobKey && !file.startsWith(legacyRoot+path.sep))throw new HttpError('Arquivo fora do armazenamento de áudio.',404)
        const buffer=await fs.readFile(file)
        return new NextResponse(new Uint8Array(buffer),{headers:{'Content-Type':audio.mimeType,'Content-Length':String(buffer.length),'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(audio.audioName)}.mp3`,'Cache-Control':'private, no-cache'}})
    }catch(error){return apiError(error)}
}
