import fs from 'fs-extra'
import crypto from 'node:crypto'
import webp from "node-webpmux"
import {getTempPath, showConsoleLibraryError} from './general.util.js'
import {fileTypeFromBuffer} from 'file-type'
import { Jimp } from 'jimp'
import { StickerOptions, StickerType } from "../interfaces/library.interface.js"
import botTexts from '../helpers/bot.texts.helper.js'
import {ffmpegPool} from './worker-pool.util.js'

const { writeFile, readFile, unlink } = fs.promises

export async function createSticker(mediaBuffer : Buffer, {pack = 'Ξ ʟ ʏ s ɪ ᴜ ᴍ  ɮ ᴏ ᴛ™', author = 'Elisyum Stickers', fps = 9, type = 'resize'}: StickerOptions){
    try {
        const bufferSticker = await stickerCreation(mediaBuffer, {pack, author, fps, type})
        if (bufferSticker.length > 1024 * 1024) {
            throw new Error('A figurinha gerada ultrapassou o limite de 1 MB do WhatsApp.')
        }

        return bufferSticker
    } catch(err){
        showConsoleLibraryError(err, 'createSticker')
        throw new Error(botTexts.library_error)
    }
}

export async function renameSticker(stickerBuffer: Buffer, pack: string, author: string){
    try {
        const stickerBufferModified = await addExif(stickerBuffer, pack, author)
        if (stickerBufferModified.length > 1024 * 1024) {
            throw new Error('A figurinha com metadados ultrapassou o limite de 1 MB do WhatsApp.')
        }

        return stickerBufferModified
    } catch(err){
        showConsoleLibraryError(err, 'renameSticker')
        throw new Error(botTexts.library_error)
    }
}

export async function stickerToImage(stickerBuffer: Buffer){
    try {
        const outputBuffer = await ffmpegPool.exec({
            inputBuffer: stickerBuffer,
            inputExt: 'webp',
            outputExt: 'png',
            args: [],
            timeout: 15000,
            maxOutputBytes: 16 * 1024 * 1024
        })

        return outputBuffer
    } catch(err){
        showConsoleLibraryError(err, 'stickerToImage')
        throw new Error(botTexts.library_error)
    }
}

async function stickerCreation(mediaBuffer : Buffer, {author, pack, fps, type} : StickerOptions){
    try{
        const bufferData = await fileTypeFromBuffer(mediaBuffer)

        if(!bufferData) {
            throw new Error("Unable to retrieve data from sent media.")
        }
        if (bufferData.mime !== 'image/webp' && mediaBuffer.length > 20 * 1024 * 1024) {
            throw new Error('Mídia excede o limite de 20 MB para criação de figurinha.')
        }

        const mime = bufferData.mime
        const isAnimated = mime.startsWith('video') || mime.includes('gif')

        if (mime == 'image/webp') mediaBuffer = await pngConvertion(mediaBuffer)

        const webpBuffer = await webpConvertion(mediaBuffer, isAnimated, fps, type)
        const stickerBuffer = await addExif(webpBuffer, pack, author)

        return stickerBuffer
    } catch(err){
        throw err
    }
}

async function addExif(buffer: Buffer, pack: string, author: string){
    try{
        const img = new webp.Image()
        const stickerPackId = crypto.randomBytes(32).toString('hex')
        const json = { 'sticker-pack-id': stickerPackId, 'sticker-pack-name': pack, 'sticker-pack-publisher': author}
        const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00])
        const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8')
        const exif = Buffer.concat([exifAttr, jsonBuffer])
        exif.writeUIntLE(jsonBuffer.length, 14, 4)
        await img.load(buffer)
        img.exif = exif
        const stickerBuffer : Buffer = await img.save(null)

        return stickerBuffer
    } catch(err){
        throw err
    }
}

async function pngConvertion(mediaBuffer : Buffer){
    try {
        const outputBuffer = await ffmpegPool.exec({
            inputBuffer: mediaBuffer,
            inputExt: 'webp',
            outputExt: 'png',
            args: [],
            timeout: 15000
        })

        return outputBuffer
    } catch(err) {
        throw err
    }
}

async function webpConvertion(mediaBuffer : Buffer, isAnimated: boolean, fps: number, type : StickerType){
    try {
        let inputExt: string
        let inputBuffer = mediaBuffer
        let args: string[]

        if (isAnimated) {
            inputExt = 'mp4'
            args = [
                '-vcodec', 'libwebp',
                '-filter:v', `fps=fps=${fps}`,
                '-lossless', '0',
                '-compression_level', '4',
                '-q:v', '10',
                '-loop', '1',
                '-preset', 'picture',
                '-an',
                '-vsync', '0',
                '-s', '512:512'
            ]
        } else {
            inputExt = 'png'
            if (type === 'circle') {
                inputBuffer = await editImage(mediaBuffer, type)
                args = [
                    '-vcodec', 'libwebp',
                    '-loop', '0',
                    '-lossless', '0',
                    '-q:v', '80',
                    '-preset', 'picture'
                ]
            } else if (type === 'contain') {
                args = [
                    '-vcodec', 'libwebp',
                    '-loop', '0',
                    '-lossless', '0',
                    '-q:v', '80',
                    '-preset', 'picture',
                    '-filter:v', 'scale=512:512:force_original_aspect_ratio=1,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black'
                ]
            } else {
                args = [
                    '-vcodec', 'libwebp',
                    '-loop', '0',
                    '-lossless', '0',
                    '-q:v', '80',
                    '-preset', 'picture',
                    '-filter:v', 'scale=512:512'
                ]
            }
        }

        const timeout = isAnimated ? 30000 : 15000

        const outputBuffer = await ffmpegPool.exec({
            inputBuffer,
            inputExt,
            outputExt: 'webp',
            args,
            timeout,
            maxOutputBytes: 4 * 1024 * 1024
        })

        return outputBuffer
    } catch(err){
        throw err
    }
}

async function editImage(imageBuffer: Buffer, type: StickerType){
    try{
        const image = await Jimp.read(imageBuffer)

        image.resize({ w: 512, h: 512 })
        image.circle()

        return image.getBuffer('image/png')
    } catch(err){
        throw err
    }
}
