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

const resolveBunBinary = () => {
    const { execSync } = require('child_process')
    try {
        // Tenta encontrar bun no PATH
        const bunPath = execSync('which bun', { encoding: 'utf-8' }).trim()
        if (bunPath) {
            console.log(`[resolveBunBinary] ✅ Bun encontrado em: ${bunPath}`)
            return bunPath
        }
    } catch (error) {
        console.warn('[resolveBunBinary] ⚠️ Erro ao executar which bun:', error)
    }
    
    // Fallback: tenta caminhos comuns
    const commonPaths = [
        '/root/.bun/bin/bun',
        '/usr/local/bin/bun',
        '/usr/bin/bun',
        process.env.HOME + '/.bun/bin/bun'
    ]
    
    const fs = require('fs')
    for (const path of commonPaths) {
        try {
            if (fs.existsSync(path)) {
                console.log(`[resolveBunBinary] ✅ Bun encontrado em fallback: ${path}`)
                return path
            }
        } catch { }
    }
    
    console.warn('[resolveBunBinary] ⚠️ Bun não encontrado, usando "bun" como último fallback')
    return 'bun'
}

// Inicializa ytdlp-nodejs com o binário customizado
const ytDlpPath = resolveYtDlpBinary()
const bunPath = resolveBunBinary()
console.log(`[download.util] 🔧 Configuração inicial: yt-dlp=${ytDlpPath}, bun=${bunPath}`)
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
    return new Promise((resolve, reject) => {
        console.log('[downloadYouTubeVideo] 🚀 Iniciando spawn yt-dlp para:', videoUrl)
        const startTime = Date.now()
        
        const { spawn } = require('child_process')
        const fs = require('fs')
        
        const tempFilePath = path.join('/tmp', `yt-${Date.now()}.mp4`)
        console.log('[downloadYouTubeVideo] 📂 Arquivo temporário:', tempFilePath)

        const ytDlpProcess = spawn(ytDlpPath, [
            videoUrl,
            '-o', tempFilePath,
            '--newline',
            '--progress',
            '-f', 'best[height<=720][ext=mp4]/best[ext=mp4]/best',
            '--no-playlist',
            '--no-check-certificate',
            '--prefer-free-formats',
            '--concurrent-fragments', '16',
            '--buffer-size', '128K',
            '--http-chunk-size', '50M',
            '--retries', '10',
            '--fragment-retries', '10',
            '--js-runtimes', `bun:${bunPath}`
        ])

        // Monitorar fragmentos HLS
        let totalFragments = 0
        let currentFragment = 0
        let lastReportedProgress = 0
        
        ytDlpProcess.stdout?.on('data', (data: Buffer) => {
            const output = data.toString()
            
            // Captura total de fragmentos HLS
            const fragmentsMatch = output.match(/Total fragments:\s*(\d+)/)
            if (fragmentsMatch) {
                totalFragments = parseInt(fragmentsMatch[1])
                console.log(`[downloadYouTubeVideo] 📊 Total de fragmentos: ${totalFragments}`)
            }
            
            // Captura fragmento atual sendo baixado e REPORTA IMEDIATAMENTE
            const currentFragmentMatch = output.match(/\(frag\s+(\d+)\/\d+\)/)
            if (currentFragmentMatch) {
                const newFragment = parseInt(currentFragmentMatch[1])
                if (newFragment > currentFragment && totalFragments > 0) {
                    currentFragment = newFragment
                    const progress = Math.floor((currentFragment / totalFragments) * 95)
                    
                    // Reporta IMEDIATAMENTE quando muda de fragmento
                    if (progress > lastReportedProgress && onProgress) {
                        lastReportedProgress = progress
                        console.log(`[downloadYouTubeVideo] 📥 Progresso: ${progress}% (fragmento ${currentFragment}/${totalFragments})`)
                        onProgress(progress)
                    }
                }
            }
            
            // Log apenas linhas importantes
            if (output.includes('[download]') && (output.includes('%') || output.includes('frag'))) {
                console.log('[downloadYouTubeVideo] 📄', output.trim())
            }
        })

        ytDlpProcess.stderr?.on('data', (data: Buffer) => {
            console.error('[downloadYouTubeVideo] ⚠️ stderr:', data.toString())
        })

        // Timeout de 5 minutos
        const timeout = setTimeout(() => {
            ytDlpProcess.kill()
            try { fs.unlinkSync(tempFilePath) } catch {}
            console.error('[downloadYouTubeVideo] ⏰ TIMEOUT após 5 minutos!')
            reject(new Error('Download timeout após 5 minutos'))
        }, 300000)

        ytDlpProcess.on('close', async (code: number | null) => {
            clearTimeout(timeout)
            
            if (code === 0) {
                try {
                    const downloadTime = ((Date.now() - startTime) / 1000).toFixed(2)
                    console.log(`[downloadYouTubeVideo] ✅ Download concluído em ${downloadTime}s`)
                    
                    // Só agora marca 100%
                    if (onProgress) {
                        console.log(`[downloadYouTubeVideo] 📥 Progresso: 100%`)
                        onProgress(100)
                    }
                    
                    console.log('[downloadYouTubeVideo] 📂 Lendo arquivo...')
                    const buffer = fs.readFileSync(tempFilePath)
                    console.log(`[downloadYouTubeVideo] ✅ Buffer criado: ${buffer.length} bytes`)
                    
                    fs.unlinkSync(tempFilePath)
                    console.log('[downloadYouTubeVideo] 🗑️ Arquivo temporário removido')
                    
                    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2)
                    console.log(`[downloadYouTubeVideo] 🎉 CONCLUÍDO em ${totalTime}s total`)
                    
                    resolve(buffer)
                } catch (err) {
                    console.error('[downloadYouTubeVideo] ❌ Erro ao ler arquivo:', err)
                    showConsoleLibraryError(err, 'downloadYouTubeVideo')
                    reject(new Error(botTexts.library_error))
                }
            } else {
                console.error('[downloadYouTubeVideo] ❌ yt-dlp falhou com código:', code)
                try { fs.unlinkSync(tempFilePath) } catch {}
                reject(new Error(`yt-dlp falhou com código ${code}`))
            }
        })

        ytDlpProcess.on('error', (err: Error) => {
            clearTimeout(timeout)
            console.error('[downloadYouTubeVideo] ❌ Erro no processo:', err)
            try { fs.unlinkSync(tempFilePath) } catch {}
            showConsoleLibraryError(err, 'downloadYouTubeVideo')
            reject(new Error(botTexts.library_error))
        })
    })
}