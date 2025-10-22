import { GroupMetadata, WAMessage, WAPresence, WASocket, S_WHATSAPP_NET, generateWAMessageFromContent, getContentType, jidNormalizedUser, proto, downloadMediaMessage, type WAMessageAddressingMode } from "@whiskeysockets/baileys"
import { buildText, randomDelay } from "./general.util.js"
import { MessageOptions, MessageTypes, Message } from "../interfaces/message.interface.js"
import * as convertLibrary from './convert.util.js'
import { Group } from "../interfaces/group.interface.js"
import { removeBold } from "./general.util.js"
import { GroupController } from "../controllers/group.controller.js"
import NodeCache from "node-cache"
import { clearBlockedContactsCache } from "../helpers/blocked-contacts.cache.js"
import { UserController } from "../controllers/user.controller.js"
import botTexts from "../helpers/bot.texts.helper.js"

function invalidateBlockedContactsCache(){
    try {
        clearBlockedContactsCache()
    } catch (error) {
        // Ignore cache invalidation errors to avoid breaking block/unblock operations
    }
}
let groupController: GroupController | undefined
let userController: UserController | undefined

type UserAdminsReturn = Awaited<ReturnType<UserController["getAdmins"]>>

function getGroupController(){
    if (!groupController){
        groupController = new GroupController()
    }

    return groupController
}

function getUserController(){
    if (!userController){
        userController = new UserController()
    }

    return userController
}

const botAdminsCache = new NodeCache({ stdTTL: 300, checkperiod: 120 })
const BOT_ADMINS_CACHE_KEY = "bot-admins"

type DownloadMediaOptions = Parameters<typeof downloadMediaMessage>[2]
type DownloadMediaContext = NonNullable<Parameters<typeof downloadMediaMessage>[3]>

/**
 * Returns bot administrators from cache to avoid hitting the database on every message.
 */
export async function getCachedBotAdmins() {
    const cachedAdmins = botAdminsCache.get(BOT_ADMINS_CACHE_KEY)

    if (cachedAdmins) {
        return cachedAdmins as UserAdminsReturn
    }

    const admins = await getUserController().getAdmins()
    botAdminsCache.set(BOT_ADMINS_CACHE_KEY, admins)
    return admins
}

export function invalidateBotAdminsCache() {
    botAdminsCache.del(BOT_ADMINS_CACHE_KEY)
}

export function createMediaDownloadContext(client: WASocket): DownloadMediaContext {
    return {
        logger: client.logger,
        reuploadRequest: async message => client.updateMediaMessage(message)
    }
}

export async function downloadMessageAsBuffer(
    client: WASocket,
    message: WAMessage,
    options: DownloadMediaOptions = {} as DownloadMediaOptions
): Promise<Buffer> {
    const context = createMediaDownloadContext(client)
    const buffer = await downloadMediaMessage(message, 'buffer', options, context)
    return buffer
}

async function updatePresence(client: WASocket, chatId: string, presence: WAPresence){
    await client.presenceSubscribe(chatId)
    await randomDelay(200, 400)
    await client.sendPresenceUpdate(presence, chatId)
    await randomDelay(300, 1000)
    await client.sendPresenceUpdate('paused', chatId)
}

export function addWhatsappSuffix(userNumber : string){
    const userId = userNumber.replace(/\W+/g,"") + S_WHATSAPP_NET
    return userId
}

export function removeWhatsappSuffix(userId: string){
    if (typeof userId !== 'string') {
        return userId
    }

    const suffixes = [
        S_WHATSAPP_NET,
        '@whatsapp.net',
        '@c.us',
        '@lid',
        '@hosted',
        '@hosted.lid'
    ]

    let sanitized = userId

    for (const suffix of suffixes) {
        if (sanitized.endsWith(suffix)) {
            sanitized = sanitized.slice(0, -suffix.length)
        }
    }

    return sanitized
}

