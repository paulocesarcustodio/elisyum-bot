import os from 'os'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'

let _ffmpegPath: string | null = null

async function resolveFfmpegPath(): Promise<string> {
  if (_ffmpegPath) return _ffmpegPath
  try {
    const installer = await import('@ffmpeg-installer/ffmpeg')
    _ffmpegPath = (installer as any).path
    return _ffmpegPath!
  } catch {
    _ffmpegPath = 'ffmpeg'
    return _ffmpegPath
  }
}

function resolveWorkerScriptPath(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  const tsPath = path.resolve(currentDir, '..', 'workers', 'ffmpeg.worker.ts')
  if (fs.existsSync(tsPath)) return tsPath
  const jsPath = path.resolve(currentDir, '..', 'workers', 'ffmpeg.worker.js')
  if (fs.existsSync(jsPath)) return jsPath
  return tsPath
}

interface PoolTask {
  id: string
  rawArgs?: boolean
  args: string[]
  outputExt: string
  inputBuffer?: Buffer
  inputExt?: string
  inputPaths?: string[]
  timeout?: number
  maxOutputBytes?: number
  onProgress?: (percent: number) => void
  resolve: (value: Buffer) => void
  reject: (reason: unknown) => void
}

interface PoolWorker {
  worker: Worker
  busy: boolean
  failed: boolean
  task?: PoolTask
}

const MAX_QUEUED_TASKS = 8
const MAX_QUEUED_INPUT_BYTES = 32 * 1024 * 1024
const MAX_TASK_INPUT_BYTES = 24 * 1024 * 1024

function getCpuCount(): number {
  return Math.max(1, os.cpus().length)
}

function resolveWorkerCount(count?: number): number {
  if (count && count > 0) return Math.min(4, Math.floor(count))

  const envWorkers = Number(process.env.FFMPEG_WORKERS)
  if (Number.isFinite(envWorkers) && envWorkers > 0) return Math.min(4, Math.floor(envWorkers))

  return Math.min(2, getCpuCount())
}

class WorkerPool {
  private workers: PoolWorker[] = []
  private queue: PoolTask[] = []
  private taskMap = new Map<string, PoolTask>()
  private initialized = false
  private ffmpegPath = 'ffmpeg'
  private workerPath = ''
  private taskCounter = 0
  private numWorkers = 3

  async initialize(count?: number): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    this.numWorkers = resolveWorkerCount(count)
    this.ffmpegPath = await resolveFfmpegPath()
    this.workerPath = resolveWorkerScriptPath()

    for (let i = 0; i < this.numWorkers; i++) {
      this.spawnWorker()
    }

