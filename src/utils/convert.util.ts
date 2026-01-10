import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs-extra'
import axios from 'axios'
import {getTempPath, showConsoleLibraryError} from './general.util.js'
import botTexts from '../helpers/bot.texts.helper.js'

export async function convertMp4ToMp3 (sourceType: 'buffer' | 'url',  video: Buffer | string, onProgress?: (percent: number) => void){
    try {
        const inputVideoPath = getTempPath('mp4')
        const outputAudioPath = getTempPath('mp3')

        if(sourceType == 'buffer'){
            if(!Buffer.isBuffer(video)) {
                throw new Error("The media type is Buffer, but the video parameter is not a Buffer.")
            }
                
            fs.writeFileSync(inputVideoPath, video)
        } else if (sourceType == 'url'){
            if(typeof video != 'string') {
                throw new Error("The media type is URL, but the video parameter is not a String.")
            }

            const {data : mediaResponse} = await axios.get(video, {responseType: 'arraybuffer'})
            const videoBuffer = Buffer.from(mediaResponse)
            fs.writeFileSync(inputVideoPath, videoBuffer)
        } else {
            throw new Error("Unsupported media type.")
        }
        
        // Obtém metadados do vídeo para calcular progresso corretamente
        const metadata = await new Promise<any>((resolve, reject) => {
            ffmpeg.ffprobe(inputVideoPath, (err: any, data: any) => {
                if (err) reject(err)
                else resolve(data)
            })
        })
        
        const duration = metadata?.format?.duration || 0
        
        await new Promise <void> ((resolve, reject)=>{
            const command = ffmpeg(inputVideoPath)
            .outputOptions(['-vn', '-codec:a libmp3lame', '-q:a 3'])
            
            // Monitora progresso se callback foi fornecido
            if (onProgress && duration > 0) {
                command.on('progress', (progress: any) => {
                    // ffmpeg retorna progresso com timemark e percent
                    if (progress.percent && progress.percent > 0 && progress.percent <= 100) {
                        onProgress(Math.floor(progress.percent))
                    } else if (progress.timemark && duration > 0) {
                        // Calcula percent baseado no timemark vs duração total
                        const [hours, minutes, seconds] = progress.timemark.split(':').map(Number)
                        const currentSeconds = hours * 3600 + minutes * 60 + (seconds || 0)
                        const percent = Math.min(100, Math.floor((currentSeconds / duration) * 100))
                        if (percent > 0) {
                            onProgress(percent)
                        }
                    }
                })
            }
            
            command
            .save(outputAudioPath)
            .on('end', () => resolve())
            .on("error", (err: Error) => reject(err))
        }).catch((err) =>{
            fs.unlinkSync(inputVideoPath)
            throw err
        })

        const audioBuffer = fs.readFileSync(outputAudioPath)
        fs.unlinkSync(inputVideoPath)
        fs.unlinkSync(outputAudioPath)

        return audioBuffer
    } catch(err){
        showConsoleLibraryError(err, 'convertMp4ToMp3')
        throw new Error(botTexts.library_error)
    }
}

export async function convertVideoToWhatsApp(sourceType: 'buffer' | 'url',  video: Buffer | string){
    try {
        const inputVideoPath = getTempPath('mp4')
        const outputVideoPath = getTempPath('mp4')

        if(sourceType == 'buffer'){
            if (!Buffer.isBuffer(video)) {
                throw new Error('The media type is Buffer, but the video parameter is not a Buffer.')
            }
                
            fs.writeFileSync(inputVideoPath, video)
        } else if (sourceType == 'url'){
            if (typeof video != 'string') {
                throw new Error('The media type is URL, but the video parameter is not a String.')
            } 

            const {data : mediaResponse} = await axios.get(video, {responseType: 'arraybuffer'})
            const videoBuffer = Buffer.from(mediaResponse)
            fs.writeFileSync(inputVideoPath, videoBuffer)
        } else {
            throw new Error('Unsupported media type.')
        }
        
        await new Promise <void> ((resolve, reject)=>{
            ffmpeg(inputVideoPath)
            .outputOptions([
                '-c:v libx264',
                '-profile:v baseline',
                '-level 3.0',
                '-pix_fmt yuv420p',
                '-movflags faststart',
                '-crf 23', 
                '-preset fast',
                '-c:a aac',
                '-b:a 128k',
                '-ar 44100',
                '-f mp4'
            ])
            .save(outputVideoPath)
            .on('end', () => resolve())
            .on("error", (err: Error) => reject(err))
        }).catch((err) =>{
            fs.unlinkSync(inputVideoPath)
            throw err
        })

        const videoBuffer = fs.readFileSync(outputVideoPath)
        fs.unlinkSync(inputVideoPath)
        fs.unlinkSync(outputVideoPath)

        return videoBuffer
    } catch(err){
        showConsoleLibraryError(err, 'convertVideoToWhatsApp')
        throw new Error(botTexts.library_error)
    }
}

