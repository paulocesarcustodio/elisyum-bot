import { WASocket } from "@whiskeysockets/baileys";
import { Bot } from "../interfaces/bot.interface.js";
import { Message } from "../interfaces/message.interface.js";
import { Group } from "../interfaces/group.interface.js";
import { buildText, messageErrorCommandUsage, timestampToDate } from "../utils/general.util.js";
import { UserController } from "../controllers/user.controller.js";
import { GroupController } from "../controllers/group.controller.js";
import { BotController } from "../controllers/bot.controller.js";
import { adminMenu } from "../helpers/menu.builder.helper.js";
import os from 'node:os'
import moment from "moment";
import * as waUtil from "../utils/whatsapp.util.js";
import botTexts from "../helpers/bot.texts.helper.js";
import adminCommands from "./admin.list.commands.js";

export async function adminCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    await waUtil.replyText(client, message.chat_id, adminMenu(botInfo), message.wa_message, {expiration: message.expiration})
}

export async function comandospvCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const botController = new BotController()
    const replyText = botInfo.commands_pv ? adminCommands.comandospv.msgs.reply_off : adminCommands.comandospv.msgs.reply_on
    await botController.setCommandsPv(!botInfo.commands_pv)
    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function taxacomandosCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const botController = new BotController()
    let replyText : string

    if (!botInfo.command_rate.status){
        if (!message.args.length) {
            throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
        }

        let max_commands_minute = Number(message.args[0])
        let block_time = Number(message.args[1])
    
        if (message.args[1] === undefined) {
            block_time = 60
        } else if (!Number.isFinite(block_time) || block_time < 10) {
            throw new Error(adminCommands.taxacomandos.msgs.error_block_time_invalid)
        }
        if (!Number.isInteger(max_commands_minute) || max_commands_minute < 3) {
            throw new Error(adminCommands.taxacomandos.msgs.error_max_commands_invalid)
        }

        replyText = buildText(adminCommands.taxacomandos.msgs.reply_on, max_commands_minute, block_time)
        await botController.setCommandRate(true, max_commands_minute, block_time)
    } else {
        replyText = adminCommands.taxacomandos.msgs.reply_off
        await botController.setCommandRate(false)
    }

    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function listablockCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const blockedUsers: string[] = await waUtil.getBlockedContacts(client)

    if (!blockedUsers.length) {
        throw new Error(adminCommands.listablock.msgs.error)
    }

    let replyText = buildText(adminCommands.listablock.msgs.reply_title, blockedUsers.length)

    blockedUsers.forEach((userId, index) => {
        replyText += buildText(adminCommands.listablock.msgs.reply_item, index + 1, waUtil.removeWhatsappSuffix(userId))
    })

    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function bloquearCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const userController = new UserController()
    // Buscar usuários owner ao invés de admins (getAdmins não existe mais)
    const adminsId = (await userController.getUsers()).filter(u => u.owner).map(u => u.id)
    const blockedUsers: string[] = await waUtil.getBlockedContacts(client)
    let targetUserId : string | undefined

    if(message.isQuoted && message.quotedMessage?.sender) {
        targetUserId = message.quotedMessage.sender
    } else if(message.mentioned.length) {
        targetUserId = message.mentioned[0]
    } else if (message.args.length) {
        targetUserId =  waUtil.addWhatsappSuffix(message.text_command)
    }

    if (!targetUserId) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    if (adminsId.includes(targetUserId)){
        throw new Error(buildText(adminCommands.bloquear.msgs.error_block_admin_bot, waUtil.removeWhatsappSuffix(targetUserId)))
    } else if (blockedUsers.includes(targetUserId)) {
        throw new Error(buildText(adminCommands.bloquear.msgs.error_already_blocked, waUtil.removeWhatsappSuffix(targetUserId)))
    } else {
        const replyText = buildText(adminCommands.bloquear.msgs.reply, waUtil.removeWhatsappSuffix(targetUserId))
        await waUtil.blockContact(client, targetUserId).catch(() => {
            throw new Error(adminCommands.bloquear.msgs.error_block)
        })
        await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
    }
}

export async function desbloquearCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const blockedUsers: string[] = await waUtil.getBlockedContacts(client)
    let targetUserId : string | undefined

    if(message.isQuoted && message.quotedMessage?.sender) {
        targetUserId = message.quotedMessage.sender
    } else if(message.mentioned.length) {
        targetUserId = message.mentioned[0]
    } else if(message.args.length == 1 && message.args[0].length <= 3 && Number(message.args[0])) {
        const blockedIndex = Number(message.args[0]) - 1
        targetUserId = blockedUsers[blockedIndex]
    } else if (message.args.length) {
        targetUserId =  waUtil.addWhatsappSuffix(message.text_command)
    }

    if (!targetUserId) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    if (!blockedUsers.includes(targetUserId)) {
        throw new Error(buildText(adminCommands.desbloquear.msgs.error_already_unblocked, waUtil.removeWhatsappSuffix(targetUserId)))
    } else {
        const replyText = buildText(adminCommands.desbloquear.msgs.reply, waUtil.removeWhatsappSuffix(targetUserId))
        await waUtil.unblockContact(client, targetUserId).catch(() => {
            throw new Error(adminCommands.desbloquear.msgs.error_unblock)
        })
        await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
    }
}

export async function usuarioCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const userController = new UserController()
    let targetUserId : string

    if (message.isQuoted && message.quotedMessage) {
        targetUserId = message.quotedMessage.sender
    } else if (message.mentioned.length) {
        targetUserId = message.mentioned[0]
    } else if (message.args.length) {
        targetUserId = waUtil.addWhatsappSuffix(message.text_command)
    } else {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    let userData = await userController.getUser(targetUserId)

    if (!userData) {
        throw new Error(adminCommands.usuario.msgs.error_user_not_found)
    }

    const userType = userData.owner ? botTexts.user_types.owner : botTexts.user_types.user
    const replyText = buildText(adminCommands.usuario.msgs.reply, userData.name || '---', userType, waUtil.removeWhatsappSuffix(userData.id), userData.commands)
    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function pingCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const userController = new UserController()
    const groupController = new GroupController()
    const replyTime = ((moment.now()/1000) - message.t).toFixed(2)
    const ramTotal = (os.totalmem()/1024000000).toFixed(2)
    const ramUsed = ((os.totalmem() - os.freemem())/1024000000).toFixed(2)
    const systemName = `${os.type()} ${os.release()}`
    const cpuName = os.cpus()[0]?.model ?? '---'
    const currentGroups = await groupController.getAllGroups()
    const currentUsers = await userController.getUsers()
    const botStarted = timestampToDate(botInfo.started)
    const replyText = buildText(adminCommands.ping.msgs.reply, systemName, cpuName, ramUsed, ramTotal, replyTime, currentUsers.length, currentGroups.length, botStarted)
    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}
