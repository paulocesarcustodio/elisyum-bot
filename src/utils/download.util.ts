import {runProcess,workSignal} from '../infrastructure/subprocess.js'
import {mediaProcessor,shouldQueueWork} from '../infrastructure/media-client.js'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {detectPlatform, formatSeconds, showConsoleLibraryError} from './general.util.js'
import { getFbVideoInfo } from 'fb-downloader-scrapper'
import axios from 'axios'
import yts from 'yt-search'
import { YtDlp } from 'ytdlp-nodejs'
import Tiktok from "@tobyg74/tiktok-api-dl"

import { FacebookMedia, InstagramMedia, PinterestMedia, SpotifyInfo, TiktokMedia, XMedia, YTInfo } from '../interfaces/library.interface.js'
import botTexts from '../helpers/bot.texts.helper.js'
import { YOUTUBE_QUALITY_LIMIT } from '../config/youtube.config.js'
import NodeCache from 'node-cache'
import { ytDlpProgress, YTDLP_PROGRESS_TEMPLATE } from './progress.util.js'

const DOWNLOAD_CACHE_MAX_BYTES = 16 * 1024 * 1024
const DOWNLOAD_CACHE_MAX_ITEM_BYTES = 8 * 1024 * 1024
const downloadCache = new NodeCache({ stdTTL: 300, checkperiod: 60, maxKeys: 8, useClones: false })
type SharedDownload={promise:Promise<Buffer>;listeners:Set<(percent:number)=>void>;progress:number}
const inflightDownloads = new Map<string, SharedDownload>()
const cachedDownloadSizes = new Map<string, number>()
let cachedDownloadBytes = 0
const MAX_CONCURRENT_DOWNLOADS = 2
const MAX_QUEUED_DOWNLOADS = 6
let activeDownloads = 0
const downloadWaiters: Array<() => void> = []
const downloadMetadataCache = new NodeCache({ stdTTL: 300, checkperiod: 60, maxKeys: 500 })
const downloadMetadataInFlight = new Map<string, Promise<InstagramMedia>>()

async function withDownloadSlot<T>(download: () => Promise<T>): Promise<T> {
    let acquired = false
    if (activeDownloads >= MAX_CONCURRENT_DOWNLOADS) {
        if (downloadWaiters.length >= MAX_QUEUED_DOWNLOADS) {
            throw new Error('Muitos downloads em andamento; tente novamente em alguns segundos.')
        }
        await new Promise<void>(resolve => downloadWaiters.push(resolve))
        acquired = true
    } else {
        activeDownloads++
        acquired = true
    }

    try {
        return await download()
    } finally {
        if (acquired) {
            const next = downloadWaiters.shift()
            if (next) next()
            else activeDownloads--
        }
    }
}

async function sharedDownload(key:string,onProgress:((percent:number)=>void)|undefined,download:(report:(percent:number)=>void)=>Promise<Buffer>) {
    let work=inflightDownloads.get(key)
    if(!work){
        const created:SharedDownload={promise:undefined as unknown as Promise<Buffer>,listeners:new Set(),progress:0}
        created.promise=Promise.resolve().then(()=>withDownloadSlot(()=>download(percent=>{
            if(percent<=created.progress)return
            created.progress=percent
            for(const listener of created.listeners)listener(percent)
        }))).finally(()=>inflightDownloads.delete(key))
        inflightDownloads.set(key,created)
        work=created
    }
    if(onProgress){work.listeners.add(onProgress);if(work.progress>0)onProgress(work.progress)}
    try{return await work.promise}
    finally{if(onProgress)work.listeners.delete(onProgress)}
}

downloadCache.on('del', key => {
    cachedDownloadBytes -= cachedDownloadSizes.get(key) ?? 0
    cachedDownloadSizes.delete(key)
})

