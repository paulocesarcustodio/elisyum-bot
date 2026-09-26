import { WASocket, BaileysEvent, BaileysEventMap } from '@whiskeysockets/baileys'
import NodeCache from 'node-cache'

type QueuedEvent = { event: BaileysEvent; data: BaileysEventMap[BaileysEvent] }
const MAX_QUEUED_EVENTS = 2000

function mergeGroupEvents(queue: QueuedEvent[], eventName: BaileysEvent, eventData: BaileysEventMap[BaileysEvent]): QueuedEvent[] {
    if (eventName !== 'groups.upsert' && eventName !== 'groups.update') return queue
    const newData = eventData as BaileysEventMap['groups.upsert']
    const newIds = new Set((Array.isArray(newData) ? newData : [newData]).map(group => group.id))
    return queue.filter(queued => {
        if (queued.event !== eventName) return true
        const oldData = queued.data as BaileysEventMap['groups.upsert']
        const oldIds = (Array.isArray(oldData) ? oldData : [oldData]).map(group => group.id)
        return !oldIds.some(id => newIds.has(id))
    })
}

export async function executeEventQueue(client: WASocket, eventsCache: NodeCache) {
    const eventsQueue = (eventsCache.get("events") as QueuedEvent[]) ?? []

    for (const ev of eventsQueue) {
        client.ev.emit(ev.event, ev.data)
    }

    eventsCache.set("events", [])
}

export async function queueEvent<T extends BaileysEvent>(
    eventsCache: NodeCache,
    eventName: T,
    eventData: BaileysEventMap[T]
) {
    let queueArray = (eventsCache.get("events") as QueuedEvent[]) ?? []

    if (eventName === 'groups.upsert' || eventName === 'groups.update') {
        queueArray = mergeGroupEvents(queueArray, eventName, eventData as BaileysEventMap[BaileysEvent])
    }
    queueArray.push({ event: eventName, data: eventData })
    if (queueArray.length > MAX_QUEUED_EVENTS) {
        queueArray.splice(0, queueArray.length - MAX_QUEUED_EVENTS)
    }
    eventsCache.set("events", queueArray)
}
