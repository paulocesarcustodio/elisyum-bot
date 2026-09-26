export function matchExplicitIntent(text: string, hasStickerSource: boolean): { command: 'play' | 's'; args: string[] } | null {
    const request = text.trim()
    if (/\b(?:não|nao|nunca|nem)\b/i.test(request)) return null

    const music = request.match(/^(?:(?:por favor|bot)[,\s]+)*(?:baix(?:a|e|ar)|toc(?:a|ar|que)|peg(?:a|ar|ue)|coloc(?:a|ar|que)|mand(?:a|ar|e))\s+(?:(?:a|uma)\s+)?(?:m[uú]sica|can[cç][aã]o|faixa)\s+(.+?)\s*[.!?]*$/i)
    if (music?.[1]?.trim()) {
        const title = music[1].trim().replace(/[.!?]+$/, '').replace(/^e\s+/i, '').trim()
        if (title) return { command: 'play', args: [title] }
    }

    const sticker = /^(?:fa[cç]a|faz|crie?|criar|transforma|transforme|converta)\s+(?:(?:uma|a)\s+)?(?:figurinhas?|stickers?|adesivos?)(?:\s+(?:(?:diss[oa]|dess[ae]|dest[ae])(?:\s+(?:texto|imagem|foto|v[ií]deo|mensagem))?|d[aeo]\s+(?:texto|imagem|foto|v[ií]deo|mensagem)))?\s*[.!?]*$/i.test(request)
        || /^(?:transforma|transforme|converta)\s+(?:isso|isto|essa|esse|a\s+(?:imagem|foto|mensagem|texto))\s+(?:(?:em\s+(?:uma\s+)?)|numa\s+|num\s+)(?:figurinha|sticker|adesivo)\s*[.!?]*$/i.test(request)
    if (sticker && hasStickerSource) return { command: 's', args: [] }

    return null
}

export function isExplicitStickerRequest(text: string): boolean {
    return matchExplicitIntent(text, true)?.command === 's'
}
