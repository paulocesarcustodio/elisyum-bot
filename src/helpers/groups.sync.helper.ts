import { WASocket } from '@whiskeysockets/baileys'
import { BotController } from '../controllers/bot.controller.js'
import { buildText, showConsoleError, colorText } from '../utils/general.util.js'
import { GroupController } from '../controllers/group.controller.js'
import botTexts from '../helpers/bot.texts.helper.js'
import * as waUtil from '../utils/whatsapp.util.js'

export async function syncGroupsOnStart(client: WASocket){
    try{
        const groupsMetadata = await waUtil.getAllGroups(client)

        if (groupsMetadata.length){
            let groupController = new GroupController()
            await groupController.syncGroups(groupsMetadata)

            console.log(colorText(botTexts.groups_loaded))
        }

        return true
    } catch(err: any){
        showConsoleError(err, "GROUPS-START-UPDATE")
        throw err
    }
}
