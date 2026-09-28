import fs from 'fs-extra'
import axios from 'axios'
import {getTempPath, showConsoleLibraryError} from './general.util.js'
import botTexts from '../helpers/bot.texts.helper.js'
import {ffmpegPool} from './worker-pool.util.js'
import {probeFile} from './worker-pool.util.js'
async function getVideoDuration(filePath:string):Promise<number>{
    const data=await probeFile(filePath)
    return Number(data.format?.duration) || 0
}

export async function convertMp4ToMp3 (sourceType: 'buffer' | 'url',  video: Buffer | string, onProgress?: (percent: number) => void){
    try {
        let inputBuffer: Buffer | undefined
        let inputExt = 'mp4'

        if (sourceType === 'buffer') {
            if (!Buffer.isBuffer(video)) {
                throw new Error('The media type is Buffer, but the video parameter is not a Buffer.')
            }
            inputBuffer = video
        } else if (sourceType === 'url') {
            if (typeof video !== 'string') {
                throw new Error('The media type is URL, but the video parameter is not a String.')
            }
            const {data: mediaResponse} = await axios.get(video, {responseType: 'arraybuffer', timeout: 30000, maxContentLength: 20 * 1024 * 1024})
            inputBuffer = Buffer.from(mediaResponse)
        } else {
            throw new Error('Unsupported media type.')
        }

        const outputBuffer = await ffmpegPool.exec({
            inputBuffer,
            inputExt,
            outputExt: 'mp3',
            args: [
                '-vn',
                '-codec:a', 'libmp3lame',
                '-b:a', '128k',
                '-ac', '2',
                '-ar', '44100',
                '-map_metadata', '-1',
                '-movflags', '+faststart'
            ],
            onProgress
        })

        return outputBuffer
    } catch(err){
        showConsoleLibraryError(err, 'convertMp4ToMp3')
        throw new Error(botTexts.library_error)
    }
}

export async function convertVideoToWhatsApp(sourceType: 'buffer' | 'url', video: Buffer | string, onProgress?: (percent:number)=>void){
    try {
        let inputBuffer: Buffer | undefined
        let inputExt = 'mp4'

        if (sourceType === 'buffer') {
            if (!Buffer.isBuffer(video)) {
                throw new Error('The media type is Buffer, but the video parameter is not a Buffer.')
            }
            inputBuffer = video
        } else if (sourceType === 'url') {
            if (typeof video !== 'string') {
                throw new Error('The media type is URL, but the video parameter is not a String.')
            }
            const {data: mediaResponse} = await axios.get(video, {responseType: 'arraybuffer', timeout: 30000, maxContentLength: 20 * 1024 * 1024})
            inputBuffer = Buffer.from(mediaResponse)
        } else {
            throw new Error('Unsupported media type.')
        }

        const outputBuffer = await ffmpegPool.exec({
            inputBuffer,
            inputExt,
            outputExt: 'mp4',
            onProgress,
            args: [
                '-c:v', 'libx264',
                '-profile:v', 'baseline',
                '-level', '3.0',
                '-pix_fmt', 'yuv420p',
                '-movflags', 'faststart',
                '-crf', '23',
                '-preset', 'fast',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-ar', '44100',
                '-f', 'mp4'
            ]
        })

        return outputBuffer
    } catch(err){
        showConsoleLibraryError(err, 'convertVideoToWhatsApp')
        throw new Error(botTexts.library_error)
    }
}

export async function convertVideoToThumbnail(sourceType : "file"|"buffer"|"url", video : Buffer | string){
    try{
        let inputPath: string | undefined
        let inputBuffer: Buffer | undefined
        let inputExt = 'mp4'
        const isFile = sourceType === 'file'

        if (sourceType === 'file') {
            if (typeof video !== 'string') {
                throw new Error('The media type is File, but the video parameter is not a String.')
            }
            inputPath = video
        } else if (sourceType === 'buffer') {
            if (!Buffer.isBuffer(video)) {
                throw new Error('The media type is Buffer, but the video parameter is not a Buffer.')
            }
            inputBuffer = video
        } else if (sourceType === 'url') {
            if (typeof video !== 'string') {
                throw new Error('The media type is URL, but the video parameter is not a String.')
            }
            const {data: mediaResponse} = await axios.get(video, {responseType: 'arraybuffer', timeout: 30000, maxContentLength: 20 * 1024 * 1024})
            inputBuffer = Buffer.from(mediaResponse)
        }

        let actualInputPath = inputPath
        if (!actualInputPath && inputBuffer) {
            actualInputPath = getTempPath('mp4')
            fs.writeFileSync(actualInputPath, inputBuffer)
        }

        if (!actualInputPath) throw new Error('No input source')

        const outputBuffer = await ffmpegPool.execRaw({
            outputExt: 'jpg',
            args: [
                '-ss', '00:00:00',
                '-i', actualInputPath,
                '-vf', 'scale=32:-1',
                '-vframes', '1',
                '-f', 'image2'
            ]
        })

        if (sourceType !== 'file' && actualInputPath) {
            fs.unlink(actualInputPath).catch(() => {})
        }

        const thumbBase64: string = outputBuffer.toString('base64')

        return thumbBase64
    } catch(err){
        showConsoleLibraryError(err, 'convertVideoToThumbnail')
        throw new Error(botTexts.library_error)
    }
}

