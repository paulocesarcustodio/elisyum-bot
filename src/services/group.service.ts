import { Group } from "../interfaces/group.interface.js";
import { GroupMetadata } from '@whiskeysockets/baileys'
import { normalizeWhatsappJid } from "../utils/whatsapp.util.js";
import { ParticipantService } from "./participant.service.js";
import { deepMerge } from "../utils/general.util.js";
import NodeCache from "node-cache"
import { db } from "../database/db.js";

const getStmt = db.prepare('SELECT * FROM groups_data WHERE id = ?')
const getAllStmt = db.prepare('SELECT * FROM groups_data')
const groupCache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

export class GroupService {
    private participantService
    private groupCache = groupCache

    private defaultGroup: Group = {
        id: '',
        name: '',
        description: undefined,
        commands_executed: 0,
        owner: undefined,
        restricted: false,
        expiration: undefined,
        muted: false,
        muted_members: [],
        welcome: {
            status: false,
            msg: ''
        },
        antifake: { 
            status: false, 
            exceptions: {
                prefixes: ['55'],
                numbers: []
            }
        },
        antilink: { 
            status: false, 
            exceptions: [] 
        },
        antiflood: { 
            status: false, 
            max_messages: 10, 
            interval: 10 
        },
        auto_reply: {
            status: false,
            config: [],
        },
        autosticker: false,
        block_cmds: [],
        blacklist: [],
        word_filter: []
    }

    constructor() {
        this.participantService = new ParticipantService()
    }

    private rowToGroup(row: any): Group {
        return {
            id: row.id,
            name: row.name || '',
            description: row.description || undefined,
            commands_executed: row.commands_executed || 0,
            owner: row.owner || undefined,
            restricted: row.restricted === 1,
            expiration: row.expiration || undefined,
            muted: row.muted === 1,
            muted_members: this.safeParseJSON(row.muted_members, []),
            welcome: {
                status: row.welcome_status === 1,
                msg: row.welcome_msg || '',
            },
            antifake: {
                status: row.antifake_status === 1,
                exceptions: this.safeParseJSON(row.antifake_exceptions, { prefixes: ['55'], numbers: [] }),
            },
            antilink: {
                status: row.antilink_status === 1,
                exceptions: this.safeParseJSON(row.antilink_exceptions, []),
            },
            antiflood: {
                status: row.antiflood_status === 1,
                max_messages: row.antiflood_max_messages || 10,
                interval: row.antiflood_interval || 10,
            },
            auto_reply: {
                status: row.auto_reply_status === 1,
                config: this.safeParseJSON(row.auto_reply_config, []),
            },
            autosticker: row.autosticker === 1,
            block_cmds: this.safeParseJSON(row.block_cmds, []),
            blacklist: this.safeParseJSON(row.blacklist, []),
            word_filter: this.safeParseJSON(row.word_filter, []),
        }
    }

    private safeParseJSON(value: any, fallback: any): any {
        if (!value) return fallback
        try {
            return JSON.parse(value)
        } catch {
            return fallback
        }
    }

    private groupToRow(group: Group): any[] {
        const welcome = group.welcome || { status: false, msg: '' }
        const antifake = group.antifake || { status: false, exceptions: { prefixes: ['55'], numbers: [] } }
        const antilink = group.antilink || { status: false, exceptions: [] }
        const antiflood = group.antiflood || { status: false, max_messages: 10, interval: 10 }
        const autoReply = group.auto_reply || { status: false, config: [] }

        return [
            group.id,
            group.name || '',
            group.description || null,
            group.commands_executed || 0,
            group.owner || null,
            group.restricted ? 1 : 0,
            group.expiration || null,
            group.muted ? 1 : 0,
            JSON.stringify(group.muted_members || []),
            welcome.status ? 1 : 0,
            welcome.msg || '',
            antifake.status ? 1 : 0,
            JSON.stringify(antifake.exceptions),
            antilink.status ? 1 : 0,
            JSON.stringify(antilink.exceptions),
            antiflood.status ? 1 : 0,
            antiflood.max_messages || 10,
            antiflood.interval || 10,
            autoReply.status ? 1 : 0,
            JSON.stringify(autoReply.config),
            group.autosticker ? 1 : 0,
            JSON.stringify(group.block_cmds || []),
            JSON.stringify(group.blacklist || []),
            JSON.stringify(group.word_filter || []),
        ]
    }

