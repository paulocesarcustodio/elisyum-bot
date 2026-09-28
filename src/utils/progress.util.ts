export type ProgressCallback = (percent:number)=>void|Promise<void>

/** Subprocess chunks need not coincide with lines. Keep incomplete records. */
export function progressLines(onLine:(line:string)=>void) {
    let remainder=''
    return (chunk:string)=>{
        const lines=(remainder+chunk).split(/\r?\n|\r/)
        remainder=lines.pop()!.slice(-8192)
        for(const line of lines)onLine(line)
    }
}

export const YTDLP_PROGRESS_TEMPLATE='download:elysium-progress:%(progress.downloaded_bytes)s/%(progress.total_bytes)s/%(progress.total_bytes_estimate)s'
export function ytDlpProgress(onProgress:ProgressCallback) {
    return progressLines(line=>{
        const match=line.match(/^elysium-progress:([^/]+)\/([^/]+)\/([^/]+)$/)
        if(!match)return
        const downloaded=Number(match[1]),total=Number(match[2]) || Number(match[3])
        if(Number.isFinite(downloaded) && Number.isFinite(total) && downloaded>=0 && total>0)
            void onProgress(Math.min(99,Math.floor(downloaded/total*100)))
    })
}

export function ffmpegProgress(durationSeconds:number,onProgress:ProgressCallback) {
    return progressLines(line=>{
        const match=line.match(/^out_time_us=(\d+)$/)
        if(match && durationSeconds>0)
            void onProgress(Math.min(99,Math.floor(Number(match[1])/1_000_000/durationSeconds*100)))
    })
}
