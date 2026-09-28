import { identityService } from '../services/identity.service.js'
import { Contact } from "@whiskeysockets/baileys"
import { normalizeWhatsappJid } from "../utils/whatsapp.util.js"
import { contactsDb } from "../database/db.js"

export async function updateContactInStore(contact: Partial<Contact>) {
    if (!contact.id) return

    const identifiers = new Set<string>()

    const addIdentifier = (value?: string | null) => {
        if (!value || typeof value !== 'string') {
            return
        }

        const normalized = normalizeWhatsappJid(value)

        if (normalized) {
            identifiers.add(normalized)
        }

        if (normalized !== value) {
            identifiers.add(value)
        }
    }

    addIdentifier(contact.id)
    addIdentifier(contact.phoneNumber)
    addIdentifier(contact.lid)

    if (!identifiers.size) return
    await identityService.resolve(contact.id,[...identifiers],'contact')

    // Salvar todos os identificadores no banco
    for (const identifier of identifiers) {
        if (!identifier) continue

        ;(await contactsDb.upsert({
            jid: identifier,
            name: contact.name,
            notify: contact.notify,
            verifiedName: contact.verifiedName,
            phoneNumber: contact.phoneNumber,
            lid: contact.lid,
            imgUrl: contact.imgUrl
        }))
    }
}

export async function getContactFromStore(jid: string): Promise<Partial<Contact> | undefined> {
    const normalizedJid = normalizeWhatsappJid(jid)
    
    // Buscar primeiro com JID normalizado
    let contact = (await contactsDb.get(normalizedJid || jid))
    
    if (!contact && normalizedJid !== jid) {
        // Tentar com JID original
        contact = (await contactsDb.get(jid))
    }

    if (!contact && normalizedJid) {
        const [user] = normalizedJid.split('@')
        if (user) contact = (await contactsDb.get(user))
    }

    if (!contact) return undefined

    return {
        id: contact.jid,
        name: contact.name || undefined,
        notify: contact.notify || undefined,
        verifiedName: contact.verified_name || undefined,
        phoneNumber: contact.phone_number || undefined,
        lid: contact.lid || undefined,
        imgUrl: contact.avatar_url || undefined
    }
}

export function clearContactsStore() {
    // Não vamos limpar o banco de dados, mas podemos adicionar se necessário
    console.log('[CONTACTS] clearContactsStore chamado (não limpa BD permanente)')
}
