import { Contact } from '@whiskeysockets/baileys'
import { showConsoleError } from '../utils/general.util.js'
import { UserController } from '../controllers/user.controller.js'
import { updateContactInStore } from '../helpers/contacts.store.helper.js'

export async function contactsUpdate(contacts: Partial<Contact>[]) {
    try {
        const userController = new UserController()
        
        for (const contact of contacts) {
            if (!contact.id) continue
            
            // Atualiza o store de contatos
            updateContactInStore(contact)
            
            // Prioridade de nomes: notify > name > verifiedName
            const nameToSave = contact.notify || contact.name || contact.verifiedName
            
            if (nameToSave && nameToSave.trim().length > 0) {
                // Salva/atualiza o nome do contato no banco de dados
                await userController.setName(contact.id, nameToSave.trim(), contact.phoneNumber, contact.lid)
                console.log(`[CONTACTS] Nome atualizado: ${nameToSave} (${contact.id})`)
            }
        }
    } catch (err: any) {
        showConsoleError(err, "CONTACTS.UPDATE")
    }
}
