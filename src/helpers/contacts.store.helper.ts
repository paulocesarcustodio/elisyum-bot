import { Contact } from "@whiskeysockets/baileys"
import { normalizeWhatsappJid } from "../utils/whatsapp.util.js"
import { contactsDb } from "../database/db.js"

export function getContactsStore(): Record<string, Partial<Contact>> {
    // Retorna todos os contatos do banco como um objeto (para compatibilidade)
    const contacts = contactsDb.getAll()
    const result: Record<string, Partial<Contact>> = {}
    
    for (const contact of contacts) {
        result[contact.jid] = {
            id: contact.jid,
            name: contact.name || undefined,
            notify: contact.notify || undefined,
            verifiedName: contact.verified_name || undefined,
            phoneNumber: contact.phone_number || undefined,
            lid: contact.lid || undefined
        }
    }
    
    return result
}

export function updateContactInStore(contact: Partial<Contact>) {
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

    // Salvar todos os identificadores no banco
    for (const identifier of identifiers) {
        if (!identifier) continue

        contactsDb.upsert({
            jid: identifier,
            name: contact.name,
            notify: contact.notify,
            verifiedName: contact.verifiedName,
            phoneNumber: contact.phoneNumber,
            lid: contact.lid
        })
    }
}

export function getContactFromStore(jid: string): Partial<Contact> | undefined {
    const normalizedJid = normalizeWhatsappJid(jid)
    
    // Buscar primeiro com JID normalizado
    let contact = contactsDb.get(normalizedJid || jid)
    
    if (!contact && normalizedJid !== jid) {
        // Tentar com JID original
        contact = contactsDb.get(jid)
    }

    if (!contact) return undefined

    return {
        id: contact.jid,
        name: contact.name || undefined,
        notify: contact.notify || undefined,
        verifiedName: contact.verified_name || undefined,
        phoneNumber: contact.phone_number || undefined,
        lid: contact.lid || undefined
    }
}

export function clearContactsStore() {
    // Não vamos limpar o banco de dados, mas podemos adicionar se necessário
    console.log('[CONTACTS] clearContactsStore chamado (não limpa BD permanente)')
}
