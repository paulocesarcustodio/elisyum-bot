import { WASocket } from "@whiskeysockets/baileys"
import { Bot } from "../interfaces/bot.interface.js"
import { Group } from "../interfaces/group.interface.js"
import { Message } from "../interfaces/message.interface.js"
import { buildText, messageErrorCommandUsage, generateProgressBar } from "../utils/general.util.js"
import * as waUtil from "../utils/whatsapp.util.js"
import * as downloadUtil from '../utils/download.util.js'
import * as convertUtil from '../utils/convert.util.js'
import { imageSearchGoogle } from '../utils/image.util.js'
import format from 'format-duration'
import downloadCommands from "./download.list.commands.js"

export async function playCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    if (!message.args.length){
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    } 

    const videoInfo = await downloadUtil.youtubeMedia(message.text_command)

    if (!videoInfo){
        throw new Error(downloadCommands.play.msgs.error_not_found)
    } else if (videoInfo.is_live){
        throw new Error(downloadCommands.play.msgs.error_live)
    } else if (videoInfo.duration > 360){
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
        console.log('[playCommand] Iniciando download...')
        
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
                    `🎵 *${videoInfo.title}*\n` +
                    `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
                    `📥 Baixando...\n` +
                    `${generateProgressBar(percent, 100, 20)}`
                )
            }
        })
        console.log('[playCommand] Vídeo baixado, tamanho:', videoBuffer.length, 'bytes')
        
        // Conversão com progresso real (0-100%)
        console.log('[playCommand] Iniciando conversão para MP3...')
        await safeEdit(
            `🎵 *${videoInfo.title}*\n` +
            `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
            `🔄 Convertendo para MP3...\n` +
            `${generateProgressBar(0, 100, 20)}`
        )
        
        let lastConvertProgress = 0
        const audioBuffer = await convertUtil.convertMp4ToMp3('buffer', videoBuffer, async (percent) => {
            // Atualiza: primeiro update aos 5%, depois a cada 15%, e sempre em 100%
            const shouldUpdate = (percent >= 5 && lastConvertProgress === 0) || 
                                 (percent - lastConvertProgress >= 15) || 
                                 (percent === 100)
            
            if (shouldUpdate) {
                lastConvertProgress = percent
                await safeEdit(
                    `🎵 *${videoInfo.title}*\n` +
                    `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
                    `🔄 Convertendo para MP3...\n` +
                    `${generateProgressBar(percent, 100, 20)}`
                )
            }
        })
        console.log('[playCommand] Conversão completa, tamanho:', audioBuffer.length, 'bytes')
        
        // Atualiza para 90% - Conversão completa
        await safeEdit(
            `🎵 *${videoInfo.title}*\n` +
            `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
            `📤 Enviando...\n` +
            `${generateProgressBar(90, 100, 20)}`
        )
        
        console.log('[playCommand] Enviando áudio...')
        
        // Atualiza para 90% - Enviando
        await safeEdit(
            `🎵 *${videoInfo.title}*\n` +
            `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
            `📤 Enviando áudio...\n` +
            `${generateProgressBar(90, 100, 20)}`
        )
        
        await waUtil.replyFileFromBuffer(client, message.chat_id, 'audioMessage', audioBuffer, '', message.wa_message, {expiration: message.expiration, mimetype: 'audio/mpeg'})
        console.log('[playCommand] Áudio enviado com sucesso')
        
        // Atualiza para 100% - Concluído
        await safeEdit(
            `🎵 *${videoInfo.title}*\n` +
            `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
            `✅ Concluído!`
        )
        console.log('[playCommand] Comando concluído')
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
    if (!message.args.length){
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const videoInfo = await downloadUtil.youtubeMedia(message.text_command)

    if (!videoInfo){
        throw new Error(downloadCommands.yt.msgs.error_not_found)
    } else if (videoInfo.is_live){
        throw new Error(downloadCommands.yt.msgs.error_live)
    } else if (videoInfo.duration > 360){
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
    
    
    // Verifica tamanho
    const videoSizeMB = videoBuffer.length / 1024 / 1024
    if (videoSizeMB > 16) {
        await safeEdit(
            `🎥 *${videoInfo.title}*\n` +
            `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
            `❌ Vídeo muito grande (${videoSizeMB.toFixed(2)}MB)\n` +
            `O WhatsApp suporta apenas vídeos de até 16MB.`
        )
        return
    }
    
    // Download completo - Enviando
    await safeEdit(
        `🎥 *${videoInfo.title}*\n` +
        `⏱️ Duração: ${videoInfo.duration_formatted}\n` +
        `📦 Tamanho: ${videoSizeMB.toFixed(2)}MB\n\n` +
        `📤 Enviando vídeo...\n` +
        `${generateProgressBar(100, 100, 20)}`
    )
    
    await waUtil.replyFileFromBuffer(client, message.chat_id, 'videoMessage', videoBuffer, '', message.wa_message, {expiration: message.expiration, mimetype: 'video/mp4'})
    
    // Atualiza para 100% - Concluído
    await safeEdit(
        `🎥 *${videoInfo.title}*\n` +
        `⏱️ Duração: ${videoInfo.duration_formatted}\n` +
        `📦 Tamanho: ${videoSizeMB.toFixed(2)}MB\n\n` +
        `✅ Concluído!`
    )
}

export async function fbCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    if (!message.args.length){
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const fbInfo = await downloadUtil.facebookMedia(message.text_command)

    if (fbInfo.duration > 360){
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
    if (!message.args.length){
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const igInfo = await downloadUtil.instagramMedia(message.text_command)
    
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
    if (!message.args.length){
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const xInfo = await downloadUtil.xMedia(message.text_command)

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
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const tiktok = await downloadUtil.tiktokMedia(message.text_command)

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