    private normalizeGroupUserList(list: unknown): string[] {
        const normalizedIds = new Set<string>()

        if (!Array.isArray(list)) {
            return []
        }

        for (const rawId of list) {
            if (typeof rawId !== 'string') {
                continue
            }

            const normalizedId = normalizeWhatsappJid(rawId)

            if (normalizedId) {
                normalizedIds.add(normalizedId)
            }
        }

        return Array.from(normalizedIds)
    }

    public async registerGroup(groupMetadata : GroupMetadata){
        const group = await this.getGroup(groupMetadata.id)

        if (group) return

        const groupData : Group = {
            ...this.defaultGroup,
            id: groupMetadata.id,
            name: groupMetadata.subject,
            description: groupMetadata.desc,
            owner: groupMetadata.owner,
            restricted: groupMetadata.announce,
            expiration: groupMetadata.ephemeralDuration
        }

        ;(await db.prepare(`
            INSERT INTO groups_data (id, name, description, commands_executed, owner, restricted, expiration,
                muted, muted_members, welcome_status, welcome_msg, antifake_status, antifake_exceptions,
                antilink_status, antilink_exceptions, antiflood_status, antiflood_max_messages, antiflood_interval,
                auto_reply_status, auto_reply_config, autosticker, block_cmds, blacklist, word_filter)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(...this.groupToRow(groupData)))

        this.invalidateGroupCache(groupMetadata.id)

        for (let participant of groupMetadata.participants) {
            const isAdmin = (participant.admin) ? true : false
            await this.participantService.addParticipant(groupMetadata.id, participant.id, isAdmin)
        }

        return groupData
    }

    public async migrateGroups() {
        const groups = await this.getAllGroups()

        for (const group of groups) {
            const oldGroupData = group as any
            const normalizedMutedMembers = this.normalizeGroupUserList(oldGroupData?.muted_members)
            const normalizedBlacklist = this.normalizeGroupUserList(oldGroupData?.blacklist)

            const updatedGroupData: Group = deepMerge(this.defaultGroup, {
                ...oldGroupData,
                muted_members: normalizedMutedMembers,
                blacklist: normalizedBlacklist
            })

            ;(await db.prepare(`
                UPDATE groups_data SET name = ?, description = ?, commands_executed = ?, owner = ?,
                    restricted = ?, expiration = ?, muted = ?, muted_members = ?, welcome_status = ?, welcome_msg = ?,
                    antifake_status = ?, antifake_exceptions = ?, antilink_status = ?, antilink_exceptions = ?,
                    antiflood_status = ?, antiflood_max_messages = ?, antiflood_interval = ?,
                    auto_reply_status = ?, auto_reply_config = ?, autosticker = ?, block_cmds = ?, blacklist = ?, word_filter = ?
                WHERE id = ?
            `).run(...this.groupToRow(updatedGroupData).slice(1), group.id))
        }
    }

    public async syncGroups(groupsMeta: GroupMetadata[]){
        const currentGroups = await this.getAllGroups()
        for (const group of currentGroups) {
            if (!groupsMeta.find(groupMeta => groupMeta.id == group.id)) {
                await this.removeGroup(group.id)
            }
        }
        
        for (let groupMeta of groupsMeta) {
            const group = await this.getGroup(groupMeta.id)

            if (group){
                ;(await db.prepare(`
                    UPDATE groups_data SET name = ?, description = ?, owner = ?, restricted = ?, expiration = ?
                    WHERE id = ?
                `).run(
                    groupMeta.subject,
                    groupMeta.desc || null,
                    groupMeta.owner || null,
                    groupMeta.announce ? 1 : 0,
                    groupMeta.ephemeralDuration || null,
                    groupMeta.id
                ))
                this.invalidateGroupCache(groupMeta.id)
                await this.participantService.syncParticipants(groupMeta)
            } else {
                await this.registerGroup(groupMeta)
            }
        }
    }

    public async updatePartialGroup(group: Partial<GroupMetadata>) {
        if (group.id){
            if (group.desc !== undefined) await this.setDescription(group.id, group.desc)
            if (group.subject !== undefined) await this.setName(group.id, group.subject)
            if (group.announce !== undefined) await this.setRestricted(group.id, group.announce)
            if (group.ephemeralDuration !== undefined) await this.setExpiration(group.id, group.ephemeralDuration)
        }
    }

    public async getGroup(groupId : string){
        const cached = this.groupCache.get<Group>(groupId)
        if (cached !== undefined) return cached

        const row = (await getStmt.get(groupId)) as any | undefined
        if (!row) return null

        const group = this.rowToGroup(row)
        if (!this.groupCache.has(groupId) && this.groupCache.keys().length >= 500) {
            const oldestGroupId = this.groupCache.keys()[0]
            if (oldestGroupId !== undefined) this.groupCache.del(oldestGroupId)
        }
        this.groupCache.set(groupId, group)
        return group
    }

    public async getAllGroups(){
        const rows = (await getAllStmt.all()) as any[]
        return rows.map(row => this.rowToGroup(row))
    }

    public async removeGroup(groupId: string){
        await this.participantService.removeParticipants(groupId)
        this.invalidateGroupCache(groupId)
        ;(await db.prepare('DELETE FROM groups_data WHERE id = ?').run(groupId))
        this.invalidateGroupCache(groupId)
    }

    public async setName(groupId: string, name: string){
        ;(await db.prepare('UPDATE groups_data SET name = ? WHERE id = ?').run(name, groupId))
        this.invalidateGroupCache(groupId)
    }

    public async setRestricted(groupId: string, restricted: boolean){
        ;(await db.prepare('UPDATE groups_data SET restricted = ? WHERE id = ?').run(restricted ? 1 : 0, groupId))
        this.invalidateGroupCache(groupId)
    }

    private async setExpiration(groupId: string, expiration: number | undefined){
        ;(await db.prepare('UPDATE groups_data SET expiration = ? WHERE id = ?').run(expiration || null, groupId))
        this.invalidateGroupCache(groupId)
    }

    public async setDescription(groupId: string, description?: string){
        ;(await db.prepare('UPDATE groups_data SET description = ? WHERE id = ?').run(description || null, groupId))
        this.invalidateGroupCache(groupId)
    }

    public async incrementGroupCommands(groupId: string){
        ;(await db.prepare('UPDATE groups_data SET commands_executed = commands_executed + 1 WHERE id = ?').run(groupId))
        this.invalidateGroupCache(groupId)
    } 






    public async setMuted(groupId: string, status: boolean){
        ;(await db.prepare('UPDATE groups_data SET muted = ? WHERE id = ?').run(status ? 1 : 0, groupId))
        this.invalidateGroupCache(groupId)
    }

    public async setMutedMember(groupId: string, userId: string){
        const group = await this.getGroup(groupId)

        if (!group) return

        const normalizedMutedMembers = this.normalizeGroupUserList(group.muted_members)

        if (normalizedMutedMembers.includes(userId)) return

        normalizedMutedMembers.push(userId)

        ;(await db.prepare('UPDATE groups_data SET muted_members = ? WHERE id = ?').run(JSON.stringify(normalizedMutedMembers), groupId))
        this.invalidateGroupCache(groupId)
    }

    public async unsetMutedMember(groupId: string, userId: string){
        const group = await this.getGroup(groupId)
        if (!group) return

        const mutedMembers = group.muted_members || []
        const filtered = mutedMembers.filter((m: string) => m !== userId)
        ;(await db.prepare('UPDATE groups_data SET muted_members = ? WHERE id = ?').run(JSON.stringify(filtered), groupId))
        this.invalidateGroupCache(groupId)
    }

    public async isMemberMuted(groupId: string, userId: string){
        const group = await this.getGroup(groupId)

        if (!group) return false

        if (!Array.isArray(group.muted_members)) {
            return false
        }

        return group.muted_members.includes(userId)
    }





    public async setBlacklist(groupId: string, userId: string, operation: 'add' | 'remove'){
        const group = await this.getGroup(groupId)

        if (!group) return

        const normalizedBlacklist = this.normalizeGroupUserList(group.blacklist)
        let updatedBlacklist = normalizedBlacklist

        if (operation == 'add'){
            if (normalizedBlacklist.includes(userId)) return
            updatedBlacklist = [...normalizedBlacklist, userId]
        } else {
            updatedBlacklist = normalizedBlacklist.filter(blacklistId => blacklistId !== userId)
        }

        ;(await db.prepare('UPDATE groups_data SET blacklist = ? WHERE id = ?').run(JSON.stringify(updatedBlacklist), groupId))
        this.invalidateGroupCache(groupId)
    }


    private invalidateGroupCache(groupId: string) {
        this.groupCache.del(groupId)
    }

}
