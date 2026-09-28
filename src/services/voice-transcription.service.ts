import { mediaProcessor,shouldQueueWork } from '../infrastructure/media-client.js'
import { workSignal } from '../infrastructure/subprocess.js'
import { admit } from '../application/admission.js'
import { performance } from 'node:perf_hooks'
import axios from 'axios'
import FormData from 'form-data'
import { randomUUID } from 'node:crypto'
import type { WASocket } from '@whiskeysockets/baileys'
import type { Message } from '../interfaces/message.interface.js'
import { downloadMessageAsBuffer } from '../utils/whatsapp.util.js'
import { ffmpegPool } from '../utils/worker-pool.util.js'

const VOICE_TIMEOUT_MS = Number(process.env.WHISPER_TIMEOUT_MS || 8000)
const MAX_VOICE_BYTES = 8 * 1024 * 1024
const transcriptCache = new Map<string, { text: string, expiresAt: number }>()

export interface VoiceTranscription {
    text: string
    language: string
    durationMs?: number
    inferenceMs?: number
    downloadMs?: number
    conversionMs?: number
    totalMs: number
    model: string
}

export async function transcribeVoiceMessage(client: WASocket, message: Message): Promise<VoiceTranscription | null> {
    if (process.env.VOICE_COMMANDS_ENABLED !== 'true') return null
    if (message.type !== 'audioMessage') return null

    const mediaLength = message.media?.file_length ?? 0
    if (mediaLength > MAX_VOICE_BYTES) throw new Error('O áudio para comando de voz deve ter no máximo 8 MB.')

    const cacheKey = `${message.chat_id}:${message.message_id}`
    const cached = transcriptCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) return {
        text: cached.text,
        language: 'pt',
        totalMs: 0,
        model: process.env.WHISPER_MODEL || 'base'
    }
    if (cached) transcriptCache.delete(cacheKey)

    if(!await admit([{key:`voice:actor:${message.sender}`,limit:8},{key:`voice:chat:${message.chat_id}`,limit:24},{key:'voice:global',limit:60}]))return null
    return doTranscribe(client, message, cacheKey)
}

async function doTranscribe(client: WASocket, message: Message, cacheKey: string): Promise<VoiceTranscription | null> {
    const started = performance.now()
    const sourceMessage = message.wa_message
    const sourceBuffer = await downloadMessageAsBuffer(client, sourceMessage)
    const downloadedAt = performance.now()
    if (sourceBuffer.length > MAX_VOICE_BYTES) throw new Error('O áudio para comando de voz deve ter no máximo 8 MB.')
    const mimeType = message.media?.mimetype ?? ''
    const extension = inferAudioExtension(mimeType)
    const audioBuffer = extension === 'wav' ? sourceBuffer : await ffmpegPool.exec({
        inputBuffer: sourceBuffer,
        inputExt: extension,
        outputExt: 'wav',
        args: ['-vn', '-ac', '1', '-ar', '16000', '-f', 'wav'],
        timeout: VOICE_TIMEOUT_MS,
        maxOutputBytes: 16 * 1024 * 1024
    })
    const downloadMs = downloadedAt - started
    const conversionMs = performance.now() - downloadedAt

    try {
        const transcription = shouldQueueWork()
            ? await mediaProcessor.execute<any>('voice.transcribe',[audioBuffer],{timeoutMs:VOICE_TIMEOUT_MS+10_000})
            : await transcribeBuffer(audioBuffer)
        const text = typeof transcription.text === 'string' ? transcription.text.trim() : ''
        if (!text) return null
        const result: VoiceTranscription = {
            text,
            language: transcription.language || 'pt',
            durationMs: transcription.duration_ms,
            inferenceMs: transcription.inference_ms,
            downloadMs,
            conversionMs,
            totalMs: performance.now() - started,
            model: transcription.model || process.env.WHISPER_MODEL || 'base'
        }
        transcriptCache.set(cacheKey, {text, expiresAt: Date.now() + 10 * 60 * 1000})
        while (transcriptCache.size > 1000) transcriptCache.delete(transcriptCache.keys().next().value!)
        return result
    } catch (error) {
        console.warn('[Voice] Serviço Whisper indisponível; comandos de texto seguem funcionando.', error instanceof Error ? error.message : error)
        return null
    }
}

export async function transcribeBuffer(audioBuffer:Buffer){
    const form=new FormData()
    form.append('file',audioBuffer,{filename:`voice-${randomUUID()}.wav`,contentType:'audio/wav'})
    form.append('language',process.env.WHISPER_LANGUAGE || 'pt')
    form.append('task','transcribe')
    form.append('vad_filter','false')
    const endpoint=process.env.WHISPER_URL || 'http://127.0.0.1:8090'
    const response=await axios.post(`${endpoint.replace(/\/$/,'')}/transcribe`,form,{
        headers:form.getHeaders(),timeout:VOICE_TIMEOUT_MS,maxContentLength:MAX_VOICE_BYTES,maxBodyLength:MAX_VOICE_BYTES,
        signal:workSignal.getStore(),
    })
    return response.data as Partial<VoiceTranscription> & {duration_ms?:number;inference_ms?:number}
}

function inferAudioExtension(mimeType: string): string {
    if (mimeType.includes('ogg') || mimeType.includes('opus')) return 'ogg'
    if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
    if (mimeType.includes('wav')) return 'wav'
    if (mimeType.includes('webm')) return 'webm'
    if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a'
    return 'bin'
}