export function normalizeWhatsappJid(jid?: string | null): string {
    if (!jid) {
        return ''
    }

    const normalizedCaseJid = jid.toLowerCase()

    // Não normalizar JIDs de grupos, broadcasts, newsletters e LIDs (Linked Devices)
    if (normalizedCaseJid.endsWith('@g.us') || 
        normalizedCaseJid.endsWith('@broadcast') || 
        normalizedCaseJid.endsWith('@newsletter') ||
        normalizedCaseJid.endsWith('@lid')) {
        return jid
    }

    try {
        const normalized = jidNormalizedUser(jid)
        const [userPart] = normalized.split('@')
        const sanitizedUser = (userPart ?? '').split(':')[0] ?? ''

        if (sanitizedUser) {
            return `${sanitizedUser}${S_WHATSAPP_NET}`
        }
    } catch (error) {
        // If Baileys cannot normalize the JID, fall back to a best-effort sanitization below.
    }

    const [rawUser] = jid.split('@')
    const sanitizedRawUser = (rawUser ?? '').split(':')[0] ?? ''

    return sanitizedRawUser ? `${sanitizedRawUser}${S_WHATSAPP_NET}` : ''
}

export function removePrefix(prefix: string, command: string){
    const commandWithoutPrefix = command.replace(prefix, '')
    return commandWithoutPrefix
}

export function getGroupParticipantsByMetadata(group : GroupMetadata){
    return group.participants
        .map(participant => normalizeWhatsappJid(participant.id))
        .filter((participantId): participantId is string => !!participantId)
}

export function getGroupAdminsByMetadata(group: GroupMetadata){
    const admins = group.participants.filter(user => (user.admin != null))

    return admins
        .map(admin => normalizeWhatsappJid(admin.id))
        .filter((adminId): adminId is string => !!adminId)
}

export function deleteMessage(client: WASocket, message : WAMessage, deleteQuoted : boolean){
    let deletedMessage
    let chatId = message.key.remoteJid

    if (!chatId) return

    if (deleteQuoted){
        deletedMessage = {
            remoteJid: message.key.remoteJid,
            fromMe: message.key.participant === message?.message?.extendedTextMessage?.contextInfo?.participant,
            id: message.message?.extendedTextMessage?.contextInfo?.stanzaId,
            participant: message?.message?.extendedTextMessage?.contextInfo?.participant
        }
    } else{
        deletedMessage = message.key
    }

    return client.sendMessage(chatId, {delete: deletedMessage})
}

export function readMessage(client: WASocket, chatId: string, sender: string, messageId: string){
    return client.sendReceipt(chatId, sender, [messageId], 'read')
}

export function updateProfilePic(client: WASocket, chatId: string , image: Buffer){
    return client.updateProfilePicture(chatId, image)
}

export function updateProfileStatus(client: WASocket, text: string){
    return client.updateProfileStatus(text)
}

export function shutdownBot(client: WASocket){
    return client.end(new Error("admin_command"))
}

export function getProfilePicUrl(client: WASocket, chatId: string){
    return client.profilePictureUrl(chatId, "image")
}

export async function blockContact(client: WASocket, userId: string){
    const result = await client.updateBlockStatus(userId, "block")
    invalidateBlockedContactsCache()
    return result
}

export async function unblockContact(client: WASocket, userId: string){
    const result = await client.updateBlockStatus(userId, "unblock")
    invalidateBlockedContactsCache()
    return result
}

export function getHostNumber(client: WASocket){
    return normalizeWhatsappJid(client.user?.id)
}

export async function getBlockedContacts(client: WASocket): Promise<string[]>{
    const blocklist = await client.fetchBlocklist()
    return blocklist.filter((jid): jid is string => typeof jid === 'string')
}

export async function sendText(client: WASocket, chatId: string, text: string, options?: MessageOptions){
    await updatePresence(client, chatId, "composing")
    return client.sendMessage(chatId, {text, linkPreview: null}, {ephemeralExpiration: options?.expiration})
}

export function sendLinkWithPreview(client: WASocket, chatId: string, text: string, options?: MessageOptions){
    return client.sendMessage(chatId, {text}, {ephemeralExpiration: options?.expiration})
}

