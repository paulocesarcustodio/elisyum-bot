/** Real byte streams, yt-dlp, FFmpeg and a separate worker; disposable database. */
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { ytDlpProgress, ffmpegProgress } from '../src/utils/progress.util.js'
import { createStatusUpdater } from '../src/helpers/status-editor.helper.js'
import { createTestDatabase } from './testing/database.js'

const root=path.resolve(import.meta.dir,'..')
const sandbox=await fs.mkdtemp(path.join(tmpdir(),'elysium-progress-qa-'))
process.env.BLOB_STORAGE_PATH=path.join(sandbox,'blobs')
const test=await createTestDatabase()
const {db}=await import('../src/database/client.js')
const {QueuedMediaProcessor}=await import('../src/infrastructure/media-client.js')
const {createJobProgress}=await import('../src/infrastructure/job-progress.js')
const {stopJobs}=await import('../src/infrastructure/jobs.js')
const {runProcess}=await import('../src/infrastructure/subprocess.js')
const report:Record<string,unknown>={}
let worker:ReturnType<typeof Bun.spawn>|undefined
let server:ReturnType<typeof createServer>|undefined
try {
    const parsed:number[]=[],parse=ytDlpProgress(percent=>{parsed.push(percent)})
    parse('noise 5%\nelysium-prog');parse('ress:20/100/NA\nelysium-progress:5/NA/10\nelysium-progress:NA/NA/NA\n')
    parse('elysium-progress:100/100/NA\n')
    assert.deepEqual(parsed,[20,50,99])
    const frames:number[]=[],frame=ffmpegProgress(10,percent=>{frames.push(percent)})
    frame('frame=1\nout_time_');frame('us=2500000\nprogress=continue\nout_time_us=10000000\n')
    assert.deepEqual(frames,[25,99])
    const output:number[]=[]
    await runProcess(process.execPath,['-e',"process.stdout.write('elysium-progress:40/100/NA\\n')"],{onStdout:ytDlpProgress(percent=>{output.push(percent)})})
    assert.deepEqual(output,[40])
    report.parsers='partial/multiple lines, unknown totals and subprocess stdout passed'

    const writes:string[]=[]
    let editing=0,maxEditing=0
    const update=createStatusUpdater(async text=>{
        editing++;maxEditing=Math.max(maxEditing,editing)
        await Bun.sleep(35);writes.push(text);editing--
    },'initial',60)
    const initial=[update('10%'),update('20%'),update('30%')]
    await Promise.all(initial)
    await update('30%')
    const later=[update('40%'),update('70%'),update('Concluído',true)]
    await Promise.all(later);await Bun.sleep(90)
    assert.equal(maxEditing,1)
    assert.deepEqual(writes,['30%','Concluído'])
    report.editor={writes,serialized:true}

    const fenced=await db.prepare("INSERT INTO media_jobs(owner_id,operation,input,status,attempt,expires_at) VALUES('qa','probe','[]','running',1,now()+interval '1 minute') RETURNING id").get()
    const old=createJobProgress(fenced.id,1)
    old.report(35);await old.close()
    assert.equal((await db.prepare('SELECT progress FROM media_jobs WHERE id=?').get(fenced.id)).progress,35)
    await db.prepare('UPDATE media_jobs SET attempt=2,progress=40 WHERE id=?').run(fenced.id)
    const stale=createJobProgress(fenced.id,1);stale.report(95);await stale.close()
    assert.equal((await db.prepare('SELECT progress FROM media_jobs WHERE id=?').get(fenced.id)).progress,40)
    const current=createJobProgress(fenced.id,2);current.report(75);current.report(50);current.report(NaN);await current.close()
    assert.equal((await db.prepare('SELECT progress FROM media_jobs WHERE id=?').get(fenced.id)).progress,75)
    await db.prepare("UPDATE media_jobs SET status='cancelled' WHERE id=?").run(fenced.id)
    const cancelled=createJobProgress(fenced.id,2);cancelled.report(99);await cancelled.close()
    assert.equal((await db.prepare('SELECT progress FROM media_jobs WHERE id=?').get(fenced.id)).progress,75)
    report.fencing='stale attempts, cancellation and backward percentages passed'

    const fixture=path.join(sandbox,'clip.mp4')
    await runProcess('ffmpeg',['-f','lavfi','-i','testsrc2=size=320x180:rate=24','-t','3','-c:v','libx264','-preset','ultrafast','-movflags','+faststart','-y',fixture])
    const video=await fs.readFile(fixture)
    const bytes=Buffer.alloc(512*1024,7)
    const large=Buffer.alloc(9*1024*1024,7)
    server=createServer((request,response)=>{
        const body=request.url?.includes('clip.mp4')?video:request.url?.startsWith('/large')?large:bytes
        const known=!request.url?.startsWith('/unknown')
        const fail=request.url?.startsWith('/broken')
        response.setHeader('Content-Type',request.url?.includes('clip.mp4')?'video/mp4':'application/octet-stream')
        if(known)response.setHeader('Content-Length',body.length)
        if(request.method==='HEAD'){response.end();return}
        let offset=0
        const part=Math.ceil(body.length/20)
        const timer=setInterval(()=>{
            if(fail && offset>=part*2){clearInterval(timer);response.destroy();return}
            const next=Math.min(offset+part,body.length)
            response.write(body.subarray(offset,next));offset=next
            if(offset===body.length){clearInterval(timer);response.end()}
        },100)
        response.on('close',()=>clearInterval(timer))
    })
    await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve))
    const base='http://127.0.0.1:'+(server.address() as {port:number}).port
    worker=Bun.spawn([process.execPath,'src/workers/media.worker.ts'],{
        cwd:root,env:{...process.env,DATABASE_URL:test.roleUrl('worker'),ELYSIUM_ROLE:'media-worker',WORK_QUEUE:'media'},
        stdout:Bun.file(path.join(sandbox,'worker.log')),stderr:Bun.file(path.join(sandbox,'worker-errors.log')),
    })
    const processor=new QueuedMediaProcessor()
    const collect=async(operation:string,args:unknown[],label:string)=>{
        const values:number[]=[]
        let active=0,maximum=0
        const result=await processor.execute<Buffer>(operation,args,{ownerId:'qa:'+label,timeoutMs:45_000,onProgress:async percent=>{
            active++;maximum=Math.max(maximum,active)
            await Bun.sleep(40)
            values.push(percent);active--
        }})
        assert.equal(active,0,'Callback still running after job completion')
        assert.equal(maximum,1,'Overlapping progress callbacks')
        assert.equal(values.at(-1),100)
        assert(values.every((value,index)=>index===0||value>values[index-1]),'Repeated or decreasing progress')
        return {result,values}
    }
    const streamed=await collect('download.downloadFromUrl',[base+'/known'],'http')
    assert.deepEqual(streamed.result,bytes)
    assert(streamed.values.filter(value=>value>0&&value<100).length>=3,JSON.stringify(streamed.values))
    report.http=streamed.values
    const unknown=await collect('download.downloadFromUrl',[base+'/unknown'],'unknown')
    assert.deepEqual(unknown.result,bytes)
    assert.deepEqual(unknown.values,[100],'Unknown content length must not invent a percentage')
    report.unknown=unknown.values

    const largeVideo=await collect('download.downloadVideoFromUrl',[base+'/large'],'large-video')
    assert.deepEqual(largeVideo.result,large)
    assert(largeVideo.values.some(value=>value>0&&value<100))
    report.largeVideo=largeVideo.values

    // Two requests sharing a single download must both receive live progress.
    const shared=await Promise.all([0,1].map(index=>collect('download.downloadInstagramMedia',[base+'/clip.mp4'],'yt-dlp-'+index)))
    for(const item of shared){assert(item.result.length>1000);assert(item.values.filter(value=>value>0&&value<100).length>=2,JSON.stringify(item.values))}
    report.ytDlp=shared.map(item=>item.values)

    const converted=await collect('ffmpeg.raw',[{inputBuffers:[video],args:['-re','-i','blob-input-0','-c','copy'],outputExt:'mp4'}],'ffmpeg')
    assert(converted.result.length>1000)
    assert(converted.values.filter(value=>value>0&&value<100).length>=3,JSON.stringify(converted.values))
    report.ffmpeg=converted.values

    const download=await import('../src/utils/download.util.js')
    const failed:number[]=[]
    await assert.rejects(()=>download.downloadFromUrl(base+'/large'))
    await assert.rejects(()=>download.downloadFromUrl(base+'/broken',percent=>{failed.push(percent)}))
    assert(!failed.includes(100),'Interrupted stream reported completion')
    report.interruption=failed
    await fs.writeFile(path.join(root,'codex-scripts/download-progress-qa.json'),JSON.stringify({passed:true,...report},null,2)+'\n')
    console.log(JSON.stringify({passed:true,...report},null,2))
} finally {
    if(worker && worker.exitCode===null){worker.kill('SIGTERM');await worker.exited}
    if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()))}
    await stopJobs();await test.close()
}
process.exit(0)
