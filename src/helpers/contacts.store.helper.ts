import NodeCache from "node-cache"
import { Contact } from "@whiskeysockets/baileys"

const CONTACTS_STORE_KEY = "contacts"

// Cache de 1 hora para contatos
const contactsStore = new NodeCache({ stdTTL: 3600, checkperiod: 600 })

export function getContactsStore(): Record<string, Partial<Contact>> {
    return contactsStore.get<Record<string, Partial<Contact>>>(CONTACTS_STORE_KEY) || {}
}

export function updateContactInStore(contact: Partial<Contact>) {
    if (!contact.id) return

    const contacts = getContactsStore()
    contacts[contact.id] = {
        ...contacts[contact.id],
        ...contact
    }
    contactsStore.set(CONTACTS_STORE_KEY, contacts)
}

export function getContactFromStore(jid: string): Partial<Contact> | undefined {
    const contacts = getContactsStore()
    return contacts[jid]
}

export function clearContactsStore() {
    contactsStore.del(CONTACTS_STORE_KEY)
}
