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
import downloadCommands from "./download.list.commands.js"

export async function playCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    const startTime = performance.now()
    const textToProcess = getTextOrQuotedText(message)
    
    if (!message.args.length && !message.isQuoted){
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }
    
    // Se estiver respondendo uma mensagem, valida se é um link do YouTube
    if (message.isQuoted && !message.args.length && message.quotedMessage) {
        const quotedText = message.quotedMessage.body || message.quotedMessage.caption || ''
        const urls = extractUrls(quotedText)
        
        if (urls.length === 0) {
            throw new Error(buildText(downloadCommands.play.msgs.error_no_youtube_link, botInfo.prefix))
        }
        
        const platform = detectPlatform(urls[0])
        if (platform !== 'youtube') {
            throw new Error(buildText(downloadCommands.play.msgs.error_only_youtube, botInfo.prefix))
        }
    }

    const metadataStart = performance.now()
    const videoInfo = await downloadUtil.youtubeMedia(textToProcess)
    console.log(`[playCommand] ⏱️ Metadados: ${((performance.now() - metadataStart) / 1000).toFixed(2)}s`)

    if (!videoInfo){
        throw new Error(downloadCommands.play.msgs.error_not_found)
    } else if (videoInfo.is_live){
        throw new Error(downloadCommands.play.msgs.error_live)
    } else if (videoInfo.duration > 540){
        throw new Error(downloadCommands.play.msgs.error_limit)
    }

    // Mensagem inicial com barra de progresso (sempre texto para garantir atualizações)
    const initialCaption = `🎵 *${videoInfo.title}*\n` +
                          `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
                          `📥 Baixando...\n` +
                          `${generateProgressBar(0, 100, 20)}`
    
    // Envia apenas texto para permitir atualizações de status sem travamentos
    const sentMessage = await waUtil.replyText(client, message.chat_id, initialCaption, message.wa_message, {expiration: message.expiration})
    
    if (!sentMessage || !sentMessage.key) {
        throw new Error('Falha ao enviar mensagem inicial')
    }
    const messageKey = sentMessage.key

    // Simula progresso do download (0-60%)
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoInfo.id_video}`
    
    // Função auxiliar para editar com segurança (sempre texto)
    const safeEdit = async (caption: string) => {
        try {
            await waUtil.editText(client, message.chat_id, messageKey, caption)
        } catch (err) {
            console.error('[playCommand] Erro ao editar mensagem:', err)
        }
    }
    
    try {
        const downloadStart = performance.now()
        console.log('[playCommand] Iniciando download...')
        
        // Progresso REAL monitorando o arquivo no filesystem
        const videoBuffer = await downloadUtil.downloadYouTubeVideo(youtubeUrl, async (progress) => {
            await safeEdit(
                `🎵 *${videoInfo.title}*\n` +
                `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
                `📥 Baixando... ${progress}%\n` +
                `${generateProgressBar(progress, 100, 20)}`
            )
        })
        
        const downloadTime = (performance.now() - downloadStart) / 1000
        console.log(`[playCommand] ⏱️ Download: ${downloadTime.toFixed(2)}s - Tamanho: ${(videoBuffer.length / 1024 / 1024).toFixed(2)}MB`)
        
        // Conversão com progresso simulado suave
        const conversionStart = performance.now()
        console.log('[playCommand] Iniciando conversão para MP3...')
        
        let conversionProgress = 10 // Começa em 10% imediatamente
        await safeEdit(
            `🎵 *${videoInfo.title}*\n` +
            `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
            `🔄 Convertendo para MP3... ${conversionProgress}%\n` +
            `${generateProgressBar(conversionProgress, 100, 20)}`
        )
        
        const conversionInterval = setInterval(async () => {
            if (conversionProgress < 95) {
                conversionProgress += 10
                await safeEdit(
                    `🎵 *${videoInfo.title}*\n` +
                    `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
                    `🔄 Convertendo para MP3... ${conversionProgress}%\n` +
                    `${generateProgressBar(conversionProgress, 100, 20)}`
                )
            }
        }, 400) // Atualiza a cada 0.4s (mais rápido)
        
        const audioBuffer = await convertUtil.convertMp4ToMp3('buffer', videoBuffer)
        clearInterval(conversionInterval)
        
        // Marca 100% na conversão
        await safeEdit(
            `🎵 *${videoInfo.title}*\n` +
            `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
            `🔄 Convertendo para MP3... 100%\n` +
            `${generateProgressBar(100, 100, 20)}`
        )
        
        const conversionTime = (performance.now() - conversionStart) / 1000
        console.log(`[playCommand] ⏱️ Conversão: ${conversionTime.toFixed(2)}s - Tamanho: ${(audioBuffer.length / 1024 / 1024).toFixed(2)}MB`)
        
        // Atualiza para envio
        await safeEdit(
            `🎵 *${videoInfo.title}*\n` +
            `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
            `📤 Enviando áudio... 0%\n` +
            `${generateProgressBar(0, 100, 20)}`
        )
        
        const sendStart = performance.now()
        console.log('[playCommand] Enviando áudio...')
        
        // Progresso simulado durante envio
        let sendProgress = 0
        const sendInterval = setInterval(async () => {
            if (sendProgress < 90) {
                sendProgress += 30
                await safeEdit(
                    `🎵 *${videoInfo.title}*\n` +
                    `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
                    `📤 Enviando áudio... ${sendProgress}%\n` +
                    `${generateProgressBar(sendProgress, 100, 20)}`
                ).catch(() => {}) // Ignora erro se mensagem já foi enviada
            }
        }, 500)
        
        await waUtil.replyFileFromBuffer(client, message.chat_id, 'audioMessage', audioBuffer, '', message.wa_message, {expiration: message.expiration, mimetype: 'audio/mpeg'})
        clearInterval(sendInterval)
        
        const sendTime = (performance.now() - sendStart) / 1000
        console.log(`[playCommand] ⏱️ Envio: ${sendTime.toFixed(2)}s`)
        
        // Atualiza para 100% - Concluído
        await safeEdit(
            `🎵 *${videoInfo.title}*\n` +
            `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
            `✅ Concluído!`
        )
        const totalTime = (performance.now() - startTime) / 1000
        console.log(`[playCommand] ⏱️ TOTAL: ${totalTime.toFixed(2)}s (metadata: ${((metadataStart - startTime) / 1000).toFixed(2)}s + download: ${downloadTime.toFixed(2)}s + conversão: ${conversionTime.toFixed(2)}s + envio: ${sendTime.toFixed(2)}s)`)
    } catch (error) {
        console.error('[playCommand] Erro durante o processo:', error)
        await safeEdit(
            `🎵 *${videoInfo.title}*\n` +
            `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
            `❌ Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
        )
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
        throw new Error(downloadCommands.yt.msgs.error_not_found)
    } else if (videoInfo.is_live){
        throw new Error(downloadCommands.yt.msgs.error_live)
    } else if (videoInfo.duration > 540){
        throw new Error(downloadCommands.yt.msgs.error_limit)
    }

    // Mensagem inicial com barra de progresso (sempre texto para garantir atualizações)
    const initialCaption = `🎥 *${videoInfo.title}*\n` +
                          `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
                          `📥 Baixando vídeo...\n` +
                          `${generateProgressBar(0, 100, 20)}`
    
    // Envia apenas texto para permitir atualizações de status sem travamentos
    const sentMessage = await waUtil.replyText(client, message.chat_id, initialCaption, message.wa_message, {expiration: message.expiration})
    
    if (!sentMessage || !sentMessage.key) {
        throw new Error('Falha ao enviar mensagem inicial')
    }
    const messageKey = sentMessage.key

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoInfo.id_video}`
    
    // Função auxiliar para editar com segurança (sempre texto)
    const safeEdit = async (caption: string) => {
        try {
            await waUtil.editText(client, message.chat_id, messageKey, caption)
        } catch (err) {
            console.error('[ytCommand] Erro ao editar mensagem:', err)
        }
    }
    
    // Download com progresso real (0-100%)
    let lastProgress = 0
    const videoBuffer = await downloadUtil.downloadYouTubeVideo(youtubeUrl, async (percent) => {
        // Atualiza: primeiro update aos 5%, depois a cada 15%, e sempre em 100%
        const shouldUpdate = (percent >= 5 && lastProgress === 0) || 
                             (percent - lastProgress >= 15) || 
                             (percent === 100)
        
        if (shouldUpdate) {
            lastProgress = percent
            await safeEdit(
                `🎥 *${videoInfo.title}*\n` +
                `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
                `📥 Baixando vídeo...\n` +
                `${generateProgressBar(percent, 100, 20)}`
            )
        }
    })
    
    
    // Verifica tamanho e comprime se necessário
    const MAX_WHATSAPP_VIDEO_SIZE = 16 * 1024 * 1024 // 16MB
    let finalVideoBuffer = videoBuffer
    const videoSizeMB = videoBuffer.length / 1024 / 1024
    
    if (videoBuffer.length > MAX_WHATSAPP_VIDEO_SIZE) {
        await safeEdit(
            `🎥 *${videoInfo.title}*\n` +
            `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
            `⚠️ Vídeo muito grande (${videoSizeMB.toFixed(2)}MB)\n` +
            `🔄 Comprimindo para 16MB...\n` +
            `${generateProgressBar(0, 100, 20)}`
        )
        
        // Comprime o vídeo
        finalVideoBuffer = await convertUtil.compressVideoToLimit(videoBuffer, MAX_WHATSAPP_VIDEO_SIZE, async (percent) => {
            await safeEdit(
                `🎥 *${videoInfo.title}*\n` +
                `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
                `🔄 Comprimindo vídeo... ${percent}%\n` +
                `${generateProgressBar(percent, 100, 20)}`
            )
        })
        
        const compressedSizeMB = finalVideoBuffer.length / 1024 / 1024
        console.log(`[ytCommand] ✅ Vídeo comprimido: ${videoSizeMB.toFixed(2)}MB → ${compressedSizeMB.toFixed(2)}MB`)
    }
    
    const finalSizeMB = finalVideoBuffer.length / 1024 / 1024
    
    // Download completo - Enviando
    await safeEdit(
        `🎥 *${videoInfo.title}*\n` +
        `⏱️ Duração: ${videoInfo.duration_formatted}\n` +
        `📦 Tamanho: ${finalSizeMB.toFixed(2)}MB\n\n` +
        `📤 Enviando vídeo...\n` +
        `${generateProgressBar(100, 100, 20)}`
    )
    
    await waUtil.replyFileFromBuffer(client, message.chat_id, 'videoMessage', finalVideoBuffer, '', message.wa_message, {expiration: message.expiration, mimetype: 'video/mp4'})
    
    // Atualiza para 100% - Concluído
    await safeEdit(
        `🎥 *${videoInfo.title}*\n` +
        `⏱️ Duração: ${videoInfo.duration_formatted}\n` +
        `📦 Tamanho: ${finalSizeMB.toFixed(2)}MB\n\n` +
        `✅ Concluído!`
    )
}

