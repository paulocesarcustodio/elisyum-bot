import DataStore from "@seald-io/nedb"
import { jidNormalizedUser } from "@whiskeysockets/baileys"
import moment from "moment"
import { Bot } from "../interfaces/bot.interface.js"
import { User } from "../interfaces/user.interface.js"
import { deepMerge } from "../utils/general.util.js"
const db = new DataStore<User>({filename : './storage/users.db', autoload: true})

export class UserService {
    private defaultUser: User = {
        id: '',
        name: '',
        commands: 0,
        receivedWelcome: false,
        owner: false,
        command_rate : {
            limited: false,
            expire_limited: 0,
            cmds: 1,
            expire_cmds: Math.round(moment.now()/1000) + 60
        }
    }

    public async registerUser(userId: string, name?: string|null, ...alternateIds: (string | null | undefined)[]){
        const normalizedName = name?.trim() || undefined
        await this.ensureUserRecord(userId, alternateIds, normalizedName)
    }

    public async migrateUsers(){
        const users = await this.getUsers()

        for (let user of users) {
            const oldUserData = user as any
            const updatedUserData : User = deepMerge(this.defaultUser, oldUserData)
            await db.updateAsync({ id: user.id}, { $set: updatedUserData }, { upsert: true })
        }
    }

    public async getUser (userId : string, ...alternateIds: (string | null | undefined)[]){
        const candidates = this.buildCandidateIds(userId, alternateIds)

        for (const candidate of candidates) {
            const user  = await db.findOneAsync({id: candidate}) as User | null
            if (user) {
                return user
            }
        }

        return null
    }

    public async getUsers(){
        const users = await db.findAsync({}) as User[]
        return users
    }

    public async setOwner(userId : string, ...alternateIds: (string | null | undefined)[]){
        const user = await this.ensureUserRecord(userId, alternateIds)
        if (!user) return 0

        return db.updateAsync({id : user.id}, {$set: {owner : true}})
    }

    public async getOwner(){
        const owner = await db.findOneAsync({owner : true}) as User | null
        return owner
    }

    public async setName(userId : string, name : string, ...alternateIds: (string | null | undefined)[]){
        const trimmedName = name.trim()
        if (!trimmedName) return

        await this.ensureUserRecord(userId, alternateIds, trimmedName)
    }

    public async setReceivedWelcome(userId: string, status = true, ...alternateIds: (string | null | undefined)[]){
        const user = await this.ensureUserRecord(userId, alternateIds)
        if (!user) return

        await db.updateAsync({id : user.id}, {$set : {receivedWelcome : status}})
    }

    public async increaseUserCommandsCount(userId: string, ...alternateIds: (string | null | undefined)[]){
        const user = await this.ensureUserRecord(userId, alternateIds)
        if (!user) return

        await db.updateAsync({id : user.id}, {$inc: {commands: 1}})
    }

    public async expireCommandsRate(userId: string, currentTimestamp: number, ...alternateIds: (string | null | undefined)[]){
        const user = await this.ensureUserRecord(userId, alternateIds)
        if (!user) return

        const expireTimestamp = currentTimestamp + 60
        await db.updateAsync({id: user.id}, { $set : { 'command_rate.expire_cmds': expireTimestamp, 'command_rate.cmds': 1 } })
    }

    public async incrementCommandRate(userId: string, ...alternateIds: (string | null | undefined)[]){
        const user = await this.ensureUserRecord(userId, alternateIds)
        if (!user) return

        await db.updateAsync({id: user.id}, { $inc : { 'command_rate.cmds': 1 } })
    }

    public async setLimitedUser(userId: string, isLimited: boolean, botInfo: Bot, currentTimestamp: number, ...alternateIds: (string | null | undefined)[]){
        const user = await this.ensureUserRecord(userId, alternateIds)
        if (!user) return

        if (isLimited){
            await db.updateAsync({id: user.id}, { $set : { 'command_rate.limited': isLimited, 'command_rate.expire_limited': currentTimestamp + botInfo.command_rate.block_time} })
        } else {
            await db.updateAsync({id: user.id}, { $set : { 'command_rate.limited': isLimited, 'command_rate.expire_limited': 0, 'command_rate.cmds': 1, 'command_rate.expire_cmds': currentTimestamp + 60} })
        }
    }

