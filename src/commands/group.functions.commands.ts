import { WASocket } from "@whiskeysockets/baileys";
import { Bot } from "../interfaces/bot.interface.js";
import { Message } from "../interfaces/message.interface.js";
import { Group } from "../interfaces/group.interface.js";
import * as waUtil from "../utils/whatsapp.util.js";
import { buildText, messageErrorCommandUsage } from "../utils/general.util.js";
import { UserController } from "../controllers/user.controller.js";
import { GroupController } from "../controllers/group.controller.js";
import groupCommands from "./group.list.commands.js";

export async function silenciarCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const groupController = new GroupController()
    
    // NOTA: O bot não aparece na lista de participantes do groupMetadata
    // porque ele é quem está fazendo a consulta. Por isso, não podemos verificar
    // se o bot é admin checando a lista de participantes.
    // 
    // Solução: Removemos a verificação. Se o bot não for admin, o próprio Baileys
    // vai retornar erro ao tentar executar a ação administrativa (silenciar/remover/etc)
    
    let targetUserId: string

    // Removida a verificação: else if (!isBotGroupAdmin)
    // Motivo: Bot não aparece em groupMetadata.participants (é quem faz a query)

    if (message.mentioned.length) {
        targetUserId = message.mentioned[0]
    } else if (message.isQuoted && message.quotedMessage) {
        targetUserId = message.quotedMessage.sender
    } else {
        throw new Error(groupCommands.silenciar.msgs.error_missing_target)
    }

    const isBotTarget = botInfo.host_number === targetUserId
    const isAdminTarget = await groupController.isParticipantAdmin(group.id, targetUserId)

    if (isBotTarget) {
        throw new Error(groupCommands.silenciar.msgs.error_silence_bot)
    } else if (isAdminTarget) {
        throw new Error(groupCommands.silenciar.msgs.error_silence_admin)
    }

    const ensureMutedMembers = () => {
        if (!Array.isArray(group.muted_members)) {
            group.muted_members = []
        }

        return group.muted_members
    }

    const isMuted = await groupController.isParticipantMuted(group.id, targetUserId)
    let replyText: string

    if (isMuted) {
        await groupController.removeMutedMember(group.id, targetUserId)
        const mutedMembers = ensureMutedMembers().filter(memberId => memberId !== targetUserId)
        group.muted_members = mutedMembers
        replyText = buildText(groupCommands.silenciar.msgs.reply_unmuted, waUtil.removeWhatsappSuffix(targetUserId))
    } else {
        await groupController.setMutedMember(group.id, targetUserId)
        const mutedMembers = ensureMutedMembers()
        if (!mutedMembers.includes(targetUserId)) {
            mutedMembers.push(targetUserId)
        }
        replyText = buildText(groupCommands.silenciar.msgs.reply_muted, waUtil.removeWhatsappSuffix(targetUserId))
    }

    await waUtil.sendTextWithMentions(client, message.chat_id, replyText, [targetUserId], { expiration: message.expiration })
}

export async function addlistaCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const groupController = new GroupController()
    let targetUserId : string

    if (message.isQuoted && message.quotedMessage) {
        targetUserId = message.quotedMessage?.sender
    } else if (message.mentioned.length) {
        targetUserId = message.mentioned[0]
    } else if (message.args.length) {
        targetUserId = waUtil.addWhatsappSuffix(message.text_command)
    } else {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    if (targetUserId == botInfo.host_number) {
        throw new Error(groupCommands.addlista.msgs.error_add_bot)
    } else if (await groupController.isParticipantAdmin(group.id, targetUserId)) {
        throw new Error(groupCommands.addlista.msgs.error_add_admin)
    } 

    const currentBlacklist = group.blacklist

    if (currentBlacklist.includes(targetUserId)) {
        throw new Error(groupCommands.addlista.msgs.error_already_listed)
    }

    await groupController.setBlacklist(group.id, targetUserId, 'add')
    await waUtil.replyText(client, message.chat_id, groupCommands.addlista.msgs.reply, message.wa_message, {expiration: message.expiration})

    if (await groupController.isParticipant(group.id, targetUserId)) {
        await waUtil.removeParticipant(client, group.id, targetUserId)
    }
}

export async function rmlistaCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const groupController = new GroupController()
    let targetUserId : string

    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }
    
    const currentBlacklist = group.blacklist

    if (message.args.length == 1 && message.args[0].length <= 3) {
        targetUserId = currentBlacklist[parseInt(message.text_command) - 1]
    } else {
        targetUserId = waUtil.addWhatsappSuffix(message.text_command)
    }

    if (!currentBlacklist.includes(targetUserId)) {
        throw new Error(groupCommands.rmlista.msgs.error_not_listed)
    }

    await groupController.setBlacklist(group.id, targetUserId, 'remove')
    await waUtil.replyText(client, message.chat_id, groupCommands.rmlista.msgs.reply, message.wa_message, {expiration: message.expiration})
}

