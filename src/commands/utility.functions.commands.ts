import { WASocket } from "@whiskeysockets/baileys"
import { Bot } from "../interfaces/bot.interface.js"
import { Group } from "../interfaces/group.interface.js"
import { Message, MimeTypes } from "../interfaces/message.interface.js"
import { buildText, messageErrorCommandUsage} from "../utils/general.util.js"
import * as waUtil from '../utils/whatsapp.util.js'
import utilityCommands from "./utility.list.commands.js"

export async function revelarCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    // Restrição silenciosa: apenas o dono pode usar
    if (!message.isBotOwner) {
        return
    }
    
    if (!message.isQuoted || !message.quotedMessage) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const quotedType = message.quotedMessage.type
    
    console.log(`[REVELAR] Tipo da mensagem respondida: ${quotedType}`)
    
    // Verifica se é mensagem de visualização única
    if (quotedType !== 'viewOnceMessage' && quotedType !== 'viewOnceMessageV2' && quotedType !== 'viewOnceMessageV2Extension') {
        // Tenta verificar se a mensagem original era view once (fallback)
        if (!message.quotedMessage.media) {
            throw new Error(utilityCommands.revelar.msgs.error_not_view_once)
        }
        
        // Se tem mídia mas não é view once, mostra erro
        const isImage = quotedType === 'imageMessage'
        const isVideo = quotedType === 'videoMessage'
        
        if (!isImage && !isVideo) {
            throw new Error(utilityCommands.revelar.msgs.error_not_view_once)
        }
        
        console.log(`[REVELAR] AVISO: Mensagem é ${quotedType}, mas vou tentar revelar mesmo assim`)
    }

    if (!message.quotedMessage.wa_message) {
        throw new Error(utilityCommands.revelar.msgs.error_message)
    }

    await waUtil.replyText(client, message.chat_id, utilityCommands.revelar.msgs.wait, message.wa_message, {expiration: message.expiration})

    try {
        // Tenta extrair como view once primeiro
        const viewOnceContent = await waUtil.extractViewOnceMessage(client, message.quotedMessage.wa_message)
        
        if (viewOnceContent) {
            const { type: contentType, buffer: mediaBuffer, caption: mediaCaption } = viewOnceContent

            // Envia a mídia revelada
            if (contentType === 'imageMessage') {
                const replyText = buildText(utilityCommands.revelar.msgs.reply_image, mediaCaption || '')
                await waUtil.replyFileFromBuffer(client, message.chat_id, 'imageMessage', mediaBuffer, replyText, message.wa_message, {expiration: message.expiration})
            } else if (contentType === 'videoMessage') {
                const replyText = buildText(utilityCommands.revelar.msgs.reply_video, mediaCaption || '')
                await waUtil.replyFileFromBuffer(client, message.chat_id, 'videoMessage', mediaBuffer, replyText, message.wa_message, {expiration: message.expiration, mimetype: 'video/mp4'})
            }
        } else {
            // Fallback: baixa diretamente como mídia normal
            console.log(`[REVELAR] Fallback: baixando como mídia normal`)
            const mediaBuffer = await waUtil.downloadMessageAsBuffer(client, message.quotedMessage.wa_message)
            const mediaCaption = message.quotedMessage.caption || ''
            
            if (quotedType === 'imageMessage') {
                const replyText = buildText(utilityCommands.revelar.msgs.reply_image, mediaCaption)
                await waUtil.replyFileFromBuffer(client, message.chat_id, 'imageMessage', mediaBuffer, replyText, message.wa_message, {expiration: message.expiration})
            } else if (quotedType === 'videoMessage') {
                const replyText = buildText(utilityCommands.revelar.msgs.reply_video, mediaCaption)
                await waUtil.replyFileFromBuffer(client, message.chat_id, 'videoMessage', mediaBuffer, replyText, message.wa_message, {expiration: message.expiration, mimetype: 'video/mp4'})
            }
        }
    } catch (error: any) {
        console.error(`[REVELAR] Erro ao processar:`, error)
        throw new Error(utilityCommands.revelar.msgs.error_message)
    }
}

