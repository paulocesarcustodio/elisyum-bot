import { WASocket } from "@whiskeysockets/baileys"
import { Bot } from "../interfaces/bot.interface.js"
import { Group } from "../interfaces/group.interface.js"
import { Message } from "../interfaces/message.interface.js"
import * as waUtil from '../utils/whatsapp.util.js'
import { buildText, messageErrorCommandUsage} from "../utils/general.util.js"
import botTexts from "../helpers/bot.texts.helper.js"

// Mensagens do comando vtnc (para evitar dependência circular)
const vtncMsgs = {
    error_mention: "Apenas um membro deve ser marcado por vez.",
    error_message: "Houve um erro ao obter os dados da mensagem.",
    reply: '@{$1} vai tomar no cu!\n\n{$2}'
}

export async function vtncCommand(client: WASocket, botInfo: Bot, message: Message, group?: Group) {
    if (!message.isGroupMsg || !group) {
        throw new Error(botTexts.permission.group)
    } else if (!message.isQuoted && !message.mentioned.length) {
        throw new Error(messageErrorCommandUsage(botInfo.prefix, message))
    } else if (message.mentioned.length > 1) {
        throw new Error(vtncMsgs.error_mention)
    }

    let targetUserId: string | undefined

    if (message.mentioned.length === 1) {
        targetUserId = message.mentioned[0]
    } else if (message.isQuoted && message.quotedMessage) {
        targetUserId = message.quotedMessage.sender
    }

    if (!targetUserId) {
        throw new Error(vtncMsgs.error_message)
    }

    const messageToReply = (message.isQuoted && message.quotedMessage) ? message.quotedMessage.wa_message : message.wa_message
    const asciiArt = "……..…../´¯/)………… (\\¯`\\\n…………/….//……….. …\\\\….\\\n………../….//………… ….\\\\….\\\n…../´¯/…./´¯\\………../¯ `\\…\\¯`\\\n.././…/…./…./.|_……_| .\\…\\…\\…\\.\\..\n(.(….(….(…./.)..)..(..(. \\….)….)….)… )\n.\\…………….\\/…/….\\. ..\\/……………./\n..\\…………….. /……..\\……………..…/\n….\\…………..(…………)……………./"
    const replyText = buildText(
        vtncMsgs.reply,
        waUtil.removeWhatsappSuffix(targetUserId),
        asciiArt
    )

    await waUtil.replyWithMentions(
        client,
        message.chat_id,
        replyText,
        [targetUserId],
        messageToReply,
        { expiration: message.expiration }
    )
}

export async function askCommand(client: WASocket, botInfo: Bot, message: Message, group?: Group) {
    // Importação dinâmica para evitar problemas de dependência
    const { askGemini } = await import('../utils/ai.util.js')
    const utilityCommands = await import('./utility.list.commands.js')
    const askMsgs = utilityCommands.default.ask.msgs
    
    // Extrair pergunta
    const question = message.args.join(' ').trim()
    
    if (!question) {
        throw new Error(buildText(askMsgs.error_no_question, botInfo.prefix))
    }
    
    console.log('\n📝 [ASK] Pergunta do usuário:', question)
    
    // Enviar mensagem de espera que será editada depois
    const waitMsg = await waUtil.replyText(
        client,
        message.chat_id,
        '⏳ Consultando assistente...',
        message.wa_message,
        { expiration: message.expiration }
    )
    
    // Garantir que temos a mensagem antes de continuar
    if (!waitMsg || !waitMsg.key) {
        throw new Error('Erro ao enviar mensagem de espera')
    }
    
    try {
        // Determinar nível de permissão (3 níveis)
        const isBotOwner = message.isBotOwner
        const isGroupAdmin = group !== undefined && message.isGroupAdmin
        
        // Consultar Gemini com RAG (passa os dois flags)
        const response = await askGemini(question, isBotOwner, isGroupAdmin)
        
        console.log('🤖 [ASK] Resposta da IA:\n' + response + '\n')
        
        // Editar a mensagem de espera com a resposta final
        await waUtil.editText(client, message.chat_id, waitMsg.key, response)
    } catch (error: any) {
        // Em caso de erro, editar a mensagem com o erro
        const errorMsg = error.message || askMsgs.error_api
        try {
            await waUtil.editText(client, message.chat_id, waitMsg.key, '❌ ' + errorMsg)
        } catch (editError) {
            // Se não conseguir editar, lançar erro original
            throw new Error(errorMsg)
        }
        throw new Error(errorMsg)
    }
}
