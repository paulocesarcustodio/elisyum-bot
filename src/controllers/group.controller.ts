import { GroupMetadata } from "@whiskeysockets/baileys"
import { GroupService } from "../services/group.service.js"
import { MessageTypes } from "../interfaces/message.interface.js"
import { ParticipantService } from "../services/participant.service.js"
import { normalizeWhatsappJid } from "../utils/whatsapp.util.js"

export class GroupController {
    private groupService
    private participantService

    constructor(){
        this.groupService = new GroupService()
        this.participantService = new ParticipantService()
    }

    // ***** Grupo *****
    public registerGroup(group : GroupMetadata) {
        return this.groupService.registerGroup(group)
    }

    public migrateGroups() {
        return this.groupService.migrateGroups()
    }

    public getGroup(groupId: string) {
        return this.groupService.getGroup(groupId)
    }

    public getAllGroups() {
        return this.groupService.getAllGroups()
    }

    public setNameGroup(groupId: string, name: string) {
        return this.groupService.setName(groupId, name)
    }

    public setRestrictedGroup(groupId: string, status: boolean) {
        return this.groupService.setRestricted(groupId, status)
    }

    public syncGroups(groups: GroupMetadata[]){
        return this.groupService.syncGroups(groups)
    }

    public updatePartialGroup(group: Partial<GroupMetadata>){
        return this.groupService.updatePartialGroup(group)
    }

    public removeGroup(groupId: string) {
        return this.groupService.removeGroup(groupId)
    }

    public incrementGroupCommands(groupId: string){
        return this.groupService.incrementGroupCommands(groupId)
    }







    public setMuted(groupId: string, status = true) {
        return this.groupService.setMuted(groupId, status)
    }

    public setMutedMember(groupId: string, userId: string) {
        const normalizedUserId = normalizeWhatsappJid(userId)
        if (!normalizedUserId) return

        return this.groupService.setMutedMember(groupId, normalizedUserId)
    }

    public removeMutedMember(groupId: string, userId: string) {
        const normalizedUserId = normalizeWhatsappJid(userId)
        if (!normalizedUserId) return

        return this.groupService.unsetMutedMember(groupId, normalizedUserId)
    }

    public isParticipantMuted(groupId: string, userId: string) {
        const normalizedUserId = normalizeWhatsappJid(userId)
        if (!normalizedUserId) return Promise.resolve(false)

        return this.groupService.isMemberMuted(groupId, normalizedUserId)
    }


    public async setBlacklist(groupId: string, userId: string, operation: 'add' | 'remove'){
        const normalizedUserId = normalizeWhatsappJid(userId)
        if (!normalizedUserId) return

        return this.groupService.setBlacklist(groupId, normalizedUserId, operation)
    }

    // ***** Participantes *****
    public addParticipant(groupId: string, userId: string, isAdmin = false) {
        const normalizedUserId = normalizeWhatsappJid(userId)
        if (!normalizedUserId) return

        return this.participantService.addParticipant(groupId, normalizedUserId, isAdmin)
    }

    public removeParticipant(groupId: string, userId: string) {
        const normalizedUserId = normalizeWhatsappJid(userId)
        if (!normalizedUserId) return

        return this.participantService.removeParticipant(groupId, normalizedUserId)
    }

    public async setAdmin(groupId: string, userId: string, status: boolean){
        const normalizedUserId = normalizeWhatsappJid(userId)
        if (!normalizedUserId) return

        return this.participantService.setAdmin(groupId, normalizedUserId, status)
    }

    public migrateParticipants(){
        return this.participantService.migrateParticipants()
    }

    public getParticipant(groupId: string, userId: string){
        const normalizedUserId = normalizeWhatsappJid(userId)
        if (!normalizedUserId) return Promise.resolve(null)

        return this.participantService.getParticipantFromGroup(groupId, normalizedUserId)
    }

    public getParticipants(groupId: string){
        return this.participantService.getParticipantsFromGroup(groupId)
    }

    public getParticipantsIds(groupId: string){
        return this.participantService.getParticipantsIdsFromGroup(groupId)
    }

    public getAdmins(groupId: string) {
        return this.participantService.getAdminsFromGroup(groupId)
    }

    public getAdminsIds(groupId: string) {
        return this.participantService.getAdminsIdsFromGroup(groupId)
    }

    public isParticipant(groupId: string, userId: string) {
        const normalizedUserId = normalizeWhatsappJid(userId)
        if (!normalizedUserId) return Promise.resolve(false)

        return this.participantService.isGroupParticipant(groupId, normalizedUserId)
    }

    public isParticipantAdmin(groupId: string, userId: string) {
        const normalizedUserId = normalizeWhatsappJid(userId)
        if (!normalizedUserId) return Promise.resolve(false)

        return this.participantService.isGroupAdmin(groupId, normalizedUserId)
    }

    public incrementParticipantActivity(groupId: string, userId: string, type: MessageTypes, isCommand: boolean){
        const normalizedUserId = normalizeWhatsappJid(userId)
        if (!normalizedUserId) return

        return this.participantService.incrementParticipantActivity(groupId, normalizedUserId, type, isCommand)
    }


}