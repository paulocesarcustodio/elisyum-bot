import { proto, WAMessage, type WAMessageAddressingMode } from '@whiskeysockets/baileys'

export type MessageTypes = keyof proto.IMessage

export type MimeTypes = "audio/mpeg"| "audio/mp4" | "audio/mp3" | "audio/ogg; codecs=opus" | "image/png" | "image/webp" | "video/mp4" | "document/pdf" | "application/pdf" | "image/jpeg"

export interface MessageOptions {
    expiration?: number,
    mimetype?: MimeTypes,
    noLinkPreview?: boolean,
    ptt?: boolean
}

export interface Message {
    message_id: string,
    sender: string,
    senderAlt?: string,
    senderAddressingMode?: WAMessageAddressingMode,
    type: MessageTypes,
    t : number,
    chat_id: string,
    chatIdAlt?: string,
    requestId?: string,
    expiration?: number,
    pushname : string,
    body: string,
    caption: string,
    mentioned: string[],
    text_command: string,
    command: string,
    args: string[],
    isQuoted: boolean,
    isGroupMsg : boolean,
    isGroupAdmin: boolean,
    isBotAdmin : boolean,
    isBotOwner: boolean,
    isBotMessage: boolean,
    isBroadcast: boolean,
    isMedia: boolean,
    wa_message: WAMessage,
    media? : {
        mimetype: string,
        url: string,
        seconds?: number,
        file_length: number | Long,
        ptt?: boolean
    },
    quotedMessage?: {
        type: keyof proto.IMessage,
        sender: string,
        pushname?: string,
        body: string,
        caption : string,
        isMedia: boolean,
        media? : {
            url: string,
            mimetype: string,
            file_length: number | Long,
            seconds?: number,
            ptt?: boolean
        }
        wa_message : WAMessage
    }

}