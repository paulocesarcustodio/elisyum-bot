import moment from "moment-timezone"
moment.tz.setDefault('America/Sao_Paulo')
import { SchedulerService } from './services/scheduler.service.js'
import { stopJobs } from './infrastructure/jobs.js'
import { db } from './database/client.js'
import connect, {closeGateway} from './socket.js'
import { buildText, getCurrentBotVersion } from "./utils/general.util.js"
import botTexts from "./helpers/bot.texts.helper.js"
import { waitForAuthPersistence } from './helpers/session.auth.helper.js'
import { BotController } from './controllers/bot.controller.js'

async function init(){
    process.env.ELYSIUM_ROLE ||= "gateway"
    console.log(buildText(botTexts.starting, getCurrentBotVersion()))
    await new BotController().initialize()
    await new SchedulerService().init()
    await connect()
}

let isShuttingDown = false

async function shutdown(signal: string){
    if (isShuttingDown) {
        return
    }

    isShuttingDown = true
    console.log(`[app] Recebido ${signal}. Aguardando persistência da autenticação...`)

    let exitCode=0
    try {
        await stopJobs()
        await closeGateway()
        await waitForAuthPersistence()
    } catch (error) {
        exitCode=1
        console.error('[app] Erro ao finalizar persistência da autenticação:', (error as Error).message)
    } finally {
        const botController = new BotController()
        try{await botController.persistOnExit()}catch(error){exitCode=1;console.error('[app] Persistência final:',(error as Error).message)}
        try{await db.close()}catch{exitCode=1}
        process.exit(exitCode)
    }
}

process.once('SIGINT', () => {
    void shutdown('SIGINT')
})

process.once('SIGTERM', () => {
    void shutdown('SIGTERM')
})

// Execução principal
init().catch(error=>{console.error("[Startup]",error.message);process.exit(1)})




