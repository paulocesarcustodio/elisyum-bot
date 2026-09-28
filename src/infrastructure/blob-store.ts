import { promises as fs } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import type { BlobStore, BlobReference } from '../domain/contracts.js'
import { db } from '../database/client.js'
export class LocalBlobStore implements BlobStore {
    readonly root=path.resolve(process.env.BLOB_STORAGE_PATH || 'storage/blobs')
    path(key:string){
        if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Chave de arquivo inválida.')
        return path.join(this.root,key.slice(0,2),key)
    }
    async put(data:Uint8Array,mimeType:string):Promise<BlobReference>{
        if(!data.byteLength || data.byteLength>64*1024*1024)throw new Error('Arquivo vazio ou maior que 64 MB.')
        const key=createHash('sha256').update(data).digest('hex')
        const destination=this.path(key)
        await fs.mkdir(path.dirname(destination),{recursive:true,mode:0o700})
        const disk=await fs.statfs(this.root)
        if(disk.bavail*disk.bsize<data.byteLength+256*1024*1024)throw new Error('Espaço em disco insuficiente para salvar a mídia.')
        const temporary=destination+'.'+randomUUID()+'.tmp'
        try{
            await fs.writeFile(temporary,data,{flag:'wx',mode:0o600})
            await db.transaction(async()=>{
                await this.lock(key)
                await fs.link(temporary,destination).catch(error=>{if(error.code!=='EEXIST')throw error})
                await db.prepare(`INSERT INTO media_assets(key,hash,size,mime_type,expires_at) VALUES(?,?,?,?,now()+interval '7 days') ON CONFLICT(key) DO UPDATE SET expires_at=greatest(media_assets.expires_at,excluded.expires_at)`).run(key,key,data.byteLength,mimeType)
            })
        }finally{await fs.unlink(temporary).catch(()=>{})}
        return {key,hash:key,size:data.byteLength,mimeType}
    }
    async read(key:string){return fs.readFile(this.path(key))}
    async lock(key:string){await db.prepare('SELECT pg_advisory_xact_lock(hashtextextended(?,0))').get('blob:'+key)}
    async remove(key:string,expiredOnly=false){
        await db.transaction(async()=>{
            await db.prepare('SELECT pg_advisory_xact_lock_shared(hashtextextended(?,0))').get('blob-backup')
            await this.lock(key)
            if(expiredOnly && !(await db.prepare('SELECT key FROM media_assets WHERE key=? AND expires_at<now()').get(key)))return
            const referenced=await db.prepare('SELECT id FROM saved_audios WHERE blob_key=? LIMIT 1').get(key)
            if(referenced){if(expiredOnly)return;throw new Error('Arquivo ainda referenciado por um áudio.')}
            await fs.unlink(this.path(key)).catch(error=>{if(error.code!=='ENOENT')throw error})
            await db.prepare('DELETE FROM media_assets WHERE key=?').run(key)
        })
    }
    async collectExpired(){
        const rows=await db.prepare('SELECT key FROM media_assets WHERE expires_at<now() AND NOT EXISTS(SELECT 1 FROM saved_audios WHERE blob_key=media_assets.key) LIMIT 1000').all()
        for(const row of rows)await this.remove(row.key,true)
    }
}
export const blobs=new LocalBlobStore()
