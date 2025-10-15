import { isJidNewsletter, type ChatUpdate } from '@whiskeysockets/baileys'
import { colorText, showConsoleError } from '../utils/general.util.js'

export async function logNewsletterChatUpdates(updates: ChatUpdate[]) {
    try {
        const relevant = (updates || []).filter(update => {
            const id = update.id
            return (typeof id === 'string' && isJidNewsletter(id)) || update.isNewsletter === true
        })

        if (!relevant.length) return

        for (const chat of relevant) {
            const id = chat.id || 'unknown'
            const name = chat.name || chat.displayName || chat.subject || ''
            const mute = chat.mute ? `${chat.mute?.type ?? 'muted'}` : 'unmuted'
            const unread = typeof chat.unreadCount === 'number' ? chat.unreadCount : 0

            console.log(
                colorText('[NEWSLETTER-CHAT]', '#c44569'),
                colorText(id, '#20bf6b'),
                name ? colorText(name, '#0fb9b1') : '',
                colorText(mute, '#f8a5c2'),
                colorText(`unread:${unread}`, '#778beb')
            )
        }
    } catch (err: any) {
        showConsoleError(err, 'NEWSLETTER-CHATS')
    }
}
