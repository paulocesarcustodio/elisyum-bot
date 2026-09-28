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
import NodeCache from "node-cache"
import { profilePictureCache } from "../helpers/profile-picture.cache.helper.js"
import { setBoundedCache } from "../utils/cache.util.js"

const groupMetadataCache = new NodeCache({ stdTTL: 30, checkperiod: 10 })

const stickerMsgs = {
    s: {
        error_limit: 'O video/gif deve ter no máximo 8 segundos.',
        error_file_limit: 'A mídia é muito grande para criar uma figurinha. O limite é 20 MB.',
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
                groupMetadataPromise ??= fetchGroupMetadataCached(client, group.id)
                const groupMetadata = await groupMetadataPromise
                const participant = groupMetadata.participants.find((participant) => {
                    const participantData = participant as typeof participant & { phoneNumber?: string; lid?: string }
                    const participantIds = [participantData.id, participantData.phoneNumber, participantData.lid]
                        .filter((id): id is string => !!id)
                        .map(id => waUtil.normalizeWhatsappJid(id) || id)
                    return participantIds.includes(normalizedMentionedJid) || participantIds.includes(mentionedJid)
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

        const contact = (await getContactFromStore(normalizedMentionedJid)) || (await getContactFromStore(mentionedJid))
        const contactName = contact?.notify || contact?.name || contact?.verifiedName

        if (contactName?.trim()) {
            return contactName.trim()
        }

        return undefined
    }
}

async function fetchGroupMetadataCached(client: WASocket, groupId: string): Promise<GroupMetadata> {
    const cached = groupMetadataCache.get<GroupMetadata>(groupId)
    if (cached) return cached

    const metadata = await client.groupMetadata(groupId)
    if (!groupMetadataCache.has(groupId) && groupMetadataCache.keys().length >= 500) {
        const oldestGroupId = groupMetadataCache.keys()[0]
        if (oldestGroupId !== undefined) groupMetadataCache.del(oldestGroupId)
    }
    groupMetadataCache.set(groupId, metadata)
    return metadata
}

async function fetchProfilePicCached(client: WASocket, sender: string, senderAlt?: string): Promise<string | undefined> {
    const normalizedSender = waUtil.normalizeWhatsappJid(sender) || sender
    const cached = profilePictureCache.get<string | null>(normalizedSender)
    if (cached !== undefined) return cached || undefined

    const contact = (await getContactFromStore(normalizedSender)) || (await getContactFromStore(sender))
    const candidates = [...new Set([
        normalizedSender,
        sender,
        senderAlt,
        contact?.phoneNumber,
        contact?.lid,
        contact?.id
    ].filter((jid): jid is string => !!jid))]

    let profilePictureTimeout: NodeJS.Timeout | undefined
    const profilePicture = await Promise.race([
        (async () => {
            for (const jid of candidates) {
                try {
                    const url = await client.profilePictureUrl(jid, 'image')
                    if (url) return url
                } catch {
                    // Try the next phone-number/LID alias.
                }
            }
            return undefined
        })(),
        new Promise<undefined>(resolve => {
            profilePictureTimeout = setTimeout(() => resolve(undefined), 3000)
            profilePictureTimeout.unref()
        })
    ]).finally(() => clearTimeout(profilePictureTimeout))
    if (profilePicture) {
        setBoundedCache(profilePictureCache, normalizedSender, profilePicture, 2000)
        return profilePicture
    }

    if (contact?.imgUrl && /^https?:\/\//i.test(contact.imgUrl)) {
        setBoundedCache(profilePictureCache, normalizedSender, contact.imgUrl, 2000)
        return contact.imgUrl
    }

    setBoundedCache(profilePictureCache, normalizedSender, null, 2000, 60)
    return undefined
}

export function fetchProfilePictureUrl(client: WASocket, sender: string, senderAlt?: string) {
    return fetchProfilePicCached(client, sender, senderAlt)
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

    if (message.isQuoted && (messageData.type === "conversation" || messageData.type === "extendedTextMessage")) {
        const quotedText = message.quotedMessage?.body || message.quotedMessage?.caption
        
        if (!quotedText) {
            throw new Error(stickerMsgs.s.error_no_text)
        }

        if (quotedText.length > 500) {
            throw new Error(stickerMsgs.s.error_too_long)
        }

        const quotedSender = message.quotedMessage!.sender
        const quotedSenderAlt = message.quotedMessage!.senderAlt
        const userController = new UserController()

    const [avatarUrl, authorName] = await Promise.all([
        fetchProfilePicCached(client, quotedSender, quotedSenderAlt),
        resolveAuthorName(client, message, group, quotedSender, userController)
    ])

        const now = new Date()
        const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

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
        if (stickerBuffer.length > 1024 * 1024) throw new Error('A figurinha ultrapassou o limite de 1 MB do WhatsApp.')
        await waUtil.sendSticker(client, message.chat_id, stickerBuffer, {expiration: message.expiration})
        return
    }

    if (messageData.type != "imageMessage" && messageData.type != "videoMessage") {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    } else if (messageData.type == "videoMessage" && messageData.seconds && messageData.seconds  > 9) {
        throw new Error(stickerMsgs.s.error_limit)
    }

    const fileLength = message.isQuoted ? message.quotedMessage?.media?.file_length : message.media?.file_length
    if (fileLength && fileLength > 20 * 1024 * 1024) {
        throw new Error(stickerMsgs.s.error_file_limit)
    }
    
    const mediaBuffer = await waUtil.downloadMessageAsBuffer(client, messageData.message)
    const authorText = buildText(stickerMsgs.s.author_text, message.pushname)
    const stickerBuffer = await stickerUtil.createSticker(mediaBuffer, {pack: botInfo.name, author: authorText, fps: 9, type: stickerType})
    if (stickerBuffer.length > 1024 * 1024) throw new Error('A figurinha ultrapassou o limite de 1 MB do WhatsApp.')
    await waUtil.sendSticker(client, message.chat_id, stickerBuffer, { expiration: message.expiration })
}

async function resolveAuthorName(client: WASocket, message: Message, group: Group | undefined, quotedSender: string, userController: UserController): Promise<string> {
    let authorName = 'Membro do grupo'

    if (group) {
        try {
            const groupMetadata = await fetchGroupMetadataCached(client, group.id)
            const normalizedSender = waUtil.normalizeWhatsappJid(quotedSender) || quotedSender
            const participant = groupMetadata.participants.find(p => {
                const participantData = p as typeof p & { phoneNumber?: string; lid?: string }
                return [participantData.id, participantData.phoneNumber, participantData.lid]
                    .filter((id): id is string => !!id)
                    .some(id => (waUtil.normalizeWhatsappJid(id) || id) === normalizedSender || id === quotedSender)
            })
            if (participant) {
                const metadataName = getGroupParticipantName(participant)
                if (metadataName?.trim()) {
                    authorName = metadataName.trim()
                    const participantData = participant as typeof participant & { phoneNumber?: string; lid?: string }
                    await userController.setName(quotedSender, authorName, participantData.phoneNumber, participantData.lid)
                    return authorName
                }
            }
        } catch (groupErr) {
            console.log(`[STICKER-NOME] Erro ao buscar metadados:`, groupErr)
        }
    }

    const pushName = message.quotedMessage?.pushname
    if (pushName?.trim()) {
        authorName = pushName.trim()
    }

    if (authorName === 'Membro do grupo') {
        const user = await userController.getUser(quotedSender)
        if (user?.name?.trim()) {
            authorName = user.name.trim()
        }
    }

    if (authorName === 'Membro do grupo') {
        const contact = (await getContactFromStore(quotedSender))
        const contactName = contact?.notify || contact?.name || contact?.verifiedName
        if (contactName?.trim()) {
            authorName = contactName.trim()
            await userController.setName(quotedSender, authorName)
        }
    }

    return authorName
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
