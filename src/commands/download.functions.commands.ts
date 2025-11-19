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

    // Mensagem inicial com barra de progresso
    const initialCaption = `🎵 *${videoInfo.title}*\n` +
                          `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
                          `📥 Baixando...\n` +
                          `${generateProgressBar(0, 100, 20)}`
    
    // Envia imagem com caption (se tiver thumbnail) ou texto puro
    const sentMessage = videoInfo.thumbnail
        ? await waUtil.replyImageFromUrl(client, message.chat_id, videoInfo.thumbnail, initialCaption, message.wa_message, {expiration: message.expiration})
        : await waUtil.replyText(client, message.chat_id, initialCaption, message.wa_message, {expiration: message.expiration})
    
    if (!sentMessage || !sentMessage.key) {
        throw new Error('Falha ao enviar mensagem inicial')
    }
    const messageKey = sentMessage.key

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoInfo.id_video}`
    
    // Função auxiliar para editar com segurança
    const safeEdit = async (caption: string) => {
        try {
            if (videoInfo.thumbnail) {
                await waUtil.editImageCaption(client, message.chat_id, messageKey, videoInfo.thumbnail, caption)
            } else {
                await waUtil.editText(client, message.chat_id, messageKey, caption)
            }
        } catch (err) {
            console.error('[playCommand] Erro ao editar mensagem:', err)
        }
    }

    let lastProgressUpdate = 0
    const throttledUpdate = async (stageLabel: string, percent: number) => {
        const now = Date.now()
        if (percent < 100 && now - lastProgressUpdate < 500) {
            return
        }
        lastProgressUpdate = now

        const clampedPercent = Math.min(Math.max(percent, 0), 100)
        await safeEdit(
            `🎵 *${videoInfo.title}*\n` +
            `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
            `${stageLabel}\n` +
            `${generateProgressBar(clampedPercent, 100, 20)}`
        )
    }
    
    const MAX_MEDIA_MB = 19
    const SAFE_TARGET_MB = 18.5

    try {
        console.log('[playCommand] Iniciando download...')

        const videoBuffer = await downloadUtil.downloadYouTubeVideo(youtubeUrl, (progress) => {
            if (progress.stage === 'download') {
                const percent = progress.percent ?? (progress.totalBytes ? (progress.downloadedBytes / progress.totalBytes) * 100 : 0)
                throttledUpdate('📥 Baixando...', percent * 0.6)
            }
        })
        console.log('[playCommand] Vídeo baixado, tamanho:', videoBuffer.length, 'bytes')

        await throttledUpdate('🔄 Convertendo para MP3...', 60)

        console.log('[playCommand] Iniciando conversão para MP3...')
        let audioBuffer = await convertUtil.convertMp4ToMp3('buffer', videoBuffer, (progress) => {
            if (progress.stage === 'convert') {
                const percent = progress.percent ?? 0
                throttledUpdate('🔄 Convertendo para MP3...', 60 + (percent * 0.3))
            }
        })
        console.log('[playCommand] Conversão completa, tamanho:', audioBuffer.length, 'bytes')

        const audioSizeMB = audioBuffer.length / 1024 / 1024
        if (audioSizeMB > MAX_MEDIA_MB) {
            if (videoInfo.duration <= 0) {
                await safeEdit(
                    `🎵 *${videoInfo.title}*\n` +
                    `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
                    `❌ Áudio com ${audioSizeMB.toFixed(2)}MB mas não foi possível estimar a duração para comprimir.`
                )
                throw new Error('Não foi possível comprimir o áudio sem duração válida')
            }

            console.log(`[playCommand] Áudio acima do limite (${audioSizeMB.toFixed(2)}MB). Iniciando compressão...`)
            await throttledUpdate('♻️ Comprimindo áudio para caber no limite...', 85)

            const targetBits = SAFE_TARGET_MB * 1024 * 1024 * 8
            const targetBitrateKbps = Math.max(64, Math.floor((targetBits / videoInfo.duration) / 1000))

            audioBuffer = await convertUtil.convertMp4ToMp3('buffer', videoBuffer, undefined, { audioBitrateKbps: targetBitrateKbps })
            const compressedSizeMB = audioBuffer.length / 1024 / 1024
            console.log(`[playCommand] Compressão concluída (${compressedSizeMB.toFixed(2)}MB) com bitrate ${targetBitrateKbps}kbps`)

            if (compressedSizeMB > MAX_MEDIA_MB) {
                const errorMessage = `❌ Mesmo após compressão, o áudio ficou com ${compressedSizeMB.toFixed(2)}MB (limite ${MAX_MEDIA_MB}MB).`
                await safeEdit(
                    `🎵 *${videoInfo.title}*\n` +
                    `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
                    errorMessage
                )
                throw new Error('Áudio acima do limite após compressão')
            } else {
                await throttledUpdate('✅ Áudio comprimido, enviando...', 90)
            }
        }

        await throttledUpdate('📤 Enviando...', 90)
        
        console.log('[playCommand] Enviando áudio...')
        await waUtil.replyFileFromBuffer(client, message.chat_id, 'audioMessage', audioBuffer, '', message.wa_message, {expiration: message.expiration, mimetype: 'audio/mpeg'})
        console.log('[playCommand] Áudio enviado com sucesso')
        
        // Atualiza para 100% - Completo (sem barra de progresso)
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

    // Mensagem inicial com barra de progresso
    const initialCaption = `🎥 *${videoInfo.title}*\n` +
                          `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
                          `📥 Baixando vídeo...\n` +
                          `${generateProgressBar(0, 100, 20)}`
    
    // Envia imagem com caption (se tiver thumbnail) ou texto puro
    const sentMessage = videoInfo.thumbnail
        ? await waUtil.replyImageFromUrl(client, message.chat_id, videoInfo.thumbnail, initialCaption, message.wa_message, {expiration: message.expiration})
        : await waUtil.replyText(client, message.chat_id, initialCaption, message.wa_message, {expiration: message.expiration})
    
    if (!sentMessage || !sentMessage.key) {
        throw new Error('Falha ao enviar mensagem inicial')
    }
    const messageKey = sentMessage.key

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoInfo.id_video}`
    
    // Função auxiliar para editar com segurança
    const safeEdit = async (caption: string) => {
        try {
            if (videoInfo.thumbnail) {
                await waUtil.editImageCaption(client, message.chat_id, messageKey, videoInfo.thumbnail, caption)
            } else {
                await waUtil.editText(client, message.chat_id, messageKey, caption)
            }
        } catch (err) {
            console.error('[ytCommand] Erro ao editar mensagem:', err)
        }
    }
    
    const MAX_VIDEO_MB = 19
    const SAFE_VIDEO_TARGET_MB = 18.5

    // Atualiza para 40%
    await safeEdit(
        `🎥 *${videoInfo.title}*\n` +
        `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
        `📥 Baixando vídeo...\n` +
        `${generateProgressBar(40, 100, 20)}`
    )

    let videoBuffer = await downloadUtil.downloadYouTubeVideo(youtubeUrl)

    // Verifica tamanho e reprocessa se necessário
    let videoSizeMB = videoBuffer.length / 1024 / 1024
    if (videoSizeMB > MAX_VIDEO_MB) {
        console.log(`[ytCommand] Vídeo acima do limite (${videoSizeMB.toFixed(2)}MB). Iniciando compressão...`)
        await safeEdit(
            `🎥 *${videoInfo.title}*\n` +
            `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
            `⚠️ Vídeo com ${videoSizeMB.toFixed(2)}MB. Compactando para caber em ${MAX_VIDEO_MB}MB...\n` +
            `${generateProgressBar(60, 100, 20)}`
        )

        try {
            const compressedBuffer = await convertUtil.compressVideoToTargetSize('buffer', videoBuffer, SAFE_VIDEO_TARGET_MB, videoInfo.duration)
            const compressedSizeMB = compressedBuffer.length / 1024 / 1024
            console.log(`[ytCommand] Compressão concluída: ${compressedSizeMB.toFixed(2)}MB`)

            if (compressedSizeMB > MAX_VIDEO_MB) {
                await safeEdit(
                    `🎥 *${videoInfo.title}*\n` +
                    `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
                    `❌ Mesmo após compressão, o vídeo ficou com ${compressedSizeMB.toFixed(2)}MB (limite ${MAX_VIDEO_MB}MB).`
                )
                return
            }

            videoBuffer = compressedBuffer
            videoSizeMB = compressedSizeMB
            await safeEdit(
                `🎥 *${videoInfo.title}*\n` +
                `⏱️ Duração: ${videoInfo.duration_formatted}\n` +
                `📦 Compactado para ${videoSizeMB.toFixed(2)}MB\n\n` +
                `📤 Enviando...\n` +
                `${generateProgressBar(80, 100, 20)}`
            )
        } catch (error) {
            console.error('[ytCommand] Falha ao comprimir vídeo:', error)
            await safeEdit(
                `🎥 *${videoInfo.title}*\n` +
                `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
                `❌ Não foi possível comprimir o vídeo (${videoSizeMB.toFixed(2)}MB) para o limite de ${MAX_VIDEO_MB}MB.`
            )
            throw error
        }
    } else {
        // Atualiza para 80% - Download completo
        await safeEdit(
            `🎥 *${videoInfo.title}*\n` +
            `⏱️ Duração: ${videoInfo.duration_formatted}\n` +
            `📦 Tamanho: ${videoSizeMB.toFixed(2)}MB\n\n` +
            `📤 Enviando...\n` +
            `${generateProgressBar(80, 100, 20)}`
        )
    }

    await waUtil.replyFileFromBuffer(client, message.chat_id, 'videoMessage', videoBuffer, '', message.wa_message, {expiration: message.expiration, mimetype: 'video/mp4'})
    
    // Atualiza para 100% - Completo (sem barra de progresso)
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

    const waitReply = buildText(downloadCommands.fb.msgs.wait, fbInfo.title, format(fbInfo.duration * 1000))
    await waUtil.replyText(client, message.chat_id, waitReply, message.wa_message, {expiration: message.expiration})
    await waUtil.replyFileFromUrl(client, message.chat_id, 'videoMessage', fbInfo.sd, '', message.wa_message, {expiration: message.expiration, mimetype: 'video/mp4'})
}

export async function igCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    if (!message.args.length){
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const igInfo = await downloadUtil.instagramMedia(message.text_command)
    const waitReply = buildText(downloadCommands.ig.msgs.wait, igInfo.author_fullname, igInfo.author_username, igInfo.caption, igInfo.likes)
    await waUtil.replyText(client, message.chat_id, waitReply, message.wa_message, {expiration: message.expiration})

    for await (let media of igInfo.media){
        if (media.type == "image"){
            await waUtil.replyFileFromUrl(client, message.chat_id, 'imageMessage', media.url, '', message.wa_message, {expiration: message.expiration})
        } else if (media.type == "video"){
            await waUtil.replyFileFromUrl(client, message.chat_id, 'videoMessage', media.url, '', message.wa_message, {expiration: message.expiration, mimetype: 'video/mp4'})
        }
    }
}

export async function xCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    if (!message.args.length){
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const xInfo = await downloadUtil.xMedia(message.text_command)

    if (!xInfo){
        throw new Error(downloadCommands.x.msgs.error_not_found)
    }

    const waitReply = buildText(downloadCommands.x.msgs.wait, xInfo.text)
    await waUtil.replyText(client, message.chat_id, waitReply, message.wa_message, {expiration: message.expiration})
    
    for await(let media of xInfo.media){
        if (media.type == "image"){
            await waUtil.replyFileFromUrl(client, message.chat_id, 'imageMessage', media.url, '', message.wa_message, {expiration: message.expiration})
        } else if (media.type == "video"){
            await waUtil.replyFileFromUrl(client, message.chat_id, 'videoMessage', media.url, '', message.wa_message, {expiration: message.expiration, mimetype: 'video/mp4'})
        }
    }
}

export async function tkCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const tiktok = await downloadUtil.tiktokMedia(message.text_command)

    if (!tiktok) {
        throw new Error(downloadCommands.tk.msgs.error_not_found)
    }

    const waitReply = buildText(downloadCommands.tk.msgs.wait, tiktok.author_profile, tiktok.description)
    await waUtil.replyText(client, message.chat_id, waitReply, message.wa_message, {expiration: message.expiration})
    
    if (!Array.isArray(tiktok.url)){
        if (tiktok.type == 'image') {
            await waUtil.replyFileFromUrl(client, message.chat_id, 'imageMessage', tiktok.url, '', message.wa_message, {expiration: message.expiration})
        } else if (tiktok.type == 'video'){
            await waUtil.replyFileFromUrl(client, message.chat_id, 'videoMessage', tiktok.url, '', message.wa_message, {expiration: message.expiration, mimetype: 'video/mp4'})
        } 
    } else {
        for await (const url of tiktok.url) {
            if (tiktok.type == 'image') {
                await waUtil.replyFileFromUrl(client, message.chat_id, 'imageMessage', url, '', message.wa_message, {expiration: message.expiration})
            }  else if (tiktok.type == 'video') {
                await waUtil.replyFileFromUrl(client, message.chat_id, 'videoMessage', url, '', message.wa_message, {expiration: message.expiration, mimetype: 'video/mp4'})
            }
        }
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

