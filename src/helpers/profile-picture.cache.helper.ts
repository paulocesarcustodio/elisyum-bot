import NodeCache from 'node-cache'
import { normalizeWhatsappJid } from '../utils/whatsapp.util.js'

export const profilePictureCache = new NodeCache({ stdTTL: 1800, checkperiod: 120 })

export function invalidateProfilePictureCache(...ids: (string | null | undefined)[]) {
    for (const id of ids) {
        const normalizedId = normalizeWhatsappJid(id)
        if (normalizedId) profilePictureCache.del(normalizedId)
        if (id) profilePictureCache.del(id)
    }
}
