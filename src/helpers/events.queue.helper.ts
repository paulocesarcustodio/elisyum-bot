import { WASocket, BaileysEvent, BaileysEventMap, GroupParticipant } from '@whiskeysockets/baileys'
import NodeCache from 'node-cache'

type QueuedEvent = { event: BaileysEvent; data: BaileysEventMap[BaileysEvent] }

export async function executeEventQueue(client: WASocket, eventsCache: NodeCache) {
    const eventsQueue = (eventsCache.get("events") as QueuedEvent[]) ?? []

    for (const ev of eventsQueue) {
        client.ev.emit(ev.event, ev.data)
    }

    eventsCache.set("events", [])
}

function toParticipantIds(participants: GroupParticipant[] | undefined) {
    return (participants ?? [])
        .map(participant => participant.id)
        .filter((id): id is string => typeof id === 'string')
}

export async function queueEvent<T extends BaileysEvent>(
    eventsCache: NodeCache,
    eventName: T,
    eventData: BaileysEventMap[T]
) {
    let queueArray = (eventsCache.get("events") as QueuedEvent[]) ?? []

    if (eventName === 'group-participants.update') {
        const newEvent = eventData as BaileysEventMap['group-participants.update']
        const newParticipantsIds = toParticipantIds(newEvent.participants)

        queueArray = queueArray.filter(queue => {
            if (queue.event !== 'group-participants.update') {
                return true
            }

            const queuedEvent = queue.data as BaileysEventMap['group-participants.update']
            const queuedParticipantIds = toParticipantIds(queuedEvent.participants)
            const sameGroup = queuedEvent.id === newEvent.id
            const hasOverlap = queuedParticipantIds.some(id => newParticipantsIds.includes(id))

            return !(sameGroup && hasOverlap)
        })
    }

    if (eventName === 'groups.upsert') {
        const newGroups = eventData as BaileysEventMap['groups.upsert']
        queueArray = queueArray.filter(queue => {
            if (queue.event !== 'groups.upsert') {
                return true
            }

            const queuedGroups = queue.data as BaileysEventMap['groups.upsert']
            return queuedGroups[0]?.id !== newGroups[0]?.id
        })
    }

    queueArray.push({ event: eventName, data: eventData })
    eventsCache.set("events", queueArray)
}