export async function extractAudioFromVideo(sourceType : "file"|"buffer"|"url", video : Buffer | string){
    try {
        let inputPath: string | undefined
        let inputBuffer: Buffer | undefined
        let inputExt = 'mp4'
        const isFile = sourceType === 'file'

        if (sourceType === 'file') {
            if (typeof video !== 'string') {
                throw new Error('The media type is File, but the video parameter is not a String.')
            }
            inputPath = video
        } else if (sourceType === 'buffer') {
            if (!Buffer.isBuffer(video)) {
                throw new Error('The media type is Buffer, but the video parameter is not a Buffer.')
            }
            inputBuffer = video
        } else if (sourceType === 'url') {
            if (typeof video !== 'string') {
                throw new Error('The media type is URL, but the video parameter is not a String.')
            }
            const {data: mediaResponse} = await axios.get(video, {responseType: 'arraybuffer', timeout: 30000, maxContentLength: 20 * 1024 * 1024})
            inputBuffer = Buffer.from(mediaResponse)
        }

        const outputBuffer = await ffmpegPool.exec({
            inputBuffer,
            inputExt,
            inputPaths: inputPath ? [inputPath] : undefined,
            outputExt: 'mp3',
            args: [
                '-vn',
                '-codec:a', 'libmp3lame',
                '-b:a', '192k',
                '-f', 'mp3'
            ]
        })

        return outputBuffer
    } catch(err){
        showConsoleLibraryError(err, 'extractAudioFromVideo')
        throw new Error(botTexts.library_error)
    }
}

export async function compressVideoToLimit(videoBuffer: Buffer, maxSizeBytes: number = 20 * 1024 * 1024, onProgress?: (percent: number) => void): Promise<Buffer> {
    try {
        const inputExt = 'mp4'

        const inputPath = getTempPath('mp4')
        fs.writeFileSync(inputPath, videoBuffer)

        let duration = await getVideoDuration(inputPath)
        if (duration <= 0) {
            console.warn('[compressVideo] ⚠️ Não foi possível obter a duração, assumindo 30s')
            duration = 30
        }

        const originalSize = videoBuffer.length
        const targetSize = maxSizeBytes * 0.95

        console.log(`[compressVideo] Original: ${(originalSize / 1024 / 1024).toFixed(2)}MB, Alvo: ${(targetSize / 1024 / 1024).toFixed(2)}MB`)

        const targetBitrateKbps = Math.max(100, Math.floor((targetSize * 8) / (duration * 1024)))

        const strategies = [
            { scale: '720:-2', crf: 28, bitrate: targetBitrateKbps, preset: 'fast' },
            { scale: '640:-2', crf: 30, bitrate: Math.floor(targetBitrateKbps * 0.8), preset: 'fast' },
            { scale: '480:-2', crf: 32, bitrate: Math.floor(targetBitrateKbps * 0.6), preset: 'faster' },
            { scale: '360:-2', crf: 35, bitrate: Math.floor(targetBitrateKbps * 0.4), preset: 'faster' }
        ]

        for (let i = 0; i < strategies.length; i++) {
            const strategy = strategies[i]
            console.log(`[compressVideo] Tentativa ${i + 1}/${strategies.length}: ${strategy.scale} CRF=${strategy.crf} bitrate=${strategy.bitrate}k`)

            try {
                const compressedBuffer = await ffmpegPool.exec({
                    inputBuffer: undefined,
                    inputExt,
                    inputPaths: [inputPath],
                    outputExt: 'mp4',
                    args: [
                        '-vf', `scale=${strategy.scale}`,
                        '-c:v', 'libx264',
                        '-profile:v', 'baseline',
                        '-level', '3.0',
                        '-pix_fmt', 'yuv420p',
                        '-crf', `${strategy.crf}`,
                        '-preset', `${strategy.preset}`,
                        '-b:v', `${strategy.bitrate}k`,
                        '-maxrate', `${Math.floor(strategy.bitrate * 1.5)}k`,
                        '-bufsize', `${Math.floor(strategy.bitrate * 2)}k`,
                        '-c:a', 'aac',
                        '-b:a', '96k',
                        '-movflags', '+faststart',
                        '-f', 'mp4'
                    ],
                    onProgress: (percent) => {
                        const adjustedPercent = Math.floor(percent * (1 / strategies.length) + (i * (100 / strategies.length)))
                        onProgress?.(adjustedPercent)
                    }
                })

                if (compressedBuffer.length <= maxSizeBytes) {
                    fs.unlinkSync(inputPath)
                    const reduction = ((1 - compressedBuffer.length / originalSize) * 100).toFixed(1)
                    console.log(`[compressVideo] ✅ Comprimido! Redução: ${reduction}%`)
                    return compressedBuffer
                } else if (i < strategies.length - 1) {
                    console.log(`[compressVideo] ⚠️ Ainda grande (${(compressedBuffer.length / 1024 / 1024).toFixed(2)}MB), tentando próxima...`)
                } else {
                    fs.unlinkSync(inputPath)
                    return compressedBuffer
                }
            } catch (err) {
                console.error(`[compressVideo] Tentativa ${i + 1} falhou:`, err)
                if (i < strategies.length - 1) continue
                fs.unlinkSync(inputPath)
                throw err
            }
        }

        fs.unlinkSync(inputPath)
        throw new Error('compressVideoToLimit failed')
    } catch (err) {
        showConsoleLibraryError(err, 'compressVideoToLimit')
        throw new Error(botTexts.library_error)
    }
}
