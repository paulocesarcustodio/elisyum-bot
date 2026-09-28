import { BotService } from "../services/bot.service.js"

export class BotController {
    private botService
    
    constructor(){
        this.botService = new BotService()
    }

    public initialize(){
        return this.botService.initialize()
    }

    public persistOnExit(){
        return this.botService.persistOnExit()
    }

    public startBot(hostNumber : string){
        return this.botService.startBot(hostNumber)
    }

    public migrateBot(){
        return this.botService.migrateBot()
    }

    public getBot(){
        return this.botService.getBot()
    }

    public setDbMigrated(status: boolean) {
        return this.botService.setDbMigrated(status)
    }    

    public incrementExecutedCommands(){
        return this.botService.incrementExecutedCommands()
    }

    public setCommandsPv(status: boolean){
        return this.botService.setCommandsPv(status)
    }

    public setCommandRate(status = true, maxCommandsMinute = 5, blockTime = 60){
        return this.botService.setCommandRate(status, maxCommandsMinute, blockTime)
    }

}
