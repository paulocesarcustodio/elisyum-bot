import { Participant, Group } from "../interfaces/group.interface.js";
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
const getInactiveStmt = (limit: number) => db.prepare('SELECT * FROM participants WHERE group_id = ? AND msgs < ? ORDER BY msgs DESC')
const getRankingStmt = (limit: number) => db.prepare('SELECT * FROM participants WHERE group_id = ? ORDER BY msgs DESC LIMIT ?')
const insertStmt = db.prepare('INSERT OR IGNORE INTO participants (group_id, user_id, registered_since, admin) VALUES (?, ?, ?, ?)')
const deleteStmt = db.prepare('DELETE FROM participants WHERE group_id = ? AND user_id = ?')
const deleteByGroupStmt = db.prepare('DELETE FROM participants WHERE group_id = ?')

export class ParticipantService {
    private adminsCache = new NodeCache({ stdTTL: 30, checkperiod: 10 })
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
        const existingRow = getOneStmt.get(groupId, normalizedUserId) as any | undefined

        if (existingRow) {
            return this.rowToParticipant(existingRow)
        }

        insertStmt.run(groupId, normalizedUserId, this.defaultParticipant.registered_since, 0)
        return { ...this.defaultParticipant, group_id: groupId, user_id: normalizedUserId }
    }

    public async syncParticipants(groupMeta: GroupMetadata){
        let adminsChanged = false
        for (const participant of groupMeta.participants) {
            const participantData = participant as typeof participant & { phoneNumber?: string; lid?: string }
            const participantIds = [...new Set([
                this.normalizeUserId(participant.id),
                this.normalizeUserId(participantData.phoneNumber || ''),
                this.normalizeUserId(participantData.lid || '')
            ].filter(Boolean))]
            const existingParticipant = participantIds
                .map(id => getOneStmt.get(groupMeta.id, id) as { user_id: string } | undefined)
                .find((row): row is { user_id: string } => !!row)
            const normalizedParticipantId = existingParticipant?.user_id || participantIds[0]
            if (!normalizedParticipantId) continue
            const isAdmin = participant.admin ? true : false
            const isGroupParticipant = await this.isGroupParticipant(groupMeta.id, normalizedParticipantId)

            if (!isGroupParticipant) {
                await this.addParticipant(groupMeta.id, normalizedParticipantId, isAdmin)
            } else {
                db.prepare('UPDATE participants SET admin = ? WHERE group_id = ? AND user_id = ?').run(isAdmin ? 1 : 0, groupMeta.id, normalizedParticipantId)
            }
            adminsChanged = true
        }

        const normalizedParticipantIds = new Set(
            groupMeta.participants.flatMap(participant => {
                const participantData = participant as typeof participant & { phoneNumber?: string; lid?: string }
                return [participant.id, participantData.phoneNumber, participantData.lid]
                    .map(id => this.normalizeUserId(id || ''))
                    .filter(Boolean)
            })
        )
        const currentParticipants = await this.getParticipantsFromGroup(groupMeta.id)

        for (const participant of currentParticipants) {
            if (!normalizedParticipantIds.has(participant.user_id)) {
                await this.removeParticipant(groupMeta.id, participant.user_id, { normalize: false })
            }
        }

        if (adminsChanged) this.invalidateAdminsCache(groupMeta.id)
    }

    public async addParticipant(groupId: string, userId: string, isAdmin: boolean){
        const normalizedUserId = this.normalizeUserId(userId)
        if (!normalizedUserId) return

        const existing = getOneStmt.get(groupId, normalizedUserId) as any | undefined
        if (existing) {
            if (isAdmin && existing.admin !== 1) {
                db.prepare('UPDATE participants SET admin = 1 WHERE group_id = ? AND user_id = ?').run(groupId, normalizedUserId)
                this.invalidateAdminsCache(groupId)
            }
            return
        }

        insertStmt.run(groupId, normalizedUserId, this.defaultParticipant.registered_since, isAdmin ? 1 : 0)
        this.invalidateAdminsCache(groupId)
    }

    public async migrateParticipants() {
        const participants = await this.getAllParticipants()

        for (let participant of participants) {
            const normalizedUserId = this.normalizeUserId(participant.user_id)

            if (!normalizedUserId) {
                deleteStmt.run(participant.group_id, participant.user_id)
                continue
            }

            const normalizedParticipant = { ...participant as any, user_id: normalizedUserId }
            const updatedParticipantData: Participant = deepMerge(this.defaultParticipant, normalizedParticipant)
            const existingRow = getOneStmt.get(participant.group_id, normalizedUserId) as any | undefined

            if (existingRow) {
                const existingParticipant = this.rowToParticipant(existingRow)
                const merged = this.mergeParticipantRecords(existingParticipant, updatedParticipantData)
                const textCount = typeof merged.text === 'number' ? merged.text : (merged as any).text_count || 0
                db.prepare(`
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
                )
            } else {
                const textCount = typeof updatedParticipantData.text === 'number' ? updatedParticipantData.text : (updatedParticipantData as any).text_count || 0
                db.prepare(`
                    INSERT OR REPLACE INTO participants (group_id, user_id, registered_since, commands, admin,
                        msgs, image, audio, sticker, video, text_count, other, warnings, antiflood_expire, antiflood_msgs)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                )
            }

            if (normalizedUserId !== participant.user_id) {
                deleteStmt.run(participant.group_id, participant.user_id)
            }
        }
    }

    public async removeParticipant(groupId: string, userId: string, options: { normalize?: boolean } = {}){
        const shouldNormalize = options.normalize ?? true
        const targetUserId = shouldNormalize ? this.normalizeUserId(userId) : userId
        if (!targetUserId) return

        deleteStmt.run(groupId, targetUserId)
        this.invalidateAdminsCache(groupId)
    }

    public async removeParticipants(groupId: string){
        deleteByGroupStmt.run(groupId)
        this.invalidateAdminsCache(groupId)
    }

    public async setAdmin(groupId: string, userId: string, status: boolean){
        const normalizedUserId = this.normalizeUserId(userId)
        if (!normalizedUserId) return

        await this.ensureParticipantRecord(groupId, normalizedUserId)
        db.prepare('UPDATE participants SET admin = ? WHERE group_id = ? AND user_id = ?').run(status ? 1 : 0, groupId, normalizedUserId)
        this.invalidateAdminsCache(groupId)
    }

    public async getParticipantFromGroup(groupId: string, userId: string){
        const normalizedUserId = this.normalizeUserId(userId)
        if (!normalizedUserId) return null

        const row = getOneStmt.get(groupId, normalizedUserId) as any | undefined
        return row ? this.rowToParticipant(row) : null
    }

    public async getParticipantsFromGroup(groupId: string){
        const rows = getByGroupStmt.all(groupId) as any[]
        return rows.map(row => this.rowToParticipant(row))
    }

    public async getAllParticipants() {
        const rows = getAllStmt.all() as any[]
        return rows.map(row => this.rowToParticipant(row))
    }

    public async getParticipantsIdsFromGroup(groupId: string){
        const rows = getByGroupStmt.all(groupId) as any[]
        return rows.map(row => row.user_id)
    }

    public async getAdminsFromGroup(groupId: string){
        const rows = getAdminsStmt.all(groupId) as any[]
        return rows.map(row => this.rowToParticipant(row))
    }

    public async getAdminsIdsFromGroup(groupId: string){
        const cached = this.adminsCache.get<string[]>(`admins:${groupId}`)
        if (cached !== undefined) return cached

        const rows = getAdminsIdsStmt.all(groupId) as any[]
        const adminIds = rows.map(row => row.user_id)
        setBoundedCache(this.adminsCache, `admins:${groupId}`, adminIds, 500)
        return adminIds
    }

    public invalidateAdminsCache(groupId: string) {
        this.adminsCache.del(`admins:${groupId}`)
    }

    public async isGroupParticipant(groupId: string, userId: string){
        const normalizedUserId = this.normalizeUserId(userId)
        if (!normalizedUserId) return false

        const row = getOneStmt.get(groupId, normalizedUserId) as any | undefined
        return !!row
    }

    public async isGroupAdmin(groupId: string, userId: string){
        const normalizedUserId = this.normalizeUserId(userId)
        if (!normalizedUserId) return false

        const row = db.prepare('SELECT admin FROM participants WHERE group_id = ? AND user_id = ?').get(groupId, normalizedUserId) as { admin: number } | undefined
        return row?.admin === 1
    }

    public async incrementParticipantActivity(groupId: string, userId: string, type: MessageTypes, isCommand: boolean){
        const normalizedUserId = this.normalizeUserId(userId)
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

        db.prepare(`UPDATE participants SET ${incParts.join(', ')} WHERE group_id = ? AND user_id = ?`).run(groupId, normalizedUserId)
    }

    public async getParticipantActivityLowerThan(group: Group, num : number){
        const rows = getInactiveStmt(num).all(group.id, num) as any[]
        return rows.map(row => this.rowToParticipant(row))
    }

    public async getParticipantsActivityRanking(group: Group, qty: number){
        const rows = getRankingStmt(qty).all(group.id, qty) as any[]
        return rows.map(row => this.rowToParticipant(row))
    }

    public async addWarning(groupId: string, userId: string){
        const normalizedUserId = this.normalizeUserId(userId)
        if (!normalizedUserId) return

        await this.ensureParticipantRecord(groupId, normalizedUserId)
        db.prepare('UPDATE participants SET warnings = warnings + 1 WHERE group_id = ? AND user_id = ?').run(groupId, normalizedUserId)
    }

    public async removeWarning(groupId: string, userId: string, currentWarnings: number){
        const normalizedUserId = this.normalizeUserId(userId)
        if (!normalizedUserId) return

        await this.ensureParticipantRecord(groupId, normalizedUserId)
        db.prepare('UPDATE participants SET warnings = ? WHERE group_id = ? AND user_id = ?').run(Math.max(0, currentWarnings - 1), groupId, normalizedUserId)
    }

    public async removeParticipantsWarnings(groupId: string){
        db.prepare('UPDATE participants SET warnings = 0 WHERE group_id = ?').run(groupId)
    }

    public async expireParticipantAntiFlood(groupId: string, userId: string, newExpireTimestamp: number){
        const normalizedUserId = this.normalizeUserId(userId)
        if (!normalizedUserId) return

        await this.ensureParticipantRecord(groupId, normalizedUserId)
        db.prepare('UPDATE participants SET antiflood_expire = ?, antiflood_msgs = 1 WHERE group_id = ? AND user_id = ?').run(newExpireTimestamp, groupId, normalizedUserId)
    }

    public async incrementAntiFloodMessage(groupId: string, userId: string){
        const normalizedUserId = this.normalizeUserId(userId)
        if (!normalizedUserId) return

        await this.ensureParticipantRecord(groupId, normalizedUserId)
        db.prepare('UPDATE participants SET antiflood_msgs = antiflood_msgs + 1 WHERE group_id = ? AND user_id = ?').run(groupId, normalizedUserId)
    }
}
