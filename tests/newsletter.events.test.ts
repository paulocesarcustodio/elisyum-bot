import test from 'node:test'
import assert from 'node:assert/strict'
import type { WAMessage } from '@whiskeysockets/baileys'
import { isNewsletterMessage, partitionNewsletterMessages } from '../src/events/newsletter-message.event.ts'

test('partitionNewsletterMessages separates channel JIDs from regular messages', () => {
    const newsletterMessage = {
        key: {
            id: 'msg-newsletter',
            remoteJid: '123@newsletter'
        },
        messageTimestamp: 1n
    } as unknown as WAMessage

    const privateMessage = {
        key: {
            id: 'msg-private',
            remoteJid: '555@s.whatsapp.net'
        },
        messageTimestamp: 2n
    } as unknown as WAMessage

    const { newsletterMessages, otherMessages } = partitionNewsletterMessages([newsletterMessage, privateMessage])

    assert.equal(newsletterMessages.length, 1)
    assert.equal(newsletterMessages[0]?.key.remoteJid, '123@newsletter')
    assert.equal(otherMessages.length, 1)
    assert.equal(otherMessages[0]?.key.remoteJid, '555@s.whatsapp.net')
})

test('isNewsletterMessage detects newsletter invite payloads', () => {
    const inviteMessage = {
        key: {
            id: 'msg-invite',
            remoteJid: '987@s.whatsapp.net'
        },
        messageTimestamp: Date.now(),
        message: {
            newsletterAdminInviteMessage: {
                newsletterJid: 'channel@newsletter',
                newsletterName: 'Canal de Teste'
            }
        }
    } as unknown as WAMessage

    assert.equal(isNewsletterMessage(inviteMessage), true)
})

