import { Bot } from "../interfaces/bot.interface.js";
import { User } from "../interfaces/user.interface.js";
import { UserService } from "../services/user.service.js";

export class UserController{
    private userService
    
    constructor(){
        this.userService = new UserService()
    }

    public registerUser(userId: string, name?: string|null, ...alternateIds: (string | null | undefined)[]){
        return this.userService.registerUser(userId, name, ...alternateIds)
    }

    public migrateUsers(){
        return this.userService.migrateUsers()
    }

    public setName(userId: string, name: string, ...alternateIds: (string | null | undefined)[]){
        return this.userService.setName(userId, name, ...alternateIds)
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

    public async registerOwner(userId: string, ...alternateIds: (string | null | undefined)[]){
        const updatedDocs = await this.userService.setOwner(userId, ...alternateIds)

        if (updatedDocs) {
            await this.invalidateAdminsCache()
        }
    }

    public getUsers(){
        return this.userService.getUsers()
    }

    public getUser(userId: string, ...alternateIds: (string | null | undefined)[]){
        return this.userService.getUser(userId, ...alternateIds)
    }

    public getOwner(){
        return this.userService.getOwner()
    }

    public getAdmins(){
        return this.userService.getAdmins()
    }

    public setReceivedWelcome(userId: string, status = true, ...alternateIds: (string | null | undefined)[]){
        return this.userService.setReceivedWelcome(userId, status, ...alternateIds)
    }

    public increaseUserCommandsCount(userId: string, ...alternateIds: (string | null | undefined)[]){
        return this.userService.increaseUserCommandsCount(userId, ...alternateIds)
    }

    public async expireCommandsRate(userId: string, currentTimestamp: number, ...alternateIds: (string | null | undefined)[]){
        return this.userService.expireCommandsRate(userId, currentTimestamp, ...alternateIds)
    }

    public async incrementCommandRate(userId: string, ...alternateIds: (string | null | undefined)[]){
        return this.userService.incrementCommandRate(userId, ...alternateIds)
    }

    public setLimitedUser(userId: string, isLimited: boolean, botInfo: Bot, currentTimestamp: number, ...alternateIds: (string | null | undefined)[]){
        return this.userService.setLimitedUser(userId, isLimited, botInfo, currentTimestamp, ...alternateIds)
    }

    private async invalidateAdminsCache(){
        const { invalidateBotAdminsCache } = await import("../utils/whatsapp.util.js")
        invalidateBotAdminsCache()
    }

}
