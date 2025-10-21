import test from "node:test"
import assert from "node:assert/strict"
import { ParticipantService } from "../src/services/participant.service.js"
import { GroupController } from "../src/controllers/group.controller.js"
import { normalizeWhatsappJid } from "../src/utils/whatsapp.util.js"

const TEST_GROUP_ID = `test-normalization-${Date.now()}@g.us`

function createRawBotJid(deviceSuffix: number) {
    return `551199999999${deviceSuffix}:${deviceSuffix}@s.whatsapp.net`
}

test("ParticipantService normalizes admin lookups with device suffix", async t => {
    const participantService = new ParticipantService()
    const rawBotJid = createRawBotJid(1)
    const normalizedBotJid = normalizeWhatsappJid(rawBotJid)

    await participantService.removeParticipants(TEST_GROUP_ID)

    t.after(async () => {
        await participantService.removeParticipants(TEST_GROUP_ID)
    })

    await participantService.addParticipant(TEST_GROUP_ID, rawBotJid, false)
    await participantService.setAdmin(TEST_GROUP_ID, rawBotJid, true)

    const isAdminWithRaw = await participantService.isGroupAdmin(TEST_GROUP_ID, rawBotJid)
    const isAdminWithNormalized = await participantService.isGroupAdmin(TEST_GROUP_ID, normalizedBotJid)

    assert.equal(isAdminWithRaw, true)
    assert.equal(isAdminWithNormalized, true)
})

test("GroupController normalizes admin checks for promoted bot", async t => {
    const participantService = new ParticipantService()
    const groupController = new GroupController()
    const rawBotJid = createRawBotJid(2)

    await participantService.removeParticipants(TEST_GROUP_ID)

    t.after(async () => {
        await participantService.removeParticipants(TEST_GROUP_ID)
    })

    await groupController.addParticipant(TEST_GROUP_ID, rawBotJid, false)
    await groupController.setAdmin(TEST_GROUP_ID, rawBotJid, true)

    const isAdmin = await groupController.isParticipantAdmin(TEST_GROUP_ID, rawBotJid)

    assert.equal(isAdmin, true)
})
