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
    const initialMessage = `🎵 *${videoInfo.title}*\n` +
                          `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
                          `📥 Baixando...\n` +
                          `${generateProgressBar(0, 100, 20)}`
    
    const sentMessage = await waUtil.replyText(client, message.chat_id, initialMessage, message.wa_message, {expiration: message.expiration})
    if (!sentMessage || !sentMessage.key) {
        throw new Error('Falha ao enviar mensagem inicial')
    }
    const messageKey = sentMessage.key

    // Simula progresso do download (0-60%)
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoInfo.id_video}`
    
    // Atualiza para 30%
    await waUtil.editText(client, message.chat_id, messageKey, 
        `🎵 *${videoInfo.title}*\n` +
        `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
        `📥 Baixando...\n` +
        `${generateProgressBar(30, 100, 20)}`
    )
    
    const videoBuffer = await downloadUtil.downloadYouTubeVideo(youtubeUrl)
    
    // Atualiza para 60% - Download completo
    await waUtil.editText(client, message.chat_id, messageKey,
        `🎵 *${videoInfo.title}*\n` +
        `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
        `🔄 Convertendo para MP3...\n` +
        `${generateProgressBar(60, 100, 20)}`
    )
    
    const audioBuffer = await convertUtil.convertMp4ToMp3('buffer', videoBuffer)
    
    // Atualiza para 90% - Conversão completa
    await waUtil.editText(client, message.chat_id, messageKey,
        `🎵 *${videoInfo.title}*\n` +
        `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
        `📤 Enviando...\n` +
        `${generateProgressBar(90, 100, 20)}`
    )
    
    await waUtil.replyFileFromBuffer(client, message.chat_id, 'audioMessage', audioBuffer, '', message.wa_message, {expiration: message.expiration, mimetype: 'audio/mpeg'})
    
    // Atualiza para 100% - Completo
    await waUtil.editText(client, message.chat_id, messageKey,
        `🎵 *${videoInfo.title}*\n` +
        `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
        `✅ Concluído!\n` +
        `${generateProgressBar(100, 100, 20)}`
    )
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
    const initialMessage = `🎥 *${videoInfo.title}*\n` +
                          `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
                          `📥 Baixando vídeo...\n` +
                          `${generateProgressBar(0, 100, 20)}`
    
    const sentMessage = await waUtil.replyText(client, message.chat_id, initialMessage, message.wa_message, {expiration: message.expiration})
    if (!sentMessage || !sentMessage.key) {
        throw new Error('Falha ao enviar mensagem inicial')
    }
    const messageKey = sentMessage.key

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoInfo.id_video}`
    
    // Atualiza para 40%
    await waUtil.editText(client, message.chat_id, messageKey,
        `🎥 *${videoInfo.title}*\n` +
        `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
        `📥 Baixando vídeo...\n` +
        `${generateProgressBar(40, 100, 20)}`
    )
    
    const videoBuffer = await downloadUtil.downloadYouTubeVideo(youtubeUrl)
    
    // Verifica tamanho
    const videoSizeMB = videoBuffer.length / 1024 / 1024
    if (videoSizeMB > 16) {
        await waUtil.editText(client, message.chat_id, messageKey,
            `🎥 *${videoInfo.title}*\n` +
            `⏱️ Duração: ${videoInfo.duration_formatted}\n\n` +
            `❌ Vídeo muito grande (${videoSizeMB.toFixed(2)}MB)\n` +
            `O WhatsApp suporta apenas vídeos de até 16MB.`
        )
        return
    }
    
    // Atualiza para 80% - Download completo
    await waUtil.editText(client, message.chat_id, messageKey,
        `🎥 *${videoInfo.title}*\n` +
        `⏱️ Duração: ${videoInfo.duration_formatted}\n` +
        `📦 Tamanho: ${videoSizeMB.toFixed(2)}MB\n\n` +
        `📤 Enviando...\n` +
        `${generateProgressBar(80, 100, 20)}`
    )
    
    await waUtil.replyFileFromBuffer(client, message.chat_id, 'videoMessage', videoBuffer, '', message.wa_message, {expiration: message.expiration, mimetype: 'video/mp4'})
    
    // Atualiza para 100% - Completo
    await waUtil.editText(client, message.chat_id, messageKey,
        `🎥 *${videoInfo.title}*\n` +
        `⏱️ Duração: ${videoInfo.duration_formatted}\n` +
        `📦 Tamanho: ${videoSizeMB.toFixed(2)}MB\n\n` +
        `✅ Concluído!\n` +
        `${generateProgressBar(100, 100, 20)}`
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

