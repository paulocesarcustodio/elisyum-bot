import type { Group } from '../interfaces/group.interface.js'
import type { Message } from '../interfaces/message.interface.js'
import type { Bot } from '../interfaces/bot.interface.js'
import type { SemanticCommand } from './semantic.registry.helper.js'
import { semanticCommands, getSemanticCommand } from './semantic.registry.helper.js'
import { SemanticCommandService, type SemanticDecision } from '../services/semantic-command.service.js'
import { GroupController } from '../controllers/group.controller.js'
import { getContactFromStore } from './contacts.store.helper.js'
import { normalizeWhatsappJid } from '../utils/whatsapp.util.js'
import { extractUrls } from '../utils/general.util.js'
import { transcribeVoiceMessage } from '../services/voice-transcription.service.js'
import { isExplicitStickerRequest, matchExplicitIntent } from '../utils/semantic-intent.util.js'
import { traceVoice } from './voice-trace.helper.js'

const semanticService = new SemanticCommandService()
const pendingConfirmations = new Map<string, {
    command: SemanticCommand
    expiresAt: number
    message: Message
}>()
const semanticCommandAttempts = new Map<string, number[]>()
const confidenceThreshold = Number(process.env.SEMANTIC_COMMAND_THRESHOLD || 0.7)
const confidenceFloor = Number(process.env.SEMANTIC_COMMAND_FLOOR || 0.15)
const highRiskConfidence = Number(process.env.SEMANTIC_HIGH_RISK_CONFIDENCE || 0.92)
const DEBUG_METRICS = process.env.SEMANTIC_COMMAND_METRICS === 'true'

export type SemanticRouteResult =
    | { status: 'not-applicable' }
    | { status: 'handled', invoke: false }
    | { status: 'handled', invoke: true }

