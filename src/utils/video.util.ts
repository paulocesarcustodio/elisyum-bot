import { mediaProcessor,shouldQueueWork } from '../infrastructure/media-client.js'
import { createCanvas, loadImage } from 'canvas'
import fs from 'fs-extra'
import axios from 'axios'
import { getTempPath } from './general.util.js'
import {ffmpegPool} from './worker-pool.util.js'

const SPEECH_BUBBLE_URL = 'https://memeclip.ai/assets/images/speech-bubble-memes-maker/sample/rectangle_tail_center.png'
const CACHE_TTL = 3600000
const CANVAS_W = 480

let speechBubbleCache: Buffer | null = null
let speechBubbleTimestamp = 0

async function getSpeechBubbleBuffer(): Promise<Buffer | null> {
    const now = Date.now()
    if (speechBubbleCache && (now - speechBubbleTimestamp) < CACHE_TTL) {
        return speechBubbleCache
    }

    try {
        const response = await axios.get(SPEECH_BUBBLE_URL, {
            responseType: 'arraybuffer',
            timeout: 15000,
            maxContentLength: 2 * 1024 * 1024
        })
        speechBubbleCache = Buffer.from(response.data)
        speechBubbleTimestamp = now
        return speechBubbleCache
    } catch (err: any) {
        console.error('[VIDEO] Erro ao baixar moldura:', err.message)
        if (speechBubbleCache) {
            console.log('[VIDEO] Usando moldura em cache (mesmo expirada)')
            return speechBubbleCache
        }
        return null
    }
}

async function composeSpeechBubbleImage(profilePicBuffer: Buffer): Promise<Buffer> {
    const profilePic = await loadImage(profilePicBuffer)

    let ph = Math.round(profilePic.height * (CANVAS_W / profilePic.width))
    if (ph % 2 !== 0) ph++
    if (ph < 100) ph = 100

    let canvasH = ph
    if (canvasH % 2 !== 0) canvasH++

    const canvas = createCanvas(CANVAS_W, canvasH)
    const ctx = canvas.getContext('2d')

    ctx.drawImage(profilePic, 0, 0, CANVAS_W, ph)

    const bubbleBuffer = await getSpeechBubbleBuffer()
    if (bubbleBuffer) {
        const bubble = await loadImage(bubbleBuffer)
        let displayH = Math.round((bubble.height * (CANVAS_W / bubble.width)) * 0.5)
        if (displayH % 2 !== 0) displayH++
        ctx.drawImage(bubble, 0, -10, CANVAS_W, displayH)
    } else {
        console.log('[VIDEO] Moldura indisponível, gerando vídeo apenas com a foto')
    }

    return canvas.toBuffer('image/png')
}

export async function createProfileBubbleVideo(
    profilePicBuffer: Buffer,
    audioBuffer: Buffer
): Promise<Buffer> {
    if(shouldQueueWork())return mediaProcessor.execute<Buffer>('video.profile',[profilePicBuffer,audioBuffer],{timeoutMs:90_000})
    console.log('[VIDEO] Iniciando criação do vídeo...')

    const imageBuffer = await composeSpeechBubbleImage(profilePicBuffer)

    const imagePath = getTempPath('png')
    const audioPath = getTempPath('mp3')

    fs.writeFileSync(imagePath, imageBuffer)
    fs.writeFileSync(audioPath, audioBuffer)

    console.log('[VIDEO] Arquivos temporários criados, executando ffmpeg via worker pool...')

    try {
        const outputBuffer = await ffmpegPool.execRaw({
            outputExt: 'mp4',
            args: [
                '-loop', '1',
                '-framerate', '24',
                '-i', imagePath,
                '-i', audioPath,
                '-filter_complex', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-tune', 'stillimage',
                '-pix_fmt', 'yuv420p',
                '-profile:v', 'baseline',
                '-level', '3.0',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-shortest',
                '-movflags', '+faststart'
            ],
            timeout: 60000
        })

        console.log('[VIDEO] Vídeo gerado:', outputBuffer.length, 'bytes')
        return outputBuffer
    } finally {
        fs.unlink(imagePath).catch(() => {})
        fs.unlink(audioPath).catch(() => {})
    }
}
