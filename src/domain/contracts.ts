/** Application contracts. Transport-specific objects stay in adapters. */
export type Role = 'owner' | 'group_moderator' | 'member'
export type CommandCategory = 'info' | 'utility' | 'group' | 'admin'
export type ConversationKind = 'private' | 'group' | 'web'
export interface Actor {
    id: string
    identityId?: string
    source: 'whatsapp' | 'web'
    roles: Role[]
}
export interface MessageEnvelope {
    accountId: string
    conversationId: string
    id: string
    sender: Actor
    kind: ConversationKind
    receivedAt: number
    text: string
    source: 'text' | 'audio' | 'web'
    replyTo?: string
    mediaKey?: string
}
export interface CommandRequest {
    operationId: string
    accountId: string
    conversationId: string
    actor: Actor
    kind: ConversationKind
    command: string
    args: string[]
    source: 'prefix' | 'text' | 'audio' | 'web'
    targetIds: string[]
    mediaKey?: string
    confirmationId?: string
}
export type CommandResult =
    | { status: 'succeeded'; operationId: string }
    | { status: 'rejected' | 'clarification'; operationId: string; reason: string }
    | { status: 'failed'; operationId: string; reason: string; retryable: boolean }
    | { status: 'uncertain'; operationId: string; reason: string }
export interface CommandPolicy {
    name: string
    aliases: string[]
    category: CommandCategory
    roles: Role[]
    contexts: ConversationKind[]
    description: string
    examples: string[]
    naturalCommand: boolean
    confirmation: boolean
    replyContext: 'target' | 'media' | 'none'
    family: string
}
export interface IdentityResolver {
    resolve(primary: string, alternates?: string[], source?: string): Promise<{id: string; primary: string; aliases: string[]}>
}
export interface BlobReference {
    key: string
    hash: string
    size: number
    mimeType: string
}
export interface BlobStore {
    put(data: Uint8Array, mimeType: string): Promise<BlobReference>
    read(key: string): Promise<Buffer>
    remove(key: string): Promise<void>
}
export interface MediaProcessor {
    execute<T>(operation: string, args: unknown[], options?: {signal?: AbortSignal; timeoutMs?: number}): Promise<T>
}
export interface IntentCandidate {name: string; description: string}
export interface ParsedIntent {
    command: string | null
    args: string[]
    targetText?: string
    needsClarification: boolean
    latencyMs: number
}
export interface IntentParser {
    parse(text: string, commands: IntentCandidate[], context?: string): Promise<ParsedIntent>
}
export interface WhatsAppGateway {
    readonly accountId: string
    readonly generation: number
    isActive(): boolean
    deliver(operationId: string, method: string, args: unknown[]): Promise<unknown>
    close(): Promise<void>
}