export async function convertVideoToThumbnail(sourceType : "file"|"buffer"|"url", video : Buffer | string){
    try{
        let inputPath : string | undefined
        const outputThumbnailPath = getTempPath('jpg')

        if(sourceType == "file"){
            if (typeof video !== 'string') {
                throw new Error('The media type is File, but the video parameter is not a String.')
            }
        
            inputPath = video
        } else if(sourceType == "buffer"){
            if (!Buffer.isBuffer(video)) {
                throw new Error('The media type is Buffer, but the video parameter is not a Buffer.')
            } 
            
            inputPath = getTempPath('mp4')
            fs.writeFileSync(inputPath, video)
        } else if(sourceType == "url"){
            if (typeof video !== 'string'){
                throw new Error('The media type is URL, but the video parameter is not a String.')
            } 

            const responseUrlBuffer = await axios.get(video,  { responseType: 'arraybuffer' })
            const bufferUrl = Buffer.from(responseUrlBuffer.data, "utf-8")
            inputPath = getTempPath('mp4')
            fs.writeFileSync(inputPath, bufferUrl)
        }

        await new Promise <void> (async (resolve, reject)=>{
            ffmpeg(inputPath)
            .addOption("-y")
            .inputOptions(["-ss 00:00:00"])
            .outputOptions(["-vf scale=32:-1", "-vframes 1", "-f image2"])
            .save(outputThumbnailPath)
            .on('end', () => resolve())
            .on('error', (err: Error) => reject(err))
        }).catch((err)=>{
            if (sourceType != 'file' && inputPath) {
                fs.unlinkSync(inputPath)
            }

            throw err
        })

        if (sourceType != 'file' && inputPath){
            fs.unlinkSync(inputPath)
        }

        const thumbBase64 : Base64URLString = fs.readFileSync(outputThumbnailPath).toString('base64')
        fs.unlinkSync(outputThumbnailPath)
        
        return thumbBase64
    } catch(err){
        showConsoleLibraryError(err, 'convertVideoToThumbnail')
        throw new Error(botTexts.library_error)
    }
}

export async function extractAudioFromVideo(sourceType : "file"|"buffer"|"url", video : Buffer | string){
    let inputVideoPath = getTempPath('mp4')
    const outputAudioPath = getTempPath('mp3')

    if(sourceType == "file"){
        if (typeof video !== 'string') {
            throw new Error('The media type is File, but the video parameter is not a String.')
        }

        inputVideoPath = video
    } else if (sourceType == 'buffer'){
        if (!Buffer.isBuffer(video)) {
            throw new Error('The media type is Buffer, but the video parameter is not a Buffer.')
        }

        fs.writeFileSync(inputVideoPath, video)
    } else if (sourceType == 'url'){
        if (typeof video != 'string') {
            throw new Error('The media type is URL, but the video parameter is not a String.')
        }

        const {data : mediaResponse} = await axios.get(video, {responseType: 'arraybuffer'})
        const videoBuffer = Buffer.from(mediaResponse)
        fs.writeFileSync(inputVideoPath, videoBuffer)
    } else {
        throw new Error('Unsupported media type.')
    }

    await new Promise <void> (async (resolve, reject)=>{
        ffmpeg(inputVideoPath)
        .noVideo()
        .audioCodec('libmp3lame')
        .audioBitrate('192k')
        .format('mp3')
        .save(outputAudioPath)
    .on('end', () => resolve())
    .on('error', (err: Error) => reject(err))
    }).catch((err)=>{
        if (sourceType != 'file' && inputVideoPath) {
            fs.unlinkSync(inputVideoPath)
        }

        throw err
    })

    if (sourceType != 'file' && inputVideoPath){
        fs.unlinkSync(inputVideoPath)
    }

    const audioBuffer = fs.readFileSync(outputAudioPath)
    fs.unlinkSync(outputAudioPath)
    
    return audioBuffer

}