    this.dequeue()
    console.log(`[WorkerPool] ${this.numWorkers} workers (${getCpuCount()} cores) | ffmpeg: ${this.ffmpegPath}`)
  }

  private getThreadsForTask(): number {
    const active = Math.max(1, this.workers.filter(w => w.busy).length)
    return Math.max(1, Math.floor(getCpuCount() / Math.min(active, this.numWorkers)))
  }

  private spawnWorker(): void {
    let worker: Worker

    try {
      worker = new Worker(this.workerPath)
    } catch (err) {
      console.error(`[WorkerPool] Failed to create worker:`, err)
      return
    }

    const entry: PoolWorker = { worker, busy: false, failed: false }
    const idx = this.workers.length
    this.workers.push(entry)

    worker.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as any
      const task = this.taskMap.get(data.taskId)

      if (entry.task?.id !== data.taskId) return
      if (!task) {
        if (data.type === 'result') {
          entry.busy = false
          entry.task = undefined
          this.dequeue()
        }
        return
      }

      if (data.type === 'progress') {
        task?.onProgress?.(data.percent)
        return
      }

      if (data.type === 'result') {
        entry.busy = false
        entry.task = undefined
        this.taskMap.delete(data.taskId)

        if (data.success && task) {
          task.resolve(Buffer.from(data.outputBuffer))
        } else if (task) {
          task.reject(new Error(data.error || 'Worker error'))
        }

        this.dequeue()
      }
    })

    worker.addEventListener('error', (event: ErrorEvent) => {
      this.replaceWorker(entry, `FFmpeg worker ${idx} failed: ${event.message}`)
    })

    worker.addEventListener('exit', (event: Event) => {
      if (entry.failed) return
      const exitCode = (event as Event & { code?: number }).code
      this.replaceWorker(entry, `FFmpeg worker ${idx} exited unexpectedly${exitCode ? ` with code ${exitCode}` : ''}`)
    })
  }

  private replaceWorker(entry: PoolWorker, reason: string): void {
    if (entry.failed) return
    entry.failed = true
    console.error(`[WorkerPool] ${reason}`)

    const task = entry.task
    if (task) {
      this.taskMap.delete(task.id)
      task.reject(new Error(reason))
    }
    for (const queuedTask of this.queue.splice(0)) {
      queuedTask.reject(new Error(reason))
    }

    entry.busy = false
    entry.task = undefined
    const currentIdx = this.workers.indexOf(entry)
    if (currentIdx !== -1) this.workers.splice(currentIdx, 1)
    entry.worker.terminate()
    if (this.initialized) {
      setTimeout(() => {
        if (this.workers.length < this.numWorkers) this.spawnWorker()
        this.dequeue()
      }, 250)
    }
    this.dequeue()
  }

  private dequeue(): void {
    while (this.queue.length > 0) {
      const idle = this.workers.find(w => !w.busy)
      if (!idle) break

      const task = this.queue.shift()
      if (!task) break

      this.dispatch(idle, task)
    }
  }

  private dispatch(entry: PoolWorker, task: PoolTask): void {
    entry.busy = true
    entry.task = task
    this.taskMap.set(task.id, task)

    const msg: Record<string, unknown> = {
      taskId: task.id,
      ffmpegPath: this.ffmpegPath,
      args: task.args,
      outputExt: task.outputExt,
      timeout: task.timeout,
      maxOutputBytes: task.maxOutputBytes,
      rawArgs: task.rawArgs,
      threads: this.getThreadsForTask(),
    }

    if (task.inputBuffer) {
      msg.inputBuffer = task.inputBuffer
      msg.inputExt = task.inputExt
    }

    if (task.inputPaths) {
      msg.inputPaths = task.inputPaths
    }

    try {
      entry.worker.postMessage(msg)
    } catch (error) {
      entry.busy = false
      entry.task = undefined
      this.taskMap.delete(task.id)
      task.reject(error)
      this.dequeue()
    }
  }

  private enqueue(task: PoolTask): void {
    const queuedBytes = this.queue.reduce((total, queuedTask) => total + (queuedTask.inputBuffer?.length ?? 0), 0)
    const taskBytes = task.inputBuffer?.length ?? 0
    if (this.queue.length >= MAX_QUEUED_TASKS || queuedBytes + taskBytes > MAX_QUEUED_INPUT_BYTES) {
      task.reject(new Error('Conversor ocupado; tente novamente em alguns segundos.'))
      return
    }
    this.queue.push(task)
  }

  /** Simple mode: provide input buffer, worker prepends -i <temp> before args. */
  async exec(options: {
    inputBuffer?: Buffer
    inputExt?: string
    inputPaths?: string[]
    args: string[]
    outputExt: string
    timeout?: number
    maxOutputBytes?: number
    onProgress?: (percent: number) => void
  }): Promise<Buffer> {
    if (options.inputBuffer && options.inputBuffer.length > MAX_TASK_INPUT_BYTES) {
      throw new Error('Mídia excede o limite de 24 MB para conversão.')
    }
    if (!this.initialized) await this.initialize()

    return new Promise<Buffer>((resolve, reject) => {
      const task: PoolTask = {
        id: `ff_${++this.taskCounter}`,
        args: options.args,
        outputExt: options.outputExt,
        inputBuffer: options.inputBuffer,
        inputExt: options.inputExt,
        inputPaths: options.inputPaths,
        timeout: options.timeout ?? 120000,
        maxOutputBytes: options.maxOutputBytes,
        onProgress: options.onProgress,
        resolve,
        reject,
      }

      const idle = this.workers.find(w => !w.busy)
      if (idle) this.dispatch(idle, task)
      else this.enqueue(task)
    })
  }

  /** Raw mode: caller provides complete ffmpeg argv including -i flags. Worker only appends -y <output>. */
  async execRaw(options: {
    args: string[]
    outputExt: string
    timeout?: number
    maxOutputBytes?: number
    onProgress?: (percent: number) => void
  }): Promise<Buffer> {
    if (!this.initialized) await this.initialize()

    return new Promise<Buffer>((resolve, reject) => {
      const task: PoolTask = {
        id: `ff_${++this.taskCounter}`,
        rawArgs: true,
        args: options.args,
        outputExt: options.outputExt,
        timeout: options.timeout ?? 120000,
        maxOutputBytes: options.maxOutputBytes,
        onProgress: options.onProgress,
        resolve,
        reject,
      }

      const idle = this.workers.find(w => !w.busy)
      if (idle) this.dispatch(idle, task)
      else this.enqueue(task)
    })
  }

  get status(): { total: number; busy: number; queued: number } {
    return {
      total: this.workers.length,
      busy: this.workers.filter(w => w.busy).length,
      queued: this.queue.length,
    }
  }
}

export const ffmpegPool = new WorkerPool()
