import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import type { WAMessage } from "@whiskeysockets/baileys"
import { formatWAMessage } from "../src/utils/whatsapp.util.ts"

test("formatWAMessage carries over requestId metadata", async () => {
    await fs.mkdir(path.resolve(process.cwd(), "storage"), { recursive: true })

    const sampleMessage = {
        key: {
            id: "msg-1",
            remoteJid: "123@s.whatsapp.net",
            fromMe: false
        },
        messageTimestamp: Date.now(),
        pushName: "Tester",
        message: {
            conversation: "Olá"
        }
    } as unknown as WAMessage

    const formatted = await formatWAMessage(sampleMessage, null, "bot@s.whatsapp.net", "req-123")

    assert.ok(formatted, "message should be formatted")
    assert.equal(formatted?.requestId, "req-123")
})
