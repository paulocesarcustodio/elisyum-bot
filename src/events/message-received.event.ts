import {getContentType, WASocket, WAMessage, MessageUpsertType} from 'baileys'
import { showConsoleError} from '../utils/general.util.js'
import { Bot } from '../interfaces/bot.interface.js'
import NodeCache from 'node-cache'
import { UserController } from '../controllers/user.controller.js'
import { handleGroupMessage, handlePrivateMessage } from '../helpers/message.handler.helper.js'
import { GroupController } from '../controllers/group.controller.js'
import { storeMessageOnCache, formatWAMessage } from '../utils/whatsapp.util.js'
import { commandInvoker } from '../helpers/command.invoker.helper.js'

export async function messageReceived (client: WASocket, messages : {messages: WAMessage[], requestId?: string, type: MessageUpsertType}, botInfo : Bot, messageCache: NodeCache){
    try{
        const userController = new UserController()
        const groupController = new GroupController()
        const groupCache = new Map<string, Awaited<ReturnType<GroupController['getGroup']>> | null>()

        for (const waMessage of messages.messages) {
            if (!waMessage) {
                continue
            }

            if (waMessage.key.fromMe) {
                storeMessageOnCache(waMessage, messageCache)
            }

            if (messages.type !== 'notify') {
                continue
            }

            const idChat = waMessage.key.remoteJid
            const isGroupMsg = idChat?.includes("@g.us")
            let group: Awaited<ReturnType<GroupController['getGroup']>> | null = null

            if (isGroupMsg && idChat) {
                // Avoid refetching the same group data within the batch processing.
                group = groupCache.has(idChat) ? groupCache.get(idChat) ?? null : await groupController.getGroup(idChat)
                groupCache.set(idChat, group)
            }

            const message = await formatWAMessage(waMessage, group, botInfo.host_number)

            if (!message) {
                continue
            }

            await userController.registerUser(message.sender, message.pushname)

            if (!isGroupMsg) {
                const needCallCommand = await handlePrivateMessage(client, botInfo, message)
                if (needCallCommand) {
                    await commandInvoker(client, botInfo, message, null)
                }
            } else if (group) {
                const needCallCommand = await handleGroupMessage(client, group, botInfo, message)
                if (needCallCommand) {
                    await commandInvoker(client, botInfo, message, group)
                }
            }
        }
    } catch(err: any){
        showConsoleError(err, "MESSAGES.UPSERT")
    }
}
