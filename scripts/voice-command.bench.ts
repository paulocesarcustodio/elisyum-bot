import axios from 'axios'
import fs from 'node:fs'
import {performance} from 'node:perf_hooks'
import FormData from 'form-data'
import {getSemanticCommandsForContext} from '../src/helpers/semantic.registry.helper.js'
import {getSemanticDecision} from '../src/helpers/semantic-command.helper.js'

interface VoiceCase {
    audio: string
    expected_command: string | null
    text?: string
    group?: boolean
}

const manifest = process.argv[2]
if (!manifest) throw new Error('Usage: bun run scripts/voice-command.bench.ts manifest.jsonl')
const cases = fs.readFileSync(manifest, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as VoiceCase)
const voiceUrl = process.env.WHISPER_URL || 'http://127.0.0.1:8090'
const concurrency = Number(process.env.BENCH_CONCURRENCY || 1)
const voiceLatencies: number[] = []
const totalLatencies: number[] = []
const rows: Array<Record<string, unknown>> = []
let correct = 0
let decisions = 0

for (let start = 0; start < cases.length; start += concurrency) {
    const batch = cases.slice(start, start + concurrency)
    await Promise.all(batch.map(async voiceCase => {
        const began = performance.now()
        const form = new FormData()
        form.append('file', fs.createReadStream(voiceCase.audio))
        form.append('language', process.env.WHISPER_LANGUAGE || 'pt')
        form.append('task', 'transcribe')
        form.append('vad_filter', 'false')
        const transcriptionResponse = await axios.post(`${voiceUrl.replace(/\/$/, '')}/transcribe`, form, {
            headers: form.getHeaders(), timeout: Number(process.env.WHISPER_TIMEOUT_MS || 8000),
            maxContentLength: 8 * 1024 * 1024, maxBodyLength: 8 * 1024 * 1024
        })
        const transcribedAt = performance.now()
        const transcription = transcriptionResponse.data
        const options = getSemanticCommandsForContext(voiceCase.group === true)
        const decision = await getSemanticDecision(transcription.text, options)
        const finishedAt = performance.now()
        const expected = voiceCase.expected_command
        const actual = decision?.command ?? null
        if (expected !== undefined) {
            decisions++
            if (actual === expected) correct++
        }
        voiceLatencies.push(transcribedAt - began)
        totalLatencies.push(finishedAt - began)
        rows.push({
            expected,
            actual,
            correct: expected === undefined ? null : actual === expected,
            language: transcription.language,
            audioDurationMs: transcription.duration_ms,
            whisperInferenceMs: transcription.inference_ms,
            whisperRequestMs: transcription.request_ms,
            semanticMs: decision?.latencyMs ?? null,
            confidence: decision?.confidence ?? null,
            semanticStages: decision?.stages ?? null,
            totalAudioToCommandMs: Number((finishedAt - began).toFixed(2))
        })
    }))
}

console.log(JSON.stringify({
    whisperModel: process.env.WHISPER_MODEL || 'base',
    computeType: process.env.WHISPER_COMPUTE_TYPE || 'int8',
    cpuThreads: process.env.WHISPER_CPU_THREADS || '4',
    workers: process.env.WHISPER_INTRA_THREADS || '1',
    concurrency,
    commandAccuracy: decisions ? correct / decisions : null,
    transcriptionP50Ms: percentile(voiceLatencies, .50),
    transcriptionP95Ms: percentile(voiceLatencies, .95),
    transcriptionP99Ms: percentile(voiceLatencies, .99),
    endToEndP50Ms: percentile(totalLatencies, .50),
    endToEndP95Ms: percentile(totalLatencies, .95),
    endToEndP99Ms: percentile(totalLatencies, .99),
    cases: rows
}, null, 2))

function percentile(values: number[], percentileValue: number): number | null {
    if (!values.length) return null
    const sorted = [...values].sort((a, b) => a - b)
    return Number(sorted[Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1)].toFixed(2))
}