export async function routeSemanticCommand(
    client: import('@whiskeysockets/baileys').WASocket,
    botInfo: Bot,
    message: Message,
    group: Group | null
): Promise<SemanticRouteResult> {
    const semanticEnabled = process.env.SEMANTIC_COMMANDS_ENABLED === 'true' || botInfo.semantic_commands === true
    if (message.isBotMessage || message.isBroadcast) return {status: 'not-applicable'}
    if (message.command.startsWith(botInfo.prefix)) return {status: 'not-applicable'}
    if (!semanticEnabled && message.type === 'audioMessage') return {status: 'not-applicable'}
    if (message.type === 'audioMessage' && (!message.media?.seconds || message.media.seconds >= 10)) {
        traceVoice('duration_skipped', message, `seconds=${message.media?.seconds ?? 'unknown'}`)
        return {status: 'not-applicable'}
    }
    const pendingKey = `${message.chat_id}:${message.sender}`
    const pending = pendingConfirmations.get(pendingKey)
    if (pending && pending.expiresAt <= Date.now()) pendingConfirmations.delete(pendingKey)
    else if (pending) {
        let pendingReply = null
        if (isVoiceMessageType(message.type) && process.env.VOICE_COMMANDS_ENABLED === 'true') {
            pendingReply = await transcribeVoiceMessage(client, message)
        }
        const confirmationText = pendingReply?.text || message.body
        if (!confirmationText.trim()) {
            await replyText(client, message, 'Responda com “confirmar” ou “cancelar” para decidir sobre a ação pendente.')
            return {status: 'handled', invoke: false}
        }
        if (isRejection(confirmationText) || /\b(?:nao|nunca|nem)\b/i.test(normalizeName(confirmationText))) {
            pendingConfirmations.delete(pendingKey)
            await replyText(client, message, 'Ação cancelada.')
            return {status: 'handled', invoke: false}
        }
        if (!isConfirmation(confirmationText)) {
            pendingConfirmations.delete(pendingKey)
        } else {
        pendingConfirmations.delete(pendingKey)
        const pendingCommand = pending.command
        if (isVoiceMessageType(message.type) && process.env.VOICE_COMMANDS_ENABLED === 'true') {
            if (!pendingReply) {
                await replyText(client, message, 'Não consegui validar a confirmação por áudio. Responda por texto com confirmar ou cancelar.')
                return {status: 'handled', invoke: false}
            }
            message.semanticTranscript = pendingReply.text
            message.semanticSource = 'audio'
            message.body = pendingReply.text
        }
        const confirmationIntent = await semanticService.classify(
            `O usuário recebeu um pedido para confirmar a ação ${pendingCommand.name}. Resposta: ${confirmationText}`,
            [pendingCommand],
            describeContext(message, group)
        )
        if (confirmationIntent?.command !== pendingCommand.name || confirmationIntent.confidence < confidenceThreshold) {
            pendingConfirmations.delete(pendingKey)
            await replyText(client, message, 'Não consegui validar a confirmação; a ação não foi executada.')
            return {status: 'handled', invoke: false}
        }
        const executionMessage = pending.message
        if (group && executionMessage.isGroupMsg) {
            executionMessage.isGroupAdmin = await new GroupController().isParticipantAdmin(group.id, executionMessage.sender)
        }
        const permissionError = await validateExecutionGates(client, botInfo, executionMessage, group, pendingCommand)
        if (permissionError) {
            pendingConfirmations.delete(pendingKey)
            await replyText(client, message, permissionError)
            return {status: 'handled', invoke: false}
        }
        pendingConfirmations.delete(pendingKey)
        await applySemanticCommandContext(client, executionMessage, group, pendingCommand)
        applySemanticCommand(executionMessage, botInfo, pendingCommand)
        Object.assign(message, executionMessage)
        return {status: 'handled', invoke: true}
        }
    }

    if (message.type === 'audioMessage' && process.env.VOICE_COMMANDS_ENABLED === 'true' && !message.semanticTranscript) {
        // An audio has no text to inspect until it has been transcribed.
        if (message.isGroupMsg && !group) return {status: 'not-applicable'}
        try {
            const transcription = await transcribeVoiceMessage(client, message)
            if (!transcription?.text) {
                traceVoice('transcription_empty', message)
                if (!message.isGroupMsg) await replyText(client, message, 'Não consegui transcrever o áudio. Tente novamente ou envie o pedido por texto.')
                return {status: 'not-applicable'}
            }
            message.semanticTranscript = transcription.text
            message.semanticSource = 'audio'
            traceVoice('transcribed', message, `duration_ms=${transcription.durationMs ?? 'unknown'}`)
            if (process.env.VOICE_COMMAND_METRICS === 'true') {
                console.info(JSON.stringify({
                    type: 'voice_command', source: 'audio', model: transcription.model,
                    audio_duration_ms: transcription.durationMs ?? null,
                    download_ms: transcription.downloadMs ?? null,
                    conversion_ms: transcription.conversionMs ?? null,
                    transcription_ms: transcription.inferenceMs ?? null,
                    total_transcription_ms: transcription.totalMs,
                    command: message.command.startsWith(botInfo.prefix) ? message.command.slice(botInfo.prefix.length) : null
                }))
            }
        } catch (error) {
            traceVoice('transcription_failed', message, error instanceof Error ? error.name : 'unknown')
            console.warn('[Voice] Falha ao processar áudio:', error instanceof Error ? error.message : error)
            if (!message.isGroupMsg) await replyText(client, message, 'Não consegui processar o áudio. Tente novamente ou envie o pedido por texto.')
            return {status: 'not-applicable'}
        }
    }
    if (!(message.semanticTranscript || message.body || message.caption).trim()) return {status: 'not-applicable'}
    if (message.isGroupMsg && !group) return {status: 'not-applicable'}
    const activated = !message.isGroupMsg || hasActivationSignal(message, botInfo)
    traceVoice('activation_checked', message, activated ? 'active' : 'inactive')
    const eligible = semanticCommands.filter(command => {
        if (command.destructive && message.semanticSource === 'audio' && command.name === 'grupo') return false
        if (command.category === 'group' && !message.isGroupMsg) return false
        if (command.category === 'admin' && !message.isBotOwner) return false
        if (command.category === 'admin' && message.isGroupMsg) return false
        if (command.category === 'info' && command.name === 'erros' && !message.isBotOwner) return false
        if (['bloquear', 'desbloquear', 'usuario'].includes(command.name) && !message.isBotOwner) return false
        return true
    })
    if (!eligible.length) return {status: 'not-applicable'}
    const text = stripActivationPrefix(message, botInfo)
    if (!text) return {status: 'not-applicable'}

    const hasStickerSource = message.isQuoted || message.type === 'imageMessage' || message.type === 'videoMessage'
    const explicit = matchExplicitIntent(text, hasStickerSource)
    traceVoice('explicit_checked', message, explicit ? `match=${explicit.command}` : 'no_match')
    if (!explicit && message.semanticSource === 'audio') {
        traceVoice('unmatched_transcript', message, `quoted=${message.isQuoted} text=${JSON.stringify(text.slice(0, 160))}`)
    }
    if (explicit && (activated || explicit.command === 'play' || (hasStickerSource && explicit.command === 's'))
        && eligible.some(command => command.name === explicit.command)) {
        if (message.isGroupMsg && group?.block_cmds.includes(explicit.command) && !message.isGroupAdmin) return {status: 'not-applicable'}
        if (botInfo.block_cmds.includes(explicit.command) && !message.isBotOwner) return {status: 'not-applicable'}
        message.command = `${botInfo.prefix}${explicit.command}`
        message.args = explicit.args
        message.text_command = explicit.args.join(' ')
        return {status: 'handled', invoke: true}
    }
    if (activated && !explicit && isExplicitStickerRequest(text)) {
        await replyText(client, message, 'Para fazer a figurinha, responda a uma mensagem de texto, imagem ou vídeo, ou envie a imagem com o pedido na legenda.')
        return {status: 'handled', invoke: false}
    }
    if (!activated) return {status: 'not-applicable'}
    if (!semanticEnabled) return {status: 'not-applicable'}

    if (message.isBotOwner && !message.isGroupMsg && /\b(?:altere?|mude?|troque?|ligue?|desligue?|ative?|desative?|bloqueie?|desbloqueie?|configure?)\b/i.test(text)
        && !/\b(?:bot|elisyum|eliseu|elysium|robo|robô)\b/i.test(text)) return {status: 'not-applicable'}

    const rateKey = `${message.chat_id}:${message.sender}`
    const now = Date.now()
    const attempts = (semanticCommandAttempts.get(rateKey) || []).filter(timestamp => now - timestamp < 60_000)
    if (attempts.length >= 8) return {status: 'not-applicable'}
    attempts.push(now)
    semanticCommandAttempts.set(rateKey, attempts)
    if (semanticCommandAttempts.size > 2000) semanticCommandAttempts.delete(semanticCommandAttempts.keys().next().value!)

    const decision = await classifyWithMetrics(text, eligible, describeContext(message, group))
    traceVoice('classified', message, decision ? `candidate=${decision.command} confidence=${decision.confidence.toFixed(3)}` : 'no_decision')
    if (!decision) return {status: 'not-applicable'}

    if (decision.confidence < confidenceFloor) return {status: 'not-applicable'}

    const command = getSemanticCommand(decision.command)
    if (!command) return {status: 'not-applicable'}

    if (command.replyContext === 'target' && group && !message.mentioned.length && !message.isQuoted) {
        const resolution = await resolveTargetByName(message, group, command)
        if (resolution === 'ambiguous') {
            await replyText(client, message, `Encontrei mais de uma pessoa com esse nome. Marque a pessoa correta e repita o pedido.`)
            return {status: 'handled', invoke: false}
        }
        if (resolution === 'missing') {
            await replyText(client, message, 'Não consegui identificar o membro. Marque a pessoa ou responda à mensagem dele e tente novamente.')
            return {status: 'handled', invoke: false}
        }
    }
    if (command.replyContext === 'target' && group && message.mentioned.length && !message.isQuoted) {
        const mentionsResolve = await applySemanticCommandContext(client, message, group, command)
        if (!mentionsResolve) {
            await replyText(client, message, 'Não consegui validar a pessoa mencionada nos membros do grupo. Responda à mensagem dela e tente novamente.')
            return {status: 'handled', invoke: false}
        }
    }
    if (command.replyContext === 'target' && !group && !message.mentioned.length && !message.isQuoted) {
        await replyText(client, message, 'Marque ou responda à mensagem da pessoa para que eu possa identificar o alvo com segurança.')
        return {status: 'handled', invoke: false}
    }
    if (command.replyContext === 'media' && !message.isQuoted && !message.media && !extractUrls(message.semanticTranscript || message.body).length) {
        await replyText(client, message, 'Envie a mídia ou responda à mensagem que deseja usar.')
        return {status: 'handled', invoke: false}
    }

    const needsConfirmation = command.destructive
    if (needsConfirmation) {
        await replyText(client, message, `Entendi que você quer executar *${command.name}*. Confirme respondendo *confirmar* em até 30 segundos.`)
        pendingConfirmations.set(pendingKey, {command, expiresAt: Date.now() + 30_000, message: {...message}})
        return {status: 'handled', invoke: false}
    }

    if (command.category === 'group' && message.isGroupMsg && group?.restricted && !message.isGroupAdmin && !message.isBotOwner) {
        return {status: 'not-applicable'}
    }
    if (command.category === 'group' && message.isGroupMsg && group?.block_cmds.includes(command.name) && !message.isGroupAdmin) {
        return {status: 'not-applicable'}
    }
    if (botInfo.block_cmds.includes(command.name) && !message.isBotOwner) return {status: 'not-applicable'}
    await applySemanticCommandContext(client, message, group, command)
    const permissionError = await validateExecutionGates(client, botInfo, message, group, command)
    if (permissionError) {
        return {status: 'not-applicable'}
    }
    applySemanticCommand(message, botInfo, command)
    return {status: 'handled', invoke: true}
}

