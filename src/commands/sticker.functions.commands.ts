import { GroupMetadata, WASocket } from "@whiskeysockets/baileys"
import { Bot } from "../interfaces/bot.interface.js"
import { Group } from "../interfaces/group.interface.js"
import { Message } from "../interfaces/message.interface.js"
import * as waUtil from '../utils/whatsapp.util.js'
import * as imageUtil from '../utils/image.util.js'
import * as stickerUtil from '../utils/sticker.util.js'
import * as quoteUtil from '../utils/quote.util.js'
import { buildText, messageErrorCommandUsage} from "../utils/general.util.js"
import { UserController } from "../controllers/user.controller.js"
import { getContactFromStore } from "../helpers/contacts.store.helper.js"
import { replaceMentionIdsWithNames } from "../utils/mention.util.js"

// Mensagens dos comandos de sticker (para evitar dependência circular)
const stickerMsgs = {
    s: {
        error_limit: 'O video/gif deve ter no máximo 8 segundos.',
        error_message: "Houve um erro ao obter os dados da mensagem.",
        error_no_text: 'A mensagem citada não possui texto.',
        error_too_long: 'A mensagem é muito longa. Máximo de 500 caracteres.',
        author_text: 'Solicitado por: {$1}'
    },
    simg: {
        error_sticker: `Este comando pode ser usado apenas respondendo stickers.`
    },
    ssf: {
        wait: `[AGUARDE] 📸 O fundo da imagem está sendo removido e o sticker será enviado em breve.`,
        error_image: `Este comando é válido apenas para imagens.`,
        error_message: "Houve um erro ao obter os dados da mensagem.",
        author_text: 'Solicitado por: {$1}'
    }
}

function getGroupParticipantName(participant: GroupMetadata['participants'][number]) {
    const participantData = participant as GroupMetadata['participants'][number] & {
        notify?: string
        name?: string
        verifiedName?: string
    }

    return participantData.notify || participantData.name || participantData.verifiedName
}

function createMentionNameResolver(client: WASocket, group: Group | undefined, userController: UserController) {
    let groupMetadataPromise: Promise<GroupMetadata> | undefined

    return async (mentionedJid: string) => {
        const normalizedMentionedJid = waUtil.normalizeWhatsappJid(mentionedJid) || mentionedJid

        if (group) {
            try {
                groupMetadataPromise ??= client.groupMetadata(group.id)
                const groupMetadata = await groupMetadataPromise
                const participant = groupMetadata.participants.find((participant) => {
                    const normalizedParticipantId = waUtil.normalizeWhatsappJid(participant.id) || participant.id
                    return normalizedParticipantId === normalizedMentionedJid || participant.id === mentionedJid
                })
                const participantName = participant ? getGroupParticipantName(participant) : undefined

                if (participantName?.trim()) {
                    return participantName.trim()
                }
            } catch (err) {
                console.log(`[STICKER-MENCAO] Não foi possível buscar metadados do grupo:`, err)
            }
        }

        const user = await userController.getUser(normalizedMentionedJid, mentionedJid)

        if (user?.name?.trim()) {
            return user.name.trim()
        }

        const contact = getContactFromStore(normalizedMentionedJid) || getContactFromStore(mentionedJid)
        const contactName = contact?.notify || contact?.name || contact?.verifiedName

        if (contactName?.trim()) {
            return contactName.trim()
        }

        return undefined
    }
}

