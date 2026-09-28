import { identityService } from './identity.service.js'
import { db } from "../database/db.js";
import { jidNormalizedUser } from "@whiskeysockets/baileys";
import moment from "moment";
import { Bot } from "../interfaces/bot.interface.js";
import { User } from "../interfaces/user.interface.js";
import { deepMerge } from "../utils/general.util.js";

const getStmt = db.prepare('SELECT * FROM users WHERE id = ?')
const getAllStmt = db.prepare('SELECT * FROM users')
const insertStmt = db.prepare('INSERT INTO users (id, name, commands, received_welcome, owner, command_rate_limited, command_rate_expire_limited, command_rate_cmds, command_rate_expire_cmds, help_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING')
const getOwnerStmt = db.prepare('SELECT * FROM users WHERE owner = 1 LIMIT 1')

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
        },
        helpLevel: 'detailed'
    }

    public async registerUser(userId: string, name?: string|null, ...alternateIds: (string | null | undefined)[]){
        const normalizedName = name?.trim() || undefined
        await this.ensureUserRecord(userId, alternateIds, normalizedName)
    }

    public async migrateUsers(){
        const users = (await getAllStmt.all()) as any[]

        for (let user of users) {
            const oldUserData = user as any
            const updatedUserData : User = deepMerge(this.defaultUser, oldUserData)
            await this.updateStmt(updatedUserData, user.id)
        }
    }

    public async getUser (userId : string, ...alternateIds: (string | null | undefined)[]){
        const candidates = [...new Set([...(await identityService.aliases(userId)),...this.buildCandidateIds(userId, alternateIds)])]

        for (const candidate of candidates) {
            const user = (await getStmt.get(candidate)) as User | undefined
            if (user) {
                return this.rowToUser(user)
            }
        }

        return null
    }

    private async updateStmt(data: User, id: string) {
        ;(await db.prepare(`
            UPDATE users SET name = ?, commands = ?, received_welcome = ?, owner = ?,
                command_rate_limited = ?, command_rate_expire_limited = ?, command_rate_cmds = ?, command_rate_expire_cmds = ?, help_level = ?
            WHERE id = ?
        `).run(
            data.name || '',
            data.commands || 0,
            data.receivedWelcome ? 1 : 0,
            data.owner ? 1 : 0,
            data.command_rate?.limited ? 1 : 0,
            data.command_rate?.expire_limited || 0,
            data.command_rate?.cmds || 1,
            data.command_rate?.expire_cmds || 0,
            data.helpLevel || 'detailed',
            id
        ))
    }

    public async getUsers(){
        const rows = (await getAllStmt.all()) as any[]
        return rows.map(row => this.rowToUser(row))
    }

    public async setOwner(userId : string, ...alternateIds: (string | null | undefined)[]){
        const user = await this.ensureUserRecord(userId, alternateIds)
        if (!user) return 0

        await db.transaction(async()=>{
            await db.prepare('UPDATE users SET owner = 1 WHERE id = ?').run(user.id)
            const identity=await identityService.resolve(user.id,alternateIds.filter((id):id is string=>!!id),'owner-registration')
            await db.prepare("INSERT INTO role_grants(account_id,identity_id,scope,role) VALUES (?,?,'global','owner') ON CONFLICT DO NOTHING").run(process.env.BOT_ACCOUNT_ID || 'default',identity.id)
        })
        return 1
    }

    public async getOwner(){
        const row = (await getOwnerStmt.get()) as any | undefined
        return row ? this.rowToUser(row) : null
    }

    public async setName(userId : string, name : string, ...alternateIds: (string | null | undefined)[]){
        const trimmedName = name.trim()
        if (!trimmedName) return

        await this.ensureUserRecord(userId, alternateIds, trimmedName)
    }

    public async setReceivedWelcome(userId: string, status = true, ...alternateIds: (string | null | undefined)[]){
        const user = await this.ensureUserRecord(userId, alternateIds)
        if (!user) return

        ;(await db.prepare('UPDATE users SET received_welcome = ? WHERE id = ?').run(status ? 1 : 0, user.id))
    }

    public async increaseUserCommandsCount(userId: string, ...alternateIds: (string | null | undefined)[]){
        const user = await this.ensureUserRecord(userId, alternateIds)
        if (!user) return

        ;(await db.prepare('UPDATE users SET commands = commands + 1 WHERE id = ?').run(user.id))
    }

    public async expireCommandsRate(userId: string, currentTimestamp: number, ...alternateIds: (string | null | undefined)[]){
        const user = await this.ensureUserRecord(userId, alternateIds)
        if (!user) return

        const expireTimestamp = currentTimestamp + 60
        ;(await db.prepare('UPDATE users SET command_rate_expire_cmds = ?, command_rate_cmds = 1 WHERE id = ?').run(expireTimestamp, user.id))
    }

    public async incrementCommandRate(userId: string, ...alternateIds: (string | null | undefined)[]){
        const user = await this.ensureUserRecord(userId, alternateIds)
        if (!user) return

        ;(await db.prepare('UPDATE users SET command_rate_cmds = command_rate_cmds + 1 WHERE id = ?').run(user.id))
    }

    public async setLimitedUser(userId: string, isLimited: boolean, botInfo: Bot, currentTimestamp: number, ...alternateIds: (string | null | undefined)[]){
        const user = await this.ensureUserRecord(userId, alternateIds)
        if (!user) return

        if (isLimited){
            ;(await db.prepare('UPDATE users SET command_rate_limited = 1, command_rate_expire_limited = ? WHERE id = ?').run(currentTimestamp + botInfo.command_rate.block_time, user.id))
        } else {
            ;(await db.prepare('UPDATE users SET command_rate_limited = 0, command_rate_expire_limited = 0, command_rate_cmds = 1, command_rate_expire_cmds = ? WHERE id = ?').run(currentTimestamp + 60, user.id))
        }
    }

    public async setHelpLevel(userId: string, level: 'simple' | 'detailed' | 'with-ai', ...alternateIds: (string | null | undefined)[]){
        const user = await this.ensureUserRecord(userId, alternateIds)
        if (!user) return

        ;(await db.prepare('UPDATE users SET help_level = ? WHERE id = ?').run(level, user.id))
    }

    public async getHelpLevel(userId: string, ...alternateIds: (string | null | undefined)[]): Promise<'simple' | 'detailed' | 'with-ai'> {
        const user = await this.getUser(userId, ...alternateIds)
        return user?.helpLevel || 'detailed'
    }

    private rowToUser(row: any): User {
        return {
            id: row.id,
            name: row.name || '',
            commands: row.commands || 0,
            receivedWelcome: row.received_welcome === 1,
            owner: row.owner === 1,
            command_rate: {
                limited: row.command_rate_limited === 1,
                expire_limited: row.command_rate_expire_limited || 0,
                cmds: row.command_rate_cmds || 1,
                expire_cmds: row.command_rate_expire_cmds || 0,
            },
            helpLevel: row.help_level || 'detailed',
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

        return userId
    }

    private isValidUserId(userId: string){
        if (typeof userId !== 'string') return false

        const normalized = this.tryNormalizeUserId(userId)
        if (normalized) return true

        const validSuffixes = ['@s.whatsapp.net', '@whatsapp.net', '@c.us', '@lid', '@hosted', '@hosted.lid']
        return validSuffixes.some(suffix => userId.endsWith(suffix))
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
        const supplied = this.buildCandidateIds(userId, alternateIds)
        if (!supplied.length || !this.isValidUserId(supplied[0])) return null
        const identity = await identityService.resolve(supplied[0],supplied.slice(1),'message-or-contact')
        const candidates = [identity.primary,...identity.aliases.filter(alias=>alias!==identity.primary)]

        if (!candidates.length) {
            return null
        }

        const canonicalId = candidates[0]

        if (!this.isValidUserId(canonicalId)) {
            return null
        }

        const normalizedName = name?.trim()
        const canonicalUser = (await getStmt.get(canonicalId)) as any | undefined

        if (canonicalUser) {
            if (normalizedName && canonicalUser.name !== normalizedName) {
                ;(await db.prepare('UPDATE users SET name = ? WHERE id = ?').run(normalizedName, canonicalId))
                canonicalUser.name = normalizedName
            }
            return this.rowToUser(canonicalUser)
        }

        for (const alternateId of candidates.slice(1)) {
            const fallbackRow = (await getStmt.get(alternateId)) as any | undefined
            if (fallbackRow) {
                if (normalizedName) await db.prepare('UPDATE users SET name=? WHERE id=?').run(normalizedName,alternateId)
                return this.rowToUser({...fallbackRow,name:normalizedName || fallbackRow.name})
            }
        }

        ;(await insertStmt.run(
            canonicalId,
            normalizedName || '',
            0, 0, 0, 0, 0, 1,
            Math.round(moment.now()/1000) + 60,
            'detailed'
        ))

        return {
            ...this.defaultUser,
            id: canonicalId,
            name: normalizedName || ''
        }
    }
}
