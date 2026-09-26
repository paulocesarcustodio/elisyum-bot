import { Contact } from '@whiskeysockets/baileys'
import { showConsoleError } from '../utils/general.util.js'
import { UserController } from '../controllers/user.controller.js'
import { updateContactInStore } from '../helpers/contacts.store.helper.js'
import { invalidateProfilePictureCache } from '../helpers/profile-picture.cache.helper.js'

export async function contactsUpdate(contacts: Partial<Contact>[]) {
    try {
        const userController = new UserController()
        
        for (const contact of contacts) {
            if (!contact.id) continue
            
            const nameToSave = contact.notify || contact.name || contact.verifiedName
            const avatarUpdate = contact.imgUrl === 'changed' ? 'removed' : contact.imgUrl
            updateContactInStore({ ...contact, imgUrl: avatarUpdate })
            invalidateProfilePictureCache(contact.id, contact.phoneNumber, contact.lid)

            // Prioridade de nomes: notify > name > verifiedName
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
