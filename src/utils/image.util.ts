import axios, { AxiosRequestConfig } from 'axios'
import {getRandomFilename, showConsoleLibraryError} from './general.util.js'
import format from 'format-duration'
import google from '@victorsouzaleal/googlethis'
import FormData from 'form-data'
import getEmojiMixUrl, { checkSupported } from 'emoji-mixer'
import ImageUploadService from 'node-upload-images'
import { AnimeRecognition, ImageSearch } from '../interfaces/library.interface.js'
import botTexts from '../helpers/bot.texts.helper.js'
import { translate } from '@vitalets/google-translate-api'
import { JSDOM } from 'jsdom'

export async function uploadImage(imageBuffer : Buffer){
    try {
        const service = new ImageUploadService('pixhost.to')
        const { directLink } = await service.uploadFromBinary(imageBuffer, getRandomFilename("png"))

        return directLink
    } catch(err){
        showConsoleLibraryError(err, 'uploadImage')
        throw new Error(botTexts.library_error)
    }
}

export async function checkEmojiMixSupport(emoji1: string, emoji2: string){
    try {
        const emojiSupport = {
            emoji1 : checkSupported(emoji1, true) ? true : false,
            emoji2 : checkSupported(emoji2, true) ? true : false
        }

        return emojiSupport
    } catch(err){
        showConsoleLibraryError(err, 'checkEmojiMixSupport')
        throw new Error(botTexts.library_error)
    }
}

export async function emojiMix(emoji1: string, emoji2: string){
    try {
        const emojiUrl = getEmojiMixUrl(emoji1, emoji2, false, true)

        if(!emojiUrl) {
            return null
        }
        
        const { data : imageBuffer} = await axios.get(emojiUrl, {responseType: 'arraybuffer'})

        return imageBuffer as Buffer
    } catch(err){
        showConsoleLibraryError(err, 'emojiMix')
        throw new Error(botTexts.library_error)
    }
}

export async function animeRecognition(imageBuffer : Buffer){ 
    try {
        const URL_BASE = 'https://api.trace.moe/search?anilistInfo'
        const requestConfig: RequestInit = {
            method: "POST",
            // Node Buffer is acceptable at runtime, cast to any for TypeScript
            body: imageBuffer as unknown as any,
            headers: { 
                "Content-type": "image/jpeg" 
            },
        }

        const animesResponse = await fetch(URL_BASE, requestConfig).catch((err)=>{
            if (err.status == 429){
                throw new Error('Too many requests at moment.')
            } else if (err.status == 400){
                return null
            } else {
                throw err
            }
        })

        if(!animesResponse) {
            return null
        }

    const animesJson: any = await animesResponse.json()
    const {result : animes} = animesJson
        const msInitial = Math.round(animes[0].from * 1000) 
        const msFinal = Math.round(animes[0].to * 1000)
        const animeInfo : AnimeRecognition = {
            initial_time : format(msInitial),
            final_time: format(msFinal),
            episode: animes[0].episode,
            title: animes[0].anilist.title.english || animes[0].anilist.title.romaji,
            similarity: parseInt((animes[0].similarity * 100).toFixed(2)),
            preview_url: animes[0].video
        }

        return animeInfo
    } catch(err){
        showConsoleLibraryError(err, 'animeRecognition')
        throw new Error(botTexts.library_error)
    }
}

export async function imageSearchGoogle(text: string){
    try {
        const images = await google.image(text, { safe: false, additional_params:{hl: 'pt'}, axios_config:{timeout:8000}})

        if (!images.length) {
            throw new Error("Nenhum resultado foi encontrado para esta pesquisa.")
        }
        
        const imagesResult : ImageSearch[] = images.map(image => image.preview ? image : undefined).filter(image => image !== undefined)

        if (imagesResult.length) return imagesResult
    } catch(err){
        showConsoleLibraryError(err, 'imageSearchGoogle')
    }
    // Google's undocumented image endpoint changes frequently. Commons provides
    // a documented API and reusable images, with attribution kept in the reply.
    try {
        let query = text
        try {
            query = (await translate(text, {from:'pt',to:'en',fetchOptions:{timeout:3000}})).text || text
        } catch { /* Search with the original text if translation is unavailable. */ }
        const response = await axios.get('https://commons.wikimedia.org/w/api.php', {
            params: {action:'query',format:'json',generator:'search',gsrsearch:`${query} filetype:bitmap`,
                gsrnamespace:6,gsrlimit:8,prop:'imageinfo',iiprop:'url|mime|size|extmetadata',iiurlwidth:1024,
                iiextmetadatafilter:'Artist|LicenseShortName'},
            headers: {'User-Agent':'ElisyumBot/3.5 (https://github.com/paulocesarcustodio/elisyum-bot)'},
            timeout:8000,maxContentLength:1024*1024,
        })
        const pages = Object.values(response.data.query?.pages || {}) as any[]
        const results: ImageSearch[] = []
        for (const page of pages.sort((a,b)=>(a.index||0)-(b.index||0))) {
            const info = page.imageinfo?.[0]
            if (!info || !/^image\/(jpeg|png|webp)$/.test(info.mime)) continue
            const url = info.thumburl || info.url
            if (!url?.startsWith('https://')) continue
            const author = JSDOM.fragment(info.extmetadata?.Artist?.value || '').textContent?.trim() || 'Wikimedia Commons'
            const license = info.extmetadata?.LicenseShortName?.value || ''
            results.push({id:String(page.pageid),url,width:info.thumbwidth||info.width,height:info.thumbheight||info.height,color:0,
                preview:{url,width:info.thumbwidth||info.width,height:info.thumbheight||info.height},
                origin:{title:page.title,website:{name:'Wikimedia Commons',domain:'commons.wikimedia.org',url:info.descriptionurl}},
                attribution:`📷 ${author.slice(0,180)}${license?` — ${license}`:''}\n${info.descriptionurl}`})
        }
        if (results.length) return results
        throw new Error('Nenhuma imagem encontrada.')
    } catch(err) {
        showConsoleLibraryError(err, 'imageSearchCommons')
        throw new Error(botTexts.library_error)
    }
}
