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

const MAX_WHATSAPP_VIDEO_SIZE = 16 * 1024 * 1024

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

        if (!videoInfo) {
            throw new Error(downloadMsgs.mp3.error_not_found)
        }

        if (videoInfo.is_live) {
            throw new Error(downloadMsgs.play.error_live)
        }

        if (videoInfo.duration > 540) {
            throw new Error(downloadMsgs.play.error_limit)
        }

        return downloadUtil.downloadYouTubeVideo(`https://www.youtube.com/watch?v=${videoInfo.id_video}`, onProgress)
    }

    const url = urls[0]
    const platform = detectPlatform(url)

    switch (platform) {
        case 'youtube': {
            const videoInfo = await downloadUtil.youtubeMedia(url)

            if (!videoInfo) {
                throw new Error(downloadMsgs.mp3.error_not_found)
            }

            if (videoInfo.is_live) {
                throw new Error(downloadMsgs.play.error_live)
            }

            if (videoInfo.duration > 540) {
                throw new Error(downloadMsgs.play.error_limit)
            }

            return downloadUtil.downloadYouTubeVideo(`https://www.youtube.com/watch?v=${videoInfo.id_video}`, onProgress)
        }
        case 'facebook': {
            const facebookInfo = await downloadUtil.facebookMedia(url)

            if (facebookInfo.duration > 540) {
                throw new Error(downloadMsgs.play.error_limit)
            }

            return downloadUtil.downloadFromUrl(facebookInfo.sd, onProgress)
        }
        case 'instagram': {
            const instagramInfo = await downloadUtil.instagramMedia(url)
            const videoMedia = instagramInfo.media.find(media => media.type === 'video')

            if (!videoMedia) {
                throw new Error(downloadMsgs.mp3.error_only_supported)
            }

            return downloadUtil.downloadFromUrl(videoMedia.url, onProgress)
        }
        case 'tiktok': {
            const tiktokInfo = await downloadUtil.tiktokMedia(url)

            if (!tiktokInfo || tiktokInfo.type !== 'video' || Array.isArray(tiktokInfo.url)) {
                throw new Error(downloadMsgs.mp3.error_only_supported)
            }

            if (tiktokInfo.duration && tiktokInfo.duration > 540) {
                throw new Error(downloadMsgs.play.error_limit)
            }

            return downloadUtil.downloadFromUrl(tiktokInfo.url, onProgress)
        }
        case 'twitter': {
            const xInfo = await downloadUtil.xMedia(url)
            const videoMedia = xInfo?.media.find(media => media.type === 'video')

            if (!videoMedia) {
                throw new Error(downloadMsgs.mp3.error_only_supported)
            }

            return downloadUtil.downloadFromUrl(videoMedia.url, onProgress)
        }
        default:
            throw new Error(downloadMsgs.mp3.error_only_supported)
    }
}

