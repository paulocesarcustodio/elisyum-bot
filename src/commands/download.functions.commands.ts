import { WASocket } from "@whiskeysockets/baileys"
import { Bot } from "../interfaces/bot.interface.js"
import { Group } from "../interfaces/group.interface.js"
import { Message } from "../interfaces/message.interface.js"
import { buildText, messageErrorCommandUsage, generateProgressBar, getTextOrQuotedText, detectPlatform, extractUrls } from "../utils/general.util.js"
import * as waUtil from "../utils/whatsapp.util.js"
import * as downloadUtil from '../utils/download.util.js'
import * as convertUtil from '../utils/convert.util.js'
import { imageSearchGoogle } from '../utils/image.util.js'
import format from 'format-duration'

// Mensagens dos comandos de download (para evitar dependência circular)
const downloadMsgs = {
    d: {
        error_not_found: 'Não foi possível baixar a mídia'
    },
    play: {
        wait: "[AGUARDE] 🎧 Sua música está sendo baixada e processada.\n\n"+
        "*Título*: {$1}\n"+
        "*Duração*: {$2}",
        error_limit: "O vídeo deve ter no máximo *9 minutos*",
        error_live: "Esse vídeo não pode ser convertido em áudio, lives não são aceitas.",
        error_not_found: "Nenhum áudio foi encontrado",
        error_no_youtube_link: "❌ A mensagem respondida não contém nenhum link.\n\n💡 Use *{$1}play* respondendo mensagens com links do YouTube ou digite o título da música.",
        error_only_youtube: "❌ O comando *{$1}play* só funciona com links do YouTube ao responder mensagens.\n\n💡 Para outras plataformas, use *{$1}d*."
    },
    img: {
        error_limit: "O número máximo de imagens é 5",
        error_not_found: "Nenhuma imagem foi encontrada",
        error_download: "Erro ao baixar as imagens",
        error: "Erro ao buscar imagens"
    },
    mp3: {
        error_no_input: 'Você precisa informar um link, termo de busca ou responder um vídeo.',
        error_not_video: 'A mídia respondida precisa ser um vídeo para converter em MP3.',
        error_not_found: 'Não foi possível gerar o MP3 a partir do conteúdo informado.',
        error_only_supported: '❌ O link informado não possui vídeo compatível para conversão em MP3.'
    }
}

const MAX_WHATSAPP_VIDEO_SIZE = 20 * 1024 * 1024

function buildCompactStatus(label: string, percent?: number) {
    if (percent === undefined) {
        return `${label}...`
    }

    return `${label} ${percent}%\n${generateProgressBar(percent, 100, 20)}`
}

function buildIndexedCompactStatus(label: string, current: number, total: number, percent?: number) {
    const suffix = total > 1 ? ` ${current}/${total}` : ''

    if (percent === undefined) {
        return `${label}${suffix}...`
    }

    return `${label}${suffix} ${percent}%\n${generateProgressBar(percent, 100, 20)}`
}

async function prepareVideoForWhatsApp(
    videoBuffer: Buffer,
    onProgress?: (percent: number) => void | Promise<void>
): Promise<Buffer> {
    if (videoBuffer.length <= MAX_WHATSAPP_VIDEO_SIZE) {
        return videoBuffer
    }

    await onProgress?.(0)
    const compressed = await convertUtil.compressVideoToLimit(videoBuffer, MAX_WHATSAPP_VIDEO_SIZE, onProgress)
    const before = (videoBuffer.length / 1024 / 1024).toFixed(2)
    const after = (compressed.length / 1024 / 1024).toFixed(2)
    console.log(`[prepareVideoForWhatsApp] ✅ Comprimido: ${before}MB → ${after}MB`)
    return compressed
}