function cacheDownload(key: string, buffer: Buffer) {
    if (buffer.length > DOWNLOAD_CACHE_MAX_ITEM_BYTES) return
    downloadCache.del(key)
    while (downloadCache.keys().length >= 8 || cachedDownloadBytes + buffer.length > DOWNLOAD_CACHE_MAX_BYTES) {
        const oldestKey = downloadCache.keys()[0]
        if (!oldestKey) break
        downloadCache.del(oldestKey)
    }
    downloadCache.set(key, buffer)
    cachedDownloadSizes.set(key, buffer.length)
    cachedDownloadBytes += buffer.length
}

const resolveYtDlpBinary = () => {
    const currentFile = fileURLToPath(import.meta.url)
    const currentDir = path.dirname(currentFile)
    const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
    
    // From src/utils or dist/utils, go up two levels to project root
    const projectRoot = path.resolve(currentDir, '..', '..')
    
    // Binary is in project_root/bin/
    return path.join(projectRoot, 'bin', binaryName)
}

const resolveBunBinary = () => process.env.BUN_PATH || (process.versions.bun ? process.execPath : 'bun')

// Inicializa ytdlp-nodejs com o binário customizado
const ytDlpPath = resolveYtDlpBinary()
const bunPath = resolveBunBinary()
console.log(`[download.util] 🔧 Configuração inicial: yt-dlp=${ytDlpPath}, bun=${bunPath}`)
const ytdlp = new YtDlp({ binaryPath: ytDlpPath })

const X_DOWNLOADABLE_MEDIA_TYPES = new Set(['video', 'gif'])

export async function xMedia (url: string):Promise<XMedia | null>{
    if(shouldQueueWork())return mediaProcessor.execute<any>('download.xMedia',[url],{timeoutMs:240_000})
    try {
        const newURL = url.replace(/twitter\.com|x\.com/g, 'api.vxtwitter.com')
        const {data : xResponse} = await axios.get(newURL)

        if (!Array.isArray(xResponse.media_extended)){
            return null
        }

        const media = xResponse.media_extended
            .filter((media: {type?: string, url?: string}) => {
                return Boolean(media.url) && X_DOWNLOADABLE_MEDIA_TYPES.has(media.type ?? '')
            })
            .map((media: {url: string}) => {
                return {
                    type: 'video' as const,
                    url: media.url
                }
            })

        if (!media.length) {
            return null
        }

        const xMedia : XMedia = {
            text: xResponse.text,
            media
        }
    
        return xMedia
    } catch(err) {
        showConsoleLibraryError(err, 'xMedia')
        throw new Error(botTexts.library_error)
    }
}

export async function tiktokMedia (url : string): Promise<TiktokMedia>{
    if(shouldQueueWork())return mediaProcessor.execute<any>('download.tiktokMedia',[url],{timeoutMs:240_000})
    try {
        const response = await Tiktok.Downloader(url, { version: "v1" })

        if (response.status !== "success" || !response.result) {
            throw new Error(response.message || 'Falha ao obter mídia do TikTok')
        }

        const res = response.result

        // Carrossel de imagens / slides
        if (res.type === 'image' && Array.isArray(res.images) && res.images.length) {
            return {
                author_profile: res.author?.nickname || '',
                description: res.desc || '',
                type: 'image',
                duration: null,
                url: res.images
            }
        }

        const videoUrl = res.video?.downloadAddr?.[0] || res.video?.playAddr?.[0] || res.direct || ''
        if (!videoUrl) {
            throw new Error('Nenhuma URL de mídia encontrada')
        }

        return {
            author_profile: res.author?.nickname || '',
            description: res.desc || '',
            type: 'video',
            duration: Number(res.video?.duration || 0),
            url: videoUrl
        }
    } catch(err) {
        showConsoleLibraryError(err, 'tiktokMedia')
        throw new Error(botTexts.library_error)
    }
}

export async function facebookMedia(url : string) {
    if(shouldQueueWork())return mediaProcessor.execute<any>('download.facebookMedia',[url],{timeoutMs:240_000})
    try {
        const facebookResponse = await getFbVideoInfo(url)
        const facebookMedia : FacebookMedia = {
            url: facebookResponse.url,
            duration: parseInt((facebookResponse.duration_ms/1000).toFixed(0)),
            sd: facebookResponse.sd,
            hd: facebookResponse.hd,
            title: facebookResponse.title,
            thumbnail: facebookResponse.thumbnail
        }

        return facebookMedia
    } catch(err) {
        showConsoleLibraryError(err, 'facebookMedia')
        throw new Error(botTexts.library_error)
    }
}

