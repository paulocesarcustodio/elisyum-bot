import { identityService } from './identity.service.js'
import { Participant } from "../interfaces/group.interface.js";
import { MessageTypes } from "../interfaces/message.interface.js";
import { deepMerge, timestampToDate } from '../utils/general.util.js'
import { normalizeWhatsappJid } from '../utils/whatsapp.util.js'
import moment from 'moment-timezone'
import { GroupMetadata } from "@whiskeysockets/baileys";
import NodeCache from "node-cache"
import { db } from "../database/db.js";
import { setBoundedCache } from "../utils/cache.util.js"

const REGISTERED_SINCE_FORMAT = 'DD/MM/YYYY HH:mm:ss'

const getOneStmt = db.prepare('SELECT * FROM participants WHERE group_id = ? AND user_id = ?')
const getByGroupStmt = db.prepare('SELECT * FROM participants WHERE group_id = ?')
const getAllStmt = db.prepare('SELECT * FROM participants')
const getAdminsStmt = db.prepare('SELECT * FROM participants WHERE group_id = ? AND admin = 1')
const getAdminsIdsStmt = db.prepare('SELECT user_id FROM participants WHERE group_id = ? AND admin = 1')
const insertStmt = db.prepare('INSERT INTO participants (group_id, user_id, registered_since, admin) VALUES (?, ?, ?, ?) ON CONFLICT (group_id, user_id) DO NOTHING')
const deleteStmt = db.prepare('DELETE FROM participants WHERE group_id = ? AND user_id = ?')
const deleteByGroupStmt = db.prepare('DELETE FROM participants WHERE group_id = ?')
const adminsCache = new NodeCache({ stdTTL: 30, checkperiod: 10 })

export class ParticipantService {
    private adminsCache = adminsCache
    private defaultParticipant : Participant = {
        group_id : '',
        user_id: '',
        registered_since: timestampToDate(moment.now()),
        commands: 0,
        admin: false,
        msgs: 0,
        image: 0,
        audio: 0,
        sticker: 0,
        video: 0,
        text: 0,
        other: 0,
        warnings: 0,
        antiflood : {
            expire: 0,
            msgs: 0
        }
    }

    private normalizeUserId(userId: string){
        return normalizeWhatsappJid(userId)
    }

    private async resolveUserId(groupId:string,userId:string) {
        const normalized=this.normalizeUserId(userId)
        if(!normalized)return ''
        const aliases=await identityService.aliases(normalized)
        const row=await db.prepare('SELECT user_id FROM participants WHERE group_id=? AND user_id=ANY(?::text[]) ORDER BY (user_id=?) DESC LIMIT 1').get(groupId,aliases,normalized)
        return row?.user_id || normalized
    }

    private resolveRegisteredSince(existing?: string, incoming?: string): string {
        const existingMoment = existing ? moment(existing, REGISTERED_SINCE_FORMAT, true) : null
        const incomingMoment = incoming ? moment(incoming, REGISTERED_SINCE_FORMAT, true) : null

        if (existingMoment?.isValid() && incomingMoment?.isValid()) {
            return existingMoment.isBefore(incomingMoment)
                ? existing ?? this.defaultParticipant.registered_since
                : incoming ?? this.defaultParticipant.registered_since
        }

        if (incomingMoment?.isValid()) {
            return incoming ?? this.defaultParticipant.registered_since
        }

        if (existingMoment?.isValid()) {
            return existing ?? this.defaultParticipant.registered_since
        }

        return this.defaultParticipant.registered_since
    }

