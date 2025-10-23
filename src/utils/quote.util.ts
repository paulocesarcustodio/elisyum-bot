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
        const canvasSize = 512
        const avatarSize = 110
        const padding = 20
        const bubblePadding = 18
        const lineHeight = 42
        const fontSize = 32
        const nameFontSize = 28
        const timeFontSize = 20
        const maxBubbleWidth = canvasSize - avatarSize - (padding * 2) - 10
        
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
        const bubbleHeight = bubbleTextHeight + (bubblePadding * 2) + 40 // 40 para nome
        
        // Largura do balão se ajusta ao conteúdo disponível (usa quase toda largura)
        const maxAvailableWidth = canvasSize - avatarSize - (padding * 2) - 10
        const responsiveBubbleWidth = Math.min(
            Math.max(maxLineWidth + (bubblePadding * 2), maxAvailableWidth * 0.7),
            maxAvailableWidth
        )
        
        // Criar canvas final quadrado
        const canvas = createCanvas(canvasSize, canvasSize)
        const ctx = canvas.getContext('2d')
        
        // Fundo TRANSPARENTE
        ctx.clearRect(0, 0, canvasSize, canvasSize)
        
        // Calcular altura do conteúdo para centralizar verticalmente
        const contentHeight = Math.max(bubbleHeight, avatarSize)
        const startY = (canvasSize - contentHeight) / 2
        
        // Desenhar avatar
        const avatarX = padding
        const avatarY = startY
        
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
        
        // Posição do balão (centralizado verticalmente junto com o avatar)
        const bubbleX = avatarX + avatarSize + padding
        const bubbleY = startY
        
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