    private tryNormalizeUserId(userId: string){
        if (typeof userId !== 'string') {
            return undefined
        }

        try {
            const normalized = jidNormalizedUser(userId)
            return normalized || undefined
        } catch {
            return undefined
        }
    }

    private normalizeUserId(userId: string){
        if (typeof userId !== 'string') {
            return userId
        }

        const normalized = this.tryNormalizeUserId(userId)
        if (normalized) {
            return normalized
        }

        if (userId.endsWith('@whatsapp.net')) {
            return userId.replace('@whatsapp.net', '@s.whatsapp.net')
        }

        if (userId.endsWith('@c.us')) {
            return userId.replace('@c.us', '@s.whatsapp.net')
        }

        return userId
    }

    private isValidUserId(userId: string){
        if (typeof userId !== 'string') return false

        const normalized = this.tryNormalizeUserId(userId) ?? userId
        const validSuffixes = ['@s.whatsapp.net', '@whatsapp.net', '@c.us', '@lid', '@hosted', '@hosted.lid']
        return validSuffixes.some(suffix => normalized.endsWith(suffix))
    }

    private getIdPriority(id: string){
        if (id.endsWith('@lid') || id.endsWith('@hosted.lid')) return 0
        if (id.endsWith('@hosted')) return 1
        if (id.endsWith('@s.whatsapp.net')) return 2
        if (id.endsWith('@whatsapp.net') || id.endsWith('@c.us')) return 3
        return 4
    }

    private buildCandidateIds(userId: string, alternateIds: (string | null | undefined)[] = []){
        const identifiers = new Set<string>()
        const add = (value?: string | null) => {
            if (!value || typeof value !== 'string') {
                return
            }

            const normalized = this.normalizeUserId(value)

            if (this.isValidUserId(normalized)) {
                identifiers.add(normalized)
            }
        }

        add(userId)
        for (const alternate of alternateIds) {
            add(alternate)
        }

        if (!identifiers.size) {
            if (typeof userId === 'string') {
                identifiers.add(userId)
            }

            for (const alternate of alternateIds) {
                if (typeof alternate === 'string') {
                    identifiers.add(alternate)
                }
            }
        }

        return Array.from(identifiers).sort((a, b) => this.getIdPriority(a) - this.getIdPriority(b))
    }

    private async ensureUserRecord(userId: string, alternateIds: (string | null | undefined)[] = [], name?: string | null){
        const candidates = this.buildCandidateIds(userId, alternateIds)

        if (!candidates.length) {
            return null
        }

        const canonicalId = candidates[0]

        if (!this.isValidUserId(canonicalId)) {
            return null
        }

        const normalizedName = name?.trim()

        const canonicalUser = await db.findOneAsync({id: canonicalId}) as User | null

        if (canonicalUser) {
            if (normalizedName && canonicalUser.name !== normalizedName) {
                await db.updateAsync({id: canonicalId}, {$set: {name: normalizedName}})
                canonicalUser.name = normalizedName
            }
            return canonicalUser
        }

        for (const alternateId of candidates.slice(1)) {
            const fallbackUser = await db.findOneAsync({id: alternateId}) as User | null
            if (fallbackUser) {
                const updateFields: Partial<User> = { id: canonicalId }

                if (normalizedName) {
                    updateFields.name = normalizedName
                }

                await db.updateAsync({id: alternateId}, { $set: updateFields }, {})
                const migratedUser = await db.findOneAsync({id: canonicalId}) as User | null
                return migratedUser ?? { ...fallbackUser, ...updateFields }
            }
        }

        const userData : User = {
            ...this.defaultUser,
            id: canonicalId,
            name: normalizedName || ''
        }

        await db.insertAsync(userData)
        return userData
    }
}
