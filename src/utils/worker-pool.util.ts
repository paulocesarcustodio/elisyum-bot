import { promises as fs } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { runProcess } from '../infrastructure/subprocess.js'
import { mediaProcessor, shouldQueueWork } from '../infrastructure/media-client.js'
import { ffmpegProgress } from './progress.util.js'
export interface FFmpegOptions {
    inputBuffer?:Buffer;inputExt?:string;inputPaths?:string[];inputBuffers?:Buffer[]
    args:string[];outputExt:string;timeout?:number;maxOutputBytes?:number;onProgress?:(percent:number)=>void
}
let active=0
const waiters:Array<()=>void>=[]
async function convert(options:FFmpegOptions,raw:boolean):Promise<Buffer>{
    if(options.inputBuffer && options.inputBuffer.length>24*1024*1024)throw new Error('Mídia excede o limite de 24 MB para conversão.')
    const normalized={...options,args:[...options.args],inputBuffers:[...(options.inputBuffers || [])]}
    for(const input of options.inputPaths || [])normalized.inputBuffers.push(await fs.readFile(input))
    delete normalized.inputPaths
    if(raw){
        for(let i=0;i<normalized.args.length;i++)if(normalized.args[i]==='-i'&&!normalized.args[i+1].startsWith('blob-input-')){
            normalized.inputBuffers.push(await fs.readFile(normalized.args[i+1]))
            normalized.args[i+1]=`blob-input-${normalized.inputBuffers.length-1}`
        }
    }
    if(shouldQueueWork())return mediaProcessor.execute<Buffer>(raw?'ffmpeg.raw':'ffmpeg',[normalized],{timeoutMs:(options.timeout || 120_000)+30_000,onProgress:options.onProgress})
    if(active>=2){if(waiters.length>=8)throw new Error('Fila de conversão cheia.');await new Promise<void>(resolve=>waiters.push(resolve))}else active++
    let directory=''
    try{
        directory=await fs.mkdtemp(path.join(tmpdir(),'elysium-media-'))
        if(!/^[a-z0-9]{1,8}$/i.test(options.outputExt))throw new Error('Formato de saída inválido.')
        const inputs:string[]=[]
        for(const buffer of [options.inputBuffer,...normalized.inputBuffers].filter((buffer):buffer is Buffer=>!!buffer)){
            if(buffer.length>64*1024*1024)throw new Error('Mídia maior que o limite de conversão.')
            const file=path.join(directory,`input-${inputs.length}`);await fs.writeFile(file,buffer);inputs.push(file)
        }
        const args=raw ? normalized.args.map(value=>/^blob-input-\d+$/.test(value)?inputs[Number(value.slice(11))]:value) : [...inputs.flatMap(file=>['-i',file]),...options.args]
        const output=path.join(directory,'output.'+options.outputExt)
        const limit=Math.min(options.maxOutputBytes || 64*1024*1024,64*1024*1024)
        let duration=0
        if(options.onProgress && inputs[0])duration=Number((await probeFile(inputs[0])).format?.duration) || 0
        await runProcess(process.env.FFMPEG_PATH || 'ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-nostats','-progress','pipe:1','-stats_period','0.25',...args,'-threads','2','-fs',String(limit),'-y',output],{
            timeoutMs:Math.min(options.timeout || 120_000,180_000),
            onStdout:options.onProgress?ffmpegProgress(duration,options.onProgress):undefined,
        })
        const stat=await fs.stat(output)
        if(!stat.size || stat.size>=limit)throw new Error('A conversão produziu mídia vazia ou maior que o limite.')
        options.onProgress?.(100)
        return await fs.readFile(output)
    }finally{
        if(directory)await fs.rm(directory,{recursive:true,force:true})
        const next=waiters.shift();if(next)next();else active--
    }
}
// Compatibility facade. Conversions now run in the persistent media worker.
export const ffmpegPool={
    async initialize(_count?:number){},
    exec:(options:FFmpegOptions)=>convert(options,false),
    execRaw:(options:FFmpegOptions)=>convert(options,true),
    get status(){return {total:2,busy:active,queued:waiters.length}},
}
export async function probeFile(file:string):Promise<{format?:{duration?:string;format_name?:string};streams?:Array<{codec_type:string;codec_name:string}>}>{
    if(shouldQueueWork())return mediaProcessor.execute('probe',[await fs.readFile(file)],{timeoutMs:15_000})
    const output=await runProcess(process.env.FFPROBE_PATH || 'ffprobe',['-v','error','-show_entries','format=duration,format_name:stream=codec_type,codec_name','-of','json',file],{timeoutMs:10_000,maxOutputBytes:64*1024})
    return JSON.parse(output.toString()) as {format?:{duration?:string;format_name?:string};streams?:Array<{codec_type:string;codec_name:string}>}
}