async function resolveTargetByName(message: Message, group: Group, command: SemanticCommand): Promise<'found' | 'ambiguous' | 'missing'> {
    const query = extractTargetName(message.body, command.name)
    if (!query || query.length < 2) return 'missing'
    const groupController = new GroupController()
    const participants = await groupController.getParticipants(group.id)
    const normalizedQuery = normalizeName(query)
    const namedParticipants = participants.map(participant => {
        const contact = getContactFromStore(participant.user_id)
        const names = [contact?.notify, contact?.name, contact?.verifiedName]
            .filter((name): name is string => !!name)
            .map(normalizeName)
        return {participant, names}
    })
    const exactMatches = namedParticipants.filter(({names}) => names.includes(normalizedQuery))
    const matches = exactMatches.length ? exactMatches : namedParticipants.filter(({names}) =>
        names.some(name => name.startsWith(`${normalizedQuery} `) || normalizedQuery.startsWith(`${name} `))
    )
    if (matches.length === 1) {
        message.mentioned = [matches[0].participant.user_id]
        return 'found'
    }
    return matches.length ? 'ambiguous' : 'missing'
}

async function applySemanticCommandContext(
    client: import('@whiskeysockets/baileys').WASocket,
    message: Message,
    group: Group | null,
    command: SemanticCommand
): Promise<boolean> {
    if (message.isQuoted && message.quotedMessage) return true
    if (command.replyContext === 'media' && message.media) {
        message.quotedMessage = {
            type: message.type,
            sender: message.sender,
            senderAlt: message.senderAlt,
            body: message.body,
            caption: message.caption,
            mentioned: message.mentioned,
            isMedia: message.isMedia,
            media: message.media,
            wa_message: message.wa_message
        }
        message.isQuoted = true
        return true
    }
    if (command.replyContext !== 'target' || !group) return true
    const target = message.mentioned.length === 1 ? message.mentioned[0] : message.args.length === 1 && message.args[0].includes('@') ? normalizeWhatsappJid(message.args[0]) : undefined
    if (!target) return false
    const metadata = await client.groupMetadata(group.id)
    const participant = metadata.participants.find(entry => {
        const candidate = entry as typeof entry & {phoneNumber?: string; lid?: string}
        return [candidate.id, candidate.phoneNumber, candidate.lid]
            .filter((id): id is string => !!id)
            .some(id => normalizeWhatsappJid(id) === normalizeWhatsappJid(target))
    })
    if (!participant) return false
    const displayName = participant.notify || participant.name || participant.verifiedName
    if (!displayName) return false
    const targetMessage = new (await import('@whiskeysockets/baileys')).proto.WebMessageInfo()
    targetMessage.key = {remoteJid: group.id, participant: target, id: `semantic-${message.message_id}`, fromMe: false}
    targetMessage.message = {conversation: displayName}
    message.quotedMessage = {
        type: 'conversation',
        sender: target,
        pushname: displayName,
        body: displayName,
        caption: '',
        mentioned: [],
        isMedia: false,
        wa_message: targetMessage as Message['wa_message']
    }
    message.isQuoted = true
    return true
}

