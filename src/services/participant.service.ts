import { Participant, Group } from "../interfaces/group.interface.js";
import { MessageTypes } from "../interfaces/message.interface.js";
import { deepMerge, timestampToDate } from '../utils/general.util.js'
import { normalizeWhatsappJid } from '../utils/whatsapp.util.js'
import moment from 'moment-timezone'
import DataStore from "@seald-io/nedb";
import { GroupMetadata } from "@whiskeysockets/baileys";

const REGISTERED_SINCE_FORMAT = 'DD/MM/YYYY HH:mm:ss'

const db = new DataStore<Participant>({filename : './storage/participants.groups.db', autoload: true})

export class ParticipantService {
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

    public async syncParticipants(groupMeta: GroupMetadata){
        //Adiciona participantes no banco de dados que entraram enquanto o bot estava off.
        for (const participant of groupMeta.participants) {
            const normalizedParticipantId = this.normalizeUserId(participant.id)
            const isAdmin = participant.admin ? true : false
            const isGroupParticipant = await this.isGroupParticipant(groupMeta.id, normalizedParticipantId)

            if (!isGroupParticipant) {
                await this.addParticipant(groupMeta.id, normalizedParticipantId, isAdmin)
            } else {
                await db.updateAsync({group_id: groupMeta.id, user_id: normalizedParticipantId}, { $set: { admin: isAdmin }})
            }
        }

        //Remove participantes do banco de dados que sairam do grupo enquanto o bot estava off.
        const normalizedParticipantIds = new Set(
            groupMeta.participants.map(participant => this.normalizeUserId(participant.id)).filter(Boolean)
        )
        const currentParticipants = await this.getParticipantsFromGroup(groupMeta.id)

        for (const participant of currentParticipants) {
            if (!normalizedParticipantIds.has(participant.user_id)) {
                await this.removeParticipant(groupMeta.id, participant.user_id, { normalize: false })
            }
        }
    }

    public async addParticipant(groupId: string, userId: string, isAdmin: boolean){
        const normalizedUserId = this.normalizeUserId(userId)
        if (!normalizedUserId) return

        const isGroupParticipant = await this.isGroupParticipant(groupId, normalizedUserId)

        if (isGroupParticipant) return

        const participant : Participant = {
            ...this.defaultParticipant,
            group_id : groupId,
            user_id: normalizedUserId,
            admin: isAdmin
        }

        await db.insertAsync(participant)
    }

    public async migrateParticipants() {
        const participants = await this.getAllParticipants()

        for (let participant of participants) {
            const normalizedUserId = this.normalizeUserId(participant.user_id)

            if (!normalizedUserId) {
                await db.removeAsync({ group_id: participant.group_id, user_id: participant.user_id }, { multi: false })
                continue
            }

            const normalizedParticipant = {
                ...(participant as any),
                user_id: normalizedUserId
            }

            const updatedParticipantData: Participant = deepMerge(this.defaultParticipant, normalizedParticipant)
            const existingParticipantRecord = await db.findOneAsync({ group_id: participant.group_id, user_id: normalizedUserId }) as Participant | null
            const currentParticipantId = (participant as any)._id as string | undefined
            const existingParticipantId = existingParticipantRecord
                ? (existingParticipantRecord as any)._id as string | undefined
                : undefined
            const isSameParticipantRecord = Boolean(
                existingParticipantRecord
                && currentParticipantId
                && existingParticipantId
                && currentParticipantId === existingParticipantId
            )
            const sanitizedExistingRecord = existingParticipantRecord && !isSameParticipantRecord
                ? deepMerge(this.defaultParticipant, existingParticipantRecord as any)
                : null

            const finalParticipantData = sanitizedExistingRecord
                ? this.mergeParticipantRecords(sanitizedExistingRecord, updatedParticipantData)
                : updatedParticipantData

            await db.updateAsync(
                { group_id: participant.group_id, user_id: normalizedUserId },
                { $set: finalParticipantData },
                { upsert: true }
            )

            if (normalizedUserId !== participant.user_id) {
                await db.removeAsync({ group_id: participant.group_id, user_id: participant.user_id }, { multi: false })
            }
        }
    }

    public async removeParticipant(groupId: string, userId: string, options: { normalize?: boolean } = {}){
        const shouldNormalize = options.normalize ?? true
        const targetUserId = shouldNormalize ? this.normalizeUserId(userId) : userId
        if (!targetUserId) return

        await db.removeAsync({group_id: groupId, user_id: targetUserId}, {})
    }

    public async removeParticipants(groupId: string){
        await db.removeAsync({group_id: groupId}, {multi: true})
    }

    public async setAdmin(groupId: string, userId: string, status: boolean){
        const normalizedUserId = this.normalizeUserId(userId)
        if (!normalizedUserId) return

        const existingParticipant = await db.findOneAsync({ group_id: groupId, user_id: normalizedUserId }) as Participant | null

        if (!existingParticipant) {
            const participant: Participant = {
                ...this.defaultParticipant,
                group_id: groupId,
                user_id: normalizedUserId,
                admin: status
            }

            await db.updateAsync(
                { group_id: groupId, user_id: normalizedUserId },
                participant,
                { upsert: true }
            )
            return
        }

        await db.updateAsync({group_id : groupId, user_id: normalizedUserId}, { $set: { admin: status }})
    }

    public async getParticipantFromGroup(groupId: string, userId: string){
        const normalizedUserId = this.normalizeUserId(userId)
        if (!normalizedUserId) return null

        const participant = await db.findOneAsync({group_id: groupId, user_id: normalizedUserId}) as Participant | null
        return participant
    }

    public async getParticipantsFromGroup(groupId: string){
        const participants = await db.findAsync({group_id: groupId}) as Participant[]
        return participants
    }

    public async getAllParticipants() {
        const participants = await db.findAsync({}) as Participant[]
        return participants
    }

    public async getParticipantsIdsFromGroup(groupId: string){
        const participants = await this.getParticipantsFromGroup(groupId)
        return participants.map(participant => participant.user_id)
    }

    public async getAdminsFromGroup(groupId: string){
        const admins = await db.findAsync({group_id: groupId, admin: true}) as Participant[]
        return admins
    }

    public async getAdminsIdsFromGroup(groupId: string){
        const admins = await db.findAsync({group_id: groupId, admin: true}) as Participant[]
        return admins.map(admin => admin.user_id)
    }

    public async isGroupParticipant(groupId: string, userId: string){
        const normalizedUserId = this.normalizeUserId(userId)
        if (!normalizedUserId) return false

        const participantsIds = await this.getParticipantsIdsFromGroup(groupId)
        return participantsIds.includes(normalizedUserId)
    }

    public async isGroupAdmin(groupId: string, userId: string){
        const normalizedUserId = this.normalizeUserId(userId)
        if (!normalizedUserId) return false

        const adminsIds = await this.getAdminsIdsFromGroup(groupId)
        return adminsIds.includes(normalizedUserId)
    }

    public async incrementParticipantActivity(groupId: string, userId: string, type: MessageTypes, isCommand: boolean){
        const normalizedUserId = this.normalizeUserId(userId)
        if (!normalizedUserId) return

        let incrementedUser : {
            msgs: number,
            commands?: number,
            text?: number,
            image?: number,
            video?: number,
            sticker?: number,
            audio?: number,
            other?: number
        } = { msgs: 1 }

        if (isCommand) incrementedUser.commands = 1
        
        switch (type) {
            case "conversation":
            case "extendedTextMessage":
                incrementedUser.text = 1
                break
            case "imageMessage":
                incrementedUser.image = 1
                break
            case "videoMessage":
                incrementedUser.video = 1
                break
            case "stickerMessage":
                incrementedUser.sticker = 1
                break
            case "audioMessage":
                incrementedUser.audio = 1
                break
            case "documentMessage":
                incrementedUser.other = 1
                break
        }

        await db.updateAsync({group_id : groupId, user_id: normalizedUserId}, {$inc: incrementedUser})
    }

    public async getParticipantActivityLowerThan(group: Group, num : number){
        const inactives = await db.findAsync({group_id : group.id, msgs: {$lt: num}}).sort({msgs: -1}) as Participant[]
        return inactives
    }

    public async getParticipantsActivityRanking(group: Group, qty: number){
        let participantsLeaderboard = await db.findAsync({group_id : group.id}).sort({msgs: -1}) as Participant[]
        const qty_leaderboard = (qty > participantsLeaderboard.length) ? participantsLeaderboard.length : qty
        return participantsLeaderboard.splice(0, qty_leaderboard)
    }

    public async addWarning(groupId: string, userId: string){
        const normalizedUserId = this.normalizeUserId(userId)
        if (!normalizedUserId) return

        await db.updateAsync({group_id: groupId, user_id: normalizedUserId}, { $inc: { warnings: 1} })
    }

    public async removeWarning(groupId: string, userId: string, currentWarnings: number){
        const normalizedUserId = this.normalizeUserId(userId)
        if (!normalizedUserId) return

        await db.updateAsync({group_id: groupId, user_id: normalizedUserId}, { $set: { warnings: --currentWarnings} })
    }

    public async removeParticipantsWarnings(groupId: string){
        await db.updateAsync({group_id: groupId}, { $set: { warnings: 0} })
    }

    public async expireParticipantAntiFlood(groupId: string, userId: string, newExpireTimestamp: number){
        const normalizedUserId = this.normalizeUserId(userId)
        if (!normalizedUserId) return

        await db.updateAsync({group_id: groupId, user_id: normalizedUserId}, { $set : { 'antiflood.expire': newExpireTimestamp, 'antiflood.msgs': 1 } })
    }

    public async incrementAntiFloodMessage(groupId: string, userId: string){
        const normalizedUserId = this.normalizeUserId(userId)
        if (!normalizedUserId) return

        await db.updateAsync({group_id: groupId, user_id: normalizedUserId}, { $inc : { 'antiflood.msgs': 1 } })
    }
}