export async function listanegraCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const userController = new UserController()
    const groupController = new GroupController()

    const currentBlacklist = group.blacklist
    let replyText = buildText(groupCommands.listanegra.msgs.reply_title, currentBlacklist.length)

    if (!currentBlacklist.length) {
        throw new Error(groupCommands.listanegra.msgs.error_empty_list)
    }

    for(let userId of currentBlacklist){
        const userData = await userController.getUser(userId)
        const userNumberList = currentBlacklist.indexOf(userId) + 1
        replyText += buildText(groupCommands.listanegra.msgs.reply_item, userNumberList, userData?.name || '---', waUtil.removeWhatsappSuffix(userId))
    }

    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function addCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }
    
    const numbers = message.text_command.split(',').map(number => number.trim())
    if (numbers.some(number => !/^\+?[\d\s()-]+$/.test(number) || !Number(number.replace(/\D/g, '')))) {
        throw new Error(groupCommands.add.msgs.error_input)
    }
    const replies: string[] = []
    for (const number of [...new Set(numbers.map(number => number.replace(/\D/g, '')))]) {
        const userId = waUtil.addWhatsappSuffix(number)
        try {
            const response = await waUtil.addParticipant(client, group.id, userId)
            replies.push(buildText(response.status === '200' ? groupCommands.add.msgs.reply : groupCommands.add.msgs.error_add, number))
        } catch {
            replies.push(buildText(groupCommands.add.msgs.error_invalid_number, number))
        }
    }
    await waUtil.replyText(client, group.id, replies.join('\n'), message.wa_message, {expiration: message.expiration})
}

export async function banCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const groupController = new GroupController()

    let targetUsers : string[] = []

    if (!message.mentioned.length && message.isQuoted && message.quotedMessage) {
        targetUsers.push(message.quotedMessage?.sender)
    } else if (message.mentioned.length) {
        targetUsers = message.mentioned
    } else {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    let replyText = groupCommands.ban.msgs.reply_title

    for(let userId of targetUsers){
        if (await groupController.isParticipant(group.id, userId)){
            if (!await groupController.isParticipantAdmin(group.id, userId)){
                await waUtil.removeParticipant(client, group.id, userId)
                replyText += buildText(groupCommands.ban.msgs.reply_item_success, waUtil.removeWhatsappSuffix(userId))
            } else {
                replyText += buildText(groupCommands.ban.msgs.reply_item_ban_admin, waUtil.removeWhatsappSuffix(userId))
            }
        } else {
            replyText += buildText(groupCommands.ban.msgs.reply_item_not_found, waUtil.removeWhatsappSuffix(userId))
        }
    }

    await waUtil.replyText(client, group.id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function promoverCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const groupController = new GroupController()

    let targetUsers : string[] = []
    let replyText = groupCommands.promover.msgs.reply_title

    if (message.mentioned.length) {
        targetUsers = message.mentioned
    } else if (message.isQuoted && message.quotedMessage) {
        targetUsers.push(message.quotedMessage.sender)
    } else {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    for(let userId of targetUsers){
        if (!await groupController.isParticipantAdmin(group.id, userId)) {
            await waUtil.promoteParticipant(client, group.id, userId)
            replyText += buildText(groupCommands.promover.msgs.reply_item_success, waUtil.removeWhatsappSuffix(userId))
        } else {
            replyText += buildText(groupCommands.promover.msgs.reply_item_error, waUtil.removeWhatsappSuffix(userId))
        }
    }

    await waUtil.replyWithMentions(client, group.id, replyText, targetUsers, message.wa_message, {expiration: message.expiration})
}

export async function rebaixarCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const groupController = new GroupController()

    let targetUsers : string[] = []
    let replyText = groupCommands.rebaixar.msgs.reply_title

    if (message.mentioned.length > 0) {
        targetUsers = message.mentioned
    } else if (message.isQuoted && message.quotedMessage) {
        targetUsers.push(message.quotedMessage.sender)
    } else {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    for(let userId of targetUsers){
        if (userId == botInfo.host_number || userId == group.owner){
            replyText += buildText(groupCommands.rebaixar.msgs.reply_item_error, waUtil.removeWhatsappSuffix(userId))
        } else if (await groupController.isParticipantAdmin(group.id, userId)) {
            replyText += buildText(groupCommands.rebaixar.msgs.reply_item_success, waUtil.removeWhatsappSuffix(userId))
            await waUtil.demoteParticipant(client, group.id, userId)
        } else {
            replyText += buildText(groupCommands.rebaixar.msgs.reply_item_error_is_member, waUtil.removeWhatsappSuffix(userId))
        }
    }

    await waUtil.replyWithMentions(client, message.chat_id, replyText, targetUsers, message.wa_message, {expiration: message.expiration})
}


export async function apgCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const groupController = new GroupController()

    if (!message.isQuoted || !message.quotedMessage) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }
    
    await waUtil.deleteMessage(client, message.wa_message, true)
}