async function validateExecutionGates(
    client: import('@whiskeysockets/baileys').WASocket,
    botInfo: Bot,
    message: Message,
    group: Group | null,
    command: SemanticCommand
): Promise<string | null> {
    if (command.category === 'admin' && (!message.isBotOwner || message.isGroupMsg)) return 'Este comando só pode ser usado pelo dono do bot no privado.'
    if (command.category === 'group' && (!group || !message.isGroupMsg)) return 'Este comando só pode ser usado em um grupo.'
    if (command.name === 'bloquear' || command.name === 'desbloquear' || command.name === 'usuario') {
        if (!message.isBotOwner) return 'Este comando só pode ser usado pelo dono do bot.'
    }
    if (command.name === 's' && !message.isQuoted && !message.media && !message.semanticTranscript) return 'Envie uma imagem/vídeo ou responda ao conteúdo que deseja transformar em figurinha.'
    if (command.name === 'mp3' && !message.isQuoted && !message.media && !extractUrls(message.semanticTranscript || message.body).length) return 'Responda a um vídeo ou envie um link para extrair o áudio.'
    if (message.isGroupMsg && (command.name === 'ban' || command.name === 'silenciar' || command.name === 'promover' || command.name === 'rebaixar')) {
        if (!group) return 'Este comando só pode ser usado em um grupo.'
        const targeted = message.mentioned[0] || (message.isQuoted ? message.quotedMessage?.sender : undefined)
        if (targeted && targeted === normalizeWhatsappJid(botInfo.host_number)) return 'Essa ação não pode ser direcionada ao próprio bot.'
        if (command.name === 'ban' || command.name === 'silenciar') {
            const groupController = new GroupController()
            if (targeted && await groupController.isParticipantAdmin(group.id, targeted)) return 'Essa ação não pode ser direcionada a um administrador do grupo.'
            if (targeted && command.name === 'ban' && !await groupController.isParticipant(group.id, targeted)) return 'Esse membro não está neste grupo.'
            if (targeted && command.name === 'silenciar' && !await groupController.isParticipant(group.id, targeted)) return 'Esse membro não está neste grupo.'
        }
        if (command.name === 'promover' && targeted && await new GroupController().isParticipantAdmin(group.id, targeted)) return 'Esse membro já é administrador do grupo.'
        if (command.name === 'rebaixar' && targeted && !await new GroupController().isParticipantAdmin(group.id, targeted)) return 'Esse membro já é um participante comum.'
    }
    void client
    return null
}