export async function sendTextWithMentions(client: WASocket, chatId: string, text: string, mentions: string[], options?: MessageOptions) {
    await updatePresence(client, chatId, "composing")
    return client.sendMessage(chatId, {text , mentions}, {ephemeralExpiration: options?.expiration})
}

export function sendSticker(client: WASocket, chatId: string, sticker: Buffer, options?: MessageOptions){
    return client.sendMessage(chatId, {sticker}, {ephemeralExpiration: options?.expiration})
}

export async function sendFileFromUrl(client: WASocket, chatId: string, type: MessageTypes, url: string, caption: string, options?: MessageOptions){
    if (type === "imageMessage") {
        return client.sendMessage(chatId, {image: {url}, caption}, {ephemeralExpiration: options?.expiration})
    }else if (type === 'videoMessage'){
        const base64Thumb = await convertLibrary.convertVideoToThumbnail('url', url)
        return client.sendMessage(chatId, {video: {url}, mimetype: options?.mimetype, caption, jpegThumbnail: base64Thumb}, {ephemeralExpiration: options?.expiration})
    } else if (type === 'audioMessage'){
        return client.sendMessage(chatId, {audio: {url}, mimetype: options?.mimetype}, {ephemeralExpiration: options?.expiration})
    }
}

export function replyText(client: WASocket, chatId: string, text: string, quoted: WAMessage, options?: MessageOptions){
    if (options?.noLinkPreview){
        return client.sendMessage(chatId, {text, linkPreview: null}, {quoted, ephemeralExpiration: options?.expiration})
    }

    return client.sendMessage(chatId, {text}, {quoted, ephemeralExpiration: options?.expiration})
}

export async function editText(client: WASocket, chatId: string, messageKey: any, text: string): Promise<any> {
    return client.sendMessage(chatId, { 
        text, 
        edit: messageKey 
    })
}

export async function editImageCaption(client: WASocket, chatId: string, messageKey: any, imageUrl: string, caption: string): Promise<any> {
    return client.sendMessage(chatId, { 
        image: { url: imageUrl },
        caption,
        edit: messageKey 
    })
}

export async function replyImageFromUrl(client: WASocket, chatId: string, imageUrl: string, caption: string, quoted: WAMessage, options?: MessageOptions) {
    return client.sendMessage(chatId, {
        image: { url: imageUrl },
        caption
    }, {
        quoted,
        ephemeralExpiration: options?.expiration
    })
}

export async function replyFile (client: WASocket, chatId: string, type: MessageTypes, url: string, caption: string, quoted: WAMessage, options?: MessageOptions){ 
    if (type == "imageMessage"){
        return client.sendMessage(chatId, {image: {url}, caption}, {quoted, ephemeralExpiration: options?.expiration})
    } else if (type == "videoMessage"){
        const base64Thumb = await convertLibrary.convertVideoToThumbnail('file', url)
        return client.sendMessage(chatId, {video: {url}, mimetype: options?.mimetype, caption, jpegThumbnail: base64Thumb}, {quoted, ephemeralExpiration: options?.expiration})
    } else if (type == "audioMessage"){
        return client.sendMessage(chatId, {audio: {url}, mimetype: options?.mimetype}, {quoted, ephemeralExpiration: options?.expiration})
    }
}

export async function replyFileFromUrl (client: WASocket, chatId: string, type: MessageTypes, url: string, caption: string, quoted: WAMessage, options?: MessageOptions){ 
    if (type == "imageMessage"){
        return client.sendMessage(chatId, {image: {url}, caption}, {quoted, ephemeralExpiration: options?.expiration})
    } else if (type == "videoMessage"){
        const base64Thumb = await convertLibrary.convertVideoToThumbnail('url', url)
        return client.sendMessage(chatId, {video: {url}, mimetype: options?.mimetype, caption, jpegThumbnail: base64Thumb}, {quoted, ephemeralExpiration: options?.expiration})
    } else if (type == "audioMessage"){
        return client.sendMessage(chatId, {audio: {url}, mimetype: options?.mimetype}, {quoted, ephemeralExpiration: options?.expiration})
    }
}

