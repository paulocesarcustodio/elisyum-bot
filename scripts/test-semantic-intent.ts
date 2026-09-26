import { strict as assert } from 'node:assert'
import { isExplicitStickerRequest, matchExplicitIntent } from '../src/utils/semantic-intent.util.js'
import { hasActivationSignal, routeSemanticCommand } from '../src/helpers/semantic-command.helper.js'
import type { Message } from '../src/interfaces/message.interface.js'
import type { Bot } from '../src/interfaces/bot.interface.js'
import type { Group } from '../src/interfaces/group.interface.js'

assert.deepEqual(matchExplicitIntent('baixe a musica x', false), { command: 'play', args: ['x'] })
assert.deepEqual(matchExplicitIntent('baixe a música Evidências!', false), { command: 'play', args: ['Evidências'] })
assert.deepEqual(matchExplicitIntent('faça uma figurinha disso', true), { command: 's', args: [] })
assert.deepEqual(matchExplicitIntent('faz figurinha disso', true), { command: 's', args: [] })
assert.deepEqual(matchExplicitIntent('transforma isso em figurinha', true), { command: 's', args: [] })
assert.deepEqual(matchExplicitIntent('faz uma figurinha desse texto', true), { command: 's', args: [] })
assert.deepEqual(matchExplicitIntent('faz uma figurinha dessa imagem', true), { command: 's', args: [] })
assert.deepEqual(matchExplicitIntent('coloca a música Evidências', false), { command: 'play', args: ['Evidências'] })
assert.equal(matchExplicitIntent('faça uma figurinha disso', false), null)
assert.equal(isExplicitStickerRequest('faça uma figurinha disso'), true)
assert.equal(isExplicitStickerRequest('não faça uma figurinha disso'), false)
assert.equal(matchExplicitIntent('não baixe a música x', false), null)
assert.equal(matchExplicitIntent('o João disse para baixar a música x', false), null)

const bot = {prefix: '!', host_number: '5511999999999@s.whatsapp.net', block_cmds: []} as Bot
const group = {id: 'test@g.us', block_cmds: []} as unknown as Group
const makeMessage = (body: string, quoted = false) => ({
    body, caption: '', command: body.split(' ')[0].toLowerCase(), chat_id: group.id,
    sender: '5511888888888@s.whatsapp.net', mentioned: [], args: body.split(' ').slice(1),
    text_command: body.split(' ').slice(1).join(' '), isGroupMsg: true,
    isQuoted: quoted, quotedMessage: quoted ? {type: 'imageMessage'} : undefined,
    type: 'extendedTextMessage', isBotMessage: false, isBroadcast: false
}) as Message

const music = makeMessage('baixe a musica x')
assert.deepEqual(await routeSemanticCommand({} as never, bot, music, group), {status: 'handled', invoke: true})
assert.equal(music.command, '!play')
assert.deepEqual(music.args, ['x'])

const sticker = makeMessage('faça uma figurinha disso', true)
assert.deepEqual(await routeSemanticCommand({} as never, bot, sticker, group), {status: 'handled', invoke: true})
assert.equal(sticker.command, '!s')
assert.deepEqual(sticker.args, [])
assert.equal(sticker.isQuoted, true)

for (const quotedType of ['conversation', 'imageMessage'] as const) {
    const quoted = makeMessage(quotedType === 'conversation' ? 'faz uma figurinha desse texto' : 'faz uma figurinha dessa imagem', true)
    quoted.quotedMessage!.type = quotedType
    assert.deepEqual(await routeSemanticCommand({} as never, bot, quoted, group), {status: 'handled', invoke: true})
    assert.equal(quoted.command, '!s')
    assert.equal(quoted.quotedMessage?.type, quotedType)
}

const imageCaption = makeMessage('')
imageCaption.type = 'imageMessage'
imageCaption.caption = 'faz uma figurinha'
assert.deepEqual(await routeSemanticCommand({} as never, bot, imageCaption, group), {status: 'handled', invoke: true})
assert.equal(imageCaption.command, '!s')
assert.equal(imageCaption.isQuoted, false)

const conversation = makeMessage('o João disse para baixar a música x')
assert.deepEqual(await routeSemanticCommand({} as never, bot, conversation, group), {status: 'not-applicable'})

const previousSemanticFlag = process.env.SEMANTIC_COMMANDS_ENABLED
process.env.SEMANTIC_COMMANDS_ENABLED = 'true'
try {
    const spokenMusic = {...makeMessage(''), type: 'audioMessage', body: '', command: '', media: {seconds: 9}, semanticSource: 'audio', semanticTranscript: 'Baixa a música e evidências do titão Zini Shotador.'} as Message
    assert.deepEqual(await routeSemanticCommand({} as never, bot, spokenMusic, group), {status: 'handled', invoke: true})
    assert.equal(spokenMusic.command, '!play')
    assert.deepEqual(spokenMusic.args, ['evidências do titão Zini Shotador'])

    const spokenSticker = {...makeMessage('', true), type: 'audioMessage', body: '', command: '', media: {seconds: 9}, semanticSource: 'audio', semanticTranscript: 'Transforme isso numa figurinha.'} as Message
    assert.deepEqual(await routeSemanticCommand({} as never, bot, spokenSticker, group), {status: 'handled', invoke: true})
    assert.equal(spokenSticker.command, '!s')
    assert.deepEqual(spokenSticker.args, [])

    const unrelatedAudio = {...makeMessage(''), type: 'audioMessage', body: '', command: '', media: {seconds: 9}, semanticSource: 'audio', semanticTranscript: 'Conversei com o João ontem.'} as Message
    assert.deepEqual(await routeSemanticCommand({} as never, bot, unrelatedAudio, group), {status: 'not-applicable'})

    for (const seconds of [10, 15, undefined]) {
        const longAudio = {...makeMessage(''), type: 'audioMessage', body: '', command: '', media: {seconds}, semanticSource: 'audio', semanticTranscript: 'Baixa a música Evidências'} as Message
        assert.deepEqual(await routeSemanticCommand({} as never, bot, longAudio, group), {status: 'not-applicable'})
        assert.equal(longAudio.command, '')
        longAudio.isGroupMsg = false
        assert.deepEqual(await routeSemanticCommand({} as never, bot, longAudio, null), {status: 'not-applicable'})
    }
} finally {
    if (previousSemanticFlag === undefined) delete process.env.SEMANTIC_COMMANDS_ENABLED
    else process.env.SEMANTIC_COMMANDS_ENABLED = previousSemanticFlag
}

const voice = {...makeMessage(''), type: 'audioMessage', body: '', command: '', media: {seconds: 9}} as Message
assert.equal(hasActivationSignal(voice, bot), false)
voice.semanticTranscript = 'bot, silencia o João'
assert.equal(hasActivationSignal(voice, bot), true)
voice.semanticTranscript = 'eu estava conversando com o João'
assert.equal(hasActivationSignal(voice, bot), false)

console.log('semantic intent fast path: ok')