async function passesSemanticGroupGates(
    client: import('@whiskeysockets/baileys').WASocket,
    botInfo: Bot,
    group: Group,
    message: Message
): Promise<boolean> {
    const procedures = await import('./message.procedures.helper.js')
    if (await procedures.isBotLimitedByGroupRestricted(group, botInfo)) return false
    if (await procedures.isDetectedByAntiLink(client, botInfo, group, message)) return false
    if (await procedures.isDetectedByWordFilter(client, botInfo, group, message)) return false
    if (await procedures.isDetectedByAntiFlood(client, botInfo, group, message)) return false
    return !(await procedures.isUserBlocked(client, message))
}

export function getSemanticDecision(text: string, commands: SemanticCommand[], context = ''): Promise<SemanticDecision | null> {
    return semanticService.classify(text, commands, context)
}

function classifyWithMetrics(text: string, commands: SemanticCommand[], context: string) {
    const started = performance.now()
    return semanticService.classify(text, commands, context).then(decision => {
        if (DEBUG_METRICS) {
            console.info(JSON.stringify({
                type: 'semantic_command',
                service_ms: decision?.latencyMs ?? null,
                route_ms: performance.now() - started,
                confidence: decision?.confidence ?? null,
                command: decision?.command ?? null,
                option_count: commands.length,
                stages: decision?.stages ?? null
            }))
        }
        return decision
    })
}

