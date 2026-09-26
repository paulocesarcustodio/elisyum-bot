import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import FormData from 'form-data'
import axios from 'axios'
import { semanticCommands } from '../src/helpers/semantic.registry.helper.js'
import { SemanticCommandService } from '../src/services/semantic-command.service.js'
import { matchExplicitIntent } from '../src/utils/semantic-intent.util.js'

const directory = path.resolve('storage/voice-diagnostic')
const whisperUrl = process.env.WHISPER_URL || 'http://127.0.0.1:8090'
const classifier = new SemanticCommandService()
const files = await readdir(directory).catch(() => [])
const metadataFiles = files.filter(file => /^voice-\d{2}\.json$/.test(file)).sort()

if (!metadataFiles.length) {
    console.log('Nenhum áudio diagnóstico foi capturado neste grupo.')
    process.exit(0)
}

for (const filename of metadataFiles) {
    const metadata = JSON.parse(await readFile(path.join(directory, filename), 'utf8'))
    const base = filename.slice(0, -5)
    const media = files.find(file => file === `${base}.ogg` || file === `${base}.m4a`)
    if (!media) {
        console.log(JSON.stringify({index: metadata.index, id: metadata.id, timestamp: metadata.timestamp, status: metadata.status}))
        continue
    }

    try {
        const form = new FormData()
        form.append('file', await readFile(path.join(directory, media)), {filename: media})
        form.append('language', 'pt')
        form.append('task', 'transcribe')
        form.append('vad_filter', 'false')
        const response = await axios.post(`${whisperUrl}/transcribe`, form, {headers: form.getHeaders(), timeout: 30000})
        const text = String(response.data.text || '').trim()
        const explicitWithQuote = matchExplicitIntent(text, true)
        const explicitWithoutQuote = matchExplicitIntent(text, false)
        const decision = text ? await classifier.classify(text, semanticCommands.filter(command => command.category !== 'admin'), 'Contexto: grupo de teste.') : null
        console.log(JSON.stringify({
            index: metadata.index, id: metadata.id, timestamp: metadata.timestamp,
            seconds: metadata.seconds, text, transcriptionMs: response.data.inference_ms,
            quotedId: metadata.quotedId ?? 'not_recorded', quotedType: metadata.quotedType ?? 'not_recorded',
            explicitWithoutQuote, explicitWithQuote,
            command: decision?.command ?? null, confidence: decision?.confidence ?? null,
            classificationMs: decision?.latencyMs ?? null
        }))
    } catch (error) {
        console.log(JSON.stringify({index: metadata.index, id: metadata.id, timestamp: metadata.timestamp, error: error instanceof Error ? error.message : String(error)}))
    }
}