async function extractInstagramWithYtDlp(url: string): Promise<InstagramMedia> {
    const result = (await runProcess(resolveYtDlpBinary(),['--dump-json','--no-download','--no-playlist','--',url],{timeoutMs:30_000,maxOutputBytes:5*1024*1024})).toString()

    const metadata = JSON.parse(result.trim())

    // Handle playlist (carousel) posts
    if (metadata._type === 'playlist' && Array.isArray(metadata.entries)) {
        const mediaList: { type: 'video' | 'image', url: string }[] = []

        for (const entry of metadata.entries) {
            const videoUrl = entry.url || entry.formats?.[0]?.url || ''
            if (videoUrl) {
                const isVideo = entry.ext !== 'jpg' && entry.ext !== 'jpeg' && entry.ext !== 'png' && entry.ext !== 'webp'
                mediaList.push({
                    type: isVideo ? 'video' : 'image',
                    url: videoUrl
                })
            }
        }

        return {
            author_username: metadata.channel || metadata.uploader || '',
            author_fullname: metadata.uploader || '',
            caption: metadata.description || '',
            likes: metadata.like_count || 0,
            media: mediaList
        }
    }

    // Single post
    const videoUrl = metadata.url || metadata.formats?.[0]?.url || ''
    const isImage = Boolean(metadata.ext) && ['jpg', 'jpeg', 'png', 'webp'].includes(metadata.ext)

    return {
        author_username: metadata.channel || metadata.uploader || '',
        author_fullname: metadata.uploader || '',
        caption: metadata.description || '',
        likes: metadata.like_count || 0,
        media: [{
            type: isImage ? 'image' : 'video',
            url: videoUrl || metadata.thumbnail || ''
        }]
    }
}

export async function instagramMedia (url: string):Promise<InstagramMedia | null>{
    if(shouldQueueWork())return mediaProcessor.execute<any>('download.instagramMedia',[url],{timeoutMs:240_000})
    try {
        const cached = downloadMetadataCache.get<InstagramMedia>(`igmeta:${url}`)
        if (cached) return cached
        let request = downloadMetadataInFlight.get(url)
        if (!request) {
            request = withDownloadSlot(() => extractInstagramWithYtDlp(url))
            downloadMetadataInFlight.set(url, request)
        }
        try {
            const result = await request
            if (!downloadMetadataCache.has(`igmeta:${url}`) && downloadMetadataCache.keys().length >= 500) {
                const oldestKey = downloadMetadataCache.keys()[0]
                if (oldestKey !== undefined) downloadMetadataCache.del(oldestKey)
            }
            downloadMetadataCache.set(`igmeta:${url}`, result)
            return result
        } finally {
            downloadMetadataInFlight.delete(url)
        }
    } catch(err: any) {
        showConsoleLibraryError(err, 'instagramMedia')
        return null
    }
}

