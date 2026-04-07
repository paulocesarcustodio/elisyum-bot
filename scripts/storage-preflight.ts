import { Database } from 'bun:sqlite'
import fs from 'node:fs'
import path from 'node:path'

type SavedAudioRow = {
    id: number
    audio_name: string
    file_path: string
    owner_jid: string
    mime_type: string
    seconds: number | null
    ptt: number
}

function listFilesSafe(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
        return []
    }

    return fs.readdirSync(dirPath).sort()
}

function fileStatsSafe(filePath: string) {
    if (!fs.existsSync(filePath)) {
        return null
    }

    const stats = fs.statSync(filePath)
    return {
        size: stats.size,
        mtime: stats.mtime.toISOString()
    }
}

const projectRoot = process.cwd()
const storageDir = path.join(projectRoot, 'storage')
const audiosDir = path.join(storageDir, 'audios')
const botDbPath = path.join(storageDir, 'bot.db')
const sessionDbPath = path.join(storageDir, 'session.db')
const audioFiles = listFilesSafe(audiosDir)

let savedAudios: SavedAudioRow[] = []

if (fs.existsSync(botDbPath)) {
    const db = new Database(botDbPath, { readonly: true })
    savedAudios = db.prepare(`
        SELECT id, audio_name, file_path, owner_jid, mime_type, seconds, ptt
        FROM saved_audios
        ORDER BY id ASC
    `).all() as SavedAudioRow[]
    db.close()
}

const brokenAudioRefs = savedAudios.filter(audio => !fs.existsSync(audio.file_path))

const report = {
    generatedAt: new Date().toISOString(),
    projectRoot,
    storage: {
        exists: fs.existsSync(storageDir),
        files: listFilesSafe(storageDir),
        sessionDb: {
            exists: fs.existsSync(sessionDbPath),
            stats: fileStatsSafe(sessionDbPath)
        },
        botDb: {
            exists: fs.existsSync(botDbPath),
            stats: fileStatsSafe(botDbPath)
        }
    },
    audios: {
        filesOnDisk: audioFiles.length,
        fileSamples: audioFiles.slice(0, 10),
        savedAudiosRows: savedAudios.length,
        brokenRefs: brokenAudioRefs.length,
        brokenRefSamples: brokenAudioRefs.slice(0, 10).map(audio => ({
            id: audio.id,
            audioName: audio.audio_name,
            filePath: audio.file_path
        })),
        rowSamples: savedAudios.slice(0, 10).map(audio => ({
            id: audio.id,
            audioName: audio.audio_name,
            filePath: audio.file_path,
            mimeType: audio.mime_type,
            seconds: audio.seconds,
            ptt: Boolean(audio.ptt)
        }))
    }
}

console.log(JSON.stringify(report, null, 2))