export async function playCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    const textToProcess = getTextOrQuotedText(message)
    
    if (!message.args.length && !message.isQuoted){
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }
    
    // Se estiver respondendo uma mensagem, valida se é um link do YouTube
    if (message.isQuoted && !message.args.length && message.quotedMessage) {
        const quotedText = message.quotedMessage.body || message.quotedMessage.caption || ''
        const urls = extractUrls(quotedText)
        
        if (urls.length === 0) {
            throw new Error(buildText(downloadMsgs.play.error_no_youtube_link, botInfo.prefix))
        }
        
        const platform = detectPlatform(urls[0])
        if (platform !== 'youtube') {
            throw new Error(buildText(downloadMsgs.play.error_only_youtube, botInfo.prefix))
        }
    }

    const videoInfo = await downloadUtil.youtubeMedia(textToProcess)

    if (!videoInfo){
        throw new Error(downloadMsgs.play.error_not_found)
    } else if (videoInfo.is_live){
        throw new Error(downloadMsgs.play.error_live)
    } else if (videoInfo.duration > 540){
        throw new Error(downloadMsgs.play.error_limit)
    }

    const safeEdit = await createStatusEditor(client, message, buildCompactStatus('📥 Baixando áudio'), 'playCommand')

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoInfo.id_video}`

    try {
        const videoBuffer = await downloadUtil.downloadYouTubeVideo(youtubeUrl, async (progress) => {
            await safeEdit(buildCompactStatus('📥 Baixando áudio', progress))
        })

        const audioBuffer = await convertUtil.convertMp4ToMp3('buffer', videoBuffer, async (progress) => {
            await safeEdit(buildCompactStatus('🔄 Convertendo para MP3', progress))
        })

        await safeEdit(buildCompactStatus('📤 Enviando áudio', 100))
        await waUtil.replyFileFromBuffer(client, message.chat_id, 'audioMessage', audioBuffer, '', message.wa_message, {expiration: message.expiration, mimetype: 'audio/mpeg'})
        await safeEdit('✅ Concluído!')
    } catch (error) {
        console.error('[playCommand] Erro durante o processo:', error)
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

    const safeEdit = await createStatusEditor(client, message, buildCompactStatus(hasQuotedVideo ? '📥 Obtendo vídeo' : '📥 Baixando vídeo'), 'mp3Command')

    try {
        let videoBuffer: Buffer

        if (hasQuotedVideo && message.quotedMessage) {
            videoBuffer = await waUtil.downloadMessageAsBuffer(client, message.quotedMessage.wa_message)
        } else {
            const textToProcess = getTextOrQuotedText(message)

            if (!textToProcess.trim()) {
                throw new Error(downloadMsgs.mp3.error_no_input)
            }

            videoBuffer = await downloadVideoBufferFromSupportedInput(textToProcess, async (progress) => {
                await safeEdit(buildCompactStatus('📥 Baixando vídeo', progress))
            })
        }

        const audioBuffer = await convertUtil.convertMp4ToMp3('buffer', videoBuffer, async (progress) => {
            await safeEdit(buildCompactStatus('🔄 Convertendo para MP3', progress))
        })

        await safeEdit(buildCompactStatus('📤 Enviando áudio', 100))
        await waUtil.replyFileFromBuffer(client, message.chat_id, 'audioMessage', audioBuffer, '', message.wa_message, {expiration: message.expiration, mimetype: 'audio/mpeg'})
        await safeEdit('✅ Concluído!')
    } catch (error) {
        console.error('[mp3Command] Erro durante o processo:', error)
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
    } else if (videoInfo.duration > 540){
        throw new Error('❌ O vídeo é muito longo (máximo 9 minutos).')
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
    
    
    // Verifica tamanho e comprime se necessário
    let finalVideoBuffer = videoBuffer
    const videoSizeMB = videoBuffer.length / 1024 / 1024
    
    if (videoBuffer.length > MAX_WHATSAPP_VIDEO_SIZE) {
        await safeEdit(buildCompactStatus('🔄 Comprimindo vídeo', 0))
        
        // Comprime o vídeo
        finalVideoBuffer = await convertUtil.compressVideoToLimit(videoBuffer, MAX_WHATSAPP_VIDEO_SIZE, async (percent) => {
            await safeEdit(buildCompactStatus('🔄 Comprimindo vídeo', percent))
        })
        
        const compressedSizeMB = finalVideoBuffer.length / 1024 / 1024
        console.log(`[ytCommand] ✅ Vídeo comprimido: ${videoSizeMB.toFixed(2)}MB → ${compressedSizeMB.toFixed(2)}MB`)
    }
    
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
    
    await safeEdit(buildCompactStatus('📤 Enviando vídeo', 100))
    
    await waUtil.replyFileFromBuffer(client, message.chat_id, 'videoMessage', videoBuffer, '', message.wa_message, {expiration: message.expiration, mimetype: 'video/mp4'})
    
    await safeEdit('✅ Concluído!')
}

export async function igCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    const textToProcess = getTextOrQuotedText(message)
    
    if (!message.args.length && !message.isQuoted){
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const igInfo = await downloadUtil.instagramMedia(textToProcess)
    
    const totalMedia = igInfo.media.length
    const safeEdit = await createStatusEditor(client, message, buildIndexedCompactStatus('📥 Baixando mídia', 1, totalMedia), 'igCommand')

    for (let i = 0; i < totalMedia; i++){
        const media = igInfo.media[i]
        
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
        
        await safeEdit(buildIndexedCompactStatus('📤 Enviando mídia', i + 1, totalMedia, 100))
        
        const messageType = media.type == 'image' ? 'imageMessage' : 'videoMessage'
        const mimetype = media.type == 'video' ? 'video/mp4' : undefined
        await waUtil.replyFileFromBuffer(client, message.chat_id, messageType, mediaBuffer, '', message.wa_message, {expiration: message.expiration, mimetype})
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

        try {
            await safeEdit(buildIndexedCompactStatus('🔄 Preparando vídeo', i + 1, totalMedia))
            finalVideoBuffer = await convertUtil.convertVideoToWhatsApp('buffer', mediaBuffer)
            console.log(`[xCommand] ✅ Vídeo normalizado para WhatsApp: ${(mediaBuffer.length / 1024 / 1024).toFixed(2)}MB → ${(finalVideoBuffer.length / 1024 / 1024).toFixed(2)}MB`)
        } catch (normalizeError) {
            console.warn('[xCommand] ⚠️ Falha ao normalizar vídeo do Twitter/X, tentando enviar original:', normalizeError)
        }

        if (finalVideoBuffer.length > MAX_WHATSAPP_VIDEO_SIZE) {
            await safeEdit(buildIndexedCompactStatus('🔄 Comprimindo vídeo', i + 1, totalMedia, 0))
            finalVideoBuffer = await convertUtil.compressVideoToLimit(finalVideoBuffer, MAX_WHATSAPP_VIDEO_SIZE, async (percent) => {
                await safeEdit(buildIndexedCompactStatus('🔄 Comprimindo vídeo', i + 1, totalMedia, percent))
            })
            console.log(`[xCommand] ✅ Vídeo comprimido: ${(mediaBuffer.length / 1024 / 1024).toFixed(2)}MB → ${(finalVideoBuffer.length / 1024 / 1024).toFixed(2)}MB`)
        }

        if (finalVideoBuffer.length > MAX_WHATSAPP_VIDEO_SIZE) {
            throw new Error('❌ O vídeo do Twitter/X continua acima do limite de envio do WhatsApp.')
        }
        
        await safeEdit(buildIndexedCompactStatus('📤 Enviando vídeo', i + 1, totalMedia, 100))
        await waUtil.replyFileFromBuffer(client, message.chat_id, 'videoMessage', finalVideoBuffer, '', message.wa_message, {expiration: message.expiration, mimetype: 'video/mp4'})
    }
    
    await safeEdit('✅ Concluído!')
}

export async function tkCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    const textToProcess = getTextOrQuotedText(message)
    
    if (!message.args.length && !message.isQuoted) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const tiktok = await downloadUtil.tiktokMedia(textToProcess)

    if (!tiktok) {
        throw new Error(downloadMsgs.d.error_not_found)
    }

    const totalMedia = Array.isArray(tiktok.url) ? tiktok.url.length : 1
    const safeEdit = await createStatusEditor(client, message, buildIndexedCompactStatus('📥 Baixando mídia', 1, totalMedia), 'tkCommand')
    
    if (!Array.isArray(tiktok.url)){
        // Download único com progresso
        let lastProgress = 0
        const mediaBuffer = await downloadUtil.downloadFromUrl(tiktok.url, async (percent) => {
            const shouldUpdate = (percent >= 5 && lastProgress === 0) || 
                                 (percent - lastProgress >= 15) || 
                                 (percent === 100)
            
            if (shouldUpdate) {
                lastProgress = percent
                await safeEdit(buildCompactStatus('📥 Baixando mídia', percent))
            }
        })
        
        await safeEdit(buildCompactStatus('📤 Enviando mídia', 100))
        
        const messageType = tiktok.type == 'image' ? 'imageMessage' : 'videoMessage'
        const mimetype = tiktok.type == 'video' ? 'video/mp4' : undefined
        await waUtil.replyFileFromBuffer(client, message.chat_id, messageType, mediaBuffer, '', message.wa_message, {expiration: message.expiration, mimetype})
        
        await safeEdit('✅ Concluído!')
    } else {
        // Múltiplas mídias (carrossel de imagens)
        for (let i = 0; i < totalMedia; i++) {
            const url = tiktok.url[i]
            
            await safeEdit(buildIndexedCompactStatus('📥 Baixando mídia', i + 1, totalMedia, 0))
            
            let lastProgress = 0
            const mediaBuffer = await downloadUtil.downloadFromUrl(url, async (percent) => {
                const shouldUpdate = (percent >= 5 && lastProgress === 0) || 
                                     (percent - lastProgress >= 15) || 
                                     (percent === 100)
                
                if (shouldUpdate) {
                    lastProgress = percent
                    await safeEdit(buildIndexedCompactStatus('📥 Baixando mídia', i + 1, totalMedia, percent))
                }
            })
            
            await safeEdit(buildIndexedCompactStatus('📤 Enviando mídia', i + 1, totalMedia, 100))
            
            const messageType = tiktok.type == 'image' ? 'imageMessage' : 'videoMessage'
            const mimetype = tiktok.type == 'video' ? 'video/mp4' : undefined
            await waUtil.replyFileFromBuffer(client, message.chat_id, messageType, mediaBuffer, '', message.wa_message, {expiration: message.expiration, mimetype})
        }
        
        await safeEdit('✅ Concluído!')
    }
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
        case 'tiktok':
            return await tkCommand(client, botInfo, modifiedMessage, group)
        case 'twitter':
            return await xCommand(client, botInfo, modifiedMessage, group)
        default:
            throw new Error('❌ Link não reconhecido. Plataformas suportadas: YouTube, Instagram, Facebook, TikTok, Twitter/X')
    }
}