export async function pinterestMedia(url: string): Promise<PinterestMedia> {
    if(shouldQueueWork())return mediaProcessor.execute<PinterestMedia>('download.pinterestMedia',[url],{timeoutMs:60_000})
    if(detectPlatform(url)!=='pinterest')throw new Error('Informe o link de um Pin público do Pinterest.')
    if(new URL(url).hostname==='pin.it'){
        const response=await axios.head(url,{timeout:15_000,maxRedirects:5,signal:workSignal.getStore()})
        url=response.request?.res?.responseUrl || response.request?.responseURL || ''
    }
    if(detectPlatform(url)!=='pinterest' || new URL(url).hostname==='pin.it')throw new Error('O link não aponta para um Pin público do Pinterest.')
    const id=new URL(url).pathname.match(/(?:\/|--)(\d+)\/?$/)?.[1]
    if(!id)throw new Error('Não foi possível identificar o Pin.')
    const canonical=`https://www.pinterest.com/pin/${id}/`
    const output=await runProcess(ytDlpPath,['--skip-download','--dump-single-json','--ignore-no-formats-error','--no-playlist','--socket-timeout','15','--retries','0','--',canonical],{timeoutMs:30_000,maxOutputBytes:2*1024*1024})
    const metadata=JSON.parse(output.toString())
    if(metadata._type==='playlist')throw new Error('Envie um Pin individual, em vez de uma pasta.')
    if(Array.isArray(metadata.formats) && metadata.formats.some((format:any)=>format.url && format.vcodec!=='none')){
        return {type:'video',url:canonical,title:metadata.title || ''}
    }
    const images=(metadata.thumbnails || []).filter((image:any)=>typeof image.url==='string' && /^https:\/\/(?:[a-z\d-]+\.)*pinimg\.com\//i.test(image.url))
    images.sort((a:any,b:any)=>(b.width || 0)*(b.height || 0)-(a.width || 0)*(a.height || 0))
    if(!images.length)throw new Error('Este Pin não contém imagem ou vídeo disponível publicamente.')
    return {type:'image',url:images[0].url,title:metadata.title || ''}
}

export async function downloadPinterestVideo(url: string,onProgress?: (percent:number)=>void): Promise<Buffer> {
    if(shouldQueueWork())return mediaProcessor.execute<Buffer>('download.downloadPinterestVideo',[url],{timeoutMs:240_000,onProgress})
    const key=`pinterest:${url}`
    const cached=downloadCache.get<Buffer>(key)
    if(cached){onProgress?.(100);return cached}
    return sharedDownload(key,onProgress,async report=>{
        const buffer=await downloadWithYtDlp(url,['-f',`best[height<=${YOUTUBE_QUALITY_LIMIT}][ext=mp4]/best[ext=mp4]`],'mp4',48*1024*1024,report)
        cacheDownload(key,buffer)
        return buffer
    })
}

export async function youtubeMedia (text: string){
    if(shouldQueueWork())return mediaProcessor.execute<any>('download.youtubeMedia',[text],{timeoutMs:240_000})
    try {
        console.log('[youtubeMedia] 📝 Texto recebido:', text)
        
        let videoUrl : string | undefined
        let videoId : string | undefined
        let quickInfo: any = null

        // Verifica se é uma URL válida do YouTube
        const urlPattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/
        const isURLValid = urlPattern.test(text)
        
        console.log('[youtubeMedia] ✅ É URL válida do YouTube?', isURLValid)

        if(isURLValid) {
            videoUrl = text
            // Extrai o ID do vídeo da URL (incluindo /shorts/)
            const idMatch = text.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([^&\s?]+)/)
            videoId = idMatch ? idMatch[1] : undefined
            console.log('[youtubeMedia] 🔍 Video ID extraído:', videoId)
        } else {
            // Busca o vídeo por título
            const {videos} = await yts(text)

            if(!videos.length) {
                return null
            }
            
            quickInfo = videos[0]
            videoId = quickInfo.videoId
            videoUrl = `https://www.youtube.com/watch?v=${videoId}`
        }

        if(!videoUrl || !videoId) {
            return null
        }

        // Se temos quickInfo do yts, retorna rapidamente sem chamar yt-dlp
        if (quickInfo) {
            console.log('[youtubeMedia] 📦 Usando dados do yts (busca)')
            // Valida e converte duração (yts retorna duration.seconds)
            const duration = Number(quickInfo.duration?.seconds) || Number(quickInfo.timestamp) || 0
            
            const ytInfo : YTInfo = {
                id_video : videoId,
                title:  quickInfo.title,
                description: quickInfo.description || '',
                duration: duration,
                channel: quickInfo.author?.name || 'Desconhecido',
                is_live: quickInfo.isLive || false,
                duration_formatted: formatSeconds(duration),
                url: '', // URL será obtida apenas no download
                thumbnail: quickInfo.thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
            }
            console.log('[youtubeMedia] ✅ Retornando:', ytInfo.title)
            return ytInfo
        }

        // Para URLs diretas, usa yts com a URL completa para obter metadados básicos
        try {
            console.log('[youtubeMedia] 🔎 Buscando metadados no yts com videoId:', videoId)
            const quickInfo = await yts({videoId: videoId})
            if (quickInfo) {
                console.log('[youtubeMedia] 📦 Dados obtidos do yts (por ID)')
                // Valida e converte duração (yts retorna duration.seconds)
                const duration = Number(quickInfo.duration?.seconds) || Number(quickInfo.timestamp) || 0
                
                const ytInfo : YTInfo = {
                    id_video : videoId,
                    title:  quickInfo.title || 'Desconhecido',
                    description: quickInfo.description || '',
                    duration: duration,
                    channel: quickInfo.author?.name || quickInfo.author || 'Desconhecido',
                    is_live: quickInfo.isLive || false,
                    duration_formatted: formatSeconds(duration),
                    url: '',
                    thumbnail: quickInfo.thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
                }
                console.log('[youtubeMedia] ✅ Retornando:', ytInfo.title)
                return ytInfo
            }
            console.log('[youtubeMedia] ⚠️ yts retornou vazio')
        } catch(ytsError) {
            console.log('[youtubeMedia] ❌ yts by ID failed, falling back to yt-dlp:', ytsError)
        }

        // Fallback: usa yt-dlp apenas se yts falhar (raro)
        const videoInfoRaw = await ytdlp.getInfoAsync(videoUrl)
        
        if (videoInfoRaw._type !== 'video') {
            return null
        }
        
        const ytInfo : YTInfo = {
            id_video : videoInfoRaw.id || videoId,
            title:  videoInfoRaw.title || 'Desconhecido',
            description: videoInfoRaw.description || '',
            duration: Number(videoInfoRaw.duration || 0),
            channel: videoInfoRaw.uploader || videoInfoRaw.channel || 'Desconhecido',
            is_live: videoInfoRaw.is_live || false,
            duration_formatted: formatSeconds(Number(videoInfoRaw.duration || 0)),
            url: '',
            thumbnail: videoInfoRaw.thumbnail || `https://img.youtube.com/vi/${videoInfoRaw.id}/maxresdefault.jpg`
        }
        
        return ytInfo
    } catch(err) {
        showConsoleLibraryError(err, 'youtubeMedia')
        throw new Error(botTexts.library_error)
    }
}

