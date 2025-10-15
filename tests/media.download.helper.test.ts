import test from "node:test"
import assert from "node:assert/strict"
import type { WAMessage, WASocket } from "@whiskeysockets/baileys"
import { createMediaDownloadContext } from "../src/utils/whatsapp.util.ts"

test("createMediaDownloadContext proxies updateMediaMessage", async () => {
    const fakeMessage = { key: { id: "media-1" } } as WAMessage
    let calledWith: WAMessage | undefined

    const fakeLogger: any = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
        trace: () => {},
        child: () => fakeLogger
    }

    const client = {
        logger: fakeLogger,
        updateMediaMessage: async (message: WAMessage) => {
            calledWith = message
            return message
        }
    } as unknown as WASocket

    const context = createMediaDownloadContext(client)
    const result = await context.reuploadRequest(fakeMessage)

    assert.equal(context.logger, fakeLogger)
    assert.equal(calledWith, fakeMessage)
    assert.equal(result, fakeMessage)
})
