import test, { mock } from "node:test"
import assert from "node:assert/strict"
import type { WASocket } from "@whiskeysockets/baileys"
import type { Bot } from "../src/interfaces/bot.interface.js"
import type { Group } from "../src/interfaces/group.interface.js"
import type { Message } from "../src/interfaces/message.interface.js"
import { handleGroupMessage } from "../src/helpers/message.handler.helper.ts"
import { GroupController } from "../src/controllers/group.controller.js"
import { UserController } from "../src/controllers/user.controller.js"

type MessageOverrides = Partial<Message>

type GroupOverrides = Partial<Group>

type BotOverrides = Partial<Bot>

function createBot(overrides: BotOverrides = {}): Bot {
    return {
        started: Date.now(),
        host_number: "bot@s.whatsapp.net",
        name: "Test Bot",
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
        },
        ...overrides
    }
}

function createGroup(overrides: GroupOverrides = {}): Group {
    return {
        id: "123@g.us",
        name: "Test Group",
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
        word_filter: [],
        ...overrides
    }
}

function createMessage(overrides: MessageOverrides = {}): Message {
    return {
        message_id: "wamid-msg",
        sender: "user@s.whatsapp.net",
        type: "conversation",
        t: Date.now(),
        chat_id: "123@g.us",
        pushname: "Muted User",
        body: "olá",
        caption: "",
        mentioned: [],
        text_command: "",
        command: "random",
        args: [],
        isQuoted: false,
        isGroupMsg: true,
        isGroupAdmin: false,
        isBotAdmin: false,
        isBotOwner: false,
        isBotMessage: false,
        isBroadcast: false,
        isMedia: false,
        wa_message: {
            key: {
                id: "wamid-msg",
                remoteJid: "123@g.us"
            }
        } as any,
        ...overrides
    }
}

test("handleGroupMessage deletes muted participant messages when bot is admin", async () => {
    const botInfo = createBot()
    const group = createGroup({ muted_members: ["user@s.whatsapp.net"] })
    const message = createMessage()
    const sendMessageCalls: any[] = []
    const client = {
        sendMessage: async (...args: any[]) => {
            sendMessageCalls.push(args)
        }
    } as unknown as WASocket

    const setNameMock = mock.method(UserController.prototype, "setName", async () => {})
    const incrementActivityMock = mock.method(GroupController.prototype, "incrementParticipantActivity", async () => {})
    const getAdminsMock = mock.method(GroupController.prototype, "getAdminsIds", async () => [botInfo.host_number])

    try {
        const result = await handleGroupMessage(client, group, botInfo, message)

        assert.equal(result, false, "deleted messages should stop further processing")
        assert.equal(sendMessageCalls.length, 1, "muted participant message must be deleted")
        assert.equal(incrementActivityMock.mock.callCount(), 0, "muted participants should not increment activity")
    } finally {
        setNameMock.mock.restore()
        incrementActivityMock.mock.restore()
        getAdminsMock.mock.restore()
    }
})

test("handleGroupMessage skips deletion when bot is not admin", async () => {
    const botInfo = createBot()
    const group = createGroup({ muted_members: ["user@s.whatsapp.net"] })
    const message = createMessage()
    const sendMessageCalls: any[] = []
    const sendReceiptCalls: any[] = []
    const client = {
        sendMessage: async (...args: any[]) => {
            sendMessageCalls.push(args)
        },
        sendReceipt: async (...args: any[]) => {
            sendReceiptCalls.push(args)
        },
        fetchBlocklist: async () => []
    } as unknown as WASocket

    const setNameMock = mock.method(UserController.prototype, "setName", async () => {})
    const getAdminsMock = mock.method(GroupController.prototype, "getAdminsIds", async () => [])
    const isParticipantAdminMock = mock.method(GroupController.prototype, "isParticipantAdmin", async () => false)
    const getParticipantMock = mock.method(GroupController.prototype, "getParticipant", async () => undefined)
    const incrementActivityMock = mock.method(GroupController.prototype, "incrementParticipantActivity", async () => {})
    const getAdminsListMock = mock.method(UserController.prototype, "getAdmins", async () => [])

    try {
        const result = await handleGroupMessage(client, group, botInfo, message)

        assert.equal(result, false, "non-admin bots should continue regular processing")
        assert.equal(sendMessageCalls.length, 0, "message should not be deleted without admin rights")
        assert.equal(incrementActivityMock.mock.callCount(), 1, "participant activity should be updated when flow continues")
        assert.equal(sendReceiptCalls.length, 1, "message should be marked as read when not deleted")
    } finally {
        setNameMock.mock.restore()
        getAdminsMock.mock.restore()
        isParticipantAdminMock.mock.restore()
        getParticipantMock.mock.restore()
        incrementActivityMock.mock.restore()
        getAdminsListMock.mock.restore()
    }
})