export async function spotifyMedia(url: string): Promise<SpotifyInfo | null> {
    try {
        const { getPreview } = require('spotify-url-info')(fetch)
        const preview = await getPreview(url)

        if (!preview || !preview.track || !preview.artist) {
            return null
        }

        return {
            title: preview.track,
            artist: preview.artist,
            url
        }
    } catch(err) {
        showConsoleLibraryError(err, 'spotifyMedia')
        return null
    }
}

export async function downloadFromUrl(url: string, onProgress?: (percent: number) => void): Promise<Buffer> {
    if(shouldQueueWork())return mediaProcessor.execute<any>('download.downloadFromUrl',[url],{timeoutMs:240_000,onProgress})
    return downloadBytesFromUrl(url,8*1024*1024,onProgress)
}

export async function downloadVideoFromUrl(url: string, onProgress?: (percent: number) => void): Promise<Buffer> {
    if(shouldQueueWork())return mediaProcessor.execute<Buffer>('download.downloadVideoFromUrl',[url],{timeoutMs:240_000,onProgress})
    return downloadBytesFromUrl(url,48*1024*1024,onProgress)
}

async function downloadBytesFromUrl(url: string,maxBytes: number,onProgress?: (percent: number) => void): Promise<Buffer> {
    return withDownloadSlot(async () => {
    try {
            const response = await axios.get(url, {
                responseType: 'stream', signal: workSignal.getStore(),
                timeout: 60000,
                maxContentLength: maxBytes,
                maxBodyLength: maxBytes
            })

            const contentLength=Number(response.headers['content-length'])
            const knownLength=!response.headers['content-encoding'] && Number.isFinite(contentLength) && contentLength>0
            const chunks: Buffer[] = []
            let totalBytes = 0
            for await (const chunk of response.data as AsyncIterable<Buffer>) {
                totalBytes += chunk.length
                if (totalBytes > maxBytes) {
                    response.data.destroy()
                    throw new Error(`Mídia excede o limite de ${maxBytes/1024/1024} MB`)
                }
                chunks.push(chunk)
                if(knownLength)onProgress?.(Math.min(99,Math.floor(totalBytes/contentLength*100)))
            }
            await onProgress?.(100)
            return Buffer.concat(chunks, totalBytes)
        } catch(err) {
            showConsoleLibraryError(err, 'downloadFromUrl')
            throw new Error(botTexts.library_error)
        }
    })
}

