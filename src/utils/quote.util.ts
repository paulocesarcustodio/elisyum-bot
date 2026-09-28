import {mediaProcessor,shouldQueueWork} from '../infrastructure/media-client.js'
import { createCanvas, loadImage } from 'canvas'
import { showConsoleLibraryError } from './general.util.js'
import botTexts from '../helpers/bot.texts.helper.js'
import https from 'https'
import http from 'http'

interface WhatsAppBubbleOptions {
    text: string
    authorName: string
    avatarUrl?: string
    time?: string
}

// Cache para emojis
const emojiCache = new Map<string, Buffer>();
const MAX_EMOJI_CACHE_ENTRIES = 128
const avatarCache = new Map<string, { buffer: Buffer, expiresAt: number }>()
const MAX_AVATAR_CACHE_ENTRIES = 128
const MAX_AVATAR_CACHE_BYTES = 8 * 1024 * 1024
const MAX_AVATAR_BYTES = 256 * 1024
let avatarCacheBytes = 0
const pendingEmojiDownloads = new Map<string, Promise<Buffer | null>>()
const pendingAvatarDownloads = new Map<string, Promise<Buffer>>()

/**
 * Converte string unicode para code points hexadecimais (para Twemoji)
 */
function toCodePoint(unicodeSurrogates: string) {
    const r: string[] = [];
    let c = 0, p = 0, i = 0;
    while (i < unicodeSurrogates.length) {
        c = unicodeSurrogates.charCodeAt(i++);
        if (p) {
            r.push((0x10000 + ((p - 0xD800) << 10) + (c - 0xDC00)).toString(16));
            p = 0;
        } else if (0xD800 <= c && c <= 0xDBFF) {
            p = c;
        } else {
            r.push(c.toString(16));
        }
    }
    return r.join('-');
}

/**
 * Verifica se um grapheme é um emoji
 */
function isEmoji(str: string) {
    return /\p{Emoji_Presentation}|\p{Extended_Pictographic}/u.test(str);
}

/**
 * Baixa uma imagem de uma URL
 */
async function downloadImage(url: string, timeoutMs = 8000, maxBytes = 2 * 1024 * 1024): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http
        const req = protocol.get(url, (response) => {
            if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                response.resume()
                downloadImage(response.headers.location, timeoutMs, maxBytes).then(resolve, reject)
                return
            }
            if (response.statusCode !== 200) {
                response.resume()
                reject(new Error(`Falha ao baixar imagem (HTTP ${response.statusCode})`))
                return
            }
            const data: Buffer[] = []
            let totalBytes = 0
            response.on('data', (chunk: Buffer) => {
                totalBytes += chunk.length
                if (totalBytes > maxBytes) {
                    req.destroy(new Error(`Imagem excede o limite de ${maxBytes} bytes`))
                    return
                }
                data.push(chunk)
            })
            response.on('end', () => resolve(Buffer.concat(data)))
            response.on('error', reject)
        })
        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error(`Timeout ao baixar imagem: ${url.slice(0, 80)}`))
        })
        req.on('error', reject)
    })
}

/**
 * Obtém o buffer de um emoji (do cache ou download)
 */
async function getEmojiBuffer(emoji: string): Promise<Buffer | null> {
    const codePoint = toCodePoint(emoji);
    if (emojiCache.has(codePoint)) return emojiCache.get(codePoint)!;
    const pending = pendingEmojiDownloads.get(codePoint)
    if (pending) return pending
    if (pendingEmojiDownloads.size >= 8) return null
    
    // URL do Twemoji
    const url = `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/${codePoint}.png`;
    const download = downloadImage(url, 1500, 256 * 1024).then(buffer => {
        if (emojiCache.size >= MAX_EMOJI_CACHE_ENTRIES) {
            const oldestKey = emojiCache.keys().next().value
            if (oldestKey) emojiCache.delete(oldestKey)
        }
        emojiCache.set(codePoint, buffer);
        return buffer;
    }).catch(() => null).finally(() => pendingEmojiDownloads.delete(codePoint))
    pendingEmojiDownloads.set(codePoint, download)
    return download
}

async function getAvatarBuffer(url: string): Promise<Buffer> {
    const cached = avatarCache.get(url)
    if (cached && cached.expiresAt > Date.now()) return cached.buffer
    if (cached) {
        avatarCacheBytes -= cached.buffer.length
        avatarCache.delete(url)
    }

    const pending = pendingAvatarDownloads.get(url)
    if (pending) return pending
    if (pendingAvatarDownloads.size >= 16) throw new Error('Muitas fotos de perfil estão sendo processadas.')

    const download = downloadImage(url, 3000, MAX_AVATAR_BYTES).then(buffer => {
        while (avatarCache.size >= MAX_AVATAR_CACHE_ENTRIES || avatarCacheBytes + buffer.length > MAX_AVATAR_CACHE_BYTES) {
            const oldestKey = avatarCache.keys().next().value
            if (!oldestKey) break
            const oldest = avatarCache.get(oldestKey)
            if (oldest) avatarCacheBytes -= oldest.buffer.length
            avatarCache.delete(oldestKey)
        }
        avatarCache.set(url, { buffer, expiresAt: Date.now() + 15 * 60 * 1000 })
        avatarCacheBytes += buffer.length
        return buffer
    }).finally(() => pendingAvatarDownloads.delete(url))
    pendingAvatarDownloads.set(url, download)
    return download
}

/**
 * Mede a largura do texto considerando emojis
 */
function measureTextWithEmojis(ctx: any, text: string, fontSize: number): { width: number } {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    const segments = Array.from(segmenter.segment(text)).map(s => s.segment);
    
    let width = 0;
    let currentText = '';
    
    for (const segment of segments) {
        if (isEmoji(segment)) {
            if (currentText) {
                width += ctx.measureText(currentText).width;
                currentText = '';
            }
            width += fontSize + 3; // Emoji width + padding
        } else {
            currentText += segment;
        }
    }
    if (currentText) {
        width += ctx.measureText(currentText).width;
    }
    
    return { width };
}

/**
 * Desenha texto com emojis no canvas
 */
async function drawTextWithEmojis(ctx: any, text: string, x: number, y: number, fontSize: number): Promise<void> {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    const segments = Array.from(segmenter.segment(text)).map(s => s.segment);
    
    let currentX = x;
    let currentText = '';
    
    for (const segment of segments) {
        if (isEmoji(segment)) {
            // Desenha o texto acumulado até agora
            if (currentText) {
                ctx.fillText(currentText, currentX, y);
                currentX += ctx.measureText(currentText).width;
                currentText = '';
            }
            
            // Desenha o emoji
            const buffer = emojiCache.get(toCodePoint(segment)) ?? null
            if (buffer) {
                try {
                    const img = await loadImage(buffer);
                    // Ajuste vertical para alinhar com o texto (baseline top)
                    ctx.drawImage(img, currentX, y + (fontSize * 0.1), fontSize * 0.9, fontSize * 0.9);
                } catch (e) {
                    // Fallback se falhar ao carregar imagem
                    ctx.fillText(segment, currentX, y);
                }
            } else {
                ctx.fillText(segment, currentX, y);
            }
            currentX += fontSize + 3;
        } else {
            currentText += segment;
        }
    }
    // Desenha o restante do texto
    if (currentText) {
        ctx.fillText(currentText, currentX, y);
    }
}

/**
 * Obtém uma cor consistente baseada no nome (Paleta Neon/Pastel para Dark Mode)
 */
function getNameColor(name: string): string {
    const colors = [
        '#ff7eb6', // Pink
        '#7ee7ff', // Cyan
        '#ffb86c', // Orange
        '#50fa7b', // Green
        '#f1fa8c', // Yellow
        '#8be9fd', // Teal
        '#bd93f9', // Purple
        '#ff5555', // Red
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

function extractEmojis(text: string): string[] {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
    const segments = Array.from(segmenter.segment(text)).map(s => s.segment)
    const emojiSet = new Set<string>()
    for (const segment of segments) {
        if (isEmoji(segment)) {
            emojiSet.add(segment)
        }
    }
    return Array.from(emojiSet)
}

async function preloadEmojis(texts: string[]): Promise<void> {
    const allEmojis = new Set<string>()
    for (const text of texts) {
        for (const emoji of extractEmojis(text)) {
            allEmojis.add(emoji)
        }
    }
    const uncached = Array.from(allEmojis).filter(e => !emojiCache.has(toCodePoint(e))).slice(0, 8)
    if (uncached.length === 0) return
    await Promise.all(uncached.map(emoji => getEmojiBuffer(emoji).catch(() => null)))
}

/**
 * Cria uma imagem estilo "Card de Citação" moderno e elegante
 */
export async function createWhatsAppBubble({
    text,
    authorName,
    avatarUrl,
    time
}: WhatsAppBubbleOptions): Promise<Buffer> {
    if(shouldQueueWork())return mediaProcessor.execute<Buffer>('image.quote',[{text,authorName,avatarUrl,time}],{timeoutMs:30_000})
    try {
        const canvasSize = 512
        const cardWidth = 480
        const cardPadding = 35
        const avatarSize = 100
        const headerHeight = avatarSize

        const emojiPreload = preloadEmojis([text, authorName])

        const accentColor = getNameColor(authorName)
        const itemsColor = '#ffffff'
        const secondaryColor = '#b3b3b3'
        const backgroundColor = '#151f2e'
        const cardRadius = 35

        let fontSize = 34
        let lineHeight = 46
        const len = text.length

        if (len < 30) {
            fontSize = 52
            lineHeight = 70
        } else if (len < 80) {
            fontSize = 42
            lineHeight = 56
        } else if (len < 150) {
            fontSize = 34
            lineHeight = 46
        } else {
            fontSize = 28
            lineHeight = 40
        }

        const nameFontSize = 32
        const timeFontSize = 20

        const maxTextWidth = cardWidth - (cardPadding * 2)
        const contentGap = 40
        const footerGap = 50
        const maxTextHeight = canvasSize - cardPadding * 2 - headerHeight - contentGap - footerGap - timeFontSize - 16
        let lines: string[] = []
        let tempCtx = createCanvas(canvasSize, 100).getContext('2d')

        for (; fontSize >= 12; fontSize--) {
            lineHeight = Math.ceil(fontSize * 1.3)
            tempCtx.font = `${fontSize}px "Segoe UI", "Helvetica Neue", "Helvetica", "Arial", sans-serif`
            const wrappedLines: string[] = []
            let currentLine = ''

            for (const word of text.split(' ')) {
                let remainingWord = word
                while (remainingWord) {
                    const testLine = currentLine ? `${currentLine} ${remainingWord}` : remainingWord
                    if (measureTextWithEmojis(tempCtx, testLine, fontSize).width <= maxTextWidth) {
                        currentLine = testLine
                        break
                    }

                    if (currentLine) {
                        wrappedLines.push(currentLine)
                        currentLine = ''
                        continue
                    }

                    const wordChars = Array.from(remainingWord)
                    let fittingWord = ''
                    while (wordChars.length && measureTextWithEmojis(tempCtx, fittingWord + wordChars[0], fontSize).width <= maxTextWidth) {
                        fittingWord += wordChars.shift()
                    }
                    if (!fittingWord) fittingWord = wordChars.shift() || ''
                    wrappedLines.push(fittingWord)
                    remainingWord = wordChars.join('')
                }
            }
            if (currentLine) wrappedLines.push(currentLine)
            lines = wrappedLines
            if (lines.length * lineHeight <= maxTextHeight) break
        }

        const maxLines = Math.max(1, Math.floor(maxTextHeight / lineHeight))
        if (lines.length > maxLines) {
            lines = lines.slice(0, maxLines)
            while (lines[maxLines - 1] && measureTextWithEmojis(tempCtx, `${lines[maxLines - 1]}...`, fontSize).width > maxTextWidth) {
                lines[maxLines - 1] = Array.from(lines[maxLines - 1]).slice(0, -1).join('')
            }
            lines[maxLines - 1] = `${lines[maxLines - 1].trimEnd()}...`
        }

        const cardHeight = Math.min(canvasSize, cardPadding + headerHeight + contentGap + lines.length * lineHeight + footerGap + timeFontSize + cardPadding)

        const canvas = createCanvas(canvasSize, canvasSize)
        const ctx = canvas.getContext('2d')

        const cardX = (canvasSize - cardWidth) / 2
        const cardY = Math.max(0, (canvasSize - cardHeight) / 2)

        ctx.shadowColor = accentColor + '66'
        ctx.shadowBlur = 40
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 10

        ctx.fillStyle = backgroundColor
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath()
            ctx.roundRect(cardX, cardY, cardWidth, cardHeight, cardRadius)
            ctx.fill()
        } else {
            ctx.beginPath()
            ctx.moveTo(cardX + cardRadius, cardY)
            ctx.lineTo(cardX + cardWidth - cardRadius, cardY)
            ctx.quadraticCurveTo(cardX + cardWidth, cardY, cardX + cardWidth, cardY + cardRadius)
            ctx.lineTo(cardX + cardWidth, cardY + cardHeight - cardRadius)
            ctx.quadraticCurveTo(cardX + cardWidth, cardY + cardHeight, cardX + cardWidth - cardRadius, cardY + cardHeight)
            ctx.lineTo(cardX + cardRadius, cardY + cardHeight)
            ctx.quadraticCurveTo(cardX, cardY + cardHeight, cardX, cardY + cardHeight - cardRadius)
            ctx.lineTo(cardX, cardY + cardRadius)
            ctx.quadraticCurveTo(cardX, cardY, cardX + cardRadius, cardY)
            ctx.closePath()
            ctx.fill()
        }

        ctx.shadowBlur = 0
        ctx.shadowColor = 'transparent'
        ctx.shadowOffsetY = 0

        ctx.save()
        ctx.fillStyle = '#ffffff'
        ctx.globalAlpha = 0.03
        ctx.font = 'bold 240px "Times New Roman", serif'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillText('”', cardX + cardWidth - 20, cardY + cardHeight + 20)
        ctx.globalAlpha = 1.0
        ctx.restore()

        const contentStartX = cardX + cardPadding
        const headerY = cardY + cardPadding

        const avatarStartX = contentStartX
        const avatarStatsY = headerY

        ctx.save()
        ctx.beginPath()
        ctx.arc(avatarStartX + avatarSize/2, avatarStatsY + avatarSize/2, avatarSize/2, 0, Math.PI * 2)
        ctx.closePath()

        ctx.strokeStyle = accentColor
        ctx.lineWidth = 3
        ctx.stroke()

        ctx.clip()

        if (avatarUrl) {
            try {
                const avatarBuffer = await getAvatarBuffer(avatarUrl)
                const avatarImg = await loadImage(avatarBuffer)
                ctx.drawImage(avatarImg, avatarStartX, avatarStatsY, avatarSize, avatarSize)
            } catch (e) {
                ctx.fillStyle = accentColor
                ctx.fillRect(avatarStartX, avatarStatsY, avatarSize, avatarSize)
                ctx.fillStyle = '#ffffff'
                ctx.font = `bold ${avatarSize/2}px Arial`
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillText(authorName.charAt(0).toUpperCase(), avatarStartX + avatarSize/2, avatarStatsY + avatarSize/2)
            }
        } else {
            ctx.fillStyle = accentColor
            ctx.fillRect(avatarStartX, avatarStatsY, avatarSize, avatarSize)
            ctx.fillStyle = '#ffffff'
            ctx.font = `bold ${avatarSize/2}px Arial`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(authorName.charAt(0).toUpperCase(), avatarStartX + avatarSize/2, avatarStatsY + avatarSize/2)
        }
        ctx.restore()

        await Promise.race([
            emojiPreload,
            new Promise<void>(resolve => {
                const timer = setTimeout(resolve, 500)
                timer.unref()
            })
        ])
        const nameX = avatarStartX + avatarSize + 20
        const nameY = avatarStatsY + (avatarSize / 2)

        ctx.fillStyle = accentColor
        ctx.font = `bold ${nameFontSize}px "Segoe UI", "Helvetica Neue", "Helvetica", "Arial", sans-serif`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'

        await drawTextWithEmojis(ctx, authorName, nameX, nameY, nameFontSize)

        const textStartX = contentStartX
        let textY = headerY + headerHeight + contentGap

        ctx.fillStyle = itemsColor
        ctx.font = `${fontSize}px "Segoe UI", "Helvetica Neue", "Helvetica", "Arial", sans-serif`
        ctx.textBaseline = 'top'

        for (const line of lines) {
            await drawTextWithEmojis(ctx, line, textStartX, textY, fontSize)
            textY += lineHeight
        }

        const footerBottomY = cardHeight - cardPadding

        if (time) {
            ctx.fillStyle = secondaryColor
            ctx.font = `${timeFontSize}px "Segoe UI", "Helvetica Neue", "Helvetica", "Arial", sans-serif`
            ctx.textAlign = 'right'
            ctx.textBaseline = 'bottom'
            ctx.fillText(time, cardX + cardWidth - cardPadding, cardY + footerBottomY)
        }

        return canvas.toBuffer('image/png')
    } catch (err) {
        showConsoleLibraryError(err, 'createWhatsAppBubble')
        throw new Error(botTexts.library_error)
    }
}
