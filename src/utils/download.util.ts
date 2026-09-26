import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {formatSeconds, showConsoleLibraryError} from './general.util.js'
import { getFbVideoInfo } from 'fb-downloader-scrapper'
import axios from 'axios'
import yts from 'yt-search'
import { YtDlp } from 'ytdlp-nodejs'
import Tiktok from "@tobyg74/tiktok-api-dl"

import { FacebookMedia, InstagramMedia, SpotifyInfo, TiktokMedia, XMedia, YTInfo } from '../interfaces/library.interface.js'
import botTexts from '../helpers/bot.texts.helper.js'
import { YOUTUBE_QUALITY_LIMIT } from '../config/youtube.config.js'
import NodeCache from 'node-cache'

const DOWNLOAD_CACHE_MAX_BYTES = 16 * 1024 * 1024
const DOWNLOAD_CACHE_MAX_ITEM_BYTES = 8 * 1024 * 1024
const downloadCache = new NodeCache({ stdTTL: 300, checkperiod: 60, maxKeys: 8, useClones: false })
const inflightDownloads = new Map<string, Promise<Buffer>>()
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

const X_DOWNLOADABLE_MEDIA_TYPES = new Set(['video', 'gif'])

export async function xMedia (url: string){
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
    const { execSync } = require('child_process')

    const ytDlpPath = resolveYtDlpBinary()
    const args = ['--dump-json', '--no-download', '--no-check-certificate']

    args.push(url)

    const result = execSync(`"${ytDlpPath}" ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`, {
        encoding: 'utf-8',
        timeout: 30000,
        maxBuffer: 5 * 1024 * 1024
    })

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

export async function instagramMedia (url: string){
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
    return withDownloadSlot(async () => {
    try {
        let simulatedProgress = 0
        let progressInterval: NodeJS.Timeout | null = null

            if (onProgress) {
                const incrementInterval = (12 * 1000) / 95
                progressInterval = setInterval(() => {
                    if (simulatedProgress < 95) onProgress(++simulatedProgress)
                }, incrementInterval)
            }

            try {
            const response = await axios.get(url, {
                responseType: 'stream',
                timeout: 60000,
                maxContentLength: 8 * 1024 * 1024,
                maxBodyLength: 8 * 1024 * 1024
            })

            if (progressInterval) clearInterval(progressInterval)
            if (onProgress) onProgress(100)
            const chunks: Buffer[] = []
            let totalBytes = 0
            for await (const chunk of response.data as AsyncIterable<Buffer>) {
                totalBytes += chunk.length
                if (totalBytes > 8 * 1024 * 1024) {
                    response.data.destroy(new Error('Mídia excede o limite de 8 MB'))
                    throw new Error('Mídia excede o limite de 8 MB')
                }
                chunks.push(chunk)
            }
            return Buffer.concat(chunks, totalBytes)
            } catch (error) {
                if (progressInterval) clearInterval(progressInterval)
                throw error
            }
        } catch(err) {
            showConsoleLibraryError(err, 'downloadFromUrl')
            throw new Error(botTexts.library_error)
        }
    })
}

export async function downloadInstagramMedia(url: string, onProgress?: (percent: number) => void): Promise<Buffer> {
    const cached = downloadCache.get<Buffer>(`igvideo:${url}`)
    if (cached) {
        console.log('[downloadInstagramMedia] ✅ Cache hit:', url)
        if (onProgress) onProgress(100)
        return cached
    }

    const inflightKey = `igvideo:${url}`
    const inflight = inflightDownloads.get(inflightKey)
    if (inflight) {
        console.log('[downloadInstagramMedia] 🔄 Download em andamento, aguardando...')
        return inflight
    }

    const promise = withDownloadSlot(() => doDownloadInstagramMedia(url, onProgress))
    inflightDownloads.set(inflightKey, promise)
    try {
        return await promise
    } finally {
        inflightDownloads.delete(inflightKey)
    }
}

export async function downloadInstagramImage(url: string): Promise<Buffer> {
    const key = `igimage:${url}`
    const cached = downloadCache.get<Buffer>(key)
    if (cached) return cached
    const inflight = inflightDownloads.get(key)
    if (inflight) return inflight

    const promise = withDownloadSlot(async () => {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 60000,
            maxContentLength: 8 * 1024 * 1024,
            maxBodyLength: 8 * 1024 * 1024
        })
        const buffer = Buffer.from(response.data)
        cacheDownload(key, buffer)
        return buffer
    })
    inflightDownloads.set(key, promise)
    try {
        return await promise
    } finally {
        inflightDownloads.delete(key)
    }
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
                responseType: 'arraybuffer',
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
    const startTime = Date.now()
    const { spawn } = require('child_process')
    const fsp = require('fs').promises

    const tempFilePath = path.join('/tmp', `ig-${process.pid}-${randomUUID()}.mp4`)

    return new Promise((resolve, reject) => {
        const args = [
            url,
            '-o', tempFilePath,
            '--newline',
            '--progress',
            '-f', `bv*[height<=1080]+ba/b[height<=1080]/b`,
            '--merge-output-format', 'mp4',
            '--no-playlist',
            '--no-check-certificate',
            '--prefer-free-formats',
            '--concurrent-fragments', '1',
            '--buffer-size', '128K',
            '--http-chunk-size', '5M',
            '--socket-timeout', '30000',
            '--retries', '10',
            '--fragment-retries', '10',
            '--js-runtimes', `bun:${bunPath}`
        ]

        const ytDlpProcess = spawn(ytDlpPath, args)

        let totalFragments = 0
        let currentFragment = 0
        let lastReportedProgress = 0

        ytDlpProcess.stdout?.on('data', (data: Buffer) => {
            const output = data.toString()

            const fragmentsMatch = output.match(/Total fragments:\s*(\d+)/)
            if (fragmentsMatch) {
                totalFragments = parseInt(fragmentsMatch[1])
            }

            const currentFragmentMatch = output.match(/\(frag\s+(\d+)\/\d+\)/)
            if (currentFragmentMatch) {
                const newFragment = parseInt(currentFragmentMatch[1])
                if (newFragment > currentFragment && totalFragments > 0) {
                    currentFragment = newFragment
                    const progress = Math.min(Math.floor((currentFragment / totalFragments) * 95), 95)
                    if (progress > lastReportedProgress && onProgress) {
                        lastReportedProgress = progress
                        onProgress(progress)
                    }
                }
            }
        })

        const timeout = setTimeout(() => {
            ytDlpProcess.kill()
            fsp.unlink(tempFilePath).catch(() => {})
            reject(new Error('Download timeout após 5 minutos'))
        }, 300000)

        const maxSizeInterval = setInterval(() => {
            fsp.stat(tempFilePath).then((stat: { size: number }) => {
                if (stat.size > 48 * 1024 * 1024) {
                    ytDlpProcess.kill()
                    clearInterval(maxSizeInterval)
                    fsp.unlink(tempFilePath).catch(() => {})
                    reject(new Error('A mídia do Instagram excede o limite de 48 MB'))
                }
            }).catch(() => {})
        }, 1000)
        maxSizeInterval.unref()

        ytDlpProcess.on('close', async (code: number | null) => {
            clearTimeout(timeout)
            clearInterval(maxSizeInterval)

            if (code === 0) {
                try {
                    const fileStat = await fsp.stat(tempFilePath)
                    if (fileStat.size > 48 * 1024 * 1024) {
                        await fsp.unlink(tempFilePath)
                        reject(new Error('A mídia do Instagram excede o limite de 48 MB'))
                        return
                    }
                    if (onProgress) onProgress(100)
                    const buffer = await fsp.readFile(tempFilePath)
                    await fsp.unlink(tempFilePath)
                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
                    console.log(`[downloadInstagramMedia] ✅ ${elapsed}s, ${(buffer.length / 1024 / 1024).toFixed(2)}MB`)
                    cacheDownload(`igvideo:${url}`, buffer)
                    resolve(buffer)
                } catch (err: any) {
                    showConsoleLibraryError(err, 'downloadInstagramMedia')
                    reject(new Error(botTexts.library_error))
                }
            } else {
                fsp.unlink(tempFilePath).catch(() => {})
                reject(new Error(`yt-dlp falhou com código ${code}`))
            }
        })

        ytDlpProcess.on('error', (err: Error) => {
            clearTimeout(timeout)
            fsp.unlink(tempFilePath).catch(() => {})
            showConsoleLibraryError(err, 'downloadInstagramMedia')
            reject(new Error(botTexts.library_error))
        })
    })
}

