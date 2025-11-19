import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs-extra'
import axios from 'axios'
import {getTempPath, showConsoleLibraryError} from './general.util.js'
import botTexts from '../helpers/bot.texts.helper.js'

export type ConvertProgressEvent = {
    stage: 'convert'
    percent?: number
}

type ConvertMp4ToMp3Options = {
    audioBitrateKbps?: number
}

export async function convertMp4ToMp3 (
    sourceType: 'buffer' | 'url',
    video: Buffer | string,
    onProgress?: (progress: ConvertProgressEvent) => void,
    options?: ConvertMp4ToMp3Options
){
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
        
        await new Promise <void> ((resolve, reject)=>{
            const audioBitrate = options?.audioBitrateKbps
            const command = ffmpeg(inputVideoPath).outputOptions(['-vn'])

            if (audioBitrate && Number.isFinite(audioBitrate)) {
                command.outputOptions([`-codec:a libmp3lame`, `-b:a ${audioBitrate}k`])
            } else {
                command.outputOptions(['-codec:a libmp3lame', '-q:a 3'])
            }

            command
            .save(outputAudioPath)
            .on('progress', (progress: { percent?: number }) => {
                const percent = progress.percent ?? undefined
                onProgress?.({ stage: 'convert', percent })
            })
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

export async function compressVideoToTargetSize(
    sourceType: 'buffer' | 'url',
    video: Buffer | string,
    targetSizeMB: number,
    durationSeconds?: number,
){
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

        const budgetBytes = Math.max(targetSizeMB, 1) * 1024 * 1024
        const budgetBits = budgetBytes * 8
        const audioBitrateKbps = 96

        if (!durationSeconds || durationSeconds <= 0) {
            throw new Error('Invalid video duration for compression')
        }

        const targetVideoBitrateKbps = Math.floor((budgetBits / durationSeconds) / 1000 - audioBitrateKbps)

        if (!Number.isFinite(targetVideoBitrateKbps) || targetVideoBitrateKbps <= 0) {
            throw new Error('Unable to calculate target bitrate for compression')
        }

        const maxRate = Math.max(targetVideoBitrateKbps * 1.5, targetVideoBitrateKbps + 50)
        const bufferSize = Math.max(targetVideoBitrateKbps * 3, targetVideoBitrateKbps + 100)

        await new Promise <void> ((resolve, reject)=>{
            ffmpeg(inputVideoPath)
            .outputOptions([
                '-c:v libx264',
                `-b:v ${targetVideoBitrateKbps}k`,
                `-maxrate ${Math.floor(maxRate)}k`,
                `-bufsize ${Math.floor(bufferSize)}k`,
                '-preset veryfast',
                '-pix_fmt yuv420p',
                '-movflags faststart',
                '-c:a aac',
                `-b:a ${audioBitrateKbps}k`,
                '-ar 44100'
            ])
            .save(outputVideoPath)
            .on('end', () => resolve())
            .on("error", (err: Error) => reject(err))
        }).catch((err) =>{
            fs.unlinkSync(inputVideoPath)
            throw err
        })

        const compressedBuffer = fs.readFileSync(outputVideoPath)
        fs.unlinkSync(inputVideoPath)
        fs.unlinkSync(outputVideoPath)

        return compressedBuffer
    } catch(err){
        showConsoleLibraryError(err, 'compressVideoToTargetSize')
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