    private mergeParticipantRecords(existing: Participant, incoming: Participant): Participant {
        const numericFields: (keyof Pick<Participant, 'commands' | 'msgs' | 'image' | 'audio' | 'sticker' | 'video' | 'text' | 'other' | 'warnings'>)[] = [
            'commands',
            'msgs',
            'image',
            'audio',
            'sticker',
            'video',
            'text',
            'other',
            'warnings'
        ]

        const merged: Participant = {
            ...this.defaultParticipant,
            ...existing,
            ...incoming
        }

        merged.group_id = incoming.group_id
        merged.user_id = incoming.user_id
        merged.admin = existing.admin || incoming.admin
        merged.registered_since = this.resolveRegisteredSince(existing.registered_since, incoming.registered_since)

        for (const field of numericFields) {
            const existingValue = existing[field] ?? 0
            const incomingValue = incoming[field] ?? 0
            merged[field] = existingValue + incomingValue
        }

        const existingFlood = existing.antiflood ?? this.defaultParticipant.antiflood
        const incomingFlood = incoming.antiflood ?? this.defaultParticipant.antiflood

        merged.antiflood = {
            expire: Math.max(existingFlood.expire ?? 0, incomingFlood.expire ?? 0),
            msgs: (existingFlood.msgs ?? 0) + (incomingFlood.msgs ?? 0)
        }

        return merged
    }

    private rowToParticipant(row: any): Participant {
        return {
            group_id: row.group_id,
            user_id: row.user_id,
            registered_since: row.registered_since || this.defaultParticipant.registered_since,
            commands: row.commands || 0,
            admin: row.admin === 1,
            msgs: row.msgs || 0,
            image: row.image || 0,
            audio: row.audio || 0,
            sticker: row.sticker || 0,
            video: row.video || 0,
            text: row.text_count || 0,
            other: row.other || 0,
            warnings: row.warnings || 0,
            antiflood: {
                expire: row.antiflood_expire || 0,
                msgs: row.antiflood_msgs || 0,
            },
        }
    }

    private async ensureParticipantRecord(groupId: string, normalizedUserId: string): Promise<Participant> {
        const existingRow = (await getOneStmt.get(groupId, normalizedUserId)) as any | undefined

        if (existingRow) {
            return this.rowToParticipant(existingRow)
        }

        ;(await insertStmt.run(groupId, normalizedUserId, this.defaultParticipant.registered_since, 0))
        return { ...this.defaultParticipant, group_id: groupId, user_id: normalizedUserId }
    }

    private async updateRole(groupId:string,userId:string,status:boolean){
        const identity=await identityService.resolve(userId)
        const account=process.env.BOT_ACCOUNT_ID || 'default'
        await db.prepare("DELETE FROM role_grants WHERE account_id=? AND identity_id=? AND scope=? AND role='group_moderator'").run(account,identity.id,groupId)
        if(status)await db.prepare("INSERT INTO role_grants(account_id,identity_id,scope,role) VALUES(?,?,?,'group_moderator') ON CONFLICT DO NOTHING").run(account,identity.id,groupId)
    }

    public async syncParticipants(groupMeta: GroupMetadata){
        await db.transaction(async()=>{
            const activeAliases=new Set<string>()
            for(const participant of groupMeta.participants){
                const data=participant as typeof participant & {phoneNumber?:string;lid?:string}
                const ids=[participant.id,data.phoneNumber,data.lid].filter((value):value is string=>!!value)
                if(!ids.length)continue
                const identity=await identityService.resolve(ids[0],ids.slice(1),'group-metadata')
                identity.aliases.forEach(alias=>activeAliases.add(alias))
                const existing=await db.prepare('SELECT user_id FROM participants WHERE group_id=? AND user_id=ANY(?::text[]) LIMIT 1').get(groupMeta.id,identity.aliases)
                const id=existing?.user_id || identity.primary
                await this.ensureParticipantRecord(groupMeta.id,id)
                await db.prepare('UPDATE participants SET admin=? WHERE group_id=? AND user_id=ANY(?::text[])').run(participant.admin ? 1:0,groupMeta.id,identity.aliases)
                await this.updateRole(groupMeta.id,id,!!participant.admin)
            }
            for(const participant of await this.getParticipantsFromGroup(groupMeta.id)){
                if(!activeAliases.has(participant.user_id))await this.removeParticipant(groupMeta.id,participant.user_id,{normalize:false})
            }
        })
        this.invalidateAdminsCache(groupMeta.id)
    }

