import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { ParticipantService } from "../src/services/participant.service.js"
import { GroupController } from "../src/controllers/group.controller.js"
import { normalizeWhatsappJid } from "../src/utils/whatsapp.util.js"
import { groupParticipantsUpdated } from "../src/events/group-participants-updated.event.ts"
import type { Group } from "../src/interfaces/group.interface.js"
import type { Bot } from "../src/interfaces/bot.interface.js"
import type { WASocket } from "@whiskeysockets/baileys"

const TEST_GROUP_ID = `test-normalization-${Date.now()}@g.us`

function createRawBotJid(deviceSuffix: number) {
    return `551199999999${deviceSuffix}:${deviceSuffix}@s.whatsapp.net`
}

function createGroup(groupId: string): Group {
    return {
        id: groupId,
        name: "Normalization Test Group",
        commands_executed: 0,
        muted: false,
        muted_members: [],
        welcome: { status: false, msg: "" },
        antifake: { status: false, exceptions: { prefixes: [], numbers: [] } },
        antilink: { status: false, exceptions: [] },
        antiflood: { status: false, max_messages: 0, interval: 0 },
        auto_reply: { status: false, config: [] },
        autosticker: false,
        block_cmds: [],
        blacklist: [],
        word_filter: []
    }
}

function createBot(hostNumber: string): Bot {
    return {
        started: Date.now(),
        host_number: hostNumber,
        name: "Normalization Bot",
        prefix: "!",
        executed_cmds: 0,
        db_migrated: true,
        autosticker: false,
        block_cmds: [],
        commands_pv: true,
        admin_mode: false,
        command_rate: {
            status: false,
            max_cmds_minute: 0,
            block_time: 0
        }
    }
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

test("GroupController persists admin promotion without prior participant record", async t => {
    const participantService = new ParticipantService()
    const groupController = new GroupController()
    const rawBotJid = createRawBotJid(3)
    const groupId = `test-promotion-${Date.now()}@g.us`

    await participantService.removeParticipants(groupId)

    t.after(async () => {
        await participantService.removeParticipants(groupId)
    })

    const isAdminBefore = await groupController.isParticipantAdmin(groupId, rawBotJid)
    assert.equal(isAdminBefore, false)

    await groupController.setAdmin(groupId, rawBotJid, true)

    const participantRecord = await participantService.getParticipantFromGroup(groupId, rawBotJid)
    assert.notEqual(participantRecord, null)
    assert.equal(participantRecord?.admin, true)

    const isAdminAfter = await groupController.isParticipantAdmin(groupId, rawBotJid)
    assert.equal(isAdminAfter, true)
})