export async function downloadInstagramMedia(url: string, onProgress?: (percent: number) => void): Promise<Buffer> {
    if(shouldQueueWork())return mediaProcessor.execute<any>('download.downloadInstagramMedia',[url],{timeoutMs:240_000,onProgress})
    const cached = downloadCache.get<Buffer>(`igvideo:${url}`)
    if (cached) {
        console.log('[downloadInstagramMedia] ✅ Cache hit:', url)
        if (onProgress) onProgress(100)
        return cached
    }

    return sharedDownload(`igvideo:${url}`,onProgress,report=>doDownloadInstagramMedia(url,report))
}

export async function downloadInstagramImage(url: string): Promise<Buffer> {
    if(shouldQueueWork())return mediaProcessor.execute<any>('download.downloadInstagramImage',[url],{timeoutMs:240_000})
    const key = `igimage:${url}`
    const cached = downloadCache.get<Buffer>(key)
    if (cached) return cached
    return sharedDownload(key,undefined,async () => {
        const response = await axios.get(url, {
            responseType: 'arraybuffer', signal: workSignal.getStore(),
            timeout: 60000,
            maxContentLength: 8 * 1024 * 1024,
            maxBodyLength: 8 * 1024 * 1024
        })
        const buffer = Buffer.from(response.data)
        cacheDownload(key, buffer)
        return buffer
    })
}

const inflightEmojiMixes = new Map<string, Promise<Buffer | null>>()

export async function getEmojiMixBuffer(url: string): Promise<Buffer | null> {
    const cached = downloadCache.get<Buffer>(`emoji:${url}`)
    if (cached) return cached

    const inflight = inflightEmojiMixes.get(url)
    if (inflight) return inflight

    const promise = withDownloadSlot(async () => {
        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer', signal: workSignal.getStore(),
                timeout: 15000,
                maxContentLength: 2 * 1024 * 1024
            })
            const buffer = Buffer.from(response.data)
            cacheDownload(`emoji:${url}`, buffer)
            return buffer
        } catch {
            return null
        }
    })
    inflightEmojiMixes.set(url, promise)
    try {
        return await promise
    } finally {
        inflightEmojiMixes.delete(url)
    }
}

async function doDownloadInstagramMedia(url: string, onProgress?: (percent: number) => void): Promise<Buffer> {
    const buffer=await downloadWithYtDlp(url,['-f','bv*[height<=1080]+ba/b[height<=1080]/b','--merge-output-format','mp4'],'mp4',48*1024*1024,onProgress)
    cacheDownload(`igvideo:${url}`,buffer)
    return buffer
}

export async function downloadYouTubeAudio(videoUrl: string, onProgress?: (percent: number) => void): Promise<Buffer> {
    if(shouldQueueWork())return mediaProcessor.execute<any>('download.downloadYouTubeAudio',[videoUrl],{timeoutMs:240_000,onProgress})
    const cached = downloadCache.get<Buffer>(`audio:${videoUrl}`)
    if (cached) {
        console.log('[downloadYouTubeAudio] ✅ Cache hit:', videoUrl)
        if (onProgress) onProgress(100)
        return cached
    }

    return sharedDownload(`audio:${videoUrl}`,onProgress,report=>doDownloadYouTubeAudio(videoUrl,report))
}

