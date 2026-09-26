import { performance } from 'node:perf_hooks'
import { getSemanticCommandsForContext } from '../src/helpers/semantic.registry.helper.js'
import { SemanticCommandService } from '../src/services/semantic-command.service.js'

type Case = {text: string, expected: string | null, group: boolean}

const cases: Case[] = [
    {text: 'bane o João', expected: 'ban', group: true},
    {text: 'expulsa ele', expected: 'ban', group: true},
    {text: 'tira esse cara do grupo', expected: 'ban', group: true},
    {text: 'silencia a Maria', expected: 'silenciar', group: true},
    {text: 'muta ela', expected: 'silenciar', group: true},
    {text: 'desmuta a Maria', expected: 'silenciar', group: true},
    {text: 'promove o Carlos pra admin', expected: 'promover', group: true},
    {text: 'torna ele administrador', expected: 'promover', group: true},
    {text: 'tira ele de admin', expected: 'rebaixar', group: true},
    {text: 'faz figurinha disso', expected: 's', group: false},
    {text: 'transforma isso em sticker', expected: 's', group: false},
    {text: 'extrai o áudio desse vídeo', expected: 'mp3', group: false},
    {text: 'pega só o áudio', expected: 'mp3', group: false},
    {text: 'baixa esse vídeo', expected: 'd', group: false},
    {text: 'faz download desse link', expected: 'd', group: false},
    {text: 'me mostra as informações do grupo', expected: 'grupo', group: true},
    {text: 'quais são os admins?', expected: 'adms', group: true},
    {text: 'quem é o dono daqui', expected: 'dono', group: true},
    {text: 'conversa normal sobre silenciar o João ontem', expected: null, group: true},
    {text: 'não bane o João', expected: null, group: true}
]

const service = new SemanticCommandService()
const results: Array<{expected: string | null, actual: string | null, latencyMs: number, stages: number | null}> = []
for (const item of cases) {
    const started = performance.now()
    const decision = await service.classify(item.text, getSemanticCommandsForContext(item.group))
    results.push({
        expected: item.expected,
        actual: decision?.command ?? null,
        latencyMs: performance.now() - started,
        stages: decision?.stages ?? null
    })
}

const measured = results.map(result => result.latencyMs).sort((a, b) => a - b)
const serviceReachable = results.some(result => result.actual !== null)
const accuracy = serviceReachable ? results.filter(result => result.expected === result.actual).length / results.length : null
const summary = {
    model: process.env.OPENJEV_MODEL || 'verdict-1.4',
    routingMode: process.env.OPENJEV_ROUTING_MODE || 'auto',
    totalCases: results.length,
    accuracy,
    status: serviceReachable ? 'model_evaluated' : 'openjev_unavailable_or_no_result',
    p50Ms: percentile(measured, 0.50),
    p95Ms: percentile(measured, 0.95),
    p99Ms: percentile(measured, 0.99),
    serviceConfigured: !!process.env.OPENJEV_URL,
    results
}
console.log(JSON.stringify(summary, null, 2))
if (!process.env.OPENJEV_URL) process.exitCode = 2

function percentile(sorted: number[], percentileValue: number): number {
    if (!sorted.length) return 0
    return Number(sorted[Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1)].toFixed(2))
}
