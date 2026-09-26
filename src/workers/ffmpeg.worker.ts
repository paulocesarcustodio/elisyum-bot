import { spawn, ChildProcess } from 'child_process'
import fs from 'fs-extra'
import path from 'path'
import { tmpdir } from 'os'
import crypto from 'crypto'

interface WorkerTask {
  taskId: string
  ffmpegPath: string
  rawArgs?: boolean
  args: string[]
  outputExt: string
  inputBuffer?: ArrayBufferLike
  inputExt?: string
  inputPaths?: string[]
  timeout?: number
  maxOutputBytes?: number
  threads?: number
}

function getTempPath(ext: string): string {
  const dir = path.join(tmpdir(), 'lbot-whatsapp-workers')
  fs.ensureDirSync(dir)
  return path.join(dir, `${crypto.randomBytes(16).toString('hex')}.${ext}`)
}

addEventListener('message', async (event: MessageEvent<WorkerTask>) => {
  const { taskId, ffmpegPath, rawArgs, args, outputExt, timeout = 120000, maxOutputBytes = 64 * 1024 * 1024, inputBuffer, inputExt, inputPaths, threads } = event.data

  const tempFiles: string[] = []
  let outputPath = ''

  try {
    outputPath = getTempPath(outputExt)
    tempFiles.push(outputPath)

    const fullArgs: string[] = []

    if (rawArgs) {
      fullArgs.push(...args)
    } else {
      if (inputBuffer && inputExt) {
        const ip = getTempPath(inputExt)
        fs.writeFileSync(ip, Buffer.from(inputBuffer))
        tempFiles.push(ip)
        fullArgs.push('-i', ip)
      }

      if (inputPaths) {
        for (const p of inputPaths) {
          fullArgs.push('-i', p)
        }
      }

      fullArgs.push(...args)
    }

    if (threads && threads > 0 && !fullArgs.includes('-threads')) {
      fullArgs.push('-threads', String(threads))
    }

    fullArgs.push('-y', outputPath)

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegPath, fullArgs) as ChildProcess

      let stderr = ''
      let durationSecs = 0

      if (proc.stderr) {
        proc.stderr.on('data', (data: Buffer) => {
          const chunk = data.toString()
          stderr = (stderr + chunk).slice(-8000)

          if (!durationSecs) {
            const durationMatch = stderr.match(/Duration: (\d+):(\d+):(\d+)\.\d+/)
            if (durationMatch) {
              durationSecs = parseInt(durationMatch[1]) * 3600 + parseInt(durationMatch[2]) * 60 + parseInt(durationMatch[3])
            }
          }

          const progressMatch = chunk.match(/time=(\d+):(\d+):(\d+)\.\d+/)
          if (progressMatch && durationSecs > 0) {
            const currentSecs = parseInt(progressMatch[1]) * 3600 + parseInt(progressMatch[2]) * 60 + parseInt(progressMatch[3])
            const percent = Math.min(99, Math.floor((currentSecs / durationSecs) * 100))
            postMessage({ taskId, type: 'progress', percent })
          }
        })
      }

      let timedOut = false
      const forceKillTimer = setTimeout(() => proc.kill('SIGKILL'), timeout + 1000)
      forceKillTimer.unref()
      const timer = setTimeout(() => {
        timedOut = true
        proc.kill('SIGTERM')
      }, timeout)

      proc.on('close', (code: number | null) => {
        clearTimeout(timer)
        clearTimeout(forceKillTimer)
        if (timedOut) reject(new Error(`FFmpeg timeout after ${timeout}ms`))
        else if (code === 0) resolve()
        else reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`))
      })

      proc.on('error', (err: Error) => {
        clearTimeout(timer)
        reject(err)
      })
    })

    const outputStats = fs.statSync(outputPath)
    if (outputStats.size > maxOutputBytes) {
      throw new Error(`FFmpeg output exceeded the ${maxOutputBytes} byte limit`)
    }
    const outputBuf = fs.readFileSync(outputPath)
    ;(postMessage as any)({ taskId, type: 'result', success: true, outputBuffer: outputBuf })
  } catch (error: any) {
    ;(postMessage as any)({ taskId, type: 'result', success: false, error: error.message })
  } finally {
    for (const f of tempFiles) {
      fs.unlink(f).catch(() => {})
    }
  }
})
