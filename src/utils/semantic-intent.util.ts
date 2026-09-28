const BOT_WAKE_PREFIX = /^(?:ei[\s,.!?:;-]+)?bot(?=$|[\s,.!?:;-])[\s,.!?:;-]*/i

export function hasBotWakeWord(text: string): boolean {
    return BOT_WAKE_PREFIX.test(text.trimStart())
}

export function stripBotWakeWord(text: string): string {
    return text.trimStart().replace(BOT_WAKE_PREFIX, '').trim()
}

/** Remove conversational framing while preserving the title/query itself. */
export function normalizeNaturalRequest(text: string): string {
    let request = stripBotWakeWord(text).replace(/^(?:por favor|por gentileza)[,.!?:;\s]+/i, '')
    request = request.replace(/^(?:(?:ser[aá] que\s+)?(?:voc[eê]\s+)?(?:pode|poderia|consegue|conseguiria)|(?:eu\s+)?(?:quero|queria|gostaria de))\s+(?:(?:voc[eê]|me)\s+)?/i, '')
    for (let i = 0; i < 3; i++) {
        request = request.replace(/[\s,.!?;]*(?:pra mim|para mim|por favor|por gentileza)[\s,.!?;]*$/i, '').trim()
    }
    return request
}

function mediaReferenceOnly(text: string): boolean {
    const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[,.!?;]+$/g, '').trim()
    return /^(?:(?:d[eo]\s+)?(?:(?:esse|este|essa|esta|desse|deste|dessa|desta|o|a)\s+)?)?(?:link|video|musica|audio|mensagem|url)?(?:\s+(?:aqui|acima|respondid[oa]))?$/.test(normalized)
        || /^(?:isso|isto|disso|disto|daqui|aqui|desse|deste)$/.test(normalized)
}

export function extractMediaRequestArguments(text: string, quotedText = ''): string[] {
    const request = normalizeNaturalRequest(text)
    const url = request.match(/https?:\/\/[^\s<>]+/i)?.[0]
    if (url) return [url]
    const content = request
        .replace(/^(?:baix[ae]r?|toc[ae]r?|toque|peg[au]e?|pegar|mand[ae]r?|envi[ae]r?|salv[ae]r?|busc[ae]r?|busque|procure|procurar|extrai[ar]?|extraia|separe)\s+(?:me\s+)?/i, '')
        .replace(/^(?:(?:a|o|uma|um)\s+)?(?:m[uú]sica|can[cç][aã]o|faixa|v[ií]deo|clipe|[aá]udio|som)\s*/i, '')
        .trim()
    if (mediaReferenceOnly(content)) {
        const quotedUrl = quotedText.match(/https?:\/\/[^\s<>]+/i)?.[0]
        return quotedUrl ? [quotedUrl] : []
    }
    return content ? [content.replace(/[.!?]+$/, '').trim()] : []
}

export function matchExplicitIntent(text: string, hasStickerSource: boolean, quotedText = ''): { command: 'play' | 'd' | 's'; args: string[] } | null {
    const request = normalizeNaturalRequest(text)
    if (/^(?:n[aã]o|nunca|nem)\b/i.test(request)) return null

    const music = request.match(/^(?:(?:por favor|bot)[,\s]+)*(?:baix(?:a|e|ar)|toc(?:a|ar|que)|peg(?:a|ar|ue)|coloc(?:a|ar|que)|mand(?:a|ar|e))\s+(?:(?:a|uma)\s+)?(?:m[uú]sica|can[cç][aã]o|faixa)\s+(.+?)\s*[.!?]*$/i)
    if (music?.[1]?.trim()) {
        const title = music[1].trim().replace(/[.!?]+$/, '').replace(/^e\s+/i, '').trim()
        if (title) return { command: 'play', args: mediaReferenceOnly(title) ? extractMediaRequestArguments(request,quotedText) : [title] }
    }

    if (/^(?:baix[ae]r?|peg[au]e?|pegar|mand[ae]r?|envi[ae]r?|salv[ae]r?)\s+(?:(?:o|um|esse|este)\s+)?(?:v[ií]deo|clipe)\b/i.test(request)) {
        return {command:'d',args:extractMediaRequestArguments(request,quotedText)}
    }

    const sticker = /^(?:fa[cç]a|faz|fazer|cri(?:a|e|ar)|transforma|transforme|converta)\s+(?:(?:uma|a|um|o)\s+)?(?:figurinhas?|stickers?|adesivos?)(?:\s+(?:(?:diss[oa]|dess[ae]|dest[ae])(?:\s+(?:texto|imagem|foto|v[ií]deo|mensagem))?|d[aeo]\s+(?:texto|imagem|foto|v[ií]deo|mensagem)))?\s*[.!?]*$/i.test(request)
        || /^(?:transforma|transforme|transformar|converta|converter)\s+(?:isso|isto|essa|esse|(?:(?:essa|esse|esta|este|a|o|uma|um)\s+)?(?:imagem|foto|mensagem|texto|v[ií]deo))\s+(?:(?:em\s+(?:(?:uma|um)\s+)?)|numa\s+|num\s+)(?:figurinha|sticker|adesivo)\s*[.!?]*$/i.test(request)
    if (sticker && hasStickerSource) return { command: 's', args: [] }

    return null
}

export function isExplicitStickerRequest(text: string): boolean {
    return matchExplicitIntent(text, true)?.command === 's'
}

/** Declarative reports must never be mistaken for moderation requests. */
export function isPastEventReport(text: string): boolean {
    // Reports of somebody else's earlier request are not a new instruction.
    const request=text.trim().replace(/^(?:(?:bot|por favor)[,.!?:;\s]+)+/i,'')
    if(/^(?:(?:ontem|anteontem|mais cedo|na semana passada)\b.{0,80}\b(?:pediram|pediu|pedi|pedimos|solicitaram|solicitou|mandaram|mandou)|(?:ele|ela|eles|elas|algu[eé]m|eu|n[oó]s)\s+(?:pediram|pediu|pedi|pedimos|solicitaram|solicitou))\b/i.test(request))return true
    return /^(?:(?:bot|por favor)[,.!?:;\s]+)*(?:(?:ontem|anteontem|hoje|agora|mais cedo)\s+)?(?!(?:remova|retire|expulse|silencie|promova|rebaixe|mostre|liste|quem|quais|me|quero|pode)\b).{1,80}\s+(?:foi|foram|estava|estavam)\s+(?:expuls[oa]s?|banid[oa]s?|silenciad[oa]s?|promovid[oa]s?|rebaixad[oa]s?)\b/i.test(text.trim())
}
