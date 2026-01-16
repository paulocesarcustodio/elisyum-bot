import { WASocket } from "@whiskeysockets/baileys";
import { Bot } from "../interfaces/bot.interface.js";
import { Message } from "../interfaces/message.interface.js";
import { Group } from "../interfaces/group.interface.js";
import * as waUtil from "../utils/whatsapp.util.js";
import { buildText, getCurrentBotVersion, messageErrorCommandUsage, timestampToDate } from "../utils/general.util.js";
import { UserController } from "../controllers/user.controller.js";
import * as menu from "../helpers/menu.builder.helper.js";
import infoCommands from "./info.list.commands.js";
import botTexts from "../helpers/bot.texts.helper.js";
import path from "path";
import { fileURLToPath } from 'url';
import { PermissionService } from "../services/permission.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function infoCommand(client: WASocket, botInfo: Bot, message: Message, group: Group){
    const userController = new UserController()
    const blockedUsers = await waUtil.getBlockedContacts(client)

    let version = getCurrentBotVersion()
    let botStartedAt = timestampToDate(botInfo.started)
    let replyText = buildText(infoCommands.info.msgs.reply_title, botInfo.name?.trim(), botStartedAt, version, botInfo.executed_cmds)

    if(message.isBotOwner){
        replyText += infoCommands.info.msgs.reply_title_resources
        // AUTO-STICKER
        replyText += (botInfo.autosticker) ? infoCommands.info.msgs.reply_item_autosticker_on: infoCommands.info.msgs.reply_item_autosticker_off
        // PV LIBERADO
        replyText += (botInfo.commands_pv) ? infoCommands.info.msgs.reply_item_commandspv_on : infoCommands.info.msgs.reply_item_commandspv_off
        // TAXA DE COMANDOS POR MINUTO
        replyText += (botInfo.command_rate.status) ? buildText(infoCommands.info.msgs.reply_item_commandsrate_on, botInfo.command_rate.max_cmds_minute, botInfo.command_rate.block_time) : infoCommands.info.msgs.reply_item_commandsrate_off
        // BLOQUEIO DE COMANDOS
        let blockedCommands = []

        for(let commandName of botInfo.block_cmds){
            blockedCommands.push(botInfo.prefix+commandName)
        }
        replyText += (botInfo.block_cmds.length != 0) ? buildText(infoCommands.info.msgs.reply_item_blockcmds_on, blockedCommands.toString()) : infoCommands.info.msgs.reply_item_blockcmds_off
        //USUARIOS BLOQUEADOS
        replyText += buildText(infoCommands.info.msgs.reply_item_blocked_count, blockedUsers.length)
    }

    //RESPOSTA
    await waUtil.getProfilePicUrl(client, botInfo.host_number).then(async (pic)=>{
        if (pic) {
            await waUtil.replyFileFromUrl(client, message.chat_id, 'imageMessage', pic, replyText, message.wa_message, {expiration: message.expiration})
        } else {
            await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
        }
    }).catch(async ()=>{
        await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
    })
}

export async function reportarCommand(client: WASocket, botInfo: Bot, message: Message, group?: Group){
    if (!message.args.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    }

    const admins = await new UserController().getUsers().then(users => users.filter(u => u.owner))

    if (!admins.length) {
        throw new Error(infoCommands.reportar.msgs.error)
    }

    admins.forEach(async (admin) => {
        let replyAdmin = buildText(infoCommands.reportar.msgs.reply_admin, message.pushname, waUtil.removeWhatsappSuffix(message.sender), message.text_command)
        await waUtil.sendText(client, admin.id, replyAdmin)
    })

    await waUtil.replyText(client, message.chat_id, infoCommands.reportar.msgs.reply, message.wa_message, {expiration: message.expiration})
}

export async function meusdadosCommand(client: WASocket, botInfo: Bot, message: Message, group?: Group){
    const userData = await new UserController().getUser(message.sender, message.senderAlt)

    if (!userData) {
        throw new Error(infoCommands.meusdados.msgs.error_not_found)
    }

    const userName = userData.name || '---'
    const userType = userData.owner ? botTexts.user_types.owner : botTexts.user_types.user
    let replyText = buildText(infoCommands.meusdados.msgs.reply, userType, userName, userData.commands)

    await waUtil.replyText(client, message.chat_id, replyText, message.wa_message, {expiration: message.expiration})
}

export async function menuCommand(client: WASocket, botInfo: Bot, message: Message, group?: Group){
    const userController = new UserController()
    let userData = await userController.getUser(message.sender, message.senderAlt)

    if (!userData) {
        await userController.registerUser(message.sender, message.pushname, message.senderAlt)
        userData = await userController.getUser(message.sender, message.senderAlt)
    }

    if (!userData) {
        throw new Error(infoCommands.menu.msgs.error_user_not_found)
    }

    // Obter roles do usuário usando PermissionService
    const permissionService = new PermissionService()
    const userRoles = permissionService.getUserRoles(message)

    // Verificar se é dono do bot, admin do grupo ou membro comum
    const isOwner = userRoles.includes('owner')
    const isGroupAdmin = userRoles.includes('group_moderator')

    const userType = userData.owner ? botTexts.user_types.owner : botTexts.user_types.user
    let replyText = buildText(infoCommands.menu.msgs.reply, userData.name, userType, userData.commands)

    if (!message.args.length){
        // Exibir menu principal baseado no role
        if (isOwner) {
            replyText += menu.mainMenuOwner(botInfo)
        } else if (isGroupAdmin) {
            replyText += menu.mainMenuGroupAdmin(botInfo)
        } else {
            replyText += menu.mainMenuMember(botInfo)
        }
    } else {
        const commandText = message.text_command.trim()
        switch(commandText){
            case "0": // INFO (apenas dono)
                if (!isOwner) {
                    throw new Error(botTexts.permission.owner)
                }
                replyText += menu.infoMenu(botInfo)
                break
            case "1": // UTILIDADE (todos)
                replyText += menu.utilityMenuUnified(botInfo)
                break
            case "2": // GRUPO (apenas admins do grupo e dono)
                if (!isGroupAdmin && !isOwner) {
                    throw new Error(botTexts.permission.group_moderator)
                }
                if (!message.isGroupMsg) {
                    throw new Error(botTexts.permission.group)
                }
                replyText += isGroupAdmin || isOwner ? menu.groupAdminMenu(botInfo) : menu.groupMenu(botInfo)
                break
            case "3": // ADMIN (apenas dono)
                if (!isOwner) {
                    throw new Error(botTexts.permission.owner)
                }
                replyText += menu.adminMenu(botInfo)
                break
            default:
                throw new Error(infoCommands.menu.msgs.error_invalid_option)
        }
    }

    // Enviar imagem com o menu
    const logoPath = path.resolve(__dirname, '../media/elisyum_logo.jpeg')
    await waUtil.replyFile(client, message.chat_id, 'imageMessage', logoPath, replyText, message.wa_message, {expiration: message.expiration})
}

