import NodeCache from "node-cache"
import { Contact } from "@whiskeysockets/baileys"
import { normalizeWhatsappJid } from "../utils/whatsapp.util.js"

const CONTACTS_STORE_KEY = "contacts"

// Cache de 1 hora para contatos
const contactsStore = new NodeCache({ stdTTL: 3600, checkperiod: 600 })

export function getContactsStore(): Record<string, Partial<Contact>> {
    return contactsStore.get<Record<string, Partial<Contact>>>(CONTACTS_STORE_KEY) || {}
}

export function updateContactInStore(contact: Partial<Contact>) {
    if (!contact.id) return

    const contacts = getContactsStore()
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

    for (const identifier of identifiers) {
        if (!identifier) continue

        contacts[identifier] = {
            ...contacts[identifier],
            ...contact,
            id: contact.id
        }
    }

    contactsStore.set(CONTACTS_STORE_KEY, contacts)
}

export function getContactFromStore(jid: string): Partial<Contact> | undefined {
    const contacts = getContactsStore()
    const normalizedJid = normalizeWhatsappJid(jid)

    if (normalizedJid && contacts[normalizedJid]) {
        return contacts[normalizedJid]
    }

    return contacts[jid]
}

export function clearContactsStore() {
    contactsStore.del(CONTACTS_STORE_KEY)
}