export async function replyFileFromBuffer (client: WASocket, chatId: string, type: MessageTypes, buffer: Buffer, caption: string, quoted: WAMessage, options?: MessageOptions){ 
    if (type == "videoMessage"){
        try {
            const base64Thumb = await convertLibrary.convertVideoToThumbnail('buffer', buffer)
            return client.sendMessage(chatId, {video: buffer, caption, mimetype: options?.mimetype, jpegThumbnail: base64Thumb}, {quoted, ephemeralExpiration: options?.expiration})
        } catch (thumbError) {
            console.warn('[replyFileFromBuffer] Failed to generate thumbnail, sending without it:', thumbError)
            // Se falhar a geração de thumbnail, envia sem thumbnail
            return client.sendMessage(chatId, {video: buffer, caption, mimetype: options?.mimetype}, {quoted, ephemeralExpiration: options?.expiration})
        }
    } else if (type == "imageMessage"){
        return client.sendMessage(chatId, {image: buffer, caption}, {quoted, ephemeralExpiration: options?.expiration})
    } else if (type == "audioMessage"){
        return client.sendMessage(chatId, {audio: buffer, mimetype: options?.mimetype}, {quoted, ephemeralExpiration: options?.expiration})
    }
}

export async function replyWithMentions (client: WASocket, chatId: string, text: string, mentions: string[], quoted: WAMessage, options?: MessageOptions){ 
    await updatePresence(client, chatId, "composing")
    return client.sendMessage(chatId, {text , mentions}, {quoted, ephemeralExpiration: options?.expiration})
}

export function joinGroupInviteLink (client: WASocket, linkGroup : string){
    return client.groupAcceptInvite(linkGroup)
}

export function revokeGroupInvite (client: WASocket, groupId: string){
    return client.groupRevokeInvite(groupId)
}

export async function getGroupInviteLink (client: WASocket, groupId: string){
    let inviteCode = await client.groupInviteCode(groupId)
    return inviteCode ? `https://chat.whatsapp.com/${inviteCode}` : undefined
}

export function leaveGroup (client: WASocket, groupId: string){
    return client.groupLeave(groupId)
}

export function getGroupInviteInfo (client: WASocket, linkGroup: string){
    return client.groupGetInviteInfo(linkGroup)
}

export function updateGroupRestriction(client: WASocket, groupId: string, status: boolean){
    let config : "announcement" | "not_announcement" = status ? "announcement" : "not_announcement"
    return client.groupSettingUpdate(groupId, config)
}

export async function getAllGroups(client: WASocket){ 
    let groups = await client.groupFetchAllParticipating()
    let groupsInfo : GroupMetadata[] = []

    for (let [key, value] of Object.entries(groups)) {
        groupsInfo.push(value)
    }
    
    return groupsInfo
}

export async function removeParticipant(client: WASocket, groupId: string, participant: string){
    const [response] = await client.groupParticipantsUpdate(groupId, [participant], "remove")
    return response
}

export async function addParticipant(client: WASocket, groupId: string, participant: string){
    const [response] = await client.groupParticipantsUpdate(groupId, [participant], "add")
    return response
}

export async function promoteParticipant(client: WASocket, groupId: string, participant: string){
    const [response] = await client.groupParticipantsUpdate(groupId, [participant], "promote")
    return response
}

export async function demoteParticipant(client: WASocket, groupId: string, participant: string){
    const [response] = await client.groupParticipantsUpdate(groupId, [participant], "demote")
    return response
}

export function storeMessageOnCache(message : proto.IWebMessageInfo, messageCache : NodeCache){
    if (message.key && message.key.remoteJid && message.key.id && message.message){
        messageCache.set(message.key.id, message.message)
    }    
}

export function getMessageFromCache(messageId: string, messageCache: NodeCache){
    let message = messageCache.get(messageId) as proto.IMessage | undefined 
    return message
}

