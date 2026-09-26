import { getContentType, type WAMessage, type WASocket } from '@whiskeysockets/baileys'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { downloadMessageAsBuffer } from '../utils/whatsapp.util.js'

const groupId = process.env.VOICE_DIAGNOSTIC_GROUP_ID
const directory = path.resolve('storage/voice-diagnostic')
const limit = 10
const seen = new Set<string>()
let count = 0
let initialized = false

export async function captureDiagnosticVoice(client: WASocket, message: WAMessage): Promise<boolean> {
    if (!groupId || message.key.remoteJid !== groupId || !message.message || getContentType(message.message) !== 'audioMessage') return false
    if (!initialized) {
        await mkdir(directory, {recursive: true, mode: 0o700})
        count = (await readdir(directory)).filter(file => /^voice-\d{2}\.json$/.test(file)).length
        initialized = true
    }
    if (count >= limit) return false
    if (message.key.fromMe || !message.key.id) return false
    if (seen.has(message.key.id)) return true

    seen.add(message.key.id)
    const index = ++count
    const base = `voice-${String(index).padStart(2, '0')}`
    const meta = {
        index,
        id: message.key.id,
        chatId: groupId,
        timestamp: Number(message.messageTimestamp) || null,
        sender: message.key.participant || message.key.participantAlt || null,
        seconds: message.message.audioMessage?.seconds || null,
        mimeType: message.message.audioMessage?.mimetype || null,
        quotedId: message.message.audioMessage?.contextInfo?.stanzaId || null,
        quotedType: message.message.audioMessage?.contextInfo?.quotedMessage
            ? getContentType(message.message.audioMessage.contextInfo.quotedMessage) || null
            : null,
        status: 'pending'
    }

    try {
        await writeFile(path.join(directory, `${base}.json`), JSON.stringify(meta), {mode: 0o600, flag: 'wx'})
        const buffer = await downloadMessageAsBuffer(client, message)
        const extension = meta.mimeType?.includes('mp4') ? 'm4a' : 'ogg'
        await writeFile(path.join(directory, `${base}.${extension}`), buffer, {mode: 0o600, flag: 'wx'})
        meta.status = 'captured'
        console.log(`[VoiceDiagnostic] ${index}/${limit} captured, id=${meta.id}, bytes=${buffer.length}`)
    } catch (error) {
        meta.status = `download_failed: ${error instanceof Error ? error.message : String(error)}`
        console.warn(`[VoiceDiagnostic] ${index}/${limit} failed, id=${meta.id}`, error)
    } finally {
        await writeFile(path.join(directory, `${base}.json`), JSON.stringify(meta), {mode: 0o600})
    }
    return true
}
