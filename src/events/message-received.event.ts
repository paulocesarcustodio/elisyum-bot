import { currentOperation } from '../application/operation-context.js'
import {getContentType, WASocket, WAMessage, MessageUpsertType} from '@whiskeysockets/baileys'
import { showConsoleError} from '../utils/general.util.js'
import { Bot } from '../interfaces/bot.interface.js'
import NodeCache from 'node-cache'
import { UserController } from '../controllers/user.controller.js'
import { handleGroupMessage, handlePrivateMessage } from '../helpers/message.handler.helper.js'
import { GroupController } from '../controllers/group.controller.js'
import { storeMessageOnCache, formatWAMessage } from '../utils/whatsapp.util.js'
import { commandInvoker } from '../helpers/command.invoker.helper.js'
import { setBoundedCache } from '../utils/cache.util.js'
import { captureDiagnosticVoice } from '../helpers/voice-diagnostic.helper.js'
import { traceVoice } from '../helpers/voice-trace.helper.js'


const CONCURRENCY_LIMIT = 3

async function processSingleMessage(
    client: WASocket,
    waMessage: WAMessage,
    botInfo: Bot,
    messageCache: NodeCache,
    viewOnceCache: NodeCache | undefined,
    messagesType: MessageUpsertType,
    requestId: string | undefined,
    groupCache: Map<string, Awaited<ReturnType<GroupController['getGroup']>> | null>,
    userController: UserController,
    groupController: GroupController
): Promise<void> {
    if (!waMessage) return

    if (waMessage.key.fromMe) {
        storeMessageOnCache(waMessage, messageCache)
    }

    if (viewOnceCache && waMessage.message && waMessage.key.id) {
        const messageType = getContentType(waMessage.message)
        if (messageType === 'viewOnceMessage' || messageType === 'viewOnceMessageV2' || messageType === 'viewOnceMessageV2Extension') {
            console.log(`[VIEW-ONCE] Salvando mensagem de visualização única: ${waMessage.key.id}`)
            setBoundedCache(viewOnceCache, waMessage.key.id, waMessage, 99)
        }
    }

    if (messagesType !== 'notify') return

    if (await captureDiagnosticVoice(client, waMessage)) return

    if (waMessage.key.remoteJid === process.env.VOICE_TRACE_GROUP_ID && waMessage.message?.audioMessage && waMessage.key.id) {
        traceVoice('received', {chat_id: waMessage.key.remoteJid!, message_id: waMessage.key.id, type: 'audioMessage'})
    }

    const idChat = waMessage.key.remoteJid
    const isGroupMsg = idChat?.includes("@g.us")
    let group: Awaited<ReturnType<GroupController['getGroup']>> | null = null

    if (isGroupMsg && idChat) {
        group = groupCache.has(idChat) ? groupCache.get(idChat) ?? null : await groupController.getGroup(idChat)
        groupCache.set(idChat, group)
    }

    const message = await formatWAMessage(waMessage, group, botInfo.host_number, requestId)

    if (!message) {
        if (waMessage.key.remoteJid === process.env.VOICE_TRACE_GROUP_ID && waMessage.message?.audioMessage && waMessage.key.id) {
            traceVoice('format_rejected', {chat_id: waMessage.key.remoteJid!, message_id: waMessage.key.id, type: 'audioMessage'})
        }
        return
    }
    message.operationId = currentOperation()?.id
    traceVoice('formatted', message, group ? 'group_found' : 'group_missing')
    if (!isGroupMsg) {
        const needCallCommand = await handlePrivateMessage(client, botInfo, message)
        await userController.registerUser(message.sender, message.pushname, message.senderAlt)
        if (needCallCommand) {
            await commandInvoker(client, botInfo, message, null)
        }
    } else if (group) {
        const needCallCommand = await handleGroupMessage(client, group, botInfo, message)
        traceVoice('group_handler_done', message, needCallCommand ? `command=${message.command}` : 'not_invoked')
        await userController.registerUser(message.sender, message.pushname, message.senderAlt)
        if (needCallCommand) {
            await commandInvoker(client, botInfo, message, group)
        }
    }
}

export async function messageReceived (client: WASocket, messages : {messages: WAMessage[], requestId?: string, type: MessageUpsertType}, botInfo : Bot, messageCache: NodeCache, viewOnceCache?: NodeCache){
    try{
        const userController = new UserController()
        const groupController = new GroupController()
        const groupCache = new Map<string, Awaited<ReturnType<GroupController['getGroup']>> | null>()
        const requestId = messages.requestId
        const messagesType = messages.type

        for (let i = 0; i < messages.messages.length; i += CONCURRENCY_LIMIT) {
            const batch = messages.messages.slice(i, i + CONCURRENCY_LIMIT)
            await Promise.all(
                batch.map(waMessage =>
                    processSingleMessage(client, waMessage, botInfo, messageCache, viewOnceCache, messagesType, requestId, groupCache, userController, groupController)
                        .catch(err => {if(currentOperation())throw err;showConsoleError(err, "MESSAGES.UPSERT")})
                )
            )
        }
    } catch(err: any){
        if(currentOperation())throw err
        showConsoleError(err, "MESSAGES.UPSERT")
    }
}