export async function fbCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    const textToProcess = getTextOrQuotedText(message)
    
    if (!message.args.length && !message.isQuoted){
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const fbInfo = await downloadUtil.facebookMedia(textToProcess)

    if (fbInfo.duration > 540){
        throw new Error(downloadCommands.fb.msgs.error_limit)
    }

    // Mensagem inicial com barra de progresso
    const initialCaption = `📘 *${fbInfo.title}*\n` +
                          `⏱️ Duração: ${format(fbInfo.duration * 1000)}\n\n` +
                          `📥 Baixando...\n` +
                          `${generateProgressBar(0, 100, 20)}`
    
    const sentMessage = await waUtil.replyText(client, message.chat_id, initialCaption, message.wa_message, {expiration: message.expiration})
    
    if (!sentMessage || !sentMessage.key) {
        throw new Error('Falha ao enviar mensagem inicial')
    }
    const messageKey = sentMessage.key

    const safeEdit = async (caption: string) => {
        try {
            await waUtil.editText(client, message.chat_id, messageKey, caption)
        } catch (err) {
            console.error('[fbCommand] Erro ao editar mensagem:', err)
        }
    }
    
    // Download com progresso simulado
    let lastProgress = 0
    const videoBuffer = await downloadUtil.downloadFromUrl(fbInfo.sd, async (percent) => {
        const shouldUpdate = (percent >= 5 && lastProgress === 0) || 
                             (percent - lastProgress >= 15) || 
                             (percent === 100)
        
        if (shouldUpdate) {
            lastProgress = percent
            await safeEdit(
                `📘 *${fbInfo.title}*\n` +
                `⏱️ Duração: ${format(fbInfo.duration * 1000)}\n\n` +
                `📥 Baixando...\n` +
                `${generateProgressBar(percent, 100, 20)}`
            )
        }
    })
    
    // Enviando
    await safeEdit(
        `📘 *${fbInfo.title}*\n` +
        `⏱️ Duração: ${format(fbInfo.duration * 1000)}\n\n` +
        `📤 Enviando...\n` +
        `${generateProgressBar(100, 100, 20)}`
    )
    
    await waUtil.replyFileFromBuffer(client, message.chat_id, 'videoMessage', videoBuffer, '', message.wa_message, {expiration: message.expiration, mimetype: 'video/mp4'})
    
    // Concluído
    await safeEdit(
        `📘 *${fbInfo.title}*\n` +
        `⏱️ Duração: ${format(fbInfo.duration * 1000)}\n\n` +
        `✅ Concluído!`
    )
}

