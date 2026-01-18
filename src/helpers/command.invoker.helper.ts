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
import groupCommands from "../commands/group.list.commands.js";
import adminCommands from "../commands/admin.list.commands.js";
import { getCommandCategory, getCommandGuide } from "../utils/commands.util.js";
import { logsDb } from "../database/db.js";
import { PermissionService } from "../services/permission.service.js";
import { findSimilarCommand } from "./command.fuzzy.helper.js";
import { askGemini } from "../utils/ai.util.js";
import { UserController } from "../controllers/user.controller.js";

// Mapa de aliases de comandos (sincronizado com commands.util.ts)
const COMMAND_ALIASES: Record<string, string> = {
    'audio': 'audio',
    'áudio': 'audio',
    'audios': 'audios',
    'áudios': 'audios'
}

export async function commandInvoker(client: WASocket, botInfo: Bot, message: Message, group: Group|null){
    const isGuide = (!message.args.length) ? false : message.args[0] === 'guia'
    let categoryCommand = getCommandCategory(botInfo.prefix, message.command)
    let commandName = waUtil.removePrefix(botInfo.prefix, message.command)
    
    // Resolve alias
    commandName = COMMAND_ALIASES[commandName] || commandName
    
    // Se comando não existe, tentar correção fuzzy
    if (categoryCommand === null) {
        const similarCommand = findSimilarCommand(commandName)
        
        if (similarCommand) {
            // Silent fix - corrige automaticamente
            console.log(`[FUZZY] 🔧 Auto-corrigindo: "${commandName}" → "${similarCommand.name}"`)
            commandName = similarCommand.name
            categoryCommand = similarCommand.category
            // Atualiza o comando na mensagem para refletir a correção
            message.command = botInfo.prefix + commandName
        }
    }

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
            case 'group':
                //Categoria GRUPO
                if (!message.isGroupMsg || !group) {
                    throw new Error(botTexts.permission.group)
                } else if (Object.keys(groupCommands).includes(commandName)){
                    const command = (groupCommands as any)[commandName]
                    
                    // Verificar permissões usando o PermissionService
                    if (command.permissions) {
                        const permissionService = new PermissionService()
                        const hasPermission = permissionService.hasPermission(message, command.permissions.roles)
                        
                        if (!hasPermission) {
                            throw new Error(botTexts.permission.group_admin)
                        }
                    }
                    
                    const commands = groupCommands as Commands
                    await commands[commandName].function(client, botInfo, message, group)
                    showCommandConsole(message.isGroupMsg, "GRUPO", message.command, "#e0e031", message.t, message.pushname, group?.name)
                    logsDb.log({ userJid: message.sender, userName: message.pushname, command: commandName, args: message.text_command, chatId: message.chat_id, isGroup: message.isGroupMsg, success: true })
                }

                break
            case 'admin':
                //Categoria ADMIN
                if (Object.keys(adminCommands).includes(commandName)){
                    const command = (adminCommands as any)[commandName]
                    
                    // Verificar permissões usando o PermissionService
                    if (command.permissions) {
                        const permissionService = new PermissionService()
                        const hasPermission = permissionService.hasPermission(message, command.permissions.roles)
                        
                        if (!hasPermission) {
                            throw new Error(botTexts.permission.owner_only)
                        }
                    }
                    
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
        
        let errorMessage = messageErrorCommand(message.command, err.message)
        
        // Obter nível de ajuda do usuário
        const userController = new UserController()
        const helpLevel = await userController.getHelpLevel(message.sender)
        
        // Verificar se usuário errou o mesmo comando 2+ vezes nos últimos 10 minutos
        try {
            const recentLogs = logsDb.getUserLogs(message.sender, 50)
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
            
            const recentErrors = recentLogs.filter((log: any) => 
                log.command === commandName &&
                log.success === 0 &&
                new Date(log.timestamp) > tenMinutesAgo
            )
            
            // Se usuário configurou 'with-ai' OU errou 2+ vezes, invocar assistente
            if (helpLevel === 'with-ai' || recentErrors.length >= 2) {
                if (recentErrors.length >= 2) {
                    console.log(`[ADAPTIVE] 🤖 Usuário ${message.pushname} errou ${commandName} ${recentErrors.length}x. Invocando assistente...`)
                } else {
                    console.log(`[HELP-LEVEL] 🤖 Usuário configurou 'with-ai'. Invocando assistente...`)
                }
                
                // Invocar assistente automaticamente
                try {
                    const aiHelp = await askGemini(
                        `Como usar o comando ${commandName}? O usuário está com dificuldades.`,
                        message.isBotOwner,
                        message.isGroupAdmin || false
                    )
                    
                    errorMessage += `\n\n🤖 *Assistente AI*\n\n${aiHelp}`
                } catch (aiError) {
                    console.error('[ADAPTIVE] Erro ao consultar assistente:', aiError)
                    // Continua sem a ajuda da IA
                }
            }
        } catch (adaptiveError) {
            console.error('[ADAPTIVE] Erro ao verificar histórico:', adaptiveError)
            // Continua com mensagem de erro padrão
        }
        
        await waUtil.replyText(client, message.chat_id, errorMessage, message.wa_message, {expiration: message.expiration})
    }

}

async function sendCommandGuide(client: WASocket, prefix: string, message : Message){
    await waUtil.replyText(client, message.chat_id, getCommandGuide(prefix, message.command), message.wa_message, {expiration: message.expiration})
}