    public async addParticipant(groupId: string, userId: string, isAdmin: boolean){
        const normalizedUserId = await this.resolveUserId(groupId,userId)
        if (!normalizedUserId) return
        await this.updateRole(groupId,normalizedUserId,isAdmin)
        const existing = (await getOneStmt.get(groupId, normalizedUserId)) as any | undefined
        if (existing) {
            if (isAdmin && existing.admin !== 1) {
                ;(await db.prepare('UPDATE participants SET admin = 1 WHERE group_id = ? AND user_id = ?').run(groupId, normalizedUserId))
                this.invalidateAdminsCache(groupId)
            }
            return
        }

        ;(await insertStmt.run(groupId, normalizedUserId, this.defaultParticipant.registered_since, isAdmin ? 1 : 0))
        this.invalidateAdminsCache(groupId)
    }

    public async migrateParticipants() {
        const participants = await this.getAllParticipants()

        for (let participant of participants) {
            const normalizedUserId = this.normalizeUserId(participant.user_id)

            if (!normalizedUserId) {
                ;(await deleteStmt.run(participant.group_id, participant.user_id))
                continue
            }

            const normalizedParticipant = { ...participant as any, user_id: normalizedUserId }
            const updatedParticipantData: Participant = deepMerge(this.defaultParticipant, normalizedParticipant)
            const existingRow = (await getOneStmt.get(participant.group_id, normalizedUserId)) as any | undefined

            if (existingRow) {
                const existingParticipant = this.rowToParticipant(existingRow)
                const merged = this.mergeParticipantRecords(existingParticipant, updatedParticipantData)
                const textCount = typeof merged.text === 'number' ? merged.text : (merged as any).text_count || 0
                ;(await db.prepare(`
                    UPDATE participants SET registered_since = ?, commands = ?, admin = ?, msgs = ?,
                        image = ?, audio = ?, sticker = ?, video = ?, text_count = ?, other = ?, warnings = ?,
                        antiflood_expire = ?, antiflood_msgs = ?
                    WHERE group_id = ? AND user_id = ?
                `).run(
                    merged.registered_since || null,
                    merged.commands || 0,
                    merged.admin ? 1 : 0,
                    merged.msgs || 0,
                    merged.image || 0,
                    merged.audio || 0,
                    merged.sticker || 0,
                    merged.video || 0,
                    textCount,
                    merged.other || 0,
                    merged.warnings || 0,
                    merged.antiflood?.expire || 0,
                    merged.antiflood?.msgs || 0,
                    participant.group_id, normalizedUserId
                ))
            } else {
                const textCount = typeof updatedParticipantData.text === 'number' ? updatedParticipantData.text : (updatedParticipantData as any).text_count || 0
                ;(await db.prepare(`
                    INSERT INTO participants (group_id, user_id, registered_since, commands, admin,
                        msgs, image, audio, sticker, video, text_count, other, warnings, antiflood_expire, antiflood_msgs)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (group_id, user_id) DO NOTHING
                `).run(
                    participant.group_id, normalizedUserId,
                    updatedParticipantData.registered_since || null,
                    updatedParticipantData.commands || 0,
                    updatedParticipantData.admin ? 1 : 0,
                    updatedParticipantData.msgs || 0,
                    updatedParticipantData.image || 0,
                    updatedParticipantData.audio || 0,
                    updatedParticipantData.sticker || 0,
                    updatedParticipantData.video || 0,
                    textCount,
                    updatedParticipantData.other || 0,
                    updatedParticipantData.warnings || 0,
                    updatedParticipantData.antiflood?.expire || 0,
                    updatedParticipantData.antiflood?.msgs || 0
                ))
            }

            if (normalizedUserId !== participant.user_id) {
                ;(await deleteStmt.run(participant.group_id, participant.user_id))
            }
        }
    }

    public async removeParticipant(groupId: string, userId: string, options: { normalize?: boolean } = {}){
        const shouldNormalize = options.normalize ?? true
        const targetUserId = shouldNormalize ? await this.resolveUserId(groupId,userId) : userId
        if (!targetUserId) return

        await this.updateRole(groupId,targetUserId,false)
        ;(await deleteStmt.run(groupId, targetUserId))
        this.invalidateAdminsCache(groupId)
    }

    public async removeParticipants(groupId: string){
        await db.prepare('DELETE FROM role_grants WHERE account_id=? AND scope=?').run(process.env.BOT_ACCOUNT_ID || 'default',groupId)
        ;(await deleteByGroupStmt.run(groupId))
        this.invalidateAdminsCache(groupId)
    }

    public async setAdmin(groupId: string, userId: string, status: boolean){
        const normalizedUserId = await this.resolveUserId(groupId,userId)
        if (!normalizedUserId) return

        await this.ensureParticipantRecord(groupId, normalizedUserId)
        await this.updateRole(groupId,normalizedUserId,status)
        ;(await db.prepare('UPDATE participants SET admin = ? WHERE group_id = ? AND user_id = ?').run(status ? 1 : 0, groupId, normalizedUserId))
        this.invalidateAdminsCache(groupId)
    }

    public async getParticipantFromGroup(groupId: string, userId: string){
        const normalizedUserId = await this.resolveUserId(groupId,userId)
        if (!normalizedUserId) return null

        const row = (await getOneStmt.get(groupId, normalizedUserId)) as any | undefined
        return row ? this.rowToParticipant(row) : null
    }

    public async getParticipantsFromGroup(groupId: string){
        const rows = (await getByGroupStmt.all(groupId)) as any[]
        return rows.map(row => this.rowToParticipant(row))
    }

    public async getAllParticipants() {
        const rows = (await getAllStmt.all()) as any[]
        return rows.map(row => this.rowToParticipant(row))
    }

    public async getParticipantsIdsFromGroup(groupId: string){
        const rows = (await getByGroupStmt.all(groupId)) as any[]
        return rows.map(row => row.user_id)
    }

    public async getAdminsFromGroup(groupId: string){
        const rows = (await getAdminsStmt.all(groupId)) as any[]
        return rows.map(row => this.rowToParticipant(row))
    }

    public async getAdminsIdsFromGroup(groupId: string){
        const cached = this.adminsCache.get<string[]>(`admins:${groupId}`)
        if (cached !== undefined) return cached

        const rows = (await getAdminsIdsStmt.all(groupId)) as any[]
        const adminIds = rows.map(row => row.user_id)
        setBoundedCache(this.adminsCache, `admins:${groupId}`, adminIds, 500)
        return adminIds
    }

    public invalidateAdminsCache(groupId: string) {
        this.adminsCache.del(`admins:${groupId}`)
    }

    public async isGroupParticipant(groupId: string, userId: string){
        const normalizedUserId = await this.resolveUserId(groupId,userId)
        if (!normalizedUserId) return false

        const row = (await getOneStmt.get(groupId, normalizedUserId)) as any | undefined
        return !!row
    }

    public async isGroupAdmin(groupId: string, userId: string){
        const normalizedUserId = await this.resolveUserId(groupId,userId)
        if (!normalizedUserId) return false

        const row = (await db.prepare('SELECT admin FROM participants WHERE group_id = ? AND user_id = ?').get(groupId, normalizedUserId)) as { admin: number } | undefined
        return row?.admin === 1
    }

    public async incrementParticipantActivity(groupId: string, userId: string, type: MessageTypes, isCommand: boolean){
        const normalizedUserId = await this.resolveUserId(groupId,userId)
        if (!normalizedUserId) return

        await this.ensureParticipantRecord(groupId, normalizedUserId)

        const incParts: string[] = ['msgs = msgs + 1']
        if (isCommand) incParts.push('commands = commands + 1')

        switch (type) {
            case "conversation":
            case "extendedTextMessage":
                incParts.push('text_count = text_count + 1')
                break
            case "imageMessage":
                incParts.push('image = image + 1')
                break
            case "videoMessage":
                incParts.push('video = video + 1')
                break
            case "stickerMessage":
                incParts.push('sticker = sticker + 1')
                break
            case "audioMessage":
                incParts.push('audio = audio + 1')
                break
            case "documentMessage":
                incParts.push('other = other + 1')
                break
        }

        ;(await db.prepare(`UPDATE participants SET ${incParts.join(', ')} WHERE group_id = ? AND user_id = ?`).run(groupId, normalizedUserId))
    }


}