export function hasActivationSignal(message: Message, botInfo: Bot): boolean {
    const body = message.semanticTranscript || message.body || message.caption
    const normalizedBody = normalizeName(body)
    const botNumber = botInfo.host_number.replace(/\D/g, '')
    const directMention = message.hasBotMention === true || message.mentioned.some(mention => normalizeWhatsappJid(mention) === normalizeWhatsappJid(botInfo.host_number))
    const wakeWord = startsWithWakeWord(message)
    const replyToBot = isReplyToBot(message, botInfo)
    const configuredWakeWord = (process.env.SEMANTIC_WAKE_WORDS || '').split(',').map(word => normalizeName(word)).filter(Boolean)
    const configuredWake = configuredWakeWord.some(word => normalizedBody.startsWith(`${word} `))
    return directMention || wakeWord || replyToBot || configuredWake || (!!botNumber && body.includes(`@${botNumber}`))
}

function startsWithWakeWord(message: Message): boolean {
    const body = message.semanticTranscript || message.body || message.caption
    if (/^(?:ei\s+)?(?:bot|robo|robô|elisyum|eliseu|elysium)[,:\s]+/i.test(body.trim())) return true
    const configured = (process.env.SEMANTIC_WAKE_WORDS || '').split(',').map(normalizeName).filter(Boolean)
    const normalized = normalizeName(body)
    return configured.some(word => normalized.startsWith(`${word} `))
}

function isReplyToBot(message: Message, botInfo: Bot): boolean {
    return message.isQuoted && !!message.quotedMessage && (
        normalizeWhatsappJid(message.quotedMessage.sender) === normalizeWhatsappJid(botInfo.host_number)
        || normalizeWhatsappJid(message.quotedMessage.senderAlt) === normalizeWhatsappJid(botInfo.host_number)
    )
}

function isVoiceMessageType(type: Message['type']): boolean {
    return type === 'audioMessage'
}

function hasDirectAddress(message: Message, botInfo: Bot): boolean {
    const number = botInfo.host_number.replace(/\D/g, '')
    return message.hasBotMention === true || message.mentioned.some(mention => normalizeWhatsappJid(mention) === normalizeWhatsappJid(botInfo.host_number))
        || (!!number && message.body.includes(`@${number}`))
}

