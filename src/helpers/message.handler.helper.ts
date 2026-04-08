import { WASocket } from "@whiskeysockets/baileys";
import { Bot } from "../interfaces/bot.interface.js";
import { Group } from "../interfaces/group.interface.js";
import { Message } from "../interfaces/message.interface.js";
import { commandExist } from "../utils/commands.util.js";
import * as waUtil from "../utils/whatsapp.util.js";
import { buildText, getFirstSupportedDownloadUrl } from "../utils/general.util.js";
import botTexts from "./bot.texts.helper.js";
import * as procs from './message.procedures.helper.js'
import { findSimilarCommand } from "./command.fuzzy.helper.js";
import { askGemini } from "../utils/ai.util.js";

function prepareAutoDownload(botInfo: Bot, message: Message, url: string) {
    message.command = `${botInfo.prefix}d`
    message.args = [url]
    message.text_command = url
    message.isAutoDownload = true
}

export async function handlePrivateMessage(client: WASocket, botInfo: Bot, message: Message){
    let isCommand = commandExist(botInfo.prefix, message.command)
    const isAutosticker = ((message.type === 'videoMessage' || message.type === "imageMessage") && botInfo.autosticker)
    const hasUnknownPrefixedCommand = !isCommand && message.command.startsWith(botInfo.prefix)
    const autoDownloadUrl = (!isCommand && !isAutosticker && !message.isBotMessage)
        ? getFirstSupportedDownloadUrl(message.caption || message.body || '')
        : null
    let callCommand : boolean

    //Verifica se o usuário está bloqueado, se estiver retorna.
    if (await procs.isUserBlocked(client, message)) {
        return false
    }

    //Atualize o nome do usuário
    await procs.updateUserName(message)

    //Verifica se é um registro de dono, se for retorne.
    if (await procs.isOwnerRegister(client, botInfo, message)) {
        return false
    }

    //Se o PV do bot não estiver liberado e o usuário não for o dono, retorne.
    if (procs.isIgnoredByPvAllowed(botInfo, message)) {
        return false
    }

    //Leia a mensagem do usuário
    await procs.readUserMessage(client, message)

    if (autoDownloadUrl) {
        prepareAutoDownload(botInfo, message, autoDownloadUrl)
        isCommand = true
    }

    if (isCommand || isAutosticker){
        //Se a taxa de comandos estiver ativado e o usuário estiver limitado, retorne.
        if (await procs.isUserLimitedByCommandRate(client, botInfo, message)) {
            return false
        }

        //Se o comando estiver bloqueado globalmente, retorne.
        if (await procs.isCommandBlockedGlobally(client, botInfo, message)) {
            return false
        }

        //Incrementa contagem de comandos do usuário
        await procs.incrementUserCommandsCount(message)

        //Incrementa contagem de comandos do bot
        procs.incrementBotCommandsCount()

        callCommand = true
    } else {
        callCommand = false
        // Aviso documentado: informa ao usuário quando um comando com prefixo não foi encontrado no privado.
        if (hasUnknownPrefixedCommand) {
            console.log(`[UNKNOWN-PV] ⚠️ Comando não encontrado: "${message.command}"`)
            
            // Tentar fuzzy match
            const commandName = waUtil.removePrefix(botInfo.prefix, message.command)
            const similarCommand = findSimilarCommand(commandName)
            
            // Se encontrou comando similar, executar silenciosamente
            if (similarCommand) {
                console.log(`[FUZZY-PV] 🔧 Auto-corrigindo "${message.command}" → "${botInfo.prefix}${similarCommand.name}"`)
                message.command = botInfo.prefix + similarCommand.name
                callCommand = true
            } else {
                // Não encontrou similar, invocar assistente
                console.log(`[UNKNOWN-PV] 🤖 Nenhum comando similar encontrado. Consultando assistente...`)
                let unknownCommandText = buildText(botTexts.unknown_command, message.command)
                
                try {
                    const aiHelp = await askGemini(
                        `O usuário digitou "${message.command}". Existe comando similar? Se sim, sugira usando !comando. Se não, oriente o usuário a usar !menu para ver comandos disponíveis.`,
                        message.isBotOwner,
                        false // Em PV não há group admin
                    )
                    unknownCommandText += `\n\n${aiHelp}\n\n💡 _Use !menu para ver todos os comandos ou !ask [pergunta] para fazer uma pergunta._`
                    console.log(`[UNKNOWN-PV] ✅ Resposta do assistente obtida`)
                } catch (error: any) {
                    console.error('[UNKNOWN-PV] ❌ Erro ao consultar assistente:', error.message)
                    unknownCommandText += `\n\n💡 _Use !menu para ver todos os comandos disponíveis ou !ask [pergunta] para tirar dúvidas._`
                }
                
                await waUtil.replyText(client, message.chat_id, unknownCommandText, message.wa_message, { expiration: message.expiration })
                console.log(`[UNKNOWN-PV] 📤 Mensagem de comando desconhecido enviada`)
            }
        }
    }

    return callCommand
}

