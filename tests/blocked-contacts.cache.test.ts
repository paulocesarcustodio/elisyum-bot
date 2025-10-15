import test, { mock } from "node:test"
import assert from "node:assert/strict"
import type { WASocket } from "@whiskeysockets/baileys"
import type { Message } from "../src/interfaces/message.interface.js"
import { isUserBlocked } from "../src/helpers/message.procedures.helper.ts"
import { blockContact, unblockContact } from "../src/utils/whatsapp.util.ts"
import { clearBlockedContactsCache, getBlockedContactsFromCache, setBlockedContactsCache } from "../src/helpers/blocked-contacts.cache.ts"

test("isUserBlocked reuses cached blocklist after the first fetch", async () => {
    clearBlockedContactsCache()

    const fetchBlocklistMock = mock.fn(async () => ["123@s.whatsapp.net"])

    const client = {
        fetchBlocklist: fetchBlocklistMock
    } as unknown as WASocket
    const message = { sender: "123@s.whatsapp.net" } as Message

    const firstCheck = await isUserBlocked(client, message)
    const secondCheck = await isUserBlocked(client, message)

    assert.equal(firstCheck, true, "first lookup should detect blocked contact")
    assert.equal(secondCheck, true, "second lookup should return cached result")
    assert.equal(fetchBlocklistMock.mock.callCount(), 1, "blocklist should be fetched once")

    clearBlockedContactsCache()
})

test("blockContact clears the blocked contacts cache", async () => {
    clearBlockedContactsCache()
    setBlockedContactsCache(["123@s.whatsapp.net"])

    const client = {
        updateBlockStatus: async () => ({ success: true })
    } as unknown as WASocket

    const updateMock = mock.method(client, "updateBlockStatus", async () => ({ success: true }))

    await blockContact(client, "123@s.whatsapp.net")

    assert.equal(updateMock.mock.callCount(), 1, "blockContact should forward the update to WhatsApp")
    assert.equal(getBlockedContactsFromCache(), undefined, "cache should be invalidated after blocking")

    updateMock.mock.restore()
})

test("unblockContact clears the blocked contacts cache", async () => {
    clearBlockedContactsCache()
    setBlockedContactsCache(["123@s.whatsapp.net"])

    const client = {
        updateBlockStatus: async () => ({ success: true })
    } as unknown as WASocket

    const updateMock = mock.method(client, "updateBlockStatus", async () => ({ success: true }))

    await unblockContact(client, "123@s.whatsapp.net")

    assert.equal(updateMock.mock.callCount(), 1, "unblockContact should forward the update to WhatsApp")
    assert.equal(getBlockedContactsFromCache(), undefined, "cache should be invalidated after unblocking")

    updateMock.mock.restore()
})
