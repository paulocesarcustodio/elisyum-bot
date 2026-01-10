import { WASocket } from "@whiskeysockets/baileys";
import { Bot } from "../interfaces/bot.interface.js";
import { Message } from "../interfaces/message.interface.js";
import { messageErrorCommand, showCommandConsole } from "../utils/general.util.js";
import { Group } from "../interfaces/group.interface.js";
import { Commands } from "../interfaces/command.interface.js";
import * as waUtil from "../utils/whatsapp.util.js";
import botTexts from "../helpers/bot.texts.helper.js";
import infoCommands from "../commands/info.list.commands.js";
import utilityCommands from "../commands/utility.list.commands.js";
import stickerCommands from "../commands/sticker.list.commands.js";
import downloadCommands from "../commands/download.list.commands.js";
import miscCommands from "../commands/misc.list.commands.js";
import groupCommands from "../commands/group.list.commands.js";
import adminCommands from "../commands/admin.list.commands.js";
import { getCommandCategory, getCommandGuide } from "../utils/commands.util.js";
import { logsDb } from "../database/db.js";

// Mapa de aliases de comandos (sincronizado com commands.util.ts)
const COMMAND_ALIASES: Record<string, string> = {
    'audio': 'audio',
    'áudio': 'audio',
    'audios': 'audios',
    'áudios': 'audios'
}

export async function commandInvoker(client: WASocket, botInfo: Bot, message: Message, group: Group|null){
    const isGuide = (!message.args.length) ? false : message.args[0] === 'guia'
    const categoryCommand = getCommandCategory(botInfo.prefix, message.command)
    let commandName = waUtil.removePrefix(botInfo.prefix, message.command)
    
    // Resolve alias
    commandName = COMMAND_ALIASES[commandName] || commandName

    try{
        if (isGuide) {
            return sendCommandGuide(client, botInfo.prefix, message)
        }

        switch (categoryCommand) {
            case 'info':
                //Categoria INFO
                if (Object.keys(infoCommands).includes(commandName)){
                    const commands = infoCommands as Commands
                    await commands[commandName].function(client, botInfo, message, group || undefined)
                    showCommandConsole(message.isGroupMsg, "INFO", message.command, "#8ac46e", message.t, message.pushname, group?.name)
                    logsDb.log({ userJid: message.sender, userName: message.pushname, command: commandName, args: message.text_command, chatId: message.chat_id, isGroup: message.isGroupMsg, success: true })
                }

                break
            case 'utility':
                //Categoria UTILIDADE
                if (Object.keys(utilityCommands).includes(commandName)){
                    const commands = utilityCommands as Commands
                    await commands[commandName].function(client, botInfo, message, group || undefined)
                    showCommandConsole(message.isGroupMsg, "UTILIDADE", message.command, "#de9a07", message.t, message.pushname, group?.name)
                    logsDb.log({ userJid: message.sender, userName: message.pushname, command: commandName, args: message.text_command, chatId: message.chat_id, isGroup: message.isGroupMsg, success: true })
                }

                break
            case 'sticker':
                //Categoria STICKER
                if (Object.keys(stickerCommands).includes(commandName)){
                    const commands = stickerCommands as Commands
                    await commands[commandName].function(client, botInfo, message, group || undefined)
                    showCommandConsole(message.isGroupMsg, "STICKER", message.command, "#ae45d1", message.t, message.pushname, group?.name)
                    logsDb.log({ userJid: message.sender, userName: message.pushname, command: commandName, args: message.text_command, chatId: message.chat_id, isGroup: message.isGroupMsg, success: true })
                }

                break
            case 'download':
                //Categoria DOWNLOAD
                if (Object.keys(downloadCommands).includes(commandName)){
                    const commands = downloadCommands as Commands
                    await commands[commandName].function(client, botInfo, message, group || undefined)
                    showCommandConsole(message.isGroupMsg, "DOWNLOAD", message.command, "#2195cf", message.t, message.pushname, group?.name)
                    logsDb.log({ userJid: message.sender, userName: message.pushname, command: commandName, args: message.text_command, chatId: message.chat_id, isGroup: message.isGroupMsg, success: true })
                }

                break
            case 'misc':
                //Categoria VARIADO
                if (Object.keys(miscCommands).includes(commandName)){
                    const commands = miscCommands as Commands
                    await commands[commandName].function(client, botInfo, message, group || undefined)
                    showCommandConsole(message.isGroupMsg, "VARIADO", message.command, "#22e3dd", message.t, message.pushname, group?.name)
                    logsDb.log({ userJid: message.sender, userName: message.pushname, command: commandName, args: message.text_command, chatId: message.chat_id, isGroup: message.isGroupMsg, success: true })
                }

                break
            case 'group':
                //Categoria GRUPO
                if (!message.isGroupMsg || !group) {
                    throw new Error(botTexts.permission.group)
                } else if (Object.keys(groupCommands).includes(commandName)){
                    const commands = groupCommands as Commands
                    await commands[commandName].function(client, botInfo, message, group)
                    showCommandConsole(message.isGroupMsg, "GRUPO", message.command, "#e0e031", message.t, message.pushname, group?.name)
                    logsDb.log({ userJid: message.sender, userName: message.pushname, command: commandName, args: message.text_command, chatId: message.chat_id, isGroup: message.isGroupMsg, success: true })
                }

                break
            case 'admin':
                //Categoria ADMIN
                if (!message.isBotAdmin) {
                    throw new Error(botTexts.permission.admin_bot_only)
                } else if (Object.keys(adminCommands).includes(commandName)){
                    const commands = adminCommands as Commands
                    await commands[commandName].function(client, botInfo, message, group || undefined)
                    showCommandConsole(message.isGroupMsg, "ADMINISTRAÇÃO", message.command, "#d1d1d1", message.t, message.pushname, group?.name)
                    logsDb.log({ userJid: message.sender, userName: message.pushname, command: commandName, args: message.text_command, chatId: message.chat_id, isGroup: message.isGroupMsg, success: true })
                }

                break
            default:
                break
        }
    } catch(err: any){
        // Registrar erro no banco
        logsDb.log({ 
            userJid: message.sender, 
            userName: message.pushname, 
            command: commandName, 
            args: message.text_command, 
            chatId: message.chat_id, 
            isGroup: message.isGroupMsg, 
            success: false, 
            error: err.message 
        })
        await waUtil.replyText(client, message.chat_id, messageErrorCommand(message.command, err.message), message.wa_message, {expiration: message.expiration})
    }

}

async function sendCommandGuide(client: WASocket, prefix: string, message : Message){
    await waUtil.replyText(client, message.chat_id, getCommandGuide(prefix, message.command), message.wa_message, {expiration: message.expiration})
}