function stripActivationPrefix(message: Message, botInfo: Bot): string {
    let text = message.semanticTranscript || message.body || message.caption
    const number = botInfo.host_number.replace(/\D/g, '')
    if (number) text = text.replace(new RegExp(`@${number}`, 'g'), ' ')
    return text.replace(/^(?:ei\s+)?(?:bot|robo|robô|elisyum|eliseu|elysium)[,:\s]+/i, '').trim()
}

function applySemanticCommand(message: Message, botInfo: Bot, command: SemanticCommand): void {
    const isTraditionalCommand = message.command.startsWith(botInfo.prefix)
    message.args = isTraditionalCommand ? message.args : extractSemanticArguments(message.semanticTranscript || message.body, command.name)
    message.text_command = message.args.join(' ')
    message.command = `${botInfo.prefix}${command.name}`
}

function extractSemanticArguments(text: string, commandName: string): string[] {
    const patterns: Record<string, RegExp[]> = {
        d: [/\b(?:baix(?:a|ar)|faz|fazer|download|salv(?:a|ar))\b/gi],
        play: [/\b(?:toca|toque|baix(?:a|ar)|procura|busca|musica|audio|som)\b/gi],
        mp3: [/\b(?:extrai|extrair|pega|pegue|s[oó]|apenas|audio|mp3|som|video)\b/gi],
        img: [/\b(?:procura|pesquisa|busca|manda|envia|imagem|imagens|foto|fotos)\b/gi],
        addfiltros: [/\b(?:adiciona|adicione|inclui|inclua|filtra)\b/gi],
        rmfiltros: [/\b(?:remove|remova|tira|retira)\b/gi],
        addresp: [/\b(?:adiciona|adicione|cria|configure)\b/gi],
        rmresp: [/\b(?:remove|remova|apaga|apague|tira)\b/gi],
        addexlink: [/\b(?:adiciona|adicione|libera|inclui)\b/gi],
        rmexlink: [/\b(?:remove|remova|bloqueia|retira)\b/gi],
        addexfake: [/\b(?:adiciona|adicione|libera|inclui)\b/gi],
        rmexfake: [/\b(?:remove|remova|retira)\b/gi],
        taxacomandos: [/\b(?:limite|taxa|comandos?|por minuto)\b/gi],
        prefixo: [/\b(?:muda|mude|troca|troque|prefixo|para|pra)\b/gi],
        nomebot: [/\b(?:muda|mude|troca|troque|nome|bot|para|pra)\b/gi],
        recado: [/\b(?:muda|mude|troca|troque|status|recado|bot|para|pra)\b/gi],
        ban: [/\b(?:bane|banir|expulsa|expulsar|remove|remover|tira|tirar)\b/gi],
        silenciar: [/\b(?:silencia|silenciar|muta|mutar|desmuta|dessilencia|tira|tirar)\b/gi],
        promover: [/\b(?:promove|promover|torna|transforma|admin|administrador|pra|para|em)\b/gi],
        rebaixar: [/\b(?:rebaixa|rebaixar|tira|tirar|admin|administrador|de)\b/gi],
        grupo: [/\b(?:me|mostra|mostrar|exibe|exibir|informacoes|dados|do|da|desse|deste|grupo)\b/gi],
        adms: [/\b(?:quem|quais|sao|os|as|admins?|administradores|marca)\b/gi],
        dono: [/\b(?:quem|qual|e|o|a|dono|dona|do|da|grupo)\b/gi],
        link: [/\b(?:me|passa|manda|mostra|qual|link|do|da|grupo)\b/gi]
    }
    let residual = text
    for (const pattern of patterns[commandName] || []) residual = residual.replace(pattern, ' ')
    residual = residual.replace(/@\d+/g, ' ').replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim()
    return residual ? [residual] : []
}

