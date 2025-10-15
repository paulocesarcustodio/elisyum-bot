import { Contact } from '@whiskeysockets/baileys'
import { showConsoleError } from '../utils/general.util.js'
import { UserController } from '../controllers/user.controller.js'

export async function contactsUpdate(contacts: Partial<Contact>[]) {
    try {
        const userController = new UserController()
        
        for (const contact of contacts) {
            if (contact.id && contact.notify) {
                // Salva/atualiza o nome do contato no banco de dados
                await userController.registerUser(contact.id, contact.notify)
                console.log(`[CONTACTS] Nome atualizado: ${contact.notify} (${contact.id})`)
            }
        }
    } catch (err: any) {
        showConsoleError(err, "CONTACTS.UPDATE")
    }
}