export async function handleGroupMessage(client: WASocket, group: Group, botInfo: Bot, message: Message){
    let isCommand = commandExist(botInfo.prefix, message.command)
    const isAutosticker = ((message.type === 'videoMessage' || message.type === "imageMessage") && group?.autosticker)
    const hasUnknownPrefixedCommand = !isCommand && message.command.startsWith(botInfo.prefix)
    const autoDownloadUrl = (!isCommand && !isAutosticker && !message.isBotMessage)
        ? getFirstSupportedDownloadUrl(message.caption || message.body || '')
        : null
    let callCommand : boolean

    //Atualize o nome do usuário
    await procs.updateUserName(message)

    if (await procs.deleteMessageIfMutedMember(client, group, botInfo, message)) {
        return false
    }

    //Se o grupo estiver restrito para admins e o bot não for um admin, retorne.
    if (await procs.isBotLimitedByGroupRestricted(group, botInfo)) {
        return false
    }

    //Se o antilink estiver ativado, e for detectado um link na mensagem, retorne.
    if (await procs.isDetectedByAntiLink(client, botInfo, group, message)) {
        return false
    }

    //Se uma palavra do filtro for detectada, retorne.
    if (await procs.isDetectedByWordFilter(client, botInfo, group, message)) {
        return false
    }

    //Se o Anti-FLOOD estiver ativado, e for detectada como FLOOD, retorne.
    if (await procs.isDetectedByAntiFlood(client, botInfo, group, message)) {
        return false
    }

    //Verifica se é um registro de dono, se for retorne.
    if (await procs.isOwnerRegister(client, botInfo, message)) {
        return false
    }

    //Incrementa a contagem do participante.
    await procs.incrementParticipantActivity(message, isCommand || !!autoDownloadUrl)

    //Se o grupo estiver mutado e o participante não for um admin, retorne.
    if (procs.isIgnoredByGroupMuted(group, message)) {
        return false
    }

    //Verifica se o usuário está bloqueado, se estiver retorna.
    if (await procs.isUserBlocked(client, message)) {
        return false
    }

    //Leia a mensagem do usuário
    await procs.readUserMessage(client, message)

    if (autoDownloadUrl) {
        prepareAutoDownload(botInfo, message, autoDownloadUrl)
        isCommand = true
    }

    if (isCommand || isAutosticker){
        //Se a taxa de comandos estiver ativa e o usuário estiver limitado, retorne.
        if (await procs.isUserLimitedByCommandRate(client, botInfo, message)) {
            return false
        }

        //Se o comando estiver bloqueado globalmente, retorne.
        if (await procs.isCommandBlockedGlobally(client, botInfo, message)) {
            return false
        }

        //Se o comando estiver bloqueado no grupo, retorne.
        if (await procs.isCommandBlockedGroup(client, group, botInfo, message)) {
            return false
        }

        //Incrementa contagem de comandos do usuário
        await procs.incrementUserCommandsCount(message)

        //Incrementa contagem de comandos do bot
        procs.incrementBotCommandsCount()

        //Incrementa contagem de comandos do grupo
        await procs.incrementGroupCommandsCount(group)

        callCommand = true
    } else {
        const autoReplied = await procs.autoReply(client, botInfo, group, message)

        // Tentar fuzzy match antes de marcar como callCommand = false
        if (hasUnknownPrefixedCommand) {
            console.log(`[UNKNOWN-GROUP] ⚠️ Comando não encontrado: "${message.command}"`)
            
            const commandName = waUtil.removePrefix(botInfo.prefix, message.command)
            const similarCommand = findSimilarCommand(commandName)
            
            if (similarCommand) {
                // Encontrou comando similar, executar silenciosamente
                console.log(`[FUZZY-GROUP] 🔧 Auto-corrigindo "${message.command}" → "${botInfo.prefix}${similarCommand.name}"`)
                message.command = botInfo.prefix + similarCommand.name
                callCommand = true
                
                // Incrementa contadores já que vamos executar o comando
                await procs.incrementUserCommandsCount(message)
                procs.incrementBotCommandsCount()
                await procs.incrementGroupCommandsCount(group)
            } else {
                // Não encontrou similar
                console.log(`[UNKNOWN-GROUP] 🤖 Nenhum comando similar encontrado`)
                callCommand = false

                // Sempre informar sobre comandos desconhecidos (removido bloqueio para admins)
                // Apenas ignora mensagens do próprio bot e quando já teve autoReply
                if (!message.isBotMessage && !autoReplied) {
                    console.log(`[UNKNOWN-GROUP] 📝 Enviando sugestão do assistente...`)
                    let unknownCommandText = buildText(botTexts.unknown_command, message.command)
                    
                    try {
                        const aiHelp = await askGemini(
                            `O usuário digitou "${message.command}" em um grupo. Existe comando similar? Se sim, sugira usando !comando. Se não, oriente brevemente a usar !menu.`,
                            message.isBotOwner,
                            message.isGroupAdmin || false
                        )
                        unknownCommandText += `\n\n${aiHelp}\n\n💡 _Use !menu ou !ask [pergunta]_`
                        console.log(`[UNKNOWN-GROUP] ✅ Resposta do assistente obtida`)
                    } catch (error: any) {
                        console.error('[UNKNOWN-GROUP] ❌ Erro ao consultar assistente:', error.message)
                        unknownCommandText += `\n\n💡 _Use !menu para ver comandos ou !ask [pergunta] para tirar dúvidas._`
                    }
                    
                    await waUtil.replyText(client, message.chat_id, unknownCommandText, message.wa_message, { expiration: message.expiration })
                    console.log(`[UNKNOWN-GROUP] 📤 Mensagem enviada`)
                } else {
                    console.log(`[UNKNOWN-GROUP] 🚫 Feedback bloqueado (isBotMessage: ${message.isBotMessage}, autoReplied: ${autoReplied})`)
                }
            }
        } else {
            callCommand = false
        }
    }

    return callCommand
}