async function createStatusEditor(client: WASocket, message: Message, initialText: string, logTag: string) {
    const sentMessage = await waUtil.replyText(client, message.chat_id, initialText, message.wa_message, {expiration: message.expiration})

    if (!sentMessage || !sentMessage.key) {
        throw new Error('Falha ao enviar mensagem inicial')
    }

    const messageKey = sentMessage.key

    return async (text: string) => {
        try {
            await waUtil.editText(client, message.chat_id, messageKey, text)
        } catch (err) {
            console.error(`[${logTag}] Erro ao editar mensagem:`, err)
        }
    }
}

async function downloadVideoBufferFromSupportedInput(text: string, onProgress?: (percent: number) => void): Promise<Buffer> {
    const urls = extractUrls(text)

    if (urls.length === 0) {
        const videoInfo = await downloadUtil.youtubeMedia(text)
        if (!videoInfo) throw new Error(downloadMsgs.mp3.error_not_found)
        if (videoInfo.is_live) throw new Error(downloadMsgs.play.error_live)
        return downloadUtil.downloadYouTubeVideo(`https://www.youtube.com/watch?v=${videoInfo.id_video}`, onProgress)
    }

    const url = urls[0]
    const platform = detectPlatform(url)

    if (platform === 'spotify') {
        const spotifyInfo = await downloadUtil.spotifyMedia(url)
        if (!spotifyInfo) throw new Error(downloadMsgs.mp3.error_not_found)
        const videoInfo = await downloadUtil.youtubeMedia(`${spotifyInfo.title} ${spotifyInfo.artist}`)
        if (!videoInfo) throw new Error(downloadMsgs.mp3.error_not_found)
        if (videoInfo.is_live) throw new Error(downloadMsgs.play.error_live)
        return downloadUtil.downloadYouTubeVideo(`https://www.youtube.com/watch?v=${videoInfo.id_video}`, onProgress)
    }

    switch (platform) {
        case 'youtube': {
            const videoInfo = await downloadUtil.youtubeMedia(url)
            if (!videoInfo) throw new Error(downloadMsgs.mp3.error_not_found)
            if (videoInfo.is_live) throw new Error(downloadMsgs.play.error_live)
            return downloadUtil.downloadYouTubeVideo(`https://www.youtube.com/watch?v=${videoInfo.id_video}`, onProgress)
        }
        case 'facebook': {
            const fb = await downloadUtil.facebookMedia(url)
            if (fb.duration > 540) throw new Error(downloadMsgs.play.error_limit)
            return downloadUtil.downloadFromUrl(fb.sd, onProgress)
        }
        case 'instagram': {
            const ig = await downloadUtil.instagramMedia(url)
            if (!ig) throw new Error(downloadMsgs.mp3.error_not_found)
            const video = ig.media.find(media => media.type === 'video')
            if (!video) throw new Error(downloadMsgs.mp3.error_only_supported)
            return await downloadUtil.downloadInstagramMedia(video.url, onProgress)
        }
        case 'twitter': {
            const x = await downloadUtil.xMedia(url)
            const video = x?.media.find(m => m.type === 'video')
            if (!video) throw new Error(downloadMsgs.mp3.error_only_supported)
            return downloadUtil.downloadFromUrl(video.url, onProgress)
        }
        case 'tiktok': {
            const tk = await downloadUtil.tiktokMedia(url)
            const downloadUrl = Array.isArray(tk.url) ? tk.url[0] : tk.url
            if (!downloadUrl) throw new Error(downloadMsgs.mp3.error_not_found)
            return downloadUtil.downloadFromUrl(downloadUrl, onProgress)
        }
        default:
            throw new Error(downloadMsgs.mp3.error_only_supported)
    }
}

async function downloadAudioBufferFromSupportedInput(text: string, onProgress?: (percent: number) => void): Promise<Buffer> {
    const urls = extractUrls(text)

    if (urls.length === 0) {
        const videoInfo = await downloadUtil.youtubeMedia(text)
        if (!videoInfo) throw new Error(downloadMsgs.mp3.error_not_found)
        if (videoInfo.is_live) throw new Error(downloadMsgs.play.error_live)
        return downloadUtil.downloadYouTubeAudio(`https://www.youtube.com/watch?v=${videoInfo.id_video}`, onProgress)
    }

    const url = urls[0]
    const platform = detectPlatform(url)

    if (platform === 'spotify') {
        const spotifyInfo = await downloadUtil.spotifyMedia(url)
        if (!spotifyInfo) throw new Error(downloadMsgs.mp3.error_not_found)
        const videoInfo = await downloadUtil.youtubeMedia(`${spotifyInfo.title} ${spotifyInfo.artist}`)
        if (!videoInfo) throw new Error(downloadMsgs.mp3.error_not_found)
        if (videoInfo.is_live) throw new Error(downloadMsgs.play.error_live)
        return downloadUtil.downloadYouTubeAudio(`https://www.youtube.com/watch?v=${videoInfo.id_video}`, onProgress)
    }

    if (platform === 'youtube') {
        const videoInfo = await downloadUtil.youtubeMedia(url)
        if (!videoInfo) throw new Error(downloadMsgs.mp3.error_not_found)
        if (videoInfo.is_live) throw new Error(downloadMsgs.play.error_live)
        return downloadUtil.downloadYouTubeAudio(`https://www.youtube.com/watch?v=${videoInfo.id_video}`, onProgress)
    }

    // Fallback: baixa vídeo + converte para MP3 (outras plataformas)
    const videoBuffer = await downloadVideoBufferFromSupportedInput(text, onProgress)
    return convertUtil.convertMp4ToMp3('buffer', videoBuffer)
}

export async function playCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    const textToProcess = getTextOrQuotedText(message)
    
    if (!message.args.length && !message.isQuoted){
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }
    
    if (message.isQuoted && !message.args.length && message.quotedMessage) {
        const quotedText = message.quotedMessage.body || message.quotedMessage.caption || ''
        const urls = extractUrls(quotedText)
        if (urls.length === 0) throw new Error(buildText(downloadMsgs.play.error_no_youtube_link, botInfo.prefix))
        const platform = detectPlatform(urls[0])
        if (platform !== 'youtube' && platform !== 'spotify') throw new Error(buildText(downloadMsgs.play.error_only_youtube, botInfo.prefix))
    }

    let searchQuery = textToProcess
    const urls = extractUrls(textToProcess)
    const spotifyUrl = urls.find(url => detectPlatform(url) === 'spotify')

    if (spotifyUrl) {
        const spotifyInfo = await downloadUtil.spotifyMedia(spotifyUrl)
        if (spotifyInfo) {
            searchQuery = `${spotifyInfo.title} ${spotifyInfo.artist}`
        } else {
            throw new Error('❌ Não foi possível obter informações do link do Spotify.')
        }
    }

    const videoInfo = await downloadUtil.youtubeMedia(searchQuery)
    if (!videoInfo) throw new Error(downloadMsgs.play.error_not_found)
    if (videoInfo.is_live) throw new Error(downloadMsgs.play.error_live)

    const safeEdit = await createStatusEditor(client, message, buildCompactStatus('📥 Baixando áudio'), 'playCommand')

    try {
        const audioBuffer = await downloadUtil.downloadYouTubeAudio(
            `https://www.youtube.com/watch?v=${videoInfo.id_video}`,
            async (progress) => await safeEdit(buildCompactStatus('📥 Baixando áudio', progress))
        )

        await safeEdit(buildCompactStatus('📤 Enviando áudio', 100))
        await waUtil.replyFileFromBuffer(client, message.chat_id, 'audioMessage', audioBuffer, '', message.wa_message, {expiration: message.expiration, mimetype: 'audio/mpeg'})
        await safeEdit('✅ Concluído!')
    } catch (error) {
        console.error('[playCommand] Erro:', error)
        await safeEdit(`❌ Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)
        throw error
    }
}

export async function mp3Command(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    const hasQuotedVideo = message.isQuoted && message.quotedMessage?.type === 'videoMessage' && message.quotedMessage.isMedia

    if (!message.args.length && !message.isQuoted) {
        throw new Error(downloadMsgs.mp3.error_no_input)
    }

    if (message.isQuoted && message.quotedMessage?.isMedia && message.quotedMessage.type !== 'videoMessage' && !message.args.length) {
        const quotedText = message.quotedMessage.body || message.quotedMessage.caption || ''
        const quotedUrls = extractUrls(quotedText)

        if (quotedUrls.length === 0) {
            throw new Error(downloadMsgs.mp3.error_not_video)
        }
    }

    const safeEdit = await createStatusEditor(client, message, buildCompactStatus(hasQuotedVideo ? '📥 Obtendo vídeo' : '📥 Baixando áudio'), 'mp3Command')

    try {
        let audioBuffer: Buffer

        if (hasQuotedVideo && message.quotedMessage) {
            const videoBuffer = await waUtil.downloadMessageAsBuffer(client, message.quotedMessage.wa_message)
            audioBuffer = await convertUtil.convertMp4ToMp3('buffer', videoBuffer, async (progress) => {
                await safeEdit(buildCompactStatus('🔄 Convertendo para MP3', progress))
            })
        } else {
            const textToProcess = getTextOrQuotedText(message)
            if (!textToProcess.trim()) throw new Error(downloadMsgs.mp3.error_no_input)

            audioBuffer = await downloadAudioBufferFromSupportedInput(textToProcess, async (progress) => {
                await safeEdit(buildCompactStatus('📥 Baixando áudio', progress))
            })
        }

        await safeEdit(buildCompactStatus('📤 Enviando áudio', 100))
        await waUtil.replyFileFromBuffer(client, message.chat_id, 'audioMessage', audioBuffer, '', message.wa_message, {expiration: message.expiration, mimetype: 'audio/mpeg'})
        await safeEdit('✅ Concluído!')
    } catch (error) {
        console.error('[mp3Command] Erro:', error)
        await safeEdit(`❌ Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)
        throw error
    }
}

