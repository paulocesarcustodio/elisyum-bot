import { isJidNewsletter, type MessageUpsertType, type WAMessage, type WASocket } from '@whiskeysockets/baileys'
import { colorText, showConsoleError, timestampToDate } from '../utils/general.util.js'

export type NewsletterMessageBatch = {
    messages: WAMessage[]
    type: MessageUpsertType
    requestId?: string
}

export function isNewsletterMessage(message: WAMessage): boolean {
    const remoteJid = message?.key?.remoteJid
    if (remoteJid && isJidNewsletter(remoteJid)) {
        return true
    }

    const invite = message?.message?.newsletterAdminInviteMessage
    if (invite?.newsletterJid && isJidNewsletter(invite.newsletterJid)) {
        return true
    }

    return false
}

export function partitionNewsletterMessages(messages: WAMessage[]) {
    const newsletterMessages: WAMessage[] = []
    const otherMessages: WAMessage[] = []

    for (const message of messages) {
        if (isNewsletterMessage(message)) {
            newsletterMessages.push(message)
        } else {
            otherMessages.push(message)
        }
    }

    return { newsletterMessages, otherMessages }
}

export async function logNewsletterMessages(_client: WASocket, batch: NewsletterMessageBatch) {
    try {
        if (!batch.messages.length) return

        for (const message of batch.messages) {
            const remoteJid = message.key.remoteJid
            const serverId = message.message?.newsletterMessage?.serverId || message.newsletterServerId
            const text = message.message?.extendedTextMessage?.text || message.message?.conversation || ''
            const timestamp = message.messageTimestamp ? timestampToDate(Number(message.messageTimestamp) * 1000) : 'unknown'

            console.log(
                colorText('[NEWSLETTER]', '#8c7ae6'),
                colorText(remoteJid || 'unknown', '#4cd137'),
                serverId ? colorText(String(serverId), '#487eb0') : colorText('-', '#487eb0'),
                colorText(batch.type, '#fbc531'),
                colorText(timestamp, '#00a8ff'),
                text ? colorText(text, '#e1b12c') : ''
            )
        }
    } catch (err: any) {
        showConsoleError(err, 'NEWSLETTER-MESSAGES')
    }
}
