import type { Message } from '../interfaces/message.interface.js'

export function traceVoice(stage: string, message: Pick<Message, 'chat_id' | 'message_id' | 'type'>, detail?: string): void {
    if (!process.env.VOICE_TRACE_GROUP_ID || message.chat_id !== process.env.VOICE_TRACE_GROUP_ID || message.type !== 'audioMessage') return
    console.log(`[VoiceTrace] id=${message.message_id} stage=${stage}${detail ? ` detail=${detail}` : ''}`)
}