export async function igCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    const textToProcess = getTextOrQuotedText(message)
    
    if (!message.args.length && !message.isQuoted){
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const igInfo = await downloadUtil.instagramMedia(textToProcess)
    
    // Mensagem inicial com barra de progresso
    const totalMedia = igInfo.media.length
    const initialCaption = `📷 *${igInfo.author_fullname}* (@${igInfo.author_username})\n` +
                          `${igInfo.caption ? `📝 ${igInfo.caption}\n` : ''}` +
                          `❤️ ${igInfo.likes} curtidas\n\n` +
                          `📥 Baixando${totalMedia > 1 ? ` 1/${totalMedia}` : ''}...\n` +
                          `${generateProgressBar(0, 100, 20)}`
    
    const sentMessage = await waUtil.replyText(client, message.chat_id, initialCaption, message.wa_message, {expiration: message.expiration})
    
    if (!sentMessage || !sentMessage.key) {
        throw new Error('Falha ao enviar mensagem inicial')
    }
    const messageKey = sentMessage.key

    const safeEdit = async (caption: string) => {
        try {
            await waUtil.editText(client, message.chat_id, messageKey, caption)
        } catch (err) {
            console.error('[igCommand] Erro ao editar mensagem:', err)
        }
    }

    for (let i = 0; i < totalMedia; i++){
        const media = igInfo.media[i]
        
        if (i > 0) {
            await safeEdit(
                `📷 *${igInfo.author_fullname}* (@${igInfo.author_username})\n` +
                `${igInfo.caption ? `📝 ${igInfo.caption}\n` : ''}` +
                `❤️ ${igInfo.likes} curtidas\n\n` +
                `📥 Baixando ${i + 1}/${totalMedia}...\n` +
                `${generateProgressBar(0, 100, 20)}`
            )
        }
        
        let lastProgress = 0
        const mediaBuffer = await downloadUtil.downloadFromUrl(media.url, async (percent) => {
            const shouldUpdate = (percent >= 5 && lastProgress === 0) || 
                                 (percent - lastProgress >= 15) || 
                                 (percent === 100)
            
            if (shouldUpdate) {
                lastProgress = percent
                await safeEdit(
                    `📷 *${igInfo.author_fullname}* (@${igInfo.author_username})\n` +
                    `${igInfo.caption ? `📝 ${igInfo.caption}\n` : ''}` +
                    `❤️ ${igInfo.likes} curtidas\n\n` +
                    `📥 Baixando${totalMedia > 1 ? ` ${i + 1}/${totalMedia}` : ''}...\n` +
                    `${generateProgressBar(percent, 100, 20)}`
                )
            }
        })
        
        await safeEdit(
            `📷 *${igInfo.author_fullname}* (@${igInfo.author_username})\n` +
            `${igInfo.caption ? `📝 ${igInfo.caption}\n` : ''}` +
            `❤️ ${igInfo.likes} curtidas\n\n` +
            `📤 Enviando${totalMedia > 1 ? ` ${i + 1}/${totalMedia}` : ''}...\n` +
            `${generateProgressBar(100, 100, 20)}`
        )
        
        const messageType = media.type == 'image' ? 'imageMessage' : 'videoMessage'
        const mimetype = media.type == 'video' ? 'video/mp4' : undefined
        await waUtil.replyFileFromBuffer(client, message.chat_id, messageType, mediaBuffer, '', message.wa_message, {expiration: message.expiration, mimetype})
    }
    
    // Concluído
    await safeEdit(
        `📷 *${igInfo.author_fullname}* (@${igInfo.author_username})\n` +
        `${igInfo.caption ? `📝 ${igInfo.caption}\n` : ''}` +
        `❤️ ${igInfo.likes} curtidas\n\n` +
        `✅ Concluído!${totalMedia > 1 ? ` (${totalMedia} mídias)` : ''}`
    )
}

