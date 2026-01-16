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
