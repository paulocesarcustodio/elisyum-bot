declare module 'ytdlp-nodejs' {
    export type VideoProgress = {
        status: 'downloading' | 'finished'
        downloaded: number
        downloaded_str: string
        total: number
        total_str: string
        speed: number
        speed_str: string
        eta: number
        eta_str: string
        percentage: number
        percentage_str: string
    }

    export type FormatKeyWord = 'videoonly' | 'audioonly' | 'audioandvideo' | 'mergevideo'

    export type FormatOptions<F extends FormatKeyWord = FormatKeyWord> = {
        format?:
            | string
            | {
                filter: F
                type?: string
                quality?: string
            }
        filename?: string
        metadata?: {
            name?: string
            type?: string
            size?: number
        }
        onProgress?: (progress: VideoProgress) => void
    }

    export type VideoThumbnail = {
        url: string
        preference?: number
        id?: string
        height?: number
        width?: number
    }

    export type VideoFormat = {
        format_id: string
        format_note?: string
        ext: string
        url: string
        width?: number
        height?: number
        resolution?: string
        filesize?: number
        tbr?: number
        protocol: string
        vcodec: string
        acodec: string
    }

    export type VideoInfo = {
        _type: 'video'
        id: string
        title: string
        description: string
        duration: number
        uploader: string
        channel?: string
        thumbnail?: string
        url?: string
        formats: VideoFormat[]
        thumbnails?: VideoThumbnail[]
        is_live: boolean
        [key: string]: unknown
    }

    export type PlaylistInfo = {
        _type: 'playlist'
        id?: string
        title?: string
        entries: VideoInfo[]
        [key: string]: unknown
    }

    export type InfoOptions = {
        flatPlaylist?: boolean
        cookies?: string
        cookiesFromBrowser?: string
        noCookiesFromBrowser?: boolean
        noCookies?: boolean
    }

    export type YtDlpOptions = {
        binaryPath?: string
        ffmpegPath?: string
    }

    export type FileLike = {
        arrayBuffer(): Promise<ArrayBuffer>
        name?: string
        type?: string
        size?: number
    }

    export class YtDlp {
        constructor(options?: YtDlpOptions)
        downloadAsync<F extends FormatKeyWord>(url: string, options?: FormatOptions<F>): Promise<string>
        stream<F extends FormatKeyWord>(url: string, options?: FormatOptions<F>): {
            pipe(writable: unknown): unknown
            pipeAsync(writable: unknown): Promise<void>
        }
        getInfoAsync(url: string, options?: InfoOptions): Promise<VideoInfo | PlaylistInfo>
        getThumbnailsAsync(url: string): Promise<VideoThumbnail[]>
        getTitleAsync(url: string): Promise<string>
        downloadFFmpeg(): Promise<string | undefined>
        getFileAsync<F extends FormatKeyWord>(
            url: string,
            options?: FormatOptions<F>
        ): Promise<FileLike>
    }

    export const helpers: {
        findYtdlpBinary(): string | null
        downloadYtDlp(): Promise<string | null>
        findFFmpegBinary(): string | null
        downloadFFmpeg(): Promise<string | undefined>
    }
}
