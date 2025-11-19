import { formatSeconds, showConsoleLibraryError } from './general.util.js'
import {instagramGetUrl} from 'instagram-url-direct'
import { getFbVideoInfo } from 'fb-downloader-scrapper'
import Tiktok from '@tobyg74/tiktok-api-dl'
import axios from 'axios'
import yts from 'yt-search'
import { FacebookMedia, InstagramMedia, TiktokMedia, XMedia, YTInfo } from '../interfaces/library.interface.js'
import botTexts from '../helpers/bot.texts.helper.js'
import { helpers, type PlaylistInfo, type VideoInfo, type VideoProgress, YtDlp } from 'ytdlp-nodejs'

let ytDlpClient: YtDlp | null = null

const ensureYtDlp = async () => {
    if (process.env.YTDLP_TEST_STUB === '1') {
        const testMock = (globalThis as any).__ytDlpMock
        return (testMock ?? {
            getInfoAsync: async () => ({
                id: 'stub',
                title: 'stub',
                description: '',
                duration: 0,
                uploader: 'stub',
                thumbnail: '',
                is_live: false,
                formats: []
            }),
            getFileAsync: async (_url: string, options?: any) => {
                options?.onProgress?.({ downloaded: 0, total: 0, percentage: 0 })
                return { async arrayBuffer() { return new ArrayBuffer(0) } }
            }
        }) as unknown as YtDlp
    }

    if (ytDlpClient) {
        return ytDlpClient
    }

    try {
        let binaryPath = helpers.findYtdlpBinary()

        if (!binaryPath) {
            binaryPath = await helpers.downloadYtDlp()
        }

        if (!binaryPath) {
            throw new Error('yt-dlp binary not found after download attempt')
        }

        ytDlpClient = new YtDlp({ binaryPath })
        return ytDlpClient
    } catch (error) {
        showConsoleLibraryError(error, 'ensureYtDlp')
        throw new Error(botTexts.library_error)
    }
}

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

        // Verifica se é uma URL válida do YouTube
        const urlPattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/
        const isURLValid = urlPattern.test(text)

        if(isURLValid) {
            videoUrl = text
        } else {
            // Busca o vídeo por título
            const {videos} = await yts(text)

            if(!videos.length) {
                return null
            }
            
            videoUrl = `https://www.youtube.com/watch?v=${videos[0].videoId}`
        }

        if(!videoUrl) {
            return null
        }

        const ytDlp = await ensureYtDlp()
        const videoInfoRaw: VideoInfo | PlaylistInfo = await ytDlp.getInfoAsync(videoUrl, { flatPlaylist: true })

        const videoInfo = videoInfoRaw._type === 'playlist'
            ? videoInfoRaw.entries?.[0]
            : videoInfoRaw

        if (!videoInfo) {
            return null
        }

        // Verifica se é live
        if (videoInfo.is_live) {
            const ytInfo : YTInfo = {
                id_video : videoInfo.id,
                title:  videoInfo.title,
                description: videoInfo.description || '',
                duration: 0,
                channel: videoInfo.uploader || videoInfo.channel || 'Desconhecido',
                is_live: true,
                duration_formatted: '00:00',
                url: '',
                thumbnail: videoInfo.thumbnail || `https://img.youtube.com/vi/${videoInfo.id}/maxresdefault.jpg`
            }
            return ytInfo
        }

        const formats = videoInfo.formats || []
        const videoAndAudioFormats = formats.filter((f: any) => f.vcodec !== 'none' && f.acodec !== 'none')

        const { YOUTUBE_QUALITY_LIMIT } = await import('../config/youtube.config.js')
        const limitHeight = Number.isFinite(YOUTUBE_QUALITY_LIMIT) ? Number(YOUTUBE_QUALITY_LIMIT) : undefined

        const withinLimit = limitHeight
            ? videoAndAudioFormats.filter((f: any) => f.height && f.height <= limitHeight)
            : []

        const sortedCandidates = (withinLimit.length ? withinLimit : videoAndAudioFormats.length ? videoAndAudioFormats : formats)
            .sort((a: any, b: any) => (b.height || 0) - (a.height || 0))

        const bestFormat = sortedCandidates[0]

        const ytInfo : YTInfo = {
            id_video : videoInfo.id,
            title:  videoInfo.title,
            description: videoInfo.description || '',
            duration: Number(videoInfo.duration || 0),
            channel: videoInfo.uploader || videoInfo.channel || 'Desconhecido',
            is_live: false,
            duration_formatted: formatSeconds(Number(videoInfo.duration || 0)),
            url: bestFormat?.url || videoInfo.url || '',
            thumbnail: videoInfo.thumbnail || `https://img.youtube.com/vi/${videoInfo.id}/maxresdefault.jpg`
        }
        
        return ytInfo
    } catch(err) {
        showConsoleLibraryError(err, 'youtubeMedia')
        throw new Error(botTexts.library_error)
    }
}

export type DownloadProgressEvent = {
    stage: 'download'
    downloadedBytes: number
    totalBytes?: number
    percent?: number
}

export async function downloadYouTubeVideo(videoUrl: string, onProgress?: (progress: DownloadProgressEvent) => void): Promise<Buffer> {
    const { YOUTUBE_QUALITY_LIMIT } = await import('../config/youtube.config.js')

    try {
        const ytDlp = await ensureYtDlp()

        console.log('[downloadYouTubeVideo] Starting download:', videoUrl)

        console.log('[downloadYouTubeVideo] Quality limit:', YOUTUBE_QUALITY_LIMIT + 'p')

        // Baixa o vídeo para o arquivo temporário com qualidade configurável
        // Prioriza velocidade e tamanho menor, ideal para WhatsApp
        const formatSelector = `bestvideo[height<=${YOUTUBE_QUALITY_LIMIT}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${YOUTUBE_QUALITY_LIMIT}][ext=mp4]/best[height<=${YOUTUBE_QUALITY_LIMIT}]/worst`

        const file = await ytDlp.getFileAsync(videoUrl, {
            format: formatSelector,
            onProgress: (progress: VideoProgress) => {
                onProgress?.({
                    stage: 'download',
                    downloadedBytes: progress.downloaded,
                    totalBytes: progress.total,
                    percent: progress.percentage
                })
            }
        })

        const videoBuffer = Buffer.from(await file.arrayBuffer())
        console.log('[downloadYouTubeVideo] File size:', (videoBuffer.length / 1024 / 1024).toFixed(2), 'MB')

        return videoBuffer
    } catch(err) {
        showConsoleLibraryError(err, 'downloadYouTubeVideo')
        throw new Error(botTexts.library_error)
    }
}