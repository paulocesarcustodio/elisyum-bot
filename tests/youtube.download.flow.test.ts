import path from "node:path"
import module from "node:module"
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import type { WASocket } from "@whiskeysockets/baileys"

const stubsPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "stubs")
process.env.NODE_PATH = [process.env.NODE_PATH, stubsPath].filter(Boolean).join(path.delimiter)
;(module as any)._initPaths?.()
process.env.YTDLP_TEST_STUB = '1'

const downloadUtil = await import("../src/utils/download.util.js")
const commandDownloads = await import("../src/commands/download.functions.commands.js")

const baseVideoInfo = {
    id_video: "abc123",
    title: "Sample video",
    description: "desc",
    duration: 120,
    channel: "Channel",
    is_live: false,
    duration_formatted: "02:00",
    url: "https://video.test/720",
    thumbnail: "https://image.test/thumb.jpg"
}

test.afterEach(() => {
    mock.restoreAll()
    delete (globalThis as any).__ytDlpMock
})

test("youtubeMedia usa ytdlp-nodejs para retornar metadata formatada", async () => {
    const fakeInfo = {
        id: "abc123",
        title: "Video Title",
        description: "Description",
        duration: 200,
        uploader: "Uploader",
        thumbnail: "thumb.png",
        is_live: false,
        formats: [
            { vcodec: "h264", acodec: "aac", height: 1080, url: "https://v1080" },
            { vcodec: "h264", acodec: "aac", height: 360, url: "https://v360" }
        ]
    }

    ;(globalThis as any).__ytDlpMock = {
        getInfoAsync: async () => fakeInfo
    }

    const result = await downloadUtil.youtubeMedia("https://youtu.be/abc123")

    assert.equal(result?.id_video, "abc123")
    assert.equal(result?.title, "Video Title")
    assert.equal(result?.channel, "Uploader")
    assert.equal(result?.url, "https://v360")
    assert.equal(result?.is_live, false)
    assert.equal(result?.duration_formatted, "03:20")
})

test("youtubeMedia marca lives e não expõe URL de download", async () => {
    ;(globalThis as any).__ytDlpMock = {
        getInfoAsync: async () => ({
            id: "live1",
            title: "Live",
            uploader: "Channel",
            description: "",
            is_live: true,
            thumbnail: "thumb.png"
        })
    }

    const result = await downloadUtil.youtubeMedia("https://youtu.be/live1")

    assert.equal(result?.is_live, true)
    assert.equal(result?.duration, 0)
    assert.equal(result?.url, "")
    assert.equal(result?.duration_formatted, "00:00")
})

test("downloadYouTubeVideo emite progresso de stream e retorna buffer", async () => {
    const progressEvents: any[] = []
    const payload = Buffer.from("video-bytes")

    ;(globalThis as any).__ytDlpMock = {
        getFileAsync: async (_url: string, options: any) => {
            options?.onProgress?.({ downloaded: 5, total: 10, percentage: 50 })
            return {
                async arrayBuffer() {
                    return payload
                }
            }
        }
    }

    const buffer = await downloadUtil.downloadYouTubeVideo(
        "https://youtu.be/stream",
        (progress) => progressEvents.push(progress)
    )

    assert.equal(buffer.compare(payload), 0)
    assert.deepEqual(progressEvents, [
        {
            stage: "download",
            downloadedBytes: 5,
            totalBytes: 10,
            percent: 50
        }
    ])
})

test("ytCommand reprocessa vídeos acima de 19MB e envia feedback", async () => {
    const videoBuffer = Buffer.alloc(20 * 1024 * 1024, 1)
    const compressedBuffer = Buffer.alloc(10 * 1024 * 1024, 2)
    const captionsSent: string[] = []
    const edits: string[] = []
    let compressArgs: any

    const fakeClient = { sendMessage: async () => ({}) } as unknown as WASocket
    const fakeMessage: any = {
        args: ["yt"],
        text_command: "query",
        chat_id: "chat-1",
        wa_message: {},
        expiration: 0
    }

    await commandDownloads.ytCommand(fakeClient, { prefix: "!" } as any, fakeMessage, undefined, {
        downloadUtil: {
            youtubeMedia: async () => ({ ...baseVideoInfo }),
            downloadYouTubeVideo: async () => videoBuffer
        },
        convertUtil: {
            compressVideoToTargetSize: async (...args: any[]) => {
                compressArgs = args
                return compressedBuffer
            },
            convertVideoToThumbnail: async () => Buffer.from("thumb")
        },
        waUtil: {
            replyImageFromUrl: async (_client: WASocket, _chatId: string, _thumb: string, caption: string) => {
                captionsSent.push(caption)
                return { key: { id: "msg1" } }
            },
            replyText: async (_client: WASocket, _chatId: string, caption: string) => {
                captionsSent.push(caption)
                return { key: { id: "msg1" } }
            },
            editImageCaption: async (_client: WASocket, _chatId: string, _key: any, _thumb: string, caption: string) => {
                edits.push(caption)
            },
            editText: async (_client: WASocket, _chatId: string, _key: any, caption: string) => {
                edits.push(caption)
            },
            replyFileFromBuffer: async (_client: WASocket, _chatId: string, _type: any, buffer: Buffer) => {
                assert.equal(buffer, compressedBuffer)
            }
        }
    })

    assert.equal(compressArgs?.[0], "buffer")
    assert.equal(compressArgs?.[2], 18.5)
    assert.equal(compressArgs?.[3], baseVideoInfo.duration)
    assert.ok(edits.some((text) => text.includes("Compactando")))
    assert.ok(edits.some((text) => text.includes("Concluído")))
    assert.ok(captionsSent[0].includes("Baixando"))
})

test("playCommand recusa lives e vídeos longos", async () => {
    const fakeClient = { sendMessage: async () => ({}) } as unknown as WASocket
    const fakeMessage: any = { args: ["play"], text_command: "abc", chat_id: "chat", wa_message: {}, expiration: 0 }

    await assert.rejects(
        () => commandDownloads.playCommand(fakeClient, { prefix: "!" } as any, fakeMessage, undefined, {
            downloadUtil: { youtubeMedia: async () => ({ ...baseVideoInfo, is_live: true }) },
            waUtil: {}
        }),
        (error: any) => /lives não são aceitas/.test(String(error))
    )

    await assert.rejects(
        () => commandDownloads.playCommand(fakeClient, { prefix: "!" } as any, fakeMessage, undefined, {
            downloadUtil: { youtubeMedia: async () => ({ ...baseVideoInfo, duration: 400 }) },
            waUtil: {}
        }),
        (error: any) => /vídeo deve ter no máximo \*6 minutos\*/.test(String(error))
    )
})
