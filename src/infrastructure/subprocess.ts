import { spawn } from 'node:child_process'
import { AsyncLocalStorage } from 'node:async_hooks'
export const workSignal=new AsyncLocalStorage<AbortSignal>()
/** One bounded process group; cancellation also stops grandchildren (yt-dlp/ffmpeg). */
export async function runProcess(binary:string,args:string[],options:{timeoutMs?:number;maxOutputBytes?:number;signal?:AbortSignal;onStdout?:(chunk:string)=>void;onStderr?:(chunk:string)=>void}={}):Promise<Buffer>{
    const signal=options.signal || workSignal.getStore()
    signal?.throwIfAborted()
    return new Promise((resolve,reject)=>{
        const grouped=process.platform!=='win32'
        const child=spawn(binary,args,{stdio:['ignore','pipe','pipe'],detached:grouped})
        const chunks:Buffer[]=[]
        let size=0,errorText='',failure:Error|undefined,killTimer:ReturnType<typeof setTimeout>|undefined
        const kill=(kind:NodeJS.Signals)=>{try{if(grouped&&child.pid)process.kill(-child.pid,kind);else child.kill(kind)}catch{}}
        const fail=(error:Error)=>{if(failure)return;failure=error;kill('SIGTERM');killTimer=setTimeout(()=>kill('SIGKILL'),1000);killTimer.unref()}
        const aborted=()=>fail(new Error('Processamento cancelado.'))
        signal?.addEventListener('abort',aborted,{once:true})
        if(signal?.aborted)aborted()
        const timeout=setTimeout(()=>fail(new Error(`${binary}: tempo limite excedido`)),options.timeoutMs || 120_000)
        const cleanup=()=>{clearTimeout(timeout);if(killTimer)clearTimeout(killTimer);signal?.removeEventListener('abort',aborted)}
        child.stdout.on('data',(chunk:Buffer)=>{
            size+=chunk.length
            if(size>(options.maxOutputBytes || 5*1024*1024))fail(new Error(`${binary}: saída maior que o limite`))
            else {chunks.push(chunk);options.onStdout?.(chunk.toString())}
        })
        child.stderr.on('data',(chunk:Buffer)=>{errorText=(errorText+chunk.toString()).slice(-8000);options.onStderr?.(chunk.toString())})
        child.on('error',error=>{cleanup();reject(error)})
        child.on('close',code=>{cleanup();if(failure){kill('SIGKILL');reject(failure)}else if(code!==0)reject(new Error(`${binary} encerrou (${code}): ${errorText.slice(-800)}`));else resolve(Buffer.concat(chunks))})
    })
}
