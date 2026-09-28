import { db } from '../database/client.js'
import { blobs } from '../infrastructure/blob-store.js'
import { ffmpegPool,probeFile } from '../utils/worker-pool.util.js'
import { mediaProcessor,shouldQueueWork,submitWork } from '../infrastructure/media-client.js'
export interface AudioActor {id:string;aliases?:string[];admin?:boolean}
export function audioName(value:unknown):string{
    if(typeof value!=='string')throw new Error('Informe o nome do áudio.')
    const name=value.trim().toLowerCase()
    if(!name || name.length>100 || /[\x00-\x1f/\\]/.test(name))throw new Error('Nome de áudio inválido (1 a 100 caracteres).')
    return name
}
export async function prepareAudio(buffer:Buffer){
    if(!buffer.length || buffer.length>24*1024*1024)throw new Error('O áudio deve ter entre 1 byte e 24 MB.')
    const converted=await ffmpegPool.exec({inputBuffer:buffer,inputExt:'bin',args:['-vn','-codec:a','libmp3lame','-qscale:a','2','-t','540'],outputExt:'mp3',timeout:60_000,maxOutputBytes:24*1024*1024})
    const asset=await blobs.put(converted,'audio/mpeg')
    const metadata=await probeFile(blobs.path(asset.key))
    if(!metadata.streams?.some(stream=>stream.codec_type==='audio') || !Number.isFinite(Number(metadata.format?.duration)))throw new Error('O arquivo não contém áudio válido.')
    return {blobKey:asset.key,filePath:blobs.path(asset.key),mimeType:'audio/mpeg',seconds:Math.round(Number(metadata.format?.duration))}
}
export async function persistAudio(name:string,ownerId:string,media:Awaited<ReturnType<typeof prepareAudio>>,ptt=false){
    return db.transaction(async()=>{
        await blobs.lock(media.blobKey)
        return db.prepare(`INSERT INTO saved_audios(owner_jid,audio_name,file_path,blob_key,mime_type,seconds,ptt) VALUES(?,?,?,?,?,?,?) RETURNING id,audio_name AS name,seconds`)
            .get(ownerId,audioName(name),media.filePath,media.blobKey,media.mimeType,media.seconds,ptt?1:0)
    })
}
export async function saveAudio(name:string,buffer:Buffer,actor:AudioActor,ptt=false){
    name=audioName(name)
    if(shouldQueueWork())return mediaProcessor.execute('audio.upload',[name,buffer,ptt],{ownerId:actor.id,timeoutMs:90_000})
    return persistAudio(name,actor.id,await prepareAudio(buffer),ptt)
}
export async function queueAudio(name:string,buffer:Buffer,actor:AudioActor){
    return submitWork('audio.upload',[audioName(name),buffer,false],actor.id,120)
}
export async function deleteAudio(name:string,actor:AudioActor){
    const row=await db.prepare('DELETE FROM saved_audios WHERE audio_name=? AND (owner_jid=ANY(?::text[]) OR ?) RETURNING id').get(audioName(name),[actor.id,...actor.aliases || []],!!actor.admin)
    if(!row)throw new Error('Áudio não encontrado ou sem permissão para excluir.')
    return row
}
export async function renameAudio(oldName:string,newName:string,actor:AudioActor){
    const row=await db.prepare('UPDATE saved_audios SET audio_name=? WHERE audio_name=? AND (owner_jid=ANY(?::text[]) OR ?) RETURNING id').get(audioName(newName),audioName(oldName),[actor.id,...actor.aliases || []],!!actor.admin)
    if(!row)throw new Error('Áudio não encontrado ou sem permissão para renomear.')
    return row
}