export async function downloadYouTubeAudio(videoUrl: string, onProgress?: (percent: number) => void): Promise<Buffer> {
    const cached = downloadCache.get<Buffer>(`audio:${videoUrl}`)
    if (cached) {
        console.log('[downloadYouTubeAudio] ✅ Cache hit:', videoUrl)
        if (onProgress) onProgress(100)
        return cached
    }

    const inflightKey = `audio:${videoUrl}`
    const inflight = inflightDownloads.get(inflightKey)
    if (inflight) {
        console.log('[downloadYouTubeAudio] 🔄 Download em andamento, aguardando...')
        return inflight
    }

    const promise = withDownloadSlot(() => doDownloadYouTubeAudio(videoUrl, onProgress))
    inflightDownloads.set(inflightKey, promise)
    try {
        const result = await promise
        return result
    } finally {
        inflightDownloads.delete(inflightKey)
    }
}

async function doDownloadYouTubeAudio(videoUrl: string, onProgress?: (percent: number) => void): Promise<Buffer> {
    const startTime = Date.now()
    const { spawn } = require('child_process')
    const fsp = require('fs').promises

    const baseName = path.join('/tmp', `yta-${process.pid}-${randomUUID()}`)
    const outputTemplate = `${baseName}.%(ext)s`

    return new Promise((resolve, reject) => {
        const ytDlpProcess = spawn(ytDlpPath, [
            videoUrl,
            '-x', '--audio-format', 'mp3',
            '--audio-quality', '0',
            '-f', 'bestaudio',
            '-o', outputTemplate,
            '--no-playlist',
            '--no-check-certificate',
            '--concurrent-fragments', '1',
            '--socket-timeout', '30000',
            '--retries', '5',
            '--fragment-retries', '5',
            '--extractor-args', 'youtube:player_client=web_embedded',
            '--js-runtimes', `bun:${bunPath}`
        ])

        const timeout = setTimeout(() => {
            ytDlpProcess.kill()
            fsp.unlink(`${baseName}.mp3`).catch(() => {})
            reject(new Error('Download de áudio timeout após 3 minutos'))
        }, 180000)

        const maxSizeInterval = setInterval(() => {
            fsp.stat(`${baseName}.mp3`).then((stat: { size: number }) => {
                if (stat.size > 32 * 1024 * 1024) {
                    ytDlpProcess.kill()
                    clearInterval(maxSizeInterval)
                    fsp.unlink(`${baseName}.mp3`).catch(() => {})
                    reject(new Error('O áudio do YouTube excede o limite de 32 MB'))
                }
            }).catch(() => {})
        }, 1000)
        maxSizeInterval.unref()

        ytDlpProcess.stderr?.on('data', (data: Buffer) => {
            const output = data.toString()
            const match = output.match(/(\d+\.?\d*)%/)
            if (match && onProgress) {
                onProgress(Math.min(Math.floor(parseFloat(match[1])), 100))
            }
        })

        ytDlpProcess.on('close', async (code: number | null) => {
            clearTimeout(timeout)
            clearInterval(maxSizeInterval)
            if (code !== 0) {
                try {
                    const dir = '/tmp'
                    const prefix = path.basename(baseName)
                    const files = (await fsp.readdir(dir)).filter((f: string) => f.startsWith(prefix))
                    await Promise.all(files.map((f: string) => fsp.unlink(path.join(dir, f)).catch(() => {})))
                } catch {}
                reject(new Error(`yt-dlp áudio falhou com código ${code}`))
                return
            }
            try {
                const mp3File = `${baseName}.mp3`
                try { await fsp.access(mp3File) } catch {
                    reject(new Error('Arquivo de áudio não encontrado após extração'))
                    return
                }
                const audioStat = await fsp.stat(mp3File)
                if (audioStat.size > 32 * 1024 * 1024) {
                    await fsp.unlink(mp3File)
                    reject(new Error('O áudio do YouTube excede o limite de 32 MB'))
                    return
                }
                const buffer = await fsp.readFile(mp3File)
                await fsp.unlink(mp3File)
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
                console.log(`[downloadYouTubeAudio] ✅ ${elapsed}s, ${(buffer.length / 1024 / 1024).toFixed(2)}MB`)
                if (onProgress) onProgress(100)
                cacheDownload(`audio:${videoUrl}`, buffer)
                resolve(buffer)
            } catch (err) {
                reject(err)
            }
        })

        ytDlpProcess.on('error', (err: Error) => {
            clearTimeout(timeout)
            clearInterval(maxSizeInterval)
            fsp.unlink(`${baseName}.mp3`).catch(() => {})
            reject(err)
        })
    })
}

