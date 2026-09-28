import {DisconnectReason, ConnectionState, WASocket} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { BotController } from '../controllers/bot.controller.js'
import { buildText, showConsoleError, colorText, askQuestion } from '../utils/general.util.js'
import botTexts from '../helpers/bot.texts.helper.js'
import { UserController } from '../controllers/user.controller.js'
import { getHostNumber } from '../utils/whatsapp.util.js'
import qrcode from 'qrcode-terminal'


export async function connectionQr(qr: string){
    if (qr) {
        await new Promise<void>(resolve => {
            qrcode.generate(qr, {small: true}, (qrcode: string) => {
                    console.log(qrcode)
                    resolve()
                })
        })
    }
}

export async function connectionPairingCode(client: WASocket){
    const answerNumber = await askQuestion(botTexts.input_phone_number)
    const code = await client.requestPairingCode(answerNumber.replace(/\W+/g,""))
    console.log(colorText(buildText(botTexts.show_pairing_code, code)))
}

export async function connectionOpen(client: WASocket){
    try{
        const botController = new BotController()
        await botController.startBot(getHostNumber(client))
        console.log(colorText(botTexts.bot_data))
        await checkOwnerRegister()
    } catch(err: any) {
        showConsoleError(err, "CONNECTION")
        throw err
    }
}

export async function connectionClose(connectionState : Partial<ConnectionState>){
    try{
        const { lastDisconnect } = connectionState
        let needReconnect = false
        const err: any = lastDisconnect?.error
        const boom = err?.isBoom ? err : new Boom(err)
        const errorCode = boom.output.statusCode

        if (lastDisconnect?.error?.message == "admin_command"){
            showConsoleError(new Error(botTexts.disconnected.command), 'CONNECTION')
        } else if (lastDisconnect?.error?.message == "fatal_error"){
            showConsoleError(new Error(botTexts.disconnected.fatal_error), 'CONNECTION')
        } else if (["gateway_lease_lost","gateway_shutdown"].includes(lastDisconnect?.error?.message || "")){
            return false
        } else {
            if (errorCode == DisconnectReason?.loggedOut){

                showConsoleError(new Error(botTexts.disconnected.logout), 'CONNECTION')
            } else if (errorCode == 405) {

                needReconnect = true
                showConsoleError(new Error('Conexão rejeitada com código 405; as credenciais foram preservadas.'), 'CONNECTION')
            } else if (errorCode == DisconnectReason?.restartRequired){
                needReconnect = true
                showConsoleError(new Error(botTexts.disconnected.restart), 'CONNECTION')
            } else {
                needReconnect = true
                showConsoleError(new Error(buildText(botTexts.disconnected.bad_connection, errorCode.toString(), lastDisconnect?.error?.message)), 'CONNECTION')
            }
        }

        return needReconnect
    } catch{
        return false
    }
}

 async function checkOwnerRegister(){
    const owner = await new UserController().getOwner()

    if (!owner){
        console.log(colorText(botTexts.owner_not_found, "#d63e3e"))
    } else {
        console.log(colorText(botTexts.owner_registered))
    }
}