export async function xCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    const textToProcess = getTextOrQuotedText(message)
    
    if (!message.args.length && !message.isQuoted){
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const xInfo = await downloadUtil.xMedia(textToProcess)

    if (!xInfo){
        throw new Error(downloadCommands.x.msgs.error_not_found)
    }

    // Mensagem inicial com barra de progresso
    const totalMedia = xInfo.media.length
    const initialCaption = `𝕏 *Tweet*\n` +
                          `${xInfo.text ? `📝 ${xInfo.text}\n` : ''}` +
                          `\n📥 Baixando${totalMedia > 1 ? ` 1/${totalMedia}` : ''}...\n` +
                          `${generateProgressBar(0, 100, 20)}`
    
    const sentMessage = await waUtil.replyText(client, message.chat_id, initialCaption, message.wa_message, {expiration: message.expiration})
    
    if (!sentMessage || !sentMessage.key) {
        throw new Error('Falha ao enviar mensagem inicial')
    }
    const messageKey = sentMessage.key

    const safeEdit = async (caption: string) => {
        try {
            await waUtil.editText(client, message.chat_id, messageKey, caption)
        } catch (err) {
            console.error('[xCommand] Erro ao editar mensagem:', err)
        }
    }
    
    for (let i = 0; i < totalMedia; i++) {
        const media = xInfo.media[i]
        
        if (i > 0) {
            await safeEdit(
                `𝕏 *Tweet*\n` +
                `${xInfo.text ? `📝 ${xInfo.text}\n` : ''}` +
                `\n📥 Baixando ${i + 1}/${totalMedia}...\n` +
                `${generateProgressBar(0, 100, 20)}`
            )
        }
        
        let lastProgress = 0
        const mediaBuffer = await downloadUtil.downloadFromUrl(media.url, async (percent) => {
            const shouldUpdate = (percent >= 5 && lastProgress === 0) || 
                                 (percent - lastProgress >= 15) || 
                                 (percent === 100)
            
            if (shouldUpdate) {
                lastProgress = percent
                await safeEdit(
                    `𝕏 *Tweet*\n` +
                    `${xInfo.text ? `📝 ${xInfo.text}\n` : ''}` +
                    `\n📥 Baixando${totalMedia > 1 ? ` ${i + 1}/${totalMedia}` : ''}...\n` +
                    `${generateProgressBar(percent, 100, 20)}`
                )
            }
        })
        
        await safeEdit(
            `𝕏 *Tweet*\n` +
            `${xInfo.text ? `📝 ${xInfo.text}\n` : ''}` +
            `\n📤 Enviando${totalMedia > 1 ? ` ${i + 1}/${totalMedia}` : ''}...\n` +
            `${generateProgressBar(100, 100, 20)}`
        )
        
        const messageType = media.type == 'image' ? 'imageMessage' : 'videoMessage'
        const mimetype = media.type == 'video' ? 'video/mp4' : undefined
        await waUtil.replyFileFromBuffer(client, message.chat_id, messageType, mediaBuffer, '', message.wa_message, {expiration: message.expiration, mimetype})
    }
    
    // Concluído
    await safeEdit(
        `𝕏 *Tweet*\n` +
        `${xInfo.text ? `📝 ${xInfo.text}\n` : ''}` +
        `\n✅ Concluído!${totalMedia > 1 ? ` (${totalMedia} mídias)` : ''}`
    )
}

