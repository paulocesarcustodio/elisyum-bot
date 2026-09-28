import { currentOperation, UncertainEffect } from '../application/operation-context.js'
import { IdentityService } from '../services/identity.service.js'
import { GroupController } from '../controllers/group.controller.js'
import { WASocket } from "@whiskeysockets/baileys";
import { Bot } from "../interfaces/bot.interface.js";
import { Message } from "../interfaces/message.interface.js";
import { messageErrorCommand, showCommandConsole } from "../utils/general.util.js";
import { Group } from "../interfaces/group.interface.js";
import * as waUtil from "../utils/whatsapp.util.js";
import botTexts from "../helpers/bot.texts.helper.js";
import { getCommandCategory, getCommandGuide } from "../utils/commands.util.js";
import { logsDb } from "../database/db.js";
import { PermissionService } from "../services/permission.service.js";
import { findCommand } from '../application/command-catalog.js'
import { executeCommand, CommandRejected } from '../application/command-executor.js'
import type { CommandRequest } from '../domain/contracts.js'
import * as procedures from './message.procedures.helper.js'
import { randomUUID } from 'node:crypto'
import { findSimilarCommand } from "./command.fuzzy.helper.js";
import { askGemini } from "../utils/ai.util.js";
import { UserController } from "../controllers/user.controller.js";
import { resolveCommandAlias } from "../utils/command.aliases.util.js";

export async function commandInvoker(client: WASocket, botInfo: Bot, message: Message, group: Group|null){
    const isGuide = (!message.args.length) ? false : message.args[0] === 'guia'
    let categoryCommand = getCommandCategory(botInfo.prefix, message.command)
    let commandName = waUtil.removePrefix(botInfo.prefix, message.command)

    // Resolve alias
    commandName = resolveCommandAlias(commandName)

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

        const definition = findCommand(commandName)
        if (!definition) return
        message.command = botInfo.prefix + definition.name
        message.isBotOwner = Boolean((await new UserController().getUser(message.sender))?.owner)
        if(message.isGroupMsg && group) {
            group = await new GroupController().getGroup(group.id)
            message.isGroupAdmin = await new GroupController().isParticipantAdmin(message.chat_id,message.sender)
        }
        const request: CommandRequest = {
            operationId: message.operationId || randomUUID(),
            accountId: process.env.BOT_ACCOUNT_ID || 'default',
            conversationId: message.chat_id,
            actor: {id:message.sender, source:'whatsapp', roles:new PermissionService().getUserRoles(message)},
            kind: message.isGroupMsg ? 'group' : 'private',
            command: definition.name,
            args: message.args,
            source: message.semanticSource || 'prefix',
            targetIds: message.mentioned.length ? message.mentioned : message.quotedMessage ? [message.quotedMessage.sender] : [],
            confirmationId: message.confirmationId
        }
        const result = await executeCommand(request, definition, async () => {
            await definition.function(client, botInfo, message, group || undefined)
        }, async () => {
            if (await procedures.isUserBlocked(client, message)) throw new CommandRejected('Este usuário está bloqueado.')
            if (!message.isGroupMsg && !botInfo.commands_pv && !message.isBotOwner) throw new CommandRejected('Comandos no privado estão desativados.')
            if (botInfo.block_cmds.includes(definition.name) && !message.isBotOwner) throw new CommandRejected('Este comando está bloqueado no bot.')
            if (message.isGroupMsg) {
                if (!group) throw new CommandRejected(botTexts.permission.group)
                if ((await new IdentityService().aliases(message.sender)).some(alias=>group!.muted_members?.includes(alias))) throw new CommandRejected('Você está silenciado neste grupo.')
                if (group.block_cmds.includes(definition.name) && !message.isGroupAdmin && !message.isBotOwner) throw new CommandRejected('Este comando está bloqueado neste grupo.')
                if (await procedures.isBotLimitedByGroupRestricted(group, botInfo)) throw new CommandRejected('O bot precisa ser administrador neste grupo.')
            }
            if (await procedures.isUserLimitedByCommandRate(client, botInfo, message)) throw new CommandRejected('Limite de comandos atingido.')
        })
        showCommandConsole(message.isGroupMsg, definition.category.toUpperCase(), message.command, '#8ac46e', message.t, message.pushname, group?.name)
        await logsDb.log({userJid:message.sender,userName:message.pushname,command:commandName,args:message.text_command,chatId:message.chat_id,isGroup:message.isGroupMsg,success:true})
        return result
    } catch(err: any){
        if(err instanceof UncertainEffect)throw err
        const operation=currentOperation()
        if(operation){operation.error=String(err.message);operation.rejected=err instanceof CommandRejected}

        // Registrar erro no banco
        ;(await logsDb.log({
            userJid: message.sender,
            userName: message.pushname,
            command: commandName,
            args: message.text_command,
            chatId: message.chat_id,
            isGroup: message.isGroupMsg,
            success: false,
            error: err.message
        }))

        let errorMessage = messageErrorCommand(message.command, err.message)

        // Obter nível de ajuda do usuário
        const userController = new UserController()
        const helpLevel = await userController.getHelpLevel(message.sender)

        // Verificar se usuário errou o mesmo comando 2+ vezes nos últimos 10 minutos
        try {
            const recentLogs = (await logsDb.getUserLogs(message.sender, 50))
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
