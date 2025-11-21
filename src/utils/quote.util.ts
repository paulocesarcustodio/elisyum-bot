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
 * Obtém uma cor consistente baseada no nome
 */
function getNameColor(name: string): string {
    const colors = [
        '#e542a3', // Magenta
        '#009de2', // Blue
        '#e67e22', // Orange
        '#2ecc71', // Green
        '#f1c40f', // Yellow
        '#1abc9c', // Teal
        '#9b59b6', // Purple
        '#ff5252', // Red
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
export async function createWhatsAppBubble({
    text,
    authorName,
    avatarUrl,
    time
}: WhatsAppBubbleOptions): Promise<Buffer> {
    try {
        const canvasSize = 512
        const avatarSize = 110 // Aumentado para 110
        const padding = 20
        const bubblePadding = 25 // Mais espaçamento interno
        
        // Lógica de tamanho de fonte dinâmico
        let fontSize = 28
        let lineHeight = 38
        const len = text.length

        if (len < 20) {
            fontSize = 58
            lineHeight = 72
        } else if (len < 50) {
            fontSize = 48
            lineHeight = 60
        } else if (len < 100) {
            fontSize = 38
            lineHeight = 48
        } else if (len < 200) {
            fontSize = 32
            lineHeight = 42
        }

        const nameFontSize = 24
        const timeFontSize = 20
        
        // Balão ocupa toda a largura disponível
        const maxBubbleWidth = canvasSize - avatarSize - (padding * 2) - 25
        
        // Criar canvas temporário para medir o texto
        const tempCanvas = createCanvas(canvasSize, 100)
        const tempCtx = tempCanvas.getContext('2d')
        tempCtx.font = `${fontSize}px "Segoe UI", Arial, sans-serif`
        
        // Quebrar o texto em linhas
        const words = text.split(' ')
        const lines: string[] = []
        let currentLine = ''
        const maxTextWidth = maxBubbleWidth - (bubblePadding * 2)
        
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
        
        if (currentLine) {
            lines.push(currentLine)
        }
        
        // Calcular espaço para o horário
        tempCtx.font = `${timeFontSize}px "Segoe UI", Arial, sans-serif`
        const timeMetrics = tempCtx.measureText(time || '')
        const timeWidth = timeMetrics.width
        
        // Verificar se o horário cabe na última linha ou precisa de nova linha
        tempCtx.font = `${fontSize}px "Segoe UI", Arial, sans-serif`
        const lastLine = lines[lines.length - 1] || ''
        const lastLineMetrics = measureTextWithEmojis(tempCtx, lastLine, fontSize)
        
        let additionalHeightForTime = 0
        
        // Se a última linha + horário + espaço passar do limite do balão, joga horário pra baixo
        // maxTextWidth já considera o padding
        if (lastLineMetrics.width + timeWidth + 20 > maxTextWidth) {
            additionalHeightForTime = timeFontSize + 5
        }
        
        // Calcular dimensões finais
        const nameHeight = nameFontSize + 15
        const textHeight = lines.length * lineHeight
        const bubbleHeight = textHeight + nameHeight + (bubblePadding * 2) + additionalHeightForTime
        
        // Força largura total disponível
        const bubbleWidth = maxBubbleWidth
        
        // Criar canvas final
        const canvas = createCanvas(canvasSize, canvasSize)
        const ctx = canvas.getContext('2d')
        
        // Centralizar verticalmente
        const contentTotalHeight = Math.max(bubbleHeight, avatarSize)
        const startY = (canvasSize - contentTotalHeight) / 2
        
        // 1. Desenhar Avatar
        const avatarX = padding
        const avatarY = startY
        
        // Função auxiliar para desenhar avatar
        const drawAvatar = async () => {
            ctx.save()
            ctx.beginPath()
            ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
            ctx.closePath()
            ctx.clip()
            
            if (avatarUrl) {
                try {
                    const avatarBuffer = await downloadImage(avatarUrl)
                    const avatarImage = await loadImage(avatarBuffer)
                    ctx.drawImage(avatarImage, avatarX, avatarY, avatarSize, avatarSize)
                } catch {
                    drawFallbackAvatar()
                }
            } else {
                drawFallbackAvatar()
            }
            ctx.restore()
        }
        
        const drawFallbackAvatar = () => {
            ctx.fillStyle = '#6a7175' // Cor padrão de avatar sem foto
            ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize)
            
            ctx.fillStyle = '#FFFFFF'
            ctx.font = `bold ${Math.floor(avatarSize / 2.2)}px Arial`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(authorName.charAt(0).toUpperCase(), avatarX + avatarSize / 2, avatarY + avatarSize / 2)
        }
        
        await drawAvatar()
        
        // 2. Desenhar Balão
        const bubbleX = avatarX + avatarSize + 10 // +10 espaço entre avatar e balão
        const bubbleY = startY
        
        // Sombra suave
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
        ctx.shadowBlur = 5
        ctx.shadowOffsetX = 2
        ctx.shadowOffsetY = 2
        
        // Cor do balão (Dark Mode WhatsApp)
        ctx.fillStyle = '#202c33'
        
        const borderRadius = 10
        
        // Desenhar retângulo arredondado do balão
        ctx.beginPath()
        ctx.roundRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight, borderRadius)
        ctx.fill()
        
        // Desenhar o "rabinho" do balão - conectado ao arredondamento
        ctx.beginPath()
        // Começa ligeiramente abaixo do topo para conectar após o border-radius
        ctx.moveTo(bubbleX, bubbleY + borderRadius + 5)
        ctx.lineTo(bubbleX - 8, bubbleY + borderRadius - 2) // Ponta esquerda
        ctx.lineTo(bubbleX, bubbleY + borderRadius + 12) // Base no balão
        ctx.closePath()
        ctx.fill()
        
        // Resetar sombra
        ctx.shadowColor = 'transparent'
        
        // Criar clipping path para evitar que o texto vaze do balão
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight, borderRadius)
        ctx.clip()
        
        // 3. Desenhar Nome do Autor
        ctx.fillStyle = getNameColor(authorName)
        ctx.font = `bold ${nameFontSize}px "Segoe UI", Arial, sans-serif`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        await drawTextWithEmojis(ctx, authorName, bubbleX + bubblePadding, bubbleY + bubblePadding, nameFontSize)
        
        // 4. Desenhar Texto da Mensagem
        ctx.fillStyle = '#e9edef' // Cor do texto (quase branco)
        ctx.font = `${fontSize}px "Segoe UI", Arial, sans-serif`
        
        let textY = bubbleY + bubblePadding + nameHeight
        for (const line of lines) {
            await drawTextWithEmojis(ctx, line, bubbleX + bubblePadding, textY, fontSize)
            textY += lineHeight
        }
        
        // 5. Desenhar Horário
        if (time) {
            ctx.fillStyle = '#8696a0' // Cor do horário (cinza)
            ctx.font = `${timeFontSize}px "Segoe UI", Arial, sans-serif`
            ctx.textAlign = 'right'
            ctx.textBaseline = 'bottom'
            
            // Posição: canto inferior direito do balão
            ctx.fillText(time, bubbleX + bubbleWidth - bubblePadding, bubbleY + bubbleHeight - 5)
        }
        
        // Restaurar contexto após clipping
        ctx.restore()
        
        return canvas.toBuffer('image/png')
    } catch (err) {
        showConsoleLibraryError(err, 'createWhatsAppBubble')
        throw new Error(botTexts.library_error)
    }
}
