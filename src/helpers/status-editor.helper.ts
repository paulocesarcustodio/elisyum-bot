/** One edit at a time, keeping only the newest pending progress text. */
export function createStatusUpdater(
    write:(text:string)=>Promise<void>, initialText:string, intervalMs=1000,
) {
    type Pending={text:string;immediate:boolean;done:Array<()=>void>}
    let pending:Pending|undefined,active=false,lastText=initialText,lastSent=Date.now()
    let timer:ReturnType<typeof setTimeout>|undefined
    const pump=()=>{
        if(active || !pending)return
        if(timer){clearTimeout(timer);timer=undefined}
        if(pending.text===lastText){const skipped=pending;pending=undefined;skipped.done.forEach(resolve=>resolve());return}
        const remaining=pending.immediate?0:Math.max(0,intervalMs-(Date.now()-lastSent))
        if(remaining){timer=setTimeout(()=>{timer=undefined;pump()},remaining);return}
        const current=pending
        pending=undefined;active=true
        void write(current.text).catch(()=>{}).finally(()=>{
            lastText=current.text;lastSent=Date.now();active=false
            current.done.forEach(resolve=>resolve())
            pump()
        })
    }
    return (text:string,immediate=false):Promise<void>=>new Promise(resolve=>{
        if(!active && !pending && text===lastText){resolve();return}
        if(pending){pending.text=text;pending.immediate ||= immediate;pending.done.push(resolve)}
        else pending={text,immediate,done:[resolve]}
        pump()
    })
}
