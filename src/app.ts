import moment from "moment-timezone"
moment.tz.setDefault('America/Sao_Paulo')
import { botUpdater } from './helpers/bot.updater.helper.js'
import connect from './socket.js'
import ffmpeg from "fluent-ffmpeg"
import { buildText, getCurrentBotVersion } from "./utils/general.util.js"
import botTexts from "./helpers/bot.texts.helper.js"
import { waitForAuthPersistence } from './helpers/session.auth.helper.js'
import('@ffmpeg-installer/ffmpeg').then((ffmpegInstaller)=>{
    ffmpeg.setFfmpegPath(ffmpegInstaller.path)
}).catch(()=>{})

async function init(){
    console.log(buildText(botTexts.starting, getCurrentBotVersion()))
    let hasBotUpdated = await botUpdater()
    
    if (!hasBotUpdated) {
        connect()
    }
}

let isShuttingDown = false

async function shutdown(signal: string){
    if (isShuttingDown) {
        return
    }

    isShuttingDown = true
    console.log(`[app] Recebido ${signal}. Aguardando persistência da autenticação...`)

    try {
        await waitForAuthPersistence()
    } catch (error) {
        console.error('[app] Erro ao finalizar persistência da autenticação:', error)
    } finally {
        process.exit(0)
    }
}

process.once('SIGINT', () => {
    void shutdown('SIGINT')
})

process.once('SIGTERM', () => {
    void shutdown('SIGTERM')
})

// Execução principal
init()