export async function sCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    let stickerType : "resize" | "contain" | "circle" =  'resize'

    if (message.args[0] === '1') {
        stickerType = 'circle'
    } else if (message.args[0] === '2') {
        stickerType = 'contain'
    }

    let messageData = {
        type : (message.isQuoted) ? message.quotedMessage?.type : message.type,
        message: (message.isQuoted) ? message.quotedMessage?.wa_message  : message.wa_message,
        seconds: (message.isQuoted) ? message.quotedMessage?.media?.seconds : message.media?.seconds
    }

    if (!messageData.type || !messageData.message) {
        throw new Error(stickerMsgs.s.error_message)
    }

    // Se for mensagem de texto citada, criar balão do WhatsApp
    if (message.isQuoted && (messageData.type === "conversation" || messageData.type === "extendedTextMessage")) {
        const quotedText = message.quotedMessage?.body || message.quotedMessage?.caption
        
        if (!quotedText) {
            throw new Error(stickerMsgs.s.error_no_text)
        }

        if (quotedText.length > 500) {
            throw new Error(stickerMsgs.s.error_too_long)
        }

        // Obter foto de perfil
        let avatarUrl: string | undefined
        try {
            const profilePicUrl = await client.profilePictureUrl(message.quotedMessage!.sender, 'image')
            avatarUrl = profilePicUrl
        } catch (err) {
            // Se não conseguir obter a foto, continua sem ela
            avatarUrl = undefined
        }

        // Obter nome do autor do grupo
        let authorName = 'Membro do grupo';
        try {
            const quotedSender = message.quotedMessage!.sender;
            const userController = new UserController();

            console.log(`\n[STICKER-NOME] ========== BUSCANDO NOME ==========`)
            console.log(`[STICKER-NOME] Sender ID: ${quotedSender}`)
            console.log(`[STICKER-NOME] É grupo?: ${!!group}`)
            console.log(`[STICKER-NOME] Group ID: ${group?.id || 'N/A'}`)

            // ESTRATÉGIA: Para GRUPOS, buscar SEMPRE nos metadados primeiro (fonte mais confiável)
            if (group) {
                console.log(`[STICKER-NOME] 📋 Buscando nos METADADOS DO GRUPO (fonte principal)...`)
                try {
                    const groupMetadata = await client.groupMetadata(group.id);
                    console.log(`[STICKER-NOME] Total de participantes: ${groupMetadata.participants.length}`)
                    
                    const participant = groupMetadata.participants.find(p => p.id === quotedSender);
                    console.log(`[STICKER-NOME] Participante encontrado?: ${!!participant}`)
                    
                    if (participant) {
                        // Log de toda a estrutura do participante para debug
                        console.log(`[STICKER-NOME] Estrutura do participante:`, JSON.stringify(participant, null, 2))
                        
                        // Tenta várias propriedades possíveis
                        const participantNotify = (participant as any).notify;
                        const participantName = (participant as any).name;
                        const participantVerifiedName = (participant as any).verifiedName;
                        
                        console.log(`[STICKER-NOME] - notify: "${participantNotify || 'vazio'}"`)
                        console.log(`[STICKER-NOME] - name: "${participantName || 'vazio'}"`)
                        console.log(`[STICKER-NOME] - verifiedName: "${participantVerifiedName || 'vazio'}"`)
                        
                        const metadataName = participantNotify || participantName || participantVerifiedName;
                        if (metadataName && metadataName.trim().length > 0) {
                            authorName = metadataName.trim();
                            console.log(`[STICKER-NOME] ✅ Nome encontrado nos METADADOS: "${authorName}"`)
                            
                            // Salva no banco para próxima vez
                            await userController.setName(quotedSender, authorName);
                            console.log(`[STICKER-NOME] 💾 Nome salvo no banco`)
                        } else {
                            console.log(`[STICKER-NOME] ⚠️ Participante existe mas sem nome nos metadados`)
                        }
                    } else {
                        console.log(`[STICKER-NOME] ⚠️ Participante NÃO encontrado nos metadados`)
                        console.log(`[STICKER-NOME] Listando alguns IDs dos participantes:`)
                        groupMetadata.participants.slice(0, 3).forEach((p, i) => {
                            console.log(`[STICKER-NOME]   ${i + 1}. ${p.id}`)
                        })
                    }
                } catch (groupErr) {
                    console.log(`[STICKER-NOME] ❌ ERRO ao buscar metadados:`, groupErr);
                }
            }

            // Se ainda não encontrou, tenta outras fontes
            if (authorName === 'Membro do grupo') {
                console.log(`[STICKER-NOME] ⏩ Tentando fontes alternativas...`)
                
                // 1. notifyName do contextInfo
                const pushName = message.quotedMessage?.pushname;
                console.log(`[STICKER-NOME] 1️⃣ contextInfo.notifyName: "${pushName || 'vazio'}"`)
                if (pushName?.trim()) {
                    authorName = pushName.trim();
                    console.log(`[STICKER-NOME] ✅ Encontrado no contextInfo`)
                }
                
                // 2. Banco de dados
                if (authorName === 'Membro do grupo') {
                    const user = await userController.getUser(quotedSender);
                    console.log(`[STICKER-NOME] 2️⃣ Banco de dados: "${user?.name || 'vazio'}"`)
                    if (user?.name?.trim()) {
                        authorName = user.name.trim();
                        console.log(`[STICKER-NOME] ✅ Encontrado no banco`)
                    }
                }
                
                // 3. Store de contatos (contacts.update)
                if (authorName === 'Membro do grupo') {
                    const contact = getContactFromStore(quotedSender);
                    console.log(`[STICKER-NOME] 3️⃣ Store de contatos: notify="${contact?.notify || 'vazio'}", name="${contact?.name || 'vazio'}"`)
                    const contactName = contact?.notify || contact?.name || contact?.verifiedName;
                    if (contactName?.trim()) {
                        authorName = contactName.trim();
                        console.log(`[STICKER-NOME] ✅ Encontrado no store de contatos`)
                        // Salva no banco para próxima vez
                        await userController.setName(quotedSender, authorName);
                    }
                }
            }

            console.log(`[STICKER-NOME] 🎯 NOME FINAL USADO: "${authorName}"`)
            console.log(`[STICKER-NOME] ========================================\n`)

        } catch (err) {
            console.log(`[STICKER] ❌ Erro geral ao buscar nome:`, err);
        }
        
        // Obter horário
        const now = new Date()
        const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

        const userController = new UserController()
        const stickerText = await replaceMentionIdsWithNames(
            quotedText,
            message.quotedMessage?.mentioned || [],
            createMentionNameResolver(client, group, userController)
        )

        const imageBuffer = await quoteUtil.createWhatsAppBubble({
            text: stickerText,
            authorName: authorName,
            avatarUrl: avatarUrl,
            time: time
        })

        const authorText = buildText(stickerMsgs.s.author_text, message.pushname)
        const stickerBuffer = await stickerUtil.createSticker(imageBuffer, {pack: botInfo.name, author: authorText, fps: 9, type: 'resize'})
        await waUtil.sendSticker(client, message.chat_id, stickerBuffer, {expiration: message.expiration})
        return
    }

    // Comportamento original para imagens/vídeos
    if (messageData.type != "imageMessage" && messageData.type != "videoMessage") {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    } else if (messageData.type == "videoMessage" && messageData.seconds && messageData.seconds  > 9) {
        throw new Error(stickerMsgs.s.error_limit)
    }
    
    const mediaBuffer = await waUtil.downloadMessageAsBuffer(client, messageData.message)
    const authorText = buildText(stickerMsgs.s.author_text, message.pushname)
    const stickerBuffer = await stickerUtil.createSticker(mediaBuffer, {pack: botInfo.name, author: authorText, fps: 9, type: stickerType})
    await waUtil.sendSticker(client, message.chat_id, stickerBuffer, { expiration: message.expiration })
}

export async function simgCommand(client: WASocket, botInfo: Bot, message: Message, group? : Group){
    if (!message.isQuoted || !message.quotedMessage) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    } else if (message.quotedMessage.type != "stickerMessage") {
        throw new Error(stickerMsgs.simg.error_sticker)
    }

    let messageQuotedData = message.quotedMessage.wa_message

    if (messageQuotedData.message?.stickerMessage?.url == "https://web.whatsapp.net") {
        messageQuotedData.message.stickerMessage.url = `https://mmg.whatsapp.net${messageQuotedData.message.stickerMessage.directPath}` 
    }

    const stickerBuffer = await waUtil.downloadMessageAsBuffer(client, message.quotedMessage.wa_message)
    const imageBuffer = await stickerUtil.stickerToImage(stickerBuffer)
    await waUtil.replyFileFromBuffer(client, message.chat_id, 'imageMessage', imageBuffer, '', message.wa_message, {expiration: message.expiration, mimetype: 'image/png'})
}

