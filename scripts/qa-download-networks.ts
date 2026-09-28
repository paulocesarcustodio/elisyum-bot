/** Opt-in live downloads from public extractor fixtures; no WhatsApp messages. */
import assert from 'node:assert/strict'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import {tmpdir} from 'node:os'
import {createTestDatabase} from './testing/database.js'

const root=path.resolve(import.meta.dir,'..')
const sandbox=await fs.mkdtemp(path.join(tmpdir(),'elysium-network-qa-'))
process.env.BLOB_STORAGE_PATH=path.join(sandbox,'blobs')
const test=await createTestDatabase()
const {QueuedMediaProcessor}=await import('../src/infrastructure/media-client.js')
const {stopJobs}=await import('../src/infrastructure/jobs.js')
const {detectPlatform}=await import('../src/utils/general.util.js')
const {runProcess}=await import('../src/infrastructure/subprocess.js')
const worker=Bun.spawn([process.execPath,'src/workers/media.worker.ts'],{
    cwd:root,env:{...process.env,DATABASE_URL:test.roleUrl('worker'),ELYSIUM_ROLE:'media-worker',WORK_QUEUE:'media'},
    stdout:Bun.file(path.join(sandbox,'worker.log')),stderr:Bun.file(path.join(sandbox,'worker-errors.log')),
})
const samples=[
    ['youtube','https://www.youtube.com/watch?v=jNQXAC9IVRw'],
    ['instagram','https://www.instagram.com/reel/Chunk8-jurw/'],
    ['tiktok','https://www.tiktok.com/@patroxofficial/video/6742501081818877190'],
    ['twitter','https://twitter.com/captainamerica/status/719944021058060289'],
    ['pinterest-video','https://www.pinterest.com/pin/664281013778109217/'],
    ['pinterest-image','https://www.pinterest.com/pin/388224430372660239/'],
    ['facebook','https://www.facebook.com/cnn/videos/10155529876156509/'],
]
if(process.env.QA_DOWNLOAD_URL)samples.push(['user-sample',process.env.QA_DOWNLOAD_URL])
const selected=process.argv.slice(2)
const results:Record<string,unknown>[]=[]
const processor=new QueuedMediaProcessor()
try {
    for(const [label,url] of samples.filter(([label])=>!selected.length||selected.includes(label))){
        const started=Date.now(),progress:number[]=[]
        const execute=<T>(name:string,args:unknown[],track=false)=>processor.execute<T>('download.'+name,args,{ownerId:'qa:'+label,timeoutMs:70_000,onProgress:track?percent=>{progress.push(percent)}:undefined})
        try {
            const platform=detectPlatform(url)
            let buffer:Buffer,type='video'
            if(platform==='youtube'){
                const metadata=await execute<any>('youtubeMedia',[url]);assert(metadata?.id_video)
                buffer=await execute('downloadYouTubeVideo',[url],true)
            }else if(platform==='instagram'){
                const metadata=await execute<any>('instagramMedia',[url]);assert(metadata?.media?.length,'Instagram returned no public media')
                const media=metadata.media[0];type=media.type
                buffer=await execute(type==='video'?'downloadInstagramMedia':'downloadInstagramImage',[media.url],type==='video')
            }else if(platform==='tiktok'){
                const metadata=await execute<any>('tiktokMedia',[url]);assert(metadata?.url)
                type=metadata.type==='image'?'image':'video'
                buffer=await execute(type==='video'?'downloadVideoFromUrl':'downloadFromUrl',[Array.isArray(metadata.url)?metadata.url[0]:metadata.url],true)
            }else if(platform==='twitter'){
                const metadata=await execute<any>('xMedia',[url]);assert(metadata?.media?.length,'X returned no video')
                buffer=await execute('downloadVideoFromUrl',[metadata.media[0].url],true)
            }else if(platform==='pinterest'){
                const metadata=await execute<any>('pinterestMedia',[url]);type=metadata.type
                assert.equal(type,label.endsWith('image')?'image':'video')
                buffer=await execute(type==='video'?'downloadPinterestVideo':'downloadFromUrl',[metadata.url],true)
            }else if(platform==='facebook'){
                const metadata=await execute<any>('facebookMedia',[url]);assert(metadata?.sd)
                buffer=await execute('downloadVideoFromUrl',[metadata.sd],true)
            }else throw new Error('Unsupported test platform')
            assert(buffer.length>1000)
            const file=path.join(sandbox,label+(type==='image'?'.jpg':'.mp4'))
            await fs.writeFile(file,buffer)
            const probe=JSON.parse((await runProcess('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file])).toString())
            assert(probe.streams.some((stream:any)=>stream.codec_type==='video'&&stream.width>0))
            if(progress.length){assert.equal(progress.at(-1),100);assert(progress.every((p,i)=>!i||p>progress[i-1]))}
            const row={label,url,status:'passed',type,bytes:buffer.length,duration:probe.format.duration,progress,elapsedMs:Date.now()-started}
            results.push(row);console.log(JSON.stringify(row))
        }catch(error){
            const row={label,url,status:'failed',error:(error as Error).message,progress,elapsedMs:Date.now()-started}
            results.push(row);console.log(JSON.stringify(row))
        }
    }
    await fs.writeFile(path.join(root,'codex-scripts/download-networks-qa'+(selected.length?'-'+selected.join('-'):'')+'.json'),JSON.stringify({sandbox,results},null,2)+'\n')
}finally{
    if(worker.exitCode===null){worker.kill('SIGTERM');await worker.exited}
    await stopJobs();await test.close()
}
process.exit(results.every(row=>row.status==='passed')?0:1)
