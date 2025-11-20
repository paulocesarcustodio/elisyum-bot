import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {formatSeconds, showConsoleLibraryError} from './general.util.js'
import {instagramGetUrl} from 'instagram-url-direct'
import { getFbVideoInfo } from 'fb-downloader-scrapper'
import Tiktok from '@tobyg74/tiktok-api-dl'
import axios from 'axios'
import yts from 'yt-search'
import { YtDlp } from 'ytdlp-nodejs'
import { FacebookMedia, InstagramMedia, TiktokMedia, XMedia, YTInfo } from '../interfaces/library.interface.js'
import botTexts from '../helpers/bot.texts.helper.js'

const resolveYtDlpBinary = () => {
    const currentFile = fileURLToPath(import.meta.url)
    const currentDir = path.dirname(currentFile)
    const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
    
    // From src/utils or dist/utils, go up two levels to project root
    const projectRoot = path.resolve(currentDir, '..', '..')
    
    // Binary is in project_root/bin/
    return path.join(projectRoot, 'bin', binaryName)
}

// Inicializa ytdlp-nodejs com o binário customizado
const ytDlpPath = resolveYtDlpBinary()
const ytdlp = new YtDlp({ binaryPath: ytDlpPath })

export async function xMedia (url: string){
    try {
        const newURL = url.replace(/twitter\.com|x\.com/g, 'api.vxtwitter.com')
        const {data : xResponse} = await axios.get(newURL)

        if (!xResponse.media_extended){
            return null
        } 

        const xMedia : XMedia = {
            text: xResponse.text,
            media : xResponse.media_extended.map((media : {type: string, url: string}) => {
                return {
                    type: (media.type === 'video') ? 'video' : 'image',
                    url: media.url
                }
            })
        }
    
        return xMedia
    } catch(err) {
        showConsoleLibraryError(err, 'xMedia')
        throw new Error(botTexts.library_error)
    }
}

export async function tiktokMedia (url : string){
    try {
        const tiktokResponse = await Tiktok.Downloader(url, { version: "v1" })
        let mediaUrl: string | string[]

        if (tiktokResponse.status === 'error') {
            return null
        }

        if (tiktokResponse.result?.type == 'video'){
            if (tiktokResponse.result?.video?.playAddr?.length) {
                mediaUrl = tiktokResponse.result?.video?.playAddr[0]
            } else {
                return null
            } 
        } else if(tiktokResponse.result?.type == 'image'){
            if (tiktokResponse.result?.images) {
                mediaUrl = tiktokResponse.result?.images
            } else {
                return null
            }
        } else {
            return null
        }

        const tiktokMedia : TiktokMedia = {
            author_profile: tiktokResponse.result?.author?.nickname,
            description : tiktokResponse.result?.desc,
            type: tiktokResponse.result?.type,
            duration: tiktokResponse.result?.type == "video" ? parseInt(((tiktokResponse.result?.video?.duration as number)/1000).toFixed(0)) : null,
            url: mediaUrl
        }

        return tiktokMedia
    } catch(err) {
        showConsoleLibraryError(err, 'tiktokMedia')
        throw new Error(botTexts.library_error)
    }
}

