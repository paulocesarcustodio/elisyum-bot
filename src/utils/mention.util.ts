export type MentionNameResolver = (jid: string) => string | undefined | Promise<string | undefined>

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getMentionToken(jid: string) {
    const [userPart] = jid.split('@')
    const normalizedUserPart = (userPart ?? '').split(':')[0]?.trim()

    return normalizedUserPart || ''
}

function formatMentionName(name: string) {
    const trimmedName = name.trim()

    if (!trimmedName) {
        return ''
    }

    return trimmedName.startsWith('@') ? trimmedName : `@${trimmedName}`
}

export async function replaceMentionIdsWithNames(
    text: string,
    mentionedJids: string[] = [],
    resolveName: MentionNameResolver
) {
    let resolvedText = text

    for (const mentionedJid of mentionedJids) {
        const mentionToken = getMentionToken(mentionedJid)

        if (!mentionToken) {
            continue
        }

        const resolvedName = await resolveName(mentionedJid)
        const mentionName = resolvedName ? formatMentionName(resolvedName) : ''

        if (!mentionName) {
            continue
        }

        const mentionPattern = new RegExp(`(^|[^\\p{L}\\p{N}_@])@${escapeRegExp(mentionToken)}(?![\\p{L}\\p{N}_])`, 'gu')
        resolvedText = resolvedText.replace(mentionPattern, (_match, prefix: string) => `${prefix}${mentionName}`)
    }

    return resolvedText
}
