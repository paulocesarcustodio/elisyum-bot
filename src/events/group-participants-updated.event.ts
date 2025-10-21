import { WASocket, ParticipantAction, GroupParticipant } from '@whiskeysockets/baileys'
import { buildText, showConsoleError} from '../utils/general.util.js'
import { Bot } from '../interfaces/bot.interface.js'
import { Group } from '../interfaces/group.interface.js'
import { GroupController } from '../controllers/group.controller.js'
import botTexts from '../helpers/bot.texts.helper.js'
import { removeParticipant, sendTextWithMentions, removeWhatsappSuffix, addWhatsappSuffix, normalizeWhatsappJid } from '../utils/whatsapp.util.js'

type ParticipantLike = GroupParticipant | string

export type ParticipantsUpdateEvent = {
    id: string
    author: string
    authorPn?: string
    participants: ParticipantLike[]
    action: ParticipantAction
}

export async function groupParticipantsUpdated(client: WASocket, event: ParticipantsUpdateEvent, botInfo: Bot) {
    try{
        const groupController = new GroupController()
        const group = await groupController.getGroup(event.id)
        const normalizedBotNumber = normalizeWhatsappJid(botInfo.host_number)

        if (!group) {
            return
        }

        const ensureMutedMembers = (): string[] => {
            const mutedMembers = Array.isArray(group.muted_members) ? group.muted_members : []
            const normalizedMembers = mutedMembers
                .map(memberId => normalizeWhatsappJid(memberId))
                .filter((memberId): memberId is string => !!memberId)

            group.muted_members = normalizedMembers
            return normalizedMembers
        }

        const participants = (event.participants ?? []).map(participant =>
            typeof participant === 'string' ? { id: participant } as GroupParticipant : participant
        )

        for (const participant of participants) {
            const participantId = normalizeWhatsappJid(participant.id)

            if (!participantId) {
                continue
            }

            const isBotUpdate = normalizedBotNumber ? participantId === normalizedBotNumber : false

            if (event.action === 'add') {
                const isParticipant = await groupController.isParticipant(group.id, participantId)

                if (isParticipant) {
                    if (participant.admin) {
                        await groupController.setAdmin(event.id, participantId, true)
                    }
                    continue
                }

                if (await isParticipantBlacklisted(client, normalizedBotNumber, botInfo, group, participantId)) continue
                if (await isParticipantFake(client, normalizedBotNumber, botInfo, group, participantId)) continue

                await sendWelcome(client, group, botInfo, participantId)
                await groupController.addParticipant(group.id, participantId, participant.admin != null)
            } else if (event.action === 'remove') {
                const isParticipant = await groupController.isParticipant(group.id, participantId)

                if (!isParticipant) {
                    const mutedMembers = ensureMutedMembers()

                    if (mutedMembers.includes(participantId)) {
                        await groupController.removeMutedMember(group.id, participantId)
                        group.muted_members = mutedMembers.filter(memberId => memberId !== participantId)
                    }
                    continue
                }

                if (isBotUpdate) {
                    await groupController.removeGroup(event.id)
                    continue
                }

                await groupController.removeParticipant(group.id, participantId)
                const mutedMembers = ensureMutedMembers()

                if (mutedMembers.includes(participantId)) {
                    await groupController.removeMutedMember(group.id, participantId)
                    group.muted_members = mutedMembers.filter(memberId => memberId !== participantId)
                }
            } else if (event.action === 'promote') {
                const isAdmin = await groupController.isParticipantAdmin(group.id, participantId)

                if (isAdmin) continue

                await groupController.setAdmin(event.id, participantId, true)
            } else if (event.action === 'demote') {
                const isAdmin = await groupController.isParticipantAdmin(group.id, participantId)

                if (!isAdmin) continue

                await groupController.setAdmin(event.id, participantId, false)
            } else if (event.action === 'modify') {
                await groupController.setAdmin(event.id, participantId, participant.admin != null)
            }
        }
    } catch(err: any){
        showConsoleError(err, "GROUP-PARTICIPANTS-UPDATE")
        client.end(new Error("fatal_error"))
    }
}

async function isParticipantBlacklisted(client: WASocket, normalizedBotNumber: string, botInfo: Bot, group: Group, userId: string){
    const normalizedUserId = normalizeWhatsappJid(userId)
    const groupController = new GroupController()
    const normalizedBlacklist = (group.blacklist ?? [])
        .map(blacklistId => normalizeWhatsappJid(blacklistId))
        .filter((blacklistId): blacklistId is string => !!blacklistId)
    group.blacklist = normalizedBlacklist
    const isUserBlacklisted = normalizedUserId ? normalizedBlacklist.includes(normalizedUserId) : false
    const isBotAdmin = normalizedBotNumber ? await groupController.isParticipantAdmin(group.id, normalizedBotNumber) : false

    if (isBotAdmin && isUserBlacklisted) {
        const replyText = buildText(botTexts.blacklist_ban_message, removeWhatsappSuffix(normalizedUserId), botInfo.name)
        await removeParticipant(client, group.id, normalizedUserId)
        await sendTextWithMentions(client, group.id, replyText, [normalizedUserId], {expiration: group.expiration})
        return true
    }

    return false
}

async function isParticipantFake(client: WASocket, normalizedBotNumber: string, botInfo: Bot, group: Group, userId: string){
    const normalizedUserId = normalizeWhatsappJid(userId)

    if (group.antifake.status){
        const groupController = new GroupController()
        const isBotAdmin = normalizedBotNumber ? await groupController.isParticipantAdmin(group.id, normalizedBotNumber) : false
        const isGroupAdmin = normalizedUserId ? await groupController.isParticipantAdmin(group.id, normalizedUserId) : false
        const isBotNumber = normalizedBotNumber ? normalizedUserId === normalizedBotNumber : false

        if (isBotAdmin){
            const allowedPrefixes = group.antifake.exceptions.prefixes
            const allowedNumbers = group.antifake.exceptions.numbers
            const isAllowedPrefix = normalizedUserId ? allowedPrefixes.filter(numberPrefix => normalizedUserId.startsWith(numberPrefix)).length ? true : false : false
            const isAllowedNumber = normalizedUserId ? allowedNumbers.filter(userNumber => addWhatsappSuffix(userNumber) == normalizedUserId).length ? true : false : false

            if (!isAllowedPrefix && !isAllowedNumber && !isBotNumber && !isGroupAdmin){
                const replyText = buildText(botTexts.antifake_ban_message, removeWhatsappSuffix(normalizedUserId), botInfo.name)
                await sendTextWithMentions(client, group.id, replyText , [normalizedUserId], {expiration: group.expiration})
                await removeParticipant(client, group.id, normalizedUserId)
                return true
            }
        } else {
            await groupController.setAntiFake(group.id, false)
        }
    }

    return false
}

async function sendWelcome(client: WASocket, group: Group, botInfo: Bot, userId: string){
    if (group.welcome.status) {
        const customMessage = group.welcome.msg ?  group.welcome.msg + "\n\n" : ""
        const normalizedUserId = normalizeWhatsappJid(userId)
        const welcomeMessage = buildText(botTexts.group_welcome_message, removeWhatsappSuffix(normalizedUserId), group.name, customMessage)
        await sendTextWithMentions(client, group.id, welcomeMessage, [normalizedUserId], {expiration: group.expiration})
    }
}