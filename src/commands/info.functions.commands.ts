import { WASocket } from "@whiskeysockets/baileys";
import { Bot } from "../interfaces/bot.interface.js";
import { Message } from "../interfaces/message.interface.js";
import { Group } from "../interfaces/group.interface.js";
import * as waUtil from "../utils/whatsapp.util.js";
import { buildText } from "../utils/general.util.js";
import { UserController } from "../controllers/user.controller.js";
import * as menu from "../helpers/menu.builder.helper.js";
import infoCommands from "./info.list.commands.js";
import botTexts from "../helpers/bot.texts.helper.js";
import path from "path";
import { fileURLToPath } from 'url';
import { PermissionService } from "../services/permission.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
                replyText += menu.groupAdminMenu(botInfo)
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

