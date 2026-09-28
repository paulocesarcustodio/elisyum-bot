import { db } from '../database/client.js'

/** Coalesce frequent byte/frame events and fence writes to this worker attempt. */
export function createJobProgress(id:string,attempt:number) {
    let latest=0,written=0,closed=false
    let timer:ReturnType<typeof setTimeout>|undefined
    let pending=Promise.resolve()
    const flush=()=>{
        if(latest<=written)return pending
        const percent=latest
        written=percent
        pending=pending.then(async()=>{
            await db.prepare(`UPDATE media_jobs SET progress=GREATEST(progress,?),updated_at=now()
                WHERE id=? AND status='running' AND attempt=? AND expires_at>now()`)
                .run(percent,id,attempt)
        }).catch(()=>{console.warn('[Media progress] Não foi possível atualizar o progresso do trabalho.')})
        return pending
    }
    return {
        report(percent:number) {
            if(closed || !Number.isFinite(percent))return
            const value=Math.max(0,Math.min(99,Math.floor(percent)))
            if(value<=latest)return
            latest=value
            if(!timer)timer=setTimeout(()=>{timer=undefined;void flush()},250)
        },
        async close() {
            closed=true
            if(timer){clearTimeout(timer);timer=undefined}
            await flush()
        },
    }
}
