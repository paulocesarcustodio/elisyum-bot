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
async function downloadImage(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http
        protocol.get(url, (response) => {
            const data: Buffer[] = []
            response.on('data', (chunk) => data.push(chunk))
            response.on('end', () => resolve(Buffer.concat(data)))
            response.on('error', reject)
        }).on('error', reject)
    })
}

/**
 * Obtém o buffer de um emoji (do cache ou download)
 */
async function getEmojiBuffer(emoji: string): Promise<Buffer | null> {
    const codePoint = toCodePoint(emoji);
    if (emojiCache.has(codePoint)) return emojiCache.get(codePoint)!;
    
    // URL do Twemoji
    const url = `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/${codePoint}.png`;
    try {
        const buffer = await downloadImage(url);
        emojiCache.set(codePoint, buffer);
        return buffer;
    } catch (e) {
        // console.error(`Erro ao baixar emoji ${emoji} (${codePoint}):`, e);
        return null;
    }
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
            const buffer = await getEmojiBuffer(segment);
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

/**
 * Cria uma imagem que simula uma mensagem do WhatsApp com avatar e balão
 */
/**
 * Cria uma imagem estilo "Card de Citação" moderno e elegante
 */
export async function createWhatsAppBubble({
    text,
    authorName,
    avatarUrl,
    time
}: WhatsAppBubbleOptions): Promise<Buffer> {
    try {
        const canvasSize = 512
        const cardWidth = 480 // Largura fixa do cartão (deixando margem lateral)
        const cardPadding = 35 // Padding interno do cartão
        const avatarSize = 100 // Avatar ampliado para 100px
        const headerHeight = avatarSize // Altura reservada para o cabeçalho (avatar + nome)
        
        // Cores e Estilo
        const accentColor = getNameColor(authorName)
        const itemsColor = '#ffffff'
        const secondaryColor = '#b3b3b3'
        const backgroundColor = '#151f2e' // Dark Blue Grey bem escuro
        const cardRadius = 35

        // Configuração de Fonte Dinâmica
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
        
        // Canvas temporário para medição
        const tempCanvas = createCanvas(canvasSize, 100)
        const tempCtx = tempCanvas.getContext('2d')
        
        // Preparar linhas de texto
        tempCtx.font = `${fontSize}px "Segoe UI", "Helvetica Neue", "Helvetica", "Arial", sans-serif`
        
        // Largura disponível para texto (Largura do cartão - padding duplo)
        const maxTextWidth = cardWidth - (cardPadding * 2)
        
        const words = text.split(' ')
        const lines: string[] = []
        let currentLine = ''

        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word
            const metrics = measureTextWithEmojis(tempCtx, testLine, fontSize)
            
            if (metrics.width > maxTextWidth) {
                if (currentLine) {
                    lines.push(currentLine)
                    currentLine = word
                } else {
                    lines.push(word)
                    currentLine = ''
                }
            } else {
                currentLine = testLine
            }
        }
        if (currentLine) lines.push(currentLine)
        
        // Calcular Altura do Cartão
        const textBlockHeight = lines.length * lineHeight
        // Aumentando espaçamentos para um visual mais "airy" e melhor uso do height
        const contentGap = 40 // Mais espaço entre header e texto
        const footerGap = 50 // Bastante espaço até o rodapé para "empurrar" a hora pro fundo
        
        // Layout:
        // [Padding Top]
        // [Header (Avatar + Nome)] -> height: headerHeight
        // [Content Gap]
        // [Text Block] -> height: textBlockHeight
        // [Footer Gap (Min)] -> O rodapé será fixado no bottom, então esse gap é o mínimo garantido
        // [Time] -> height: timeFontSize
        // [Padding Bottom]
        
        // Altura mínima calculada
        let calculatedHeight = cardPadding + headerHeight + contentGap + textBlockHeight + footerGap + timeFontSize + cardPadding
        
        // Altura final (pode ser maior se quisermos garantir um aspecto mínimo, mas vamos usar o calculado)
        const cardHeight = calculatedHeight
        
        // Ajuste vertical para centralizar o cartão no canvas 512x512
        const canvas = createCanvas(canvasSize, canvasSize)
        const ctx = canvas.getContext('2d')
        
        // Centralizar cartão
        const cardX = (canvasSize - cardWidth) / 2
        const cardY = Math.max(0, (canvasSize - cardHeight) / 2) // Evita Y negativo
        
        // === DESENHAR CARTÃO ===
        
        // Sombra Moderna
        ctx.shadowColor = accentColor + '66' // Hex + alpha (40%)
        ctx.shadowBlur = 40
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 10
        
        // Fundo do Cartão
        ctx.fillStyle = backgroundColor
        // Usar roundRect se disponível (Canvas/Node mais recentes) ou função manual
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath()
            ctx.roundRect(cardX, cardY, cardWidth, cardHeight, cardRadius)
            ctx.fill()
        } else {
            // Fallback para retângulos arredondados manuais
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
        
        // Reseta sombra para elementos internos
        ctx.shadowBlur = 0
        ctx.shadowColor = 'transparent'
        ctx.shadowOffsetY = 0
        
        // === DETALHES VISUAIS ===
        
        // Marca D'água de Aspas (Gigante e Sutil no fundo) - Fim do cartão
        ctx.save()
        ctx.fillStyle = '#ffffff'
        ctx.globalAlpha = 0.03
        ctx.font = 'bold 240px "Times New Roman", serif'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        // ctx.fillText('”', cardX + cardWidth - 20, cardY + cardHeight + 40)
        ctx.fillText('”', cardX + cardWidth - 20, cardY + cardHeight + 20)
        ctx.globalAlpha = 1.0
        ctx.restore()

        // === HEADER (Avatar + Nome) ===
        const contentStartX = cardX + cardPadding
        const headerY = cardY + cardPadding
        
        // Avatar
        const avatarStartX = contentStartX
        const avatarStatsY = headerY
        
        // Desenhar Avatar (Circular com borda)
        ctx.save()
        ctx.beginPath()
        ctx.arc(avatarStartX + avatarSize/2, avatarStatsY + avatarSize/2, avatarSize/2, 0, Math.PI * 2)
        ctx.closePath()
        
        // Borda do Avatar
        ctx.strokeStyle = accentColor
        ctx.lineWidth = 3
        ctx.stroke()
        
        ctx.clip()
        
        if (avatarUrl) {
            try {
                const avatarBuffer = await downloadImage(avatarUrl)
                const avatarImg = await loadImage(avatarBuffer)
                ctx.drawImage(avatarImg, avatarStartX, avatarStatsY, avatarSize, avatarSize)
            } catch (e) {
                // Fallback Avatar
                ctx.fillStyle = accentColor
                ctx.fillRect(avatarStartX, avatarStatsY, avatarSize, avatarSize)
                ctx.fillStyle = '#ffffff'
                ctx.font = `bold ${avatarSize/2}px Arial`
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillText(authorName.charAt(0).toUpperCase(), avatarStartX + avatarSize/2, avatarStatsY + avatarSize/2)
            }
        } else {
            // Fallback Avatar
            ctx.fillStyle = accentColor
            ctx.fillRect(avatarStartX, avatarStatsY, avatarSize, avatarSize)
            ctx.fillStyle = '#ffffff'
            ctx.font = `bold ${avatarSize/2}px Arial`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(authorName.charAt(0).toUpperCase(), avatarStartX + avatarSize/2, avatarStatsY + avatarSize/2)
        }
        ctx.restore()
        
        // Nome do Autor
        const nameX = avatarStartX + avatarSize + 20
        const nameY = avatarStatsY + (avatarSize / 2)
        
        ctx.fillStyle = accentColor // Cor do brilho/accent também para o nome
        ctx.font = `bold ${nameFontSize}px "Segoe UI", "Helvetica Neue", "Helvetica", "Arial", sans-serif`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        
        await drawTextWithEmojis(ctx, authorName, nameX, nameY, nameFontSize)

        // Linha decorativa abaixo do nome (opcional, ou cargo se tivesse)
        
        // === TEXTO DA CITAÇÃO ===
        const textStartX = contentStartX
        let textY = headerY + headerHeight + contentGap
        
        ctx.fillStyle = itemsColor
        ctx.font = `${fontSize}px "Segoe UI", "Helvetica Neue", "Helvetica", "Arial", sans-serif`
        ctx.textBaseline = 'top' // Reset timeline
        
        for (const line of lines) {
            await drawTextWithEmojis(ctx, line, textStartX, textY, fontSize)
            textY += lineHeight
        }
        
        // === RODAPÉ (Data/Hora) ===
        // Fixado absolutamente no bottom do cartão
        const footerBottomY = cardHeight - cardPadding // Y da linha de base inferior
        
        if (time) {
            ctx.fillStyle = secondaryColor
            ctx.font = `${timeFontSize}px "Segoe UI", "Helvetica Neue", "Helvetica", "Arial", sans-serif`
            ctx.textAlign = 'right'
            ctx.textBaseline = 'bottom' // Alinhar pela base
            ctx.fillText(time, cardX + cardWidth - cardPadding, cardY + footerBottomY)
        }
        
        return canvas.toBuffer('image/png')
    } catch (err) {
        showConsoleLibraryError(err, 'createWhatsAppBubble')
        throw new Error(botTexts.library_error)
    }
}
