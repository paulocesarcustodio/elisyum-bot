import { Bot } from "../interfaces/bot.interface.js";
import { User } from "../interfaces/user.interface.js";
import { UserService } from "../services/user.service.js";

export class UserController{
    private userService
    
    constructor(){
        this.userService = new UserService()
    }

    public registerUser(userId: string, name?: string|null){
        return this.userService.registerUser(userId, name)
    }

    public migrateUsers(){
        return this.userService.migrateUsers()
    }

    public setName(userId: string, name: string){
        return this.userService.setName(userId, name)
    }

    public async promoteUser(userId: string){
        const updatedDocs = await this.userService.setAdmin(userId, true)

        if (updatedDocs) {
            await this.invalidateAdminsCache()
        }
    }

    public async demoteUser(userId: string){
        const updatedDocs = await this.userService.setAdmin(userId, false)

        if (updatedDocs) {
            await this.invalidateAdminsCache()
        }
    }

    public async registerOwner(userId: string){
        const updatedDocs = await this.userService.setOwner(userId)

        if (updatedDocs) {
            await this.invalidateAdminsCache()
        }
    }

    public getUsers(){
        return this.userService.getUsers()
    }

    public getUser(userId: string){
        return this.userService.getUser(userId)
    }

    public getOwner(){
        return this.userService.getOwner()
    }

    public getAdmins(){
        return this.userService.getAdmins()
    }

    public setReceivedWelcome(userId: string, status = true){
        return this.userService.setReceivedWelcome(userId, status)
    }

    public increaseUserCommandsCount(userId: string){
        return this.userService.increaseUserCommandsCount(userId)
    }

    public async expireCommandsRate(userId: string, currentTimestamp: number){
        return this.userService.expireCommandsRate(userId, currentTimestamp)
    }

    public async incrementCommandRate(userId: string){
        return this.userService.incrementCommandRate(userId)
    }

    public setLimitedUser(userId: string, isLimited: boolean, botInfo: Bot, currentTimestamp: number){
        return this.userService.setLimitedUser(userId, isLimited, botInfo, currentTimestamp)
    }

    private async invalidateAdminsCache(){
        const { invalidateBotAdminsCache } = await import("../utils/whatsapp.util.js")
        invalidateBotAdminsCache()
    }

}