export async function facebookMedia(url : string) {
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

export async function instagramMedia (url: string){
    try {
        const instagramResponse = await instagramGetUrl(url)
        let instagramMedia : InstagramMedia = {
            author_username : instagramResponse.post_info.owner_username,
            author_fullname: instagramResponse.post_info.owner_fullname,
            caption: instagramResponse.post_info.caption,
            likes: instagramResponse.post_info.likes,
            media : []
        }

        for (const url of instagramResponse.url_list) {
            const {headers} = await axios.head(url)
            const type = headers['content-type'] === 'video/mp4' ? 'video' : 'image'
            instagramMedia.media.push({type, url})                  
        }

        return instagramMedia
    } catch(err) {
        showConsoleLibraryError(err, 'instagramMedia')
        throw new Error(botTexts.library_error)
    }
}

export async function youtubeMedia (text: string){
    try {
        let videoUrl : string | undefined
        let videoId : string | undefined
        let quickInfo: any = null

        // Verifica se é uma URL válida do YouTube
        const urlPattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/
        const isURLValid = urlPattern.test(text)

        if(isURLValid) {
            videoUrl = text
            // Extrai o ID do vídeo da URL
            const idMatch = text.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)
            videoId = idMatch ? idMatch[1] : undefined
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
            return ytInfo
        }

        // Para URLs diretas, usa yts com a URL completa para obter metadados básicos
        try {
            const quickInfo = await yts({videoId: videoId})
            if (quickInfo) {
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
                return ytInfo
            }
        } catch(ytsError) {
            console.log('[youtubeMedia] yts by ID failed, falling back to yt-dlp')
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

export async function downloadFromUrl(url: string, onProgress?: (percent: number) => void): Promise<Buffer> {
    try {
        let simulatedProgress = 0
        let progressInterval: NodeJS.Timeout | null = null
        
        // Inicia progresso simulado (tempo médio: 10-15s para downloads simples)
        if (onProgress) {
            const estimatedSeconds = 12
            const incrementInterval = (estimatedSeconds * 1000) / 95
            
            progressInterval = setInterval(() => {
                if (simulatedProgress < 95) {
                    simulatedProgress++
                    onProgress(simulatedProgress)
                }
            }, incrementInterval)
        }
        
        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 60000
            })
            
            if (progressInterval) clearInterval(progressInterval)
            if (onProgress) onProgress(100)
            
            return Buffer.from(response.data)
        } catch (error) {
            if (progressInterval) clearInterval(progressInterval)
            throw error
        }
    } catch(err) {
        showConsoleLibraryError(err, 'downloadFromUrl')
        throw new Error(botTexts.library_error)
    }
}

export async function downloadYouTubeVideo(videoUrl: string, onProgress?: (percent: number) => void): Promise<Buffer> {
    const fs = await import('fs')
    const path = await import('path')
    const crypto = await import('crypto')
    const { spawn } = await import('child_process')
    const { YOUTUBE_QUALITY_LIMIT } = await import('../config/youtube.config.js')
    
    try {
        // Cria arquivo temporário
        const tempFileName = `yt-${crypto.randomBytes(8).toString('hex')}.mp4`
        const tempFilePath = path.join('/tmp', tempFileName)
        
        // Formato customizado
        const customFormat = `best[height<=${YOUTUBE_QUALITY_LIMIT}][ext=mp4]/bestvideo[height<=${YOUTUBE_QUALITY_LIMIT}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${YOUTUBE_QUALITY_LIMIT}]/worst`
        
        // Spawn yt-dlp com progresso simulado
        await new Promise<void>((resolve, reject) => {
            const ytdlpProcess = spawn(ytDlpPath, [
                '--format', customFormat,
                '--output', tempFilePath,
                '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                '--concurrent-fragments', '4',
                '--buffer-size', '16K',
                '--http-chunk-size', '10M',
                '--merge-output-format', 'mp4',
                '--extractor-args', 'youtube:player_client=android,web',
                videoUrl
            ])
            
            let simulatedProgress = 0
            let progressInterval: NodeJS.Timeout | null = null
            
            // Inicia progresso simulado imediatamente (tempo médio: 25-30s)
            if (onProgress) {
                const estimatedSeconds = 28
                const incrementInterval = (estimatedSeconds * 1000) / 95 // Atinge 95% em ~28s
                
                progressInterval = setInterval(() => {
                    if (simulatedProgress < 95) {
                        simulatedProgress++
                        onProgress(simulatedProgress)
                    }
                }, incrementInterval)
            }
            
            // Silencia stdout/stderr
            ytdlpProcess.stdout.on('data', () => {})
            ytdlpProcess.stderr.on('data', () => {})
            
            ytdlpProcess.on('close', (code) => {
                if (progressInterval) clearInterval(progressInterval)
                
                if (code === 0) {
                    if (onProgress) onProgress(100)
                    resolve()
                } else {
                    reject(new Error(`yt-dlp exited with code ${code}`))
                }
            })
            
            ytdlpProcess.on('error', (err) => {
                if (progressInterval) clearInterval(progressInterval)
                reject(err)
            })
        })
        
        // Lê o arquivo baixado
        const videoBuffer = fs.readFileSync(tempFilePath)
        
        // Remove arquivo temporário
        fs.unlinkSync(tempFilePath)
        
        return videoBuffer
    } catch(err) {
        showConsoleLibraryError(err, 'downloadYouTubeVideo')
        throw new Error(botTexts.library_error)
    }
}