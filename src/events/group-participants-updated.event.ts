import { WASocket, ParticipantAction, GroupParticipant } from '@whiskeysockets/baileys'
import { buildText, showConsoleError} from '../utils/general.util.js'
import { Bot } from '../interfaces/bot.interface.js'
import { Group } from '../interfaces/group.interface.js'
import { GroupController } from '../controllers/group.controller.js'
import botTexts from '../helpers/bot.texts.helper.js'
import { removeParticipant, sendTextWithMentions, removeWhatsappSuffix, addWhatsappSuffix } from '../utils/whatsapp.util.js'

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

        if (!group) {
            return
        }

        const ensureMutedMembers = (): string[] => {
            if (!Array.isArray(group.muted_members)) {
                group.muted_members = []
            }

            return group.muted_members ?? []
        }

        const participants = (event.participants ?? []).map(participant =>
            typeof participant === 'string' ? { id: participant } as GroupParticipant : participant
        )

        for (const participant of participants) {
            const participantId = participant.id

            if (!participantId) {
                continue
            }

            const isBotUpdate = participantId === botInfo.host_number

            if (event.action === 'add') {
                const isParticipant = await groupController.isParticipant(group.id, participantId)

                if (isParticipant) {
                    if (participant.admin) {
                        await groupController.setAdmin(event.id, participantId, true)
                    }
                    continue
                }

                if (await isParticipantBlacklisted(client, botInfo, group, participantId)) continue
                if (await isParticipantFake(client, botInfo, group, participantId)) continue

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

async function isParticipantBlacklisted(client: WASocket, botInfo: Bot, group: Group, userId: string){
    const groupController = new GroupController()
    const isUserBlacklisted = group.blacklist.includes(userId)
    const isBotAdmin = botInfo.host_number ? await groupController.isParticipantAdmin(group.id, botInfo.host_number) : false

    if (isBotAdmin && isUserBlacklisted) {
        const replyText = buildText(botTexts.blacklist_ban_message, removeWhatsappSuffix(userId), botInfo.name)
        await removeParticipant(client, group.id, userId)
        await sendTextWithMentions(client, group.id, replyText, [userId], {expiration: group.expiration})
        return true
    }

    return false
}

async function isParticipantFake(client: WASocket, botInfo: Bot, group: Group, userId: string){
    if (group.antifake.status){
        const groupController = new GroupController()
        const isBotAdmin = botInfo.host_number ? await groupController.isParticipantAdmin(group.id, botInfo.host_number) : false
        const isGroupAdmin = await groupController.isParticipantAdmin(group.id, userId)
        const isBotNumber = userId == botInfo.host_number
        
        if (isBotAdmin){
            const allowedPrefixes = group.antifake.exceptions.prefixes
            const allowedNumbers = group.antifake.exceptions.numbers
            const isAllowedPrefix = allowedPrefixes.filter(numberPrefix => userId.startsWith(numberPrefix)).length ? true : false
            const isAllowedNumber = allowedNumbers.filter(userNumber => addWhatsappSuffix(userNumber) == userId).length ? true : false

            if (!isAllowedPrefix && !isAllowedNumber && !isBotNumber && !isGroupAdmin){
                const replyText = buildText(botTexts.antifake_ban_message, removeWhatsappSuffix(userId), botInfo.name)
                await sendTextWithMentions(client, group.id, replyText , [userId], {expiration: group.expiration})
                await removeParticipant(client, group.id, userId)
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
        const welcomeMessage = buildText(botTexts.group_welcome_message, removeWhatsappSuffix(userId), group.name, customMessage)
        await sendTextWithMentions(client, group.id, welcomeMessage, [userId], {expiration: group.expiration})
    }
}