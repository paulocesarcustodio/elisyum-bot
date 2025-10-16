import DataStore from "@seald-io/nedb";
import { jidNormalizedUser } from "@whiskeysockets/baileys";
import moment from "moment";
import { Bot } from "../interfaces/bot.interface.js";
import { User } from "../interfaces/user.interface.js";
import { deepMerge } from "../utils/general.util.js";
const db = new DataStore<User>({filename : './storage/users.db', autoload: true})

export class UserService {
    private defaultUser: User = {
        id: '',
        name: '',
        commands: 0,
        receivedWelcome: false,
        owner: false,
        admin: false,
        command_rate : {
            limited: false,
            expire_limited: 0,
            cmds: 1,
            expire_cmds: Math.round(moment.now()/1000) + 60
        }
    }

    public async registerUser(userId: string, name?: string|null){
        const normalizedId = this.normalizeUserId(userId)

        if (!this.isValidUserId(normalizedId)) return

        const normalizedName = name?.trim() || undefined
        const user = await this.getUser(normalizedId)

        if (user) {
            if (normalizedName && normalizedName !== user.name) {
                await this.setName(normalizedId, normalizedName)
            }
            return
        }
    
        const userData : User = {
            ...this.defaultUser,
            id: normalizedId,
            name: normalizedName || ''
        }

        await db.insertAsync(userData)
    }

    public async migrateUsers(){
        const users = await this.getUsers()

        for (let user of users) {
            const oldUserData = user as any
            const updatedUserData : User = deepMerge(this.defaultUser, oldUserData)    
            await db.updateAsync({ id: user.id}, { $set: updatedUserData }, { upsert: true })
        }
    }

    public async getUser (userId : string){
        const normalizedId = this.normalizeUserId(userId)

        if (!this.isValidUserId(normalizedId)) return null

        const user  = await db.findOneAsync({id: normalizedId}) as User | null
        return user
    }

    public async getUsers(){
        const users = await db.findAsync({}) as User[]
        return users
    }

    public async setAdmin(userId : string, admin: boolean){
        const normalizedId = this.normalizeUserId(userId)

        if (!this.isValidUserId(normalizedId)) return 0

        return db.updateAsync({id : normalizedId}, {$set: {admin}})
    }

    public async getAdmins(){
        const admins = await db.findAsync({admin : true}) as User[]
        return admins
    }

    public async setOwner(userId : string){
        const normalizedId = this.normalizeUserId(userId)

        if (!this.isValidUserId(normalizedId)) return 0

        return db.updateAsync({id : normalizedId}, {$set: {owner : true, admin: true}})
    }

    public async getOwner(){
        const owner = await db.findOneAsync({owner : true}) as User | null
        return owner
    }

    public async setName(userId : string, name : string){
        const normalizedId = this.normalizeUserId(userId)

        if (!this.isValidUserId(normalizedId)) return

        const trimmedName = name.trim()

        if (!trimmedName) return

        const existingUser = await this.getUser(normalizedId)

        if (existingUser) {
            await db.updateAsync({id: normalizedId}, {$set:{name: trimmedName}})
            return
        }

        const userData : User = {
            ...this.defaultUser,
            id: normalizedId,
            name: trimmedName
        }

        await db.insertAsync(userData)
    }

    public async setReceivedWelcome(userId: string, status = true){
        const normalizedId = this.normalizeUserId(userId)

        if (!this.isValidUserId(normalizedId)) return

        await db.updateAsync({id : normalizedId}, {$set : {receivedWelcome : status}})
    }

    public async increaseUserCommandsCount(userId: string){
        const normalizedId = this.normalizeUserId(userId)

        if (!this.isValidUserId(normalizedId)) return

        await db.updateAsync({id : normalizedId}, {$inc: {commands: 1}})
    }

    public async expireCommandsRate(userId: string, currentTimestamp: number){
        const normalizedId = this.normalizeUserId(userId)

        if (!this.isValidUserId(normalizedId)) return

        const expireTimestamp = currentTimestamp + 60
        await db.updateAsync({id: normalizedId}, { $set : { 'command_rate.expire_cmds': expireTimestamp, 'command_rate.cmds': 1 } })
    }

    public async incrementCommandRate(userId: string){
        const normalizedId = this.normalizeUserId(userId)

        if (!this.isValidUserId(normalizedId)) return

        await db.updateAsync({id: normalizedId}, { $inc : { "command_rate.cmds": 1 } })
    }

    public async setLimitedUser(userId: string, isLimited: boolean, botInfo: Bot, currentTimestamp: number){
        const normalizedId = this.normalizeUserId(userId)

        if (!this.isValidUserId(normalizedId)) return

        if (isLimited){
            await db.updateAsync({id: normalizedId}, { $set : { 'command_rate.limited': isLimited, 'command_rate.expire_limited': currentTimestamp + botInfo.command_rate.block_time} })
        } else {
            await db.updateAsync({id: normalizedId}, { $set : { 'command_rate.limited': isLimited, 'command_rate.expire_limited': 0, 'command_rate.cmds': 1, 'command_rate.expire_cmds': currentTimestamp + 60} })
        }
    }

    private normalizeUserId(userId: string){
        try {
            return jidNormalizedUser(userId)
        } catch {
            return userId
        }
    }

    private isValidUserId(userId: string){
        return typeof userId === 'string' && userId.endsWith('@s.whatsapp.net')
    }
}