export async function downloadYouTubeVideo(videoUrl: string, onProgress?: (percent: number) => void): Promise<Buffer> {
    const cached = downloadCache.get<Buffer>(`video:${videoUrl}`)
    if (cached) {
        console.log('[downloadYouTubeVideo] ✅ Cache hit:', videoUrl)
        if (onProgress) onProgress(100)
        return cached
    }

    const inflightKey = `video:${videoUrl}`
    const inflight = inflightDownloads.get(inflightKey)
    if (inflight) {
        console.log('[downloadYouTubeVideo] 🔄 Download em andamento, aguardando...')
        return inflight
    }

    const promise = withDownloadSlot(() => doDownloadYouTubeVideo(videoUrl, onProgress))
    inflightDownloads.set(inflightKey, promise)
    try {
        const result = await promise
        return result
    } finally {
        inflightDownloads.delete(inflightKey)
    }
}

async function doDownloadYouTubeVideo(videoUrl: string, onProgress?: (percent: number) => void): Promise<Buffer> {
    const startTime = Date.now()
    const { spawn } = require('child_process')
    const fsp = require('fs').promises

    const tempFilePath = path.join('/tmp', `yt-${process.pid}-${randomUUID()}.mp4`)

    return new Promise((resolve, reject) => {
        const ytDlpProcess = spawn(ytDlpPath, [
            videoUrl,
            '-o', tempFilePath,
            '--newline',
            '--progress',
            '-f', `best[height<=${YOUTUBE_QUALITY_LIMIT}][ext=mp4]/best[ext=mp4]/best`,
            '--no-playlist',
            '--no-check-certificate',
            '--prefer-free-formats',
            '--concurrent-fragments', '1',
            '--buffer-size', '128K',
            '--http-chunk-size', '5M',
            '--socket-timeout', '30000',
            '--retries', '10',
            '--fragment-retries', '10',
            '--extractor-args', 'youtube:player_client=web_embedded',
            '--js-runtimes', `bun:${bunPath}`
        ])

        let totalFragments = 0
        let currentFragment = 0
        let lastReportedProgress = 0
        
        ytDlpProcess.stdout?.on('data', (data: Buffer) => {
            const output = data.toString()
            
            const fragmentsMatch = output.match(/Total fragments:\s*(\d+)/)
            if (fragmentsMatch) {
                totalFragments = parseInt(fragmentsMatch[1])
            }
            
            const currentFragmentMatch = output.match(/\(frag\s+(\d+)\/\d+\)/)
            if (currentFragmentMatch) {
                const newFragment = parseInt(currentFragmentMatch[1])
                if (newFragment > currentFragment && totalFragments > 0) {
                    currentFragment = newFragment
                    const progress = Math.min(Math.floor((currentFragment / totalFragments) * 95), 95)
                    if (progress > lastReportedProgress && onProgress) {
                        lastReportedProgress = progress
                        onProgress(progress)
                    }
                }
            }
        })

        const timeout = setTimeout(() => {
            ytDlpProcess.kill()
            fsp.unlink(tempFilePath).catch(() => {})
            reject(new Error('Download timeout após 5 minutos'))
        }, 300000)

        const maxSizeInterval = setInterval(() => {
            fsp.stat(tempFilePath).then((stat: { size: number }) => {
                if (stat.size > 48 * 1024 * 1024) {
                    ytDlpProcess.kill()
                    clearInterval(maxSizeInterval)
                    fsp.unlink(tempFilePath).catch(() => {})
                    reject(new Error('A mídia do YouTube excede o limite de 48 MB'))
                }
            }).catch(() => {})
        }, 1000)
        maxSizeInterval.unref()

        ytDlpProcess.on('close', async (code: number | null) => {
            clearTimeout(timeout)
            clearInterval(maxSizeInterval)
            
            if (code === 0) {
                try {
                    const fileStat = await fsp.stat(tempFilePath)
                    if (fileStat.size > 48 * 1024 * 1024) {
                        await fsp.unlink(tempFilePath)
                        reject(new Error('A mídia do YouTube excede o limite de 48 MB'))
                        return
                    }
                    if (onProgress) onProgress(100)
                    const buffer = await fsp.readFile(tempFilePath)
                    await fsp.unlink(tempFilePath)
                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
                    console.log(`[downloadYouTubeVideo] ✅ ${elapsed}s, ${(buffer.length / 1024 / 1024).toFixed(2)}MB`)
                    cacheDownload(`video:${videoUrl}`, buffer)
                    resolve(buffer)
                } catch (err: any) {
                    showConsoleLibraryError(err, 'downloadYouTubeVideo')
                    reject(new Error(botTexts.library_error))
                }
            } else {
                fsp.unlink(tempFilePath).catch(() => {})
                reject(new Error(`yt-dlp falhou com código ${code}`))
            }
        })

        ytDlpProcess.on('error', (err: Error) => {
            clearTimeout(timeout)
            fsp.unlink(tempFilePath).catch(() => {})
            showConsoleLibraryError(err, 'downloadYouTubeVideo')
            reject(new Error(botTexts.library_error))
        })
    })
}