export async function tkCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    const textToProcess = getTextOrQuotedText(message)
    
    if (!message.args.length && !message.isQuoted) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const tiktok = await downloadUtil.tiktokMedia(textToProcess)

    if (!tiktok) {
        throw new Error(downloadCommands.tk.msgs.error_not_found)
    }

    // Mensagem inicial com barra de progresso
    const initialCaption = `🎵 *@${tiktok.author_profile}*\n` +
                          `${tiktok.description ? `📝 ${tiktok.description}\n` : ''}` +
                          `\n📥 Baixando...\n` +
                          `${generateProgressBar(0, 100, 20)}`
    
    const sentMessage = await waUtil.replyText(client, message.chat_id, initialCaption, message.wa_message, {expiration: message.expiration})
    
    if (!sentMessage || !sentMessage.key) {
        throw new Error('Falha ao enviar mensagem inicial')
    }
    const messageKey = sentMessage.key

    const safeEdit = async (caption: string) => {
        try {
            await waUtil.editText(client, message.chat_id, messageKey, caption)
        } catch (err) {
            console.error('[tkCommand] Erro ao editar mensagem:', err)
        }
    }
    
    if (!Array.isArray(tiktok.url)){
        // Download único com progresso
        let lastProgress = 0
        const mediaBuffer = await downloadUtil.downloadFromUrl(tiktok.url, async (percent) => {
            const shouldUpdate = (percent >= 5 && lastProgress === 0) || 
                                 (percent - lastProgress >= 15) || 
                                 (percent === 100)
            
            if (shouldUpdate) {
                lastProgress = percent
                await safeEdit(
                    `🎵 *@${tiktok.author_profile}*\n` +
                    `${tiktok.description ? `📝 ${tiktok.description}\n` : ''}` +
                    `\n📥 Baixando...\n` +
                    `${generateProgressBar(percent, 100, 20)}`
                )
            }
        })
        
        // Enviando
        await safeEdit(
            `🎵 *@${tiktok.author_profile}*\n` +
            `${tiktok.description ? `📝 ${tiktok.description}\n` : ''}` +
            `\n📤 Enviando...\n` +
            `${generateProgressBar(100, 100, 20)}`
        )
        
        const messageType = tiktok.type == 'image' ? 'imageMessage' : 'videoMessage'
        const mimetype = tiktok.type == 'video' ? 'video/mp4' : undefined
        await waUtil.replyFileFromBuffer(client, message.chat_id, messageType, mediaBuffer, '', message.wa_message, {expiration: message.expiration, mimetype})
        
        // Concluído
        await safeEdit(
            `🎵 *@${tiktok.author_profile}*\n` +
            `${tiktok.description ? `📝 ${tiktok.description}\n` : ''}` +
            `\n✅ Concluído!`
        )
    } else {
        // Múltiplas mídias (carrossel de imagens)
        const totalMedia = tiktok.url.length
        
        for (let i = 0; i < totalMedia; i++) {
            const url = tiktok.url[i]
            
            await safeEdit(
                `🎵 *@${tiktok.author_profile}*\n` +
                `${tiktok.description ? `📝 ${tiktok.description}\n` : ''}` +
                `\n📥 Baixando ${i + 1}/${totalMedia}...\n` +
                `${generateProgressBar(0, 100, 20)}`
            )
            
            let lastProgress = 0
            const mediaBuffer = await downloadUtil.downloadFromUrl(url, async (percent) => {
                const shouldUpdate = (percent >= 5 && lastProgress === 0) || 
                                     (percent - lastProgress >= 15) || 
                                     (percent === 100)
                
                if (shouldUpdate) {
                    lastProgress = percent
                    await safeEdit(
                        `🎵 *@${tiktok.author_profile}*\n` +
                        `${tiktok.description ? `📝 ${tiktok.description}\n` : ''}` +
                        `\n📥 Baixando ${i + 1}/${totalMedia}...\n` +
                        `${generateProgressBar(percent, 100, 20)}`
                    )
                }
            })
            
            await safeEdit(
                `🎵 *@${tiktok.author_profile}*\n` +
                `${tiktok.description ? `📝 ${tiktok.description}\n` : ''}` +
                `\n📤 Enviando ${i + 1}/${totalMedia}...\n` +
                `${generateProgressBar(100, 100, 20)}`
            )
            
            const messageType = tiktok.type == 'image' ? 'imageMessage' : 'videoMessage'
            const mimetype = tiktok.type == 'video' ? 'video/mp4' : undefined
            await waUtil.replyFileFromBuffer(client, message.chat_id, messageType, mediaBuffer, '', message.wa_message, {expiration: message.expiration, mimetype})
        }
        
        // Concluído
        await safeEdit(
            `🎵 *@${tiktok.author_profile}*\n` +
            `${tiktok.description ? `📝 ${tiktok.description}\n` : ''}` +
            `\n✅ Concluído! (${totalMedia} ${totalMedia > 1 ? 'mídias' : 'mídia'})`
        )
    }
}

export async function imgCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    if (!message.args.length){
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    } 

    const MAX_SENT = 5
    const MAX_RESULTS = 50
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
        throw new Error (downloadCommands.img.msgs.error) 
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

