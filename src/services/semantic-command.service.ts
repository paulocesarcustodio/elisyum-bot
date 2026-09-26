import { performance } from 'node:perf_hooks'
import axios from 'axios'
import type { SemanticCommand } from '../helpers/semantic.registry.helper.js'

export interface SemanticDecision {
    command: string
    confidence: number
    latencyMs: number
    candidates: Record<string, number>
    stages: number
}

interface OpenJevChoiceResponse {
    answers?: Record<string, {
        type: 'choice'
        choice: string
        probabilities?: Record<string, number>
        confidence?: number
    }>
}

const REQUEST_TIMEOUT_MS = 4000

export class SemanticCommandService {
    private readonly httpsAgent = new (require('node:https').Agent)({keepAlive: true, maxSockets: 2})
    private readonly httpAgent = new (require('node:http').Agent)({keepAlive: true, maxSockets: 2})

    public async classify(text: string, commands: SemanticCommand[], context = ''): Promise<SemanticDecision | null> {
        if (!commands.length) return null
        const endpoint = process.env.OPENJEV_URL || 'http://127.0.0.1:8080'
        const model = process.env.OPENJEV_MODEL || 'verdict-1.4'
        const maxOptions = model.startsWith('verdict') ? 24 : 255
        const flatAllowed = commands.length + 1 <= maxOptions
        const mode = process.env.OPENJEV_ROUTING_MODE || 'auto'
        if (mode === 'flat' && !flatAllowed) return null

        const started = performance.now()
        try {
            const result = mode === 'hierarchical' || !flatAllowed
                ? await this.classifyHierarchical(text, commands, endpoint, model, context, maxOptions)
                : await this.classifyFlat(text, commands, endpoint, model, context)
            if (!result) return null
            return {
                command: result.name,
                confidence: result.confidence,
                candidates: result.probabilities,
                stages: result.stages,
                latencyMs: performance.now() - started
            }
        } catch (error) {
            console.warn('[Semantic] OpenJev indisponível; mantendo o fluxo normal.', error instanceof Error ? error.message : error)
            return null
        }
    }

    private async classifyFlat(text: string, commands: SemanticCommand[], endpoint: string, model: string, context: string) {
        const answer = (await this.ask(text, {
            intent: makeQuestion(commands.map(command => ({name: command.name, description: describeCommand(command)})),
                'Escolha o comando existente que melhor atende um pedido explícito. Caso não seja comando claro, escolha none.')
        }, endpoint, model, context)).intent
        if (!answer || answer.name === 'none' || !commands.some(command => command.name === answer.name)) return null
        return {...answer, stages: 1}
    }

    private async classifyHierarchical(
        text: string,
        commands: SemanticCommand[],
        endpoint: string,
        model: string,
        context: string,
        maxOptions: number
    ) {
        const families = new Map<string, SemanticCommand[]>()
        for (const command of commands) {
            const commandsInFamily = families.get(command.family) ?? []
            commandsInFamily.push(command)
            families.set(command.family, commandsInFamily)
        }
        if ([...families.values()].some(family => family.length + 1 > maxOptions)) return null

        const familyAnswer = (await this.ask(text, {
            family: makeQuestion([...families.entries()].map(([name, family]) => ({
                name,
                description: `${name}: ${family.map(command => command.description).join('; ')}`
            })), 'Escolha a família do pedido. Se for conversa, negação ou intenção incerta, escolha none.')
        }, endpoint, model, context)).family
        if (!familyAnswer || familyAnswer.name === 'none') return null
        const family = families.get(familyAnswer.name)
        if (!family) return null
        const commandAnswer = (await this.ask(text, {
            command: makeQuestion(family.map(command => ({name: command.name, description: describeCommand(command)})),
                `Escolha o comando da família ${familyAnswer.name}; se houver dúvida, escolha none.`)
        }, endpoint, model, context)).command
        if (!commandAnswer || commandAnswer.name === 'none' || !family.some(command => command.name === commandAnswer.name)) return null
        const commandEntropyConfidence = scoreEntropy(Object.values(commandAnswer.probabilities))
        return {
            ...commandAnswer,
            confidence: Math.min(commandEntropyConfidence, 1 - (1 - familyAnswer.confidence) * (1 - commandAnswer.confidence)),
            stages: 2
        }
    }

    private async ask(
        text: string,
        questions: Record<string, {type: 'choice', instructions: string, criteria: Record<string, string>}>,
        endpoint: string,
        model: string,
        context: string
    ) {
        const base = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint
        const headers: Record<string, string> = {}
        if (process.env.OPENJEV_API_KEY) headers.authorization = `Bearer ${process.env.OPENJEV_API_KEY}`
        const response = await axios.post(`${base}/v1/systemone`, {
            model,
            state: `${context ? `${context}\n` : ''}Mensagem do usuário: ${text}`,
            questions
        }, {
            headers,
            timeout: REQUEST_TIMEOUT_MS,
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
            maxContentLength: 64 * 1024,
            maxBodyLength: 64 * 1024
        })
        const payload = response.data as OpenJevChoiceResponse
        const answers: Record<string, {name: string, confidence: number, probabilities: Record<string, number>}> = {}
        for (const [id, answer] of Object.entries(payload.answers ?? {})) {
            if (answer.type !== 'choice') continue
            const probabilities = normalizeProbabilities(answer.probabilities ?? {})
            const top = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0]
            const entropyConfidence = entropyScore(Object.values(probabilities))
            const confidence = Number.isFinite(Number(answer.confidence)) ? Number(answer.confidence) : entropyConfidence
            if (top) answers[id] = {
                name: top[0],
                confidence: Math.max(0, Math.min(entropyConfidence, confidence, top[1])),
                probabilities
            }
        }
        return answers
    }
}

function entropyScore(probabilities: number[]): number {
    if (probabilities.length < 2) return 1
    const entropy = -probabilities.reduce((sum, probability) => probability > 0 ? sum + probability * Math.log(probability) : sum, 0)
    return Math.max(0, Math.min(1, 1 - entropy / Math.log(probabilities.length)))
}

function makeQuestion(choices: Array<{name: string, description: string}>, instructions: string) {
    return {
        type: 'choice' as const,
        instructions: `${instructions} Não resolva entidades, não invente identificadores, não avalie permissões e não execute ações.`,
        criteria: {
            none: 'Conversa normal, afirmação sobre terceiros, relato, opinião, negação ou intenção incerta.',
            ...Object.fromEntries(choices.map(choice => [choice.name, choice.description]))
        }
    }
}

function describeCommand(command: SemanticCommand) {
    return `${command.description}${command.examples.length ? `. Exemplos: ${command.examples.join('; ')}` : ''}`
}

function normalizeProbabilities(probabilities: Record<string, number>): Record<string, number> {
    const safe = Object.fromEntries(Object.entries(probabilities).map(([name, probability]) => [
        name,
        Number.isFinite(probability) ? Math.max(0, probability) : 0
    ]))
    const sum = Object.values(safe).reduce((total, probability) => total + probability, 0)
    return sum ? Object.fromEntries(Object.entries(safe).map(([name, probability]) => [name, probability / sum])) : safe
}

function scoreEntropy(probabilities: number[]): number {
    if (probabilities.length < 2) return 1
    const entropy = -probabilities.reduce((total, probability) => probability > 0 ? total + probability * Math.log(probability) : total, 0)
    return Math.max(0, Math.min(1, 1 - entropy / Math.log(probabilities.length)))
}