function stripCommandPhrase(text: string, command: string): string {
    const patterns: Record<string, RegExp> = {
        ban: /\b(?:ban(?:e|ir)?|expuls(?:a|ar)|remov(?:e|er)|tira(?:r)?)\b/i,
        silenciar: /\b(?:silenci(?:a|ar)|mut(?:a|ar)|desmuta(?:r)?|dessilenci(?:a|ar))\b/i,
        promover: /\b(?:promov(?:e|er)|torna|d[aá])\b/i,
        rebaixar: /\b(?:rebaix(?:a|ar)|tir(?:a|ar))\b/i,
        s: /\b(?:faz|cria|transforma|converte)\b.{0,25}\b(?:figurinha|sticker|adesivo)s?\b/i,
        mp3: /\b(?:extrai|extrair|pega|baix(?:a|ar))\b.{0,25}\b(?:audio|mp3|som)\b/i,
        d: /\b(?:baix(?:a|ar)|faz|fazer)\b.{0,15}\b(?:download|video|midia)\b/i,
        grupo: /\b(?:mostra|mostrar|me mostra|exibe|quais|informacoes|dados)\b/i,
        adms: /\b(?:quem|quais|mostra|lista|marca)\b/i,
        link: /\b(?:me passa|manda|mostra|qual|pega|quero)\b/i,
        dono: /\b(?:quem|qual|me fala|mostra)\b/i
    }
    const pattern = patterns[command]
    return pattern ? text.replace(pattern, '').replace(/\b(?:bot|por favor|pra mim|para mim|disso|dessa|desse|isso|esse|essa)\b/gi, '').trim() : text.trim()
}

function describeContext(message: Message, group: Group | null): string {
    return [
        message.isGroupMsg ? `Contexto: grupo${group ? ` chamado ${group.name}` : ''}.` : 'Contexto: conversa privada com o bot.',
        message.isQuoted ? `Há uma mensagem respondida do tipo ${message.quotedMessage?.type}.` : '',
        message.mentioned.length ? 'A mensagem contém uma ou mais menções.' : ''
    ].filter(Boolean).join(' ')
}

function extractTargetName(text: string, commandName: string): string {
    const withoutIntent = stripCommandPhrase(text, commandName)
        .replace(/^(?:bot|por favor|o|a|os|as|do|da|de|pra|para)\s+/i, '')
        .replace(/\b(?:do grupo|do mute|de admin|pra admin|administrador|admin)\b/gi, '')
        .trim()
    const cleaned = withoutIntent
        .replace(/\b(?:ele|ela|dele|dela|isso|desse|dessa|meu|minha|este|esta|esse|essa|cara|pessoa|membro)\b/gi, ' ')
        .replace(/\b(?:o|a|os|as|do|da|de|pra|para|por favor|bot)\b/gi, ' ')
        .replace(/\b(?:e|eh|por|favor|porfavor)\b/gi, ' ')
        .replace(/\b(?:grupo|admin|administrador|mute|figurinhas?|sticker|video|audio|mp3|link|informacoes|dados)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    if (!cleaned) return ''
    const tokens = cleaned.split(' ').filter(token => !/^(?:bane|silencia|muta|promove|rebaixa|tira|remove|expulsa|transforma|faz|extrai|pega|baixa|mostra|manda|qual|quem|quais|isso|aqui|ali)$/i.test(token))
    return tokens.slice(-3).join(' ').trim()
}

function normalizeName(name: string): string {
    return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9@ ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function isConfirmation(text: string): boolean {
    return /^(confirmo|confirmar|sim|pode|pode sim|vai|executa)$/i.test(normalizeName(text))
}

function isRejection(text: string): boolean {
    return /^(nao|cancela|cancelar|deixa|pare)$/i.test(normalizeName(text))
}

async function replyText(client: import('@whiskeysockets/baileys').WASocket, message: Message, text: string) {
    const whatsapp = await import('../utils/whatsapp.util.js')
    await whatsapp.replyText(client, message.chat_id, text, message.wa_message, {expiration: message.expiration})
}