async function doDownloadYouTubeAudio(videoUrl: string, onProgress?: (percent: number) => void): Promise<Buffer> {
    const buffer=await downloadWithYtDlp(videoUrl,['-x','--audio-format','mp3','--audio-quality','0','-f','bestaudio','--extractor-args','youtube:player_client=web_embedded'],'mp3',32*1024*1024,onProgress)
    cacheDownload(`audio:${videoUrl}`,buffer)
    return buffer
}

export async function downloadYouTubeVideo(videoUrl: string, onProgress?: (percent: number) => void): Promise<Buffer> {
    if(shouldQueueWork())return mediaProcessor.execute<any>('download.downloadYouTubeVideo',[videoUrl],{timeoutMs:240_000,onProgress})
    const cached = downloadCache.get<Buffer>(`video:${videoUrl}`)
    if (cached) {
        console.log('[downloadYouTubeVideo] ✅ Cache hit:', videoUrl)
        if (onProgress) onProgress(100)
        return cached
    }

    return sharedDownload(`video:${videoUrl}`,onProgress,report=>doDownloadYouTubeVideo(videoUrl,report))
}

async function doDownloadYouTubeVideo(videoUrl: string, onProgress?: (percent: number) => void): Promise<Buffer> {
    const buffer=await downloadWithYtDlp(videoUrl,['-f',`best[height<=${YOUTUBE_QUALITY_LIMIT}][ext=mp4]/best[ext=mp4]/best`,'--extractor-args','youtube:player_client=web_embedded'],'mp4',48*1024*1024,onProgress)
    cacheDownload(`video:${videoUrl}`,buffer)
    return buffer
}

async function downloadWithYtDlp(url:string,formatArgs:string[],extension:string,maxBytes:number,onProgress?:(percent:number)=>void):Promise<Buffer>{
    const fsp=await import('node:fs/promises')
    const directory=await fsp.mkdtemp(path.join('/tmp','elysium-download-'))
    const controller=new AbortController()
    const inherited=workSignal.getStore()
    const signal=inherited?AbortSignal.any([inherited,controller.signal]):controller.signal
    let checking=false
    const monitor=setInterval(async()=>{
        if(checking)return;checking=true
        try{
            let size=0
            for(const name of await fsp.readdir(directory))size+=(await fsp.stat(path.join(directory,name))).size
            if(size>maxBytes*3)controller.abort(new Error('Download excede o limite de espaço temporário.'))
        }catch{}finally{checking=false}
    },500)
    try{
        const report=onProgress || (()=>{})
        await runProcess(ytDlpPath,[...formatArgs,'-o',path.join(directory,'media.%(ext)s'),'--no-playlist','--newline','--progress','--progress-delta','0.25','--progress-template',YTDLP_PROGRESS_TEMPLATE,'--concurrent-fragments','1','--socket-timeout','30','--retries','2','--fragment-retries','2','--max-filesize',String(maxBytes),'--js-runtimes',`bun:${bunPath}`,'--',url],{
            timeoutMs:180_000,maxOutputBytes:1024*1024,signal,onStdout:ytDlpProgress(report),onStderr:ytDlpProgress(report)
        })
        const expected=path.join(directory,'media.'+extension)
        const found=await fsp.stat(expected).catch(()=>null)
        const file=found?expected:path.join(directory,(await fsp.readdir(directory)).find(name=>name.startsWith('media.')&&!/\.(?:part|ytdl|temp)$/.test(name)) || 'missing')
        const stat=await fsp.stat(file)
        if(!stat.size || stat.size>maxBytes)throw new Error('Mídia vazia ou maior que o limite permitido.')
        const buffer=await fsp.readFile(file)
        onProgress?.(100)
        return buffer
    }finally{clearInterval(monitor);await fsp.rm(directory,{recursive:true,force:true})}
}