export async function formatWAMessage(m: WAMessage, group: Group|null, hostId: string, requestId?: string){
    if (!m.message) return

    const type = getContentType(m.message)

    if (!type || !isAllowedType(type) || !m.message[type]) return

    const normalizedHostId = normalizeWhatsappJid(hostId)
    const botAdmins = await getCachedBotAdmins()
    const normalizedBotAdmins = botAdmins.map(admin => ({ ...admin, id: normalizeWhatsappJid(admin.id) }))
    const contextInfo : proto.IContextInfo | undefined  = (typeof m.message[type] != "string" && m.message[type] && "contextInfo" in m.message[type]) ? m.message[type].contextInfo as proto.IContextInfo: undefined
    const isQuoted = (contextInfo?.quotedMessage) ? true : false
    const rawSender = m.key.fromMe ? normalizedHostId : m.key.participant || m.key.remoteJid
    const rawSenderAlt = m.key.fromMe ? normalizedHostId : m.key.participantAlt || m.key.remoteJidAlt
    const normalizedSender = normalizeWhatsappJid(rawSender)
    const normalizedSenderAlt = normalizeWhatsappJid(rawSenderAlt)
    const sender = normalizedSender || normalizedSenderAlt
    const pushName = m.pushName
    const body =  m.message.conversation ||  m.message.extendedTextMessage?.text || undefined
    const caption = (typeof m.message[type] != "string" && m.message[type] && "caption" in m.message[type]) ? m.message[type].caption as string | null: undefined
    const text =  caption || body || ''
    const [command, ...args] = text.trim().split(" ")
    const isGroupMsg = m.key.remoteJid?.includes("@g.us") ?? false
    const message_id = m.key.id
    const t = m.messageTimestamp as number
    const chat_id = m.key.remoteJid
    const chatIdAlt = m.key.remoteJidAlt ? normalizeWhatsappJid(m.key.remoteJidAlt) : undefined
    const isGroupAdmin = (sender && group) ? await getGroupController().isParticipantAdmin(group.id, sender) : false

    if (!message_id || !t || !sender || !chat_id ) return

    let formattedMessage : Message = {
        message_id,
        sender,
        senderAlt: normalizedSenderAlt && normalizedSenderAlt !== sender ? normalizedSenderAlt : undefined,
        senderAddressingMode: m.key.addressingMode as WAMessageAddressingMode | undefined,
        type : type as MessageTypes,
        t,
        chat_id,
        chatIdAlt: chatIdAlt && chatIdAlt !== chat_id ? chatIdAlt : undefined,
        requestId,
        expiration : contextInfo?.expiration || undefined,
        pushname: pushName || '',
        body: m.message.conversation || m.message.extendedTextMessage?.text || '',
        caption : caption || '',
        mentioned: contextInfo?.mentionedJid?.map(mention => normalizeWhatsappJid(mention)).filter((mention): mention is string => !!mention) || [],
        text_command: args?.join(" ").trim() || '',
        command: removeBold(command?.toLowerCase().trim()) || '',
        args,
        isQuoted,
        isGroupMsg,
        isGroupAdmin,
        isBotAdmin : normalizedBotAdmins.map(admin => admin.id).includes(sender),
        isBotOwner: normalizedBotAdmins.find(admin => admin.owner == true)?.id == sender,
        isBotMessage: m.key.fromMe ?? false,
        isBroadcast: m.key.remoteJid == "status@broadcast",
        isMedia: type != "conversation" && type != "extendedTextMessage",
        wa_message: m,
    }

    if (formattedMessage.isMedia){
        const mimetype = (typeof m.message[type] != "string" && m.message[type] && "mimetype" in m.message[type]) ? m.message[type].mimetype as string | null : undefined
        const url = (typeof m.message[type] != "string" && m.message[type] && "url" in m.message[type]) ? m.message[type].url as string | null : undefined
        const seconds = (typeof m.message[type] != "string" && m.message[type] && "seconds" in m.message[type]) ? m.message[type].seconds as number | null : undefined
        const file_length = (typeof m.message[type] != "string" && m.message[type] && "fileLength" in m.message[type]) ? m.message[type].fileLength as number | Long | null : undefined

        if (!mimetype || !url || !file_length) return

        formattedMessage.media = {
            mimetype,
            url,
            seconds : seconds || undefined,
            file_length
        }
    }


    if (formattedMessage.isQuoted){
        const quotedMessage = contextInfo?.quotedMessage

        if (!quotedMessage) return

        const typeQuoted = getContentType(quotedMessage)
        const quotedStanzaId = contextInfo.stanzaId ?? undefined
        const senderQuoted = normalizeWhatsappJid(contextInfo.participant || contextInfo.remoteJid)

        if (!typeQuoted || !senderQuoted ) return

        const captionQuoted = (typeof quotedMessage[typeQuoted] != "string" && quotedMessage[typeQuoted] && "caption" in quotedMessage[typeQuoted]) ? quotedMessage[typeQuoted].caption as string | null : undefined
        const quotedWAMessage = generateWAMessageFromContent(formattedMessage.chat_id, quotedMessage, { userJid: senderQuoted, messageId: quotedStanzaId })
        quotedWAMessage.key.fromMe = (normalizedHostId == senderQuoted)

        // Debug: log completo do contextInfo
        console.log(`[DEBUG-CONTEXT] contextInfo completo:`, JSON.stringify({
            notifyName: (contextInfo as any)?.notifyName,
            pushName: (contextInfo as any)?.pushName,
            participant: contextInfo.participant,
            remoteJid: contextInfo.remoteJid,
            keys: Object.keys(contextInfo || {})
        }, null, 2))

        formattedMessage.quotedMessage = {
            type: typeQuoted,
            sender: senderQuoted,
            pushname: (contextInfo as any)?.notifyName || (contextInfo as any)?.pushName || undefined,
            body: quotedMessage.conversation || quotedMessage.extendedTextMessage?.text || '',
            caption: captionQuoted || '',
            isMedia : typeQuoted != "conversation" && typeQuoted != "extendedTextMessage",
            wa_message: quotedWAMessage
        }

        if (formattedMessage.quotedMessage?.isMedia){
            const urlQuoted = (typeof quotedMessage[typeQuoted] != "string" && quotedMessage[typeQuoted] && "url" in quotedMessage[typeQuoted]) ? quotedMessage[typeQuoted].url as string | null : undefined
            const mimetypeQuoted = (typeof quotedMessage[typeQuoted] != "string" && quotedMessage[typeQuoted] && "mimetype" in quotedMessage[typeQuoted]) ? quotedMessage[typeQuoted].mimetype as string | null : undefined
            const fileLengthQuoted = (typeof quotedMessage[typeQuoted] != "string" && quotedMessage[typeQuoted] && "fileLength" in quotedMessage[typeQuoted]) ? quotedMessage[typeQuoted].fileLength as number| Long | null : undefined
            const secondsQuoted = (typeof quotedMessage[typeQuoted] != "string" && quotedMessage[typeQuoted] && "seconds" in quotedMessage[typeQuoted]) ? quotedMessage[typeQuoted].seconds as number| null : undefined
            
            if (!urlQuoted || !mimetypeQuoted || !fileLengthQuoted) return

            formattedMessage.quotedMessage.media = {
                url: urlQuoted,
                mimetype: mimetypeQuoted,
                file_length: fileLengthQuoted,
                seconds: secondsQuoted || undefined,
            }
        }
        
    }

    return formattedMessage
}

function isAllowedType(type : keyof proto.IMessage){
    const allowedTypes : MessageTypes[] = [
        "conversation",
        "extendedTextMessage",
        "audioMessage",
        "imageMessage",
        "audioMessage",
        "documentMessage",
        "stickerMessage",
        "videoMessage",
        "viewOnceMessage",
        "viewOnceMessageV2",
        "viewOnceMessageV2Extension"
    ]

    return allowedTypes.includes(type)
}