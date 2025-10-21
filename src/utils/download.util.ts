import {formatSeconds, showConsoleLibraryError} from './general.util.js'
import {instagramGetUrl} from 'instagram-url-direct'
import { getFbVideoInfo } from 'fb-downloader-scrapper'
import Tiktok from '@tobyg74/tiktok-api-dl'
import axios from 'axios'
import yts from 'yt-search'
import { FacebookMedia, InstagramMedia, TiktokMedia, XMedia, YTInfo } from '../interfaces/library.interface.js'
import botTexts from '../helpers/bot.texts.helper.js'

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

        // Obtém informações do vídeo usando yt-dlp (import dinâmico para compatibilidade CJS/ESM)
        const ytDlpPath = new URL('../../yt-dlp', import.meta.url).pathname
        const YTDlpModule: any = await import('yt-dlp-wrap')
        
        // O constructor está em YTDlpModule.default.default (double default export)
        const YTDlpWrap = YTDlpModule.default?.default || YTDlpModule.default || YTDlpModule
        
        if (typeof YTDlpWrap !== 'function') {
            throw new Error('YTDlpWrap constructor not found in module')
        }
        
        const ytDlpWrap = new YTDlpWrap(ytDlpPath)
        const videoInfoRaw = await ytDlpWrap.getVideoInfo(videoUrl)
        
        // Verifica se é live
        if (videoInfoRaw.is_live) {
            const ytInfo : YTInfo = {
                id_video : videoInfoRaw.id,
                title:  videoInfoRaw.title,
                description: videoInfoRaw.description || '',
                duration: 0,
                channel: videoInfoRaw.uploader || videoInfoRaw.channel || 'Desconhecido',
                is_live: true,
                duration_formatted: '00:00',
                url: ''
            }
            return ytInfo
        }

        // Pega a melhor qualidade de vídeo+áudio
        const formats = videoInfoRaw.formats || []
        const videoAndAudioFormats = formats.filter((f: any) => f.vcodec !== 'none' && f.acodec !== 'none')
        
        let bestFormat
        if (videoAndAudioFormats.length > 0) {
            bestFormat = videoAndAudioFormats.sort((a: any, b: any) => {
                const qualityA = a.height || 0
                const qualityB = b.height || 0
                return qualityB - qualityA
            })[0]
        } else {
            bestFormat = formats[0]
        }

        const ytInfo : YTInfo = {
            id_video : videoInfoRaw.id,
            title:  videoInfoRaw.title,
            description: videoInfoRaw.description || '',
            duration: Number(videoInfoRaw.duration || 0),
            channel: videoInfoRaw.uploader || videoInfoRaw.channel || 'Desconhecido',
            is_live: false,
            duration_formatted: formatSeconds(Number(videoInfoRaw.duration || 0)),
            url: bestFormat?.url || videoInfoRaw.url || ''
        }
        
        return ytInfo
    } catch(err) {
        showConsoleLibraryError(err, 'youtubeMedia')
        throw new Error(botTexts.library_error)
    }
}

export async function downloadYouTubeVideo(videoUrl: string): Promise<Buffer> {
    const fs = await import('fs')
    const path = await import('path')
    const crypto = await import('crypto')
    const { YOUTUBE_QUALITY_LIMIT } = await import('../config/youtube.config.js')
    
    try {
        const ytDlpPath = new URL('../../yt-dlp', import.meta.url).pathname
        const YTDlpModule: any = await import('yt-dlp-wrap')
        
        // O constructor está em YTDlpModule.default.default (double default export)
        const YTDlpWrap = YTDlpModule.default?.default || YTDlpModule.default || YTDlpModule
        
        if (typeof YTDlpWrap !== 'function') {
            throw new Error('YTDlpWrap constructor not found in module')
        }
        
        const ytDlpWrap = new YTDlpWrap(ytDlpPath)
        
        console.log('[downloadYouTubeVideo] Starting download:', videoUrl)
        
        // Cria um arquivo temporário para o download
        const tempFileName = `yt-${crypto.randomBytes(8).toString('hex')}.mp4`
        const tempFilePath = path.join('/tmp', tempFileName)
        
        console.log('[downloadYouTubeVideo] Temp file:', tempFilePath)
        console.log('[downloadYouTubeVideo] Quality limit:', YOUTUBE_QUALITY_LIMIT + 'p')
        
        // Baixa o vídeo para o arquivo temporário com qualidade configurável
        // Prioriza velocidade e tamanho menor, ideal para WhatsApp
        const formatSelector = `bestvideo[height<=${YOUTUBE_QUALITY_LIMIT}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${YOUTUBE_QUALITY_LIMIT}][ext=mp4]/best[height<=${YOUTUBE_QUALITY_LIMIT}]/worst`
        
        await ytDlpWrap.execPromise([
            videoUrl,
            '-f', formatSelector,
            '-o', tempFilePath,
            '--no-playlist',
            '--no-warnings',
            '--merge-output-format', 'mp4',
            '--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '--extractor-args', 'youtube:player_client=android,web'
        ])
        
        console.log('[downloadYouTubeVideo] Download complete, reading file...')
        
        // Lê o arquivo em buffer
        const videoBuffer = fs.readFileSync(tempFilePath)
        console.log('[downloadYouTubeVideo] File size:', (videoBuffer.length / 1024 / 1024).toFixed(2), 'MB')
        
        // Remove o arquivo temporário
        fs.unlinkSync(tempFilePath)
        console.log('[downloadYouTubeVideo] Temp file cleaned up')
        
        return videoBuffer
    } catch(err) {
        showConsoleLibraryError(err, 'downloadYouTubeVideo')
        throw new Error(botTexts.library_error)
    }
}