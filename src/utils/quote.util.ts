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
 * Cria uma imagem que simula uma mensagem do WhatsApp com avatar e balão
 */
export async function createWhatsAppBubble({
    text,
    authorName,
    avatarUrl,
    time
}: WhatsAppBubbleOptions): Promise<Buffer> {
    try {
        const baseSize = 600
        const avatarSize = 90
        const padding = 35
        const bubblePadding = 22
        const lineHeight = 38
        const fontSize = 28
        const nameFontSize = 26
        const timeFontSize = 18
        const maxBubbleWidth = baseSize - avatarSize - (padding * 3)
        
        // Criar canvas temporário para medir o texto
        const tempCanvas = createCanvas(baseSize, 100)
        const tempCtx = tempCanvas.getContext('2d')
        tempCtx.font = `${fontSize}px "Segoe UI", Arial, sans-serif`
        
        // Quebrar o texto em linhas
        const words = text.split(' ')
        const lines: string[] = []
        let currentLine = ''
        const maxTextWidth = maxBubbleWidth - (bubblePadding * 2)
        
        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word
            const metrics = tempCtx.measureText(testLine)
            
            if (metrics.width > maxTextWidth) {
                if (currentLine) {
                    lines.push(currentLine)
                    currentLine = word
                } else {
                    // Palavra muito longa, forçar quebra
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
        
        // Calcular largura real necessária para o texto
        let maxLineWidth = 0
        for (const line of lines) {
            const metrics = tempCtx.measureText(line)
            maxLineWidth = Math.max(maxLineWidth, metrics.width)
        }
        
        // Calcular dimensões responsivas do balão
        const bubbleTextHeight = lines.length * lineHeight
        const bubbleHeight = bubbleTextHeight + (bubblePadding * 2) + 45 // 45 para nome
        
        // Largura do balão se ajusta ao conteúdo (min: 250, max: maxBubbleWidth)
        const responsiveBubbleWidth = Math.min(
            Math.max(maxLineWidth + (bubblePadding * 2), 250),
            maxBubbleWidth
        )
        
        // Largura total do canvas se ajusta ao conteúdo
        const totalWidth = avatarSize + responsiveBubbleWidth + (padding * 3)
        
        // Altura se ajusta ao conteúdo (mínimo para caber o avatar)
        const minHeight = avatarSize + (padding * 2)
        const totalHeight = Math.max(bubbleHeight + (padding * 2), minHeight)
        
        // Criar canvas final com dimensões responsivas
        const canvas = createCanvas(totalWidth, totalHeight)
        const ctx = canvas.getContext('2d')
        
        // Fundo TRANSPARENTE
        ctx.clearRect(0, 0, totalWidth, totalHeight)
        
        // Desenhar avatar
        const avatarX = padding
        const avatarY = padding
        
        if (avatarUrl) {
            try {
                const avatarBuffer = await downloadImage(avatarUrl)
                const avatarImage = await loadImage(avatarBuffer)
                
                // Círculo de recorte para avatar
                ctx.save()
                ctx.beginPath()
                ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
                ctx.closePath()
                ctx.clip()
                ctx.drawImage(avatarImage, avatarX, avatarY, avatarSize, avatarSize)
                ctx.restore()
            } catch (err) {
                // Se falhar ao carregar avatar, desenhar um círculo padrão
                ctx.fillStyle = '#4a4a4a'
                ctx.beginPath()
                ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
                ctx.fill()
                
                // Inicial do nome
                ctx.fillStyle = '#FFFFFF'
                ctx.font = `bold ${Math.floor(avatarSize / 2.2)}px Arial`
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillText(authorName.charAt(0).toUpperCase(), avatarX + avatarSize / 2, avatarY + avatarSize / 2)
            }
        } else {
            // Avatar padrão com inicial (cinza escuro)
            ctx.fillStyle = '#4a4a4a'
            ctx.beginPath()
            ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
            ctx.fill()
            
            ctx.fillStyle = '#FFFFFF'
            ctx.font = `bold ${Math.floor(avatarSize / 2.2)}px Arial`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(authorName.charAt(0).toUpperCase(), avatarX + avatarSize / 2, avatarY + avatarSize / 2)
        }
        
        // Posição do balão
        const bubbleX = avatarX + avatarSize + padding
        const bubbleY = padding
        
        // Desenhar balão de mensagem com sombra suave
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'
        ctx.shadowBlur = 15
        ctx.shadowOffsetX = 3
        ctx.shadowOffsetY = 3
        
        // Fundo do balão (cinza escuro estilo dark mode)
        ctx.fillStyle = '#3a3a3a'
        ctx.beginPath()
        ctx.roundRect(bubbleX, bubbleY, responsiveBubbleWidth, bubbleHeight, 18)
        ctx.fill()
        
        // Resetar sombra
        ctx.shadowColor = 'transparent'
        ctx.shadowBlur = 0
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0
        
        // Nome do autor (laranja/amarelo brilhante)
        ctx.fillStyle = '#ff9f5a'
        ctx.font = `bold ${nameFontSize}px "Segoe UI", Arial, sans-serif`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(authorName, bubbleX + bubblePadding, bubbleY + bubblePadding)
        
        // Texto da mensagem (branco)
        ctx.fillStyle = '#FFFFFF'
        ctx.font = `${fontSize}px "Segoe UI", Arial, sans-serif`
        
        let textY = bubbleY + bubblePadding + nameFontSize + 10
        for (const line of lines) {
            ctx.fillText(line, bubbleX + bubblePadding, textY)
            textY += lineHeight
        }
        
        return canvas.toBuffer('image/png')
    } catch (err) {
        showConsoleLibraryError(err, 'createWhatsAppBubble')
        throw new Error(botTexts.library_error)
    }
}
