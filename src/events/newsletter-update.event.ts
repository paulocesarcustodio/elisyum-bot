import { colorText, showConsoleError } from '../utils/general.util.js'

export type NewsletterUpdate = {
    id?: string
    operation?: string
    data?: unknown
}

export async function logNewslettersUpdate(updates: NewsletterUpdate[]) {
    try {
        if (!Array.isArray(updates) || !updates.length) return

        for (const update of updates) {
            const id = update.id || 'unknown'
            const op = update.operation || 'update'

            console.log(
                colorText('[NEWSLETTER-META]', '#9c88ff'),
                colorText(id, '#44bd32'),
                colorText(op, '#e84118'),
                update.data ? colorText(JSON.stringify(update.data), '#40739e') : ''
            )
        }
    } catch (err: any) {
        showConsoleError(err, 'NEWSLETTERS-UPDATE')
    }
}
