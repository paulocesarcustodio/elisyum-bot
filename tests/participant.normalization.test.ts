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

test("groupParticipantsUpdated preserves admin status on modify without admin flag", async t => {
    const participantService = new ParticipantService()
    const groupController = new GroupController()
    const groupId = TEST_GROUP_ID
    const participantId = "5511900000000@s.whatsapp.net"
    const botInfo = createBot("5511800000000@s.whatsapp.net")
    const mockGroup = createGroup(groupId)
    const client = { end: () => {} } as unknown as WASocket

    await participantService.removeParticipants(groupId)

    t.after(async () => {
        await participantService.removeParticipants(groupId)
    })

    await groupController.addParticipant(groupId, participantId, false)
    await groupController.setAdmin(groupId, participantId, true)

    const originalSetAdmin = GroupController.prototype.setAdmin
    const getGroupMock = mock.method(GroupController.prototype, "getGroup", async () => mockGroup)
    const setAdminMock = mock.method(GroupController.prototype, "setAdmin", async function (this: GroupController, gid: string, uid: string, status: boolean) {
        return originalSetAdmin.call(this, gid, uid, status)
    })

    try {
        await groupParticipantsUpdated(client, {
            id: groupId,
            author: botInfo.host_number,
            participants: [{ id: participantId }],
            action: "modify"
        }, botInfo)
    } finally {
        getGroupMock.mock.restore()
        setAdminMock.mock.restore()
    }

    const isAdminAfterModify = await groupController.isParticipantAdmin(groupId, participantId)

    assert.equal(setAdminMock.mock.callCount(), 0)
    assert.equal(isAdminAfterModify, true)
})
