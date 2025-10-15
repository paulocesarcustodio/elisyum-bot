import test from "node:test"
import assert from "node:assert/strict"
import NodeCache from "node-cache"
import type { BaileysEventMap } from "@whiskeysockets/baileys"
import { queueEvent } from "../src/helpers/events.queue.helper.ts"

test("queueEvent deduplicates repeated participant updates", async () => {
    const cache = new NodeCache()
    cache.set("events", [])

    const baseEvent: BaileysEventMap['group-participants.update'] = {
        id: "123@g.us",
        author: "admin@s.whatsapp.net",
        participants: [
            {
                id: "user@s.whatsapp.net"
            }
        ],
        action: "add"
    }

    await queueEvent(cache, "group-participants.update", baseEvent)
    await queueEvent(cache, "group-participants.update", baseEvent)

    const events = cache.get("events") as { event: string }[]
    assert.equal(events.length, 1)
    assert.equal(events[0]?.event, "group-participants.update")
})

test("queueEvent retains updates for different participants", async () => {
    const cache = new NodeCache()
    cache.set("events", [])

    const eventA: BaileysEventMap['group-participants.update'] = {
        id: "123@g.us",
        author: "admin@s.whatsapp.net",
        participants: [
            {
                id: "user-a@s.whatsapp.net"
            }
        ],
        action: "add"
    }

    const eventB: BaileysEventMap['group-participants.update'] = {
        id: "123@g.us",
        author: "admin@s.whatsapp.net",
        participants: [
            {
                id: "user-b@s.whatsapp.net"
            }
        ],
        action: "add"
    }

    await queueEvent(cache, "group-participants.update", eventA)
    await queueEvent(cache, "group-participants.update", eventB)

    const events = cache.get("events") as { event: string }[]
    assert.equal(events.length, 2)
})