export async function compressVideoToLimit(videoBuffer: Buffer, maxSizeBytes: number = 16 * 1024 * 1024, onProgress?: (percent: number) => void): Promise<Buffer> {
    try {
        const inputVideoPath = getTempPath('mp4')
        const outputVideoPath = getTempPath('mp4')
        
        fs.writeFileSync(inputVideoPath, videoBuffer)
        
        // Obter metadados do vídeo
        const metadata = await new Promise<any>((resolve, reject) => {
            ffmpeg.ffprobe(inputVideoPath, (err: any, data: any) => {
                if (err) reject(err)
                else resolve(data)
            })
        })
        
        const duration = metadata?.format?.duration || 0
        const originalSize = videoBuffer.length
        const targetSize = maxSizeBytes * 0.95 // 95% do limite para margem de segurança
        
        console.log(`[compressVideo] Original: ${(originalSize / 1024 / 1024).toFixed(2)}MB, Alvo: ${(targetSize / 1024 / 1024).toFixed(2)}MB`)
        
        // Calcula bitrate alvo baseado na duração
        // bitrate (kbps) = (tamanho_alvo_bytes * 8) / (duração_segundos * 1024)
        const targetBitrateKbps = Math.floor((targetSize * 8) / (duration * 1024))
        
        // Define estratégias de compressão por tentativa
        const strategies = [
            { scale: '720:-2', crf: 28, bitrate: targetBitrateKbps, preset: 'fast' },
            { scale: '640:-2', crf: 30, bitrate: Math.floor(targetBitrateKbps * 0.8), preset: 'fast' },
            { scale: '480:-2', crf: 32, bitrate: Math.floor(targetBitrateKbps * 0.6), preset: 'faster' },
            { scale: '360:-2', crf: 35, bitrate: Math.floor(targetBitrateKbps * 0.4), preset: 'faster' }
        ]
        
        for (let i = 0; i < strategies.length; i++) {
            const strategy = strategies[i]
            console.log(`[compressVideo] Tentativa ${i + 1}/${strategies.length}: ${strategy.scale} CRF=${strategy.crf} bitrate=${strategy.bitrate}k`)
            
            await new Promise<void>((resolve, reject) => {
                const command = ffmpeg(inputVideoPath)
                    .outputOptions([
                        `-vf scale=${strategy.scale}`,
                        `-c:v libx264`,
                        `-crf ${strategy.crf}`,
                        `-preset ${strategy.preset}`,
                        `-b:v ${strategy.bitrate}k`,
                        `-maxrate ${Math.floor(strategy.bitrate * 1.5)}k`,
                        `-bufsize ${Math.floor(strategy.bitrate * 2)}k`,
                        `-c:a aac`,
                        `-b:a 96k`,
                        `-movflags +faststart`
                    ])
                    .format('mp4')
                    .save(outputVideoPath)
                
                if (onProgress && duration > 0) {
                    command.on('progress', (progress: any) => {
                        if (progress.percent && progress.percent > 0 && progress.percent <= 100) {
                            onProgress(Math.floor(progress.percent))
                        }
                    })
                }
                
                command
                    .on('end', () => resolve())
                    .on('error', (err: Error) => reject(err))
            })
            
            // Verifica tamanho do arquivo gerado
            const stats = fs.statSync(outputVideoPath)
            console.log(`[compressVideo] Resultado: ${(stats.size / 1024 / 1024).toFixed(2)}MB`)
            
            if (stats.size <= maxSizeBytes) {
                // Sucesso! Arquivo cabe no limite
                const compressedBuffer = fs.readFileSync(outputVideoPath)
                fs.unlinkSync(inputVideoPath)
                fs.unlinkSync(outputVideoPath)
                
                const reduction = ((1 - stats.size / originalSize) * 100).toFixed(1)
                console.log(`[compressVideo] ✅ Comprimido com sucesso! Redução: ${reduction}%`)
                
                return compressedBuffer
            } else if (i < strategies.length - 1) {
                // Ainda não cabe, tenta próxima estratégia
                console.log(`[compressVideo] ⚠️ Ainda muito grande, tentando próxima estratégia...`)
                fs.unlinkSync(outputVideoPath)
            }
        }
        
        // Se chegou aqui, nem a estratégia mais agressiva funcionou
        // Retorna o último resultado mesmo que seja maior que o limite
        console.log(`[compressVideo] ⚠️ Não foi possível comprimir abaixo de ${maxSizeBytes / 1024 / 1024}MB`)
        const finalBuffer = fs.readFileSync(outputVideoPath)
        fs.unlinkSync(inputVideoPath)
        fs.unlinkSync(outputVideoPath)
        return finalBuffer
        
    } catch (err) {
        showConsoleLibraryError(err, 'compressVideoToLimit')
        throw new Error(botTexts.library_error)
    }
}