export async function saveCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    const { audiosDb } = await import('../database/db.js')
    const fs = await import('fs')
    const path = await import('path')
    const crypto = await import('crypto')
    
    if (!message.isQuoted || message.quotedMessage?.type !== 'audioMessage') {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    if (!message.args.length) {
        throw new Error(utilityCommands.save.msgs.error_no_name)
    }

    const audioName = message.text_command.trim().toLowerCase()
    
    if (audioName.length > 100) {
        throw new Error(utilityCommands.save.msgs.error_name_too_long)
    }

    // Baixa o áudio
    const audioBuffer = await waUtil.downloadMessageAsBuffer(client, message.quotedMessage.wa_message)
    
    // Define caminho para salvar
    const audiosDir = path.join(process.cwd(), 'storage', 'audios')
    if (!fs.existsSync(audiosDir)) {
        fs.mkdirSync(audiosDir, { recursive: true })
    }
    
    // Gera nome único para o arquivo
    const fileHash = crypto.createHash('md5').update(audioBuffer).digest('hex')
    const extension = message.quotedMessage.media?.mimetype?.includes('ogg') ? 'ogg' : 'opus'
    const fileName = `${fileHash}.${extension}`
    const filePath = path.join(audiosDir, fileName)
    
    // Salva o arquivo
    fs.writeFileSync(filePath, audioBuffer)
    
    // Salva no banco
    audiosDb.save({
        userJid: message.sender,
        audioName: audioName,
        filePath: filePath,
        mimeType: message.quotedMessage.media?.mimetype || 'audio/ogg; codecs=opus',
        seconds: message.quotedMessage.media?.seconds,
        ptt: message.quotedMessage.media?.ptt || false
    })

    const replyText = buildText(utilityCommands.save.msgs.reply, audioName)
    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function audioCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    const { audiosDb } = await import('../database/db.js')
    const fs = await import('fs')
    const Fuse = (await import('fuse.js')).default
    
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const searchQuery = message.text_command.trim().toLowerCase()
    
    // Tenta busca exata primeiro
    let audio = audiosDb.get(message.sender, searchQuery)

    // Se não encontrar, usa busca fuzzy
    if (!audio) {
        const allUserAudios = audiosDb.getUserAudios(message.sender, 1000, 0)
        
        if (allUserAudios.length === 0) {
            throw new Error(utilityCommands.audio.msgs.error_not_found)
        }
        
        const fuse = new Fuse(allUserAudios, {
            keys: ['audio_name'],
            threshold: 0.4, // 0 = exact, 1 = match anything
            ignoreLocation: true,
            minMatchCharLength: 2
        })
        
        const results = fuse.search(searchQuery)
        
        if (results.length === 0) {
            throw new Error(utilityCommands.audio.msgs.error_not_found)
        }
        
        // Pega o primeiro resultado (melhor match)
        const bestMatch = results[0].item
        audio = audiosDb.get(message.sender, bestMatch.audio_name)
        
        if (!audio) {
            throw new Error(utilityCommands.audio.msgs.error_not_found)
        }
    }

    // Verifica se o arquivo existe
    if (!fs.existsSync(audio.file_path)) {
        throw new Error(utilityCommands.audio.msgs.error_file_not_found)
    }

    // Lê o arquivo
    const audioBuffer = fs.readFileSync(audio.file_path)

    // Se é resposta a uma mensagem, responde ela
    if (message.isQuoted && message.quotedMessage) {
        await waUtil.replyFileFromBuffer(
            client, 
            message.chat_id, 
            'audioMessage', 
            audioBuffer, 
            '', 
            message.quotedMessage.wa_message, 
            {
                expiration: message.expiration, 
                mimetype: audio.mime_type as MimeTypes,
                ptt: audio.ptt === 1
            }
        )
    } else {
        await waUtil.replyFileFromBuffer(
            client, 
            message.chat_id, 
            'audioMessage', 
            audioBuffer, 
            '', 
            message.wa_message, 
            {
                expiration: message.expiration, 
                mimetype: audio.mime_type as MimeTypes,
                ptt: audio.ptt === 1
            }
        )
    }
}

export async function audiosCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    const { audiosDb } = await import('../database/db.js')
    
    const page = message.args.length ? parseInt(message.args[0]) : 1
    const pageSize = 20
    const offset = (page - 1) * pageSize

    if (isNaN(page) || page < 1) {
        throw new Error(utilityCommands.audios.msgs.error_invalid_page)
    }

    const totalAudios = audiosDb.count(message.sender)
    
    if (totalAudios === 0) {
        throw new Error(utilityCommands.audios.msgs.error_no_audios)
    }

    const audiosList = audiosDb.getUserAudios(message.sender, pageSize, offset)
    const totalPages = Math.ceil(totalAudios / pageSize)

    if (page > totalPages) {
        throw new Error(buildText(utilityCommands.audios.msgs.error_page_out_of_range, totalPages.toString()))
    }

    let replyText = buildText(utilityCommands.audios.msgs.reply_title, page.toString(), totalPages.toString(), totalAudios.toString())

    audiosList.forEach((audio, index) => {
        const number = offset + index + 1
        const duration = audio.seconds ? `${audio.seconds}s` : '---'
        replyText += buildText(utilityCommands.audios.msgs.reply_item, number.toString(), audio.audio_name, duration)
    })



    if (page < totalPages) {
        replyText += buildText(utilityCommands.audios.msgs.reply_next_page, (page + 1).toString())
    }

    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function deleteAudioCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    const { audiosDb } = await import('../database/db.js')
    const fs = await import('fs')
    const Fuse = (await import('fuse.js')).default
    
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const searchQuery = message.text_command.trim().toLowerCase()
    
    // Tenta busca exata primeiro
    let audio = audiosDb.get(message.sender, searchQuery)
    let audioName = searchQuery

    // Se não encontrar, usa busca fuzzy
    if (!audio) {
        const allUserAudios = audiosDb.getUserAudios(message.sender, 1000, 0)
        
        if (allUserAudios.length === 0) {
            throw new Error(utilityCommands.delete.msgs.error_not_found)
        }
        
        const fuse = new Fuse(allUserAudios, {
            keys: ['audio_name'],
            threshold: 0.4,
            ignoreLocation: true,
            minMatchCharLength: 2
        })
        
        const results = fuse.search(searchQuery)
        
        if (results.length === 0) {
            throw new Error(utilityCommands.delete.msgs.error_not_found)
        }
        
        const bestMatch = results[0].item
        audioName = bestMatch.audio_name
        audio = audiosDb.get(message.sender, audioName)
        
        if (!audio) {
            throw new Error(utilityCommands.delete.msgs.error_not_found)
        }
    }

    // Deleta o arquivo físico se existir
    if (fs.existsSync(audio.file_path)) {
        fs.unlinkSync(audio.file_path)
    }

    // Deleta do banco
    audiosDb.delete(message.sender, audioName)

    const replyText = buildText(utilityCommands.delete.msgs.reply, audioName)
    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function renameAudioCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    const { audiosDb } = await import('../database/db.js')
    const Fuse = (await import('fuse.js')).default
    
    if (!message.args.length || !message.text_command.includes('|')) {
        throw new Error(utilityCommands.rename.msgs.error_invalid_format)
    }

    const parts = message.text_command.split('|').map(p => p.trim().toLowerCase())
    
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new Error(utilityCommands.rename.msgs.error_invalid_format)
    }

    const searchQuery = parts[0]
    const newName = parts[1]

    if (newName.length > 100) {
        throw new Error(utilityCommands.rename.msgs.error_name_too_long)
    }

    // Tenta busca exata primeiro
    let audio = audiosDb.get(message.sender, searchQuery)
    let oldName = searchQuery

    // Se não encontrar, usa busca fuzzy
    if (!audio) {
        const allUserAudios = audiosDb.getUserAudios(message.sender, 1000, 0)
        
        if (allUserAudios.length === 0) {
            throw new Error(buildText(utilityCommands.rename.msgs.error_not_found, searchQuery))
        }
        
        const fuse = new Fuse(allUserAudios, {
            keys: ['audio_name'],
            threshold: 0.4,
            ignoreLocation: true,
            minMatchCharLength: 2
        })
        
        const results = fuse.search(searchQuery)
        
        if (results.length === 0) {
            throw new Error(buildText(utilityCommands.rename.msgs.error_not_found, searchQuery))
        }
        
        const bestMatch = results[0].item
        oldName = bestMatch.audio_name
        audio = audiosDb.get(message.sender, oldName)
        
        if (!audio) {
            throw new Error(buildText(utilityCommands.rename.msgs.error_not_found, searchQuery))
        }
    }

    // Verifica se já existe um áudio com o novo nome
    const existingAudio = audiosDb.get(message.sender, newName)
    
    if (existingAudio) {
        throw new Error(buildText(utilityCommands.rename.msgs.error_name_exists, newName))
    }

    // Renomeia
    audiosDb.rename(message.sender, oldName, newName)

    const replyText = buildText(utilityCommands.rename.msgs.reply, oldName, newName)
    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}