export async function ytCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    const textToProcess = getTextOrQuotedText(message)
    
    if (!message.args.length && !message.isQuoted){
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const videoInfo = await downloadUtil.youtubeMedia(textToProcess)

    if (!videoInfo){
        throw new Error(downloadMsgs.d.error_not_found)
    } else if (videoInfo.is_live){
        throw new Error('❌ Não é possível baixar vídeos ao vivo.')
    }

    const safeEdit = await createStatusEditor(client, message, buildCompactStatus('📥 Baixando vídeo'), 'ytCommand')

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoInfo.id_video}`

    // Download com progresso real (0-100%)
    let lastProgress = 0
    const videoBuffer = await downloadUtil.downloadYouTubeVideo(youtubeUrl, async (percent) => {
        // Atualiza: primeiro update aos 5%, depois a cada 15%, e sempre em 100%
        const shouldUpdate = (percent >= 5 && lastProgress === 0) || 
                             (percent - lastProgress >= 15) || 
                             (percent === 100)
        
        if (shouldUpdate) {
            lastProgress = percent
            await safeEdit(buildCompactStatus('📥 Baixando vídeo', percent))
        }
    })
    
    // Verifica tamanho e comprime se necessário para caber no limite do WhatsApp
    const finalVideoBuffer = await prepareVideoForWhatsApp(videoBuffer, async (percent) => {
        await safeEdit(buildCompactStatus('🔄 Comprimindo vídeo', percent))
    })

    await safeEdit(buildCompactStatus('📤 Enviando vídeo', 100))
    
    await waUtil.replyFileFromBuffer(client, message.chat_id, 'videoMessage', finalVideoBuffer, '', message.wa_message, {expiration: message.expiration, mimetype: 'video/mp4'})

    await safeEdit('✅ Concluído!')
}

export async function fbCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    const textToProcess = getTextOrQuotedText(message)
    
    if (!message.args.length && !message.isQuoted){
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const fbInfo = await downloadUtil.facebookMedia(textToProcess)

    if (fbInfo.duration > 540){
        throw new Error('❌ O vídeo é muito grande para ser baixado.')
    }

    const safeEdit = await createStatusEditor(client, message, buildCompactStatus('📥 Baixando vídeo'), 'fbCommand')
    
    // Download com progresso simulado
    let lastProgress = 0
    const videoBuffer = await downloadUtil.downloadFromUrl(fbInfo.sd, async (percent) => {
        const shouldUpdate = (percent >= 5 && lastProgress === 0) || 
                             (percent - lastProgress >= 15) || 
                             (percent === 100)
        
        if (shouldUpdate) {
            lastProgress = percent
            await safeEdit(buildCompactStatus('📥 Baixando vídeo', percent))
        }
    })
    
    // Verifica tamanho e comprime se necessário para caber no limite do WhatsApp
    const finalVideoBuffer = await prepareVideoForWhatsApp(videoBuffer, async (percent) => {
        await safeEdit(buildCompactStatus('🔄 Comprimindo vídeo', percent))
    })

    await safeEdit(buildCompactStatus('📤 Enviando vídeo', 100))
    
    await waUtil.replyFileFromBuffer(client, message.chat_id, 'videoMessage', finalVideoBuffer, '', message.wa_message, {expiration: message.expiration, mimetype: 'video/mp4'})

    await safeEdit('✅ Concluído!')
}

export async function igCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    const textToProcess = getTextOrQuotedText(message)
    
    if (!message.args.length && !message.isQuoted){
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const igInfo = await downloadUtil.instagramMedia(textToProcess)
    
    if (!igInfo) {
        return
    }

    const totalMedia = igInfo.media.length
    if (totalMedia > 10) throw new Error('❌ O post contém mídia demais. O limite é 10 itens por publicação.')
    const safeEdit = await createStatusEditor(client, message, buildIndexedCompactStatus('📥 Baixando mídia', 1, totalMedia), 'igCommand')

    for (const [index, media] of igInfo.media.entries()) {
        const type = media.type
        const mediaBuffer = type === 'video'
            ? await downloadUtil.downloadInstagramMedia(media.url, (percent) => safeEdit(buildIndexedCompactStatus('📥 Baixando mídia', index + 1, totalMedia, percent)))
            : await downloadUtil.downloadInstagramImage(media.url)
        const messageType = type == 'image' ? 'imageMessage' : 'videoMessage'
        
        let finalBuffer = mediaBuffer
        if (type === 'video') {
            finalBuffer = await prepareVideoForWhatsApp(mediaBuffer, async (percent) => {
                await safeEdit(buildIndexedCompactStatus('🔄 Comprimindo vídeo', index + 1, totalMedia, percent))
            })
        }
        
        await safeEdit(buildIndexedCompactStatus('📤 Enviando mídia', index + 1, totalMedia, 100))
        await waUtil.replyFileFromBuffer(client, message.chat_id, messageType, finalBuffer, '', message.wa_message, {expiration: message.expiration, mimetype: type == 'video' ? 'video/mp4' : undefined})
    }
    
    await safeEdit('✅ Concluído!')
}

export async function xCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    const textToProcess = getTextOrQuotedText(message)
    
    if (!message.args.length && !message.isQuoted){
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const xInfo = await downloadUtil.xMedia(textToProcess)

    if (!xInfo){
        if (message.isAutoDownload) {
            console.log('[xCommand] Ignorando auto-download de Twitter/X sem vídeo')
            return
        }

        throw new Error('❌ O link do Twitter/X não contém vídeo para download.')
    }

    const totalMedia = xInfo.media.length
    const safeEdit = await createStatusEditor(client, message, buildIndexedCompactStatus('📥 Baixando mídia', 1, totalMedia), 'xCommand')
    
    for (let i = 0; i < totalMedia; i++) {
        const media = xInfo.media[i]
        
        if (i > 0) {
            await safeEdit(buildIndexedCompactStatus('📥 Baixando mídia', i + 1, totalMedia, 0))
        }
        
        let lastProgress = 0
        const mediaBuffer = await downloadUtil.downloadFromUrl(media.url, async (percent) => {
            const shouldUpdate = (percent >= 5 && lastProgress === 0) || 
                                 (percent - lastProgress >= 15) || 
                                 (percent === 100)
            
            if (shouldUpdate) {
                lastProgress = percent
                await safeEdit(buildIndexedCompactStatus('📥 Baixando mídia', i + 1, totalMedia, percent))
            }
        })

        let finalVideoBuffer = mediaBuffer

        if (mediaBuffer.length > MAX_WHATSAPP_VIDEO_SIZE) {
            await safeEdit(buildIndexedCompactStatus('🔄 Comprimindo vídeo', i + 1, totalMedia, 0))
            finalVideoBuffer = await prepareVideoForWhatsApp(mediaBuffer, async (percent) => {
                await safeEdit(buildIndexedCompactStatus('🔄 Comprimindo vídeo', i + 1, totalMedia, percent))
            })
            console.log(`[xCommand] ✅ Comprimido: ${(mediaBuffer.length / 1024 / 1024).toFixed(2)}MB → ${(finalVideoBuffer.length / 1024 / 1024).toFixed(2)}MB`)
        } else {
            try {
                await safeEdit(buildIndexedCompactStatus('🔄 Preparando vídeo', i + 1, totalMedia))
                finalVideoBuffer = await convertUtil.convertVideoToWhatsApp('buffer', mediaBuffer)
            } catch {
                console.warn('[xCommand] ⚠️ Falha ao normalizar, enviando original')
            }

            if (finalVideoBuffer.length > MAX_WHATSAPP_VIDEO_SIZE) {
                console.warn(`[xCommand] ⚠️ Normalização gerou ${(finalVideoBuffer.length / 1024 / 1024).toFixed(2)}MB, comprimindo...`)
                finalVideoBuffer = await prepareVideoForWhatsApp(finalVideoBuffer, async (percent) => {
                    await safeEdit(buildIndexedCompactStatus('🔄 Comprimindo vídeo', i + 1, totalMedia, percent))
                })
            }
        }

        if (finalVideoBuffer.length > MAX_WHATSAPP_VIDEO_SIZE) {
            throw new Error('❌ O vídeo do Twitter/X continua acima do limite de envio do WhatsApp.')
        }
        
        await safeEdit(buildIndexedCompactStatus('📤 Enviando vídeo', i + 1, totalMedia, 100))
        await waUtil.replyFileFromBuffer(client, message.chat_id, 'videoMessage', finalVideoBuffer, '', message.wa_message, {expiration: message.expiration, mimetype: 'video/mp4'})
    }
    
    await safeEdit('✅ Concluído!')
}

export async function tiktokCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    const textToProcess = getTextOrQuotedText(message)
    
    if (!message.args.length && !message.isQuoted){
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const tkInfo = await downloadUtil.tiktokMedia(textToProcess)

    if (!tkInfo || !tkInfo.url){
        if (message.isAutoDownload) {
            console.log('[tiktokCommand] Ignorando auto-download de TikTok sem mídia')
            return
        }
        throw new Error('❌ Não foi possível baixar a mídia do TikTok.')
    }

    const urls = (Array.isArray(tkInfo.url) ? tkInfo.url : [tkInfo.url]).slice(0, 10)
    const totalMedia = urls.length
    const isImageSet = tkInfo.type === 'image' || tkInfo.type === 'music'
    const safeEdit = await createStatusEditor(client, message, buildIndexedCompactStatus('📥 Baixando mídia', 1, totalMedia), 'tiktokCommand')

    for (const [index, mediaUrl] of urls.entries()) {
        const mediaBuffer = await downloadUtil.downloadFromUrl(mediaUrl, async (percent) => {
            await safeEdit(buildIndexedCompactStatus('📥 Baixando mídia', index + 1, totalMedia, percent))
        })
        const messageType = isImageSet ? 'imageMessage' : 'videoMessage'

        let finalBuffer = mediaBuffer
        if (!isImageSet) {
            finalBuffer = await prepareVideoForWhatsApp(mediaBuffer, async (percent) => {
                await safeEdit(buildIndexedCompactStatus('🔄 Comprimindo vídeo', index + 1, totalMedia, percent))
            })
        }
        
        await safeEdit(buildIndexedCompactStatus('📤 Enviando mídia', index + 1, totalMedia, 100))
        await waUtil.replyFileFromBuffer(client, message.chat_id, messageType, finalBuffer, '', message.wa_message, {expiration: message.expiration, mimetype: isImageSet ? undefined : 'video/mp4'})
    }

    await safeEdit('✅ Concluído!')
}

export async function imgCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    if (!message.args.length){
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    } 

    const MAX_SENT = 2  // Reduzido de 5 para 2 imagens
    const MAX_RESULTS = 20  // Reduzido de 50 para 20 para otimizar
    let imagesSent = 0

    let images = await imageSearchGoogle(message.text_command)
    const maxImageResults = images.length > MAX_RESULTS ? MAX_RESULTS : images.length
    images = images.splice(0, maxImageResults)

    for (let i = 0; i < maxImageResults; i++){
        let randomIndex = Math.floor(Math.random() * images.length)
        let chosenImage = images[randomIndex].url
        await waUtil.sendFileFromUrl(client, message.chat_id, 'imageMessage', chosenImage, '', {expiration: message.expiration, mimetype: 'image/jpeg'}).then(() =>{
            imagesSent++
        }).catch(() => {
            //Ignora se não for possível enviar essa imagem
        })
        images.splice(randomIndex, 1)

        if (imagesSent == MAX_SENT){
            break
        }
    }

    if (!imagesSent) {
        throw new Error (downloadMsgs.img.error) 
    }
}

export async function downCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    const textToProcess = getTextOrQuotedText(message)
    
    if (!message.args.length && !message.isQuoted){
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    // Extrai URLs do texto
    const urls = extractUrls(textToProcess)
    
    if (urls.length === 0) {
        // Se não há URL, tenta fazer busca no YouTube (comportamento do yt)
        return await ytCommand(client, botInfo, message, group)
    }

    // Detecta a plataforma da primeira URL
    const platform = detectPlatform(urls[0])
    
    // Cria uma nova mensagem com a URL como argumento para garantir processamento correto
    const modifiedMessage: Message = {
        ...message,
        args: [urls[0]],
        text_command: urls[0]
    }
    
    switch (platform) {
        case 'youtube':
            return await ytCommand(client, botInfo, modifiedMessage, group)
        case 'instagram':
            return await igCommand(client, botInfo, modifiedMessage, group)
        case 'facebook':
            return await fbCommand(client, botInfo, modifiedMessage, group)
        case 'twitter':
            return await xCommand(client, botInfo, modifiedMessage, group)
        case 'tiktok':
            return await tiktokCommand(client, botInfo, modifiedMessage, group)
        case 'spotify':
            return await playCommand(client, botInfo, modifiedMessage, group)
        default:
            throw new Error('❌ Link não reconhecido. Plataformas suportadas: YouTube, Instagram, Facebook, Twitter/X, Spotify, TikTok')
    }
}
