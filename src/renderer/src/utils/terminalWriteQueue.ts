type TerminalWrite = (data: string, callback?: () => void) => void

interface QueueChunk {
  data: string
  droppable: boolean
  callbacks: Array<() => void>
}

export interface TerminalWriteQueueOptions {
  write: TerminalWrite
  maxBatchBytes?: number
  maxPendingBytes?: number
  scheduleFrame?: (callback: () => void) => number | ReturnType<typeof setTimeout>
  cancelFrame?: (handle: number | ReturnType<typeof setTimeout>) => void
  dropNotice?: (bytes: number) => string
}

export interface TerminalWriteQueue {
  enqueue: (data: string, options?: { droppable?: boolean; callback?: () => void }) => void
  setPaused: (paused: boolean) => void
  flush: () => void
  dispose: () => void
  getPendingBytes: () => number
}

const DEFAULT_MAX_BATCH_BYTES = 64 * 1024
const DEFAULT_MAX_PENDING_BYTES = 2 * 1024 * 1024

const defaultScheduleFrame = (callback: () => void): number | ReturnType<typeof setTimeout> => {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(callback)
  }
  return setTimeout(callback, 16)
}

const defaultCancelFrame = (handle: number | ReturnType<typeof setTimeout>) => {
  if (typeof cancelAnimationFrame === 'function' && typeof handle === 'number') {
    cancelAnimationFrame(handle)
    return
  }
  clearTimeout(handle as ReturnType<typeof setTimeout>)
}

const defaultDropNotice = (bytes: number) =>
  `\r\n[Chaterm] Output is arriving too fast; skipped ${Math.ceil(bytes / 1024)} KB to keep the UI responsive.\r\n`

export const createTerminalWriteQueue = (options: TerminalWriteQueueOptions): TerminalWriteQueue => {
  const maxBatchBytes = options.maxBatchBytes ?? DEFAULT_MAX_BATCH_BYTES
  const maxPendingBytes = options.maxPendingBytes ?? DEFAULT_MAX_PENDING_BYTES
  const scheduleFrame = options.scheduleFrame ?? defaultScheduleFrame
  const cancelFrame = options.cancelFrame ?? defaultCancelFrame
  const dropNotice = options.dropNotice ?? defaultDropNotice

  const queue: QueueChunk[] = []
  let pendingBytes = 0
  let frameHandle: number | ReturnType<typeof setTimeout> | null = null
  let writing = false
  let disposed = false
  let noticeQueued = false
  let paused = false

  const byteLength = (data: string): number => data.length

  const enqueueChunk = (chunk: QueueChunk) => {
    queue.push(chunk)
    pendingBytes += byteLength(chunk.data)
  }

  const dequeueChunk = (): QueueChunk | undefined => {
    const chunk = queue.shift()
    if (chunk) {
      pendingBytes -= byteLength(chunk.data)
    }
    return chunk
  }

  const dropPendingDroppableChunks = (requiredBytes: number): number => {
    let droppedBytes = 0
    for (let index = 0; index < queue.length && pendingBytes + requiredBytes > maxPendingBytes; ) {
      const chunk = queue[index]
      if (!chunk.droppable) {
        index++
        continue
      }
      droppedBytes += byteLength(chunk.data)
      pendingBytes -= byteLength(chunk.data)
      queue.splice(index, 1)
    }
    return droppedBytes
  }

  const enqueueDropNotice = (droppedBytes: number) => {
    if (!droppedBytes || noticeQueued) return
    const notice = dropNotice(droppedBytes)
    noticeQueued = true
    enqueueChunk({
      data: notice,
      droppable: false,
      callbacks: [
        () => {
          noticeQueued = false
        }
      ]
    })
  }

  const trimIncomingChunk = (data: string): { data: string; droppedBytes: number } => {
    const dataBytes = byteLength(data)
    if (dataBytes <= maxPendingBytes) {
      return { data, droppedBytes: 0 }
    }

    const kept = data.slice(-maxPendingBytes)
    return {
      data: kept,
      droppedBytes: dataBytes - byteLength(kept)
    }
  }

  const schedule = () => {
    if (disposed || paused || writing || frameHandle !== null) return
    frameHandle = scheduleFrame(() => {
      frameHandle = null
      flush()
    })
  }

  const flush = () => {
    if (disposed || paused || writing || queue.length === 0) return

    let batch = ''
    const callbacks: Array<() => void> = []

    while (queue.length > 0) {
      const next = queue[0]
      const nextBytes = byteLength(next.data)
      if (batch && byteLength(batch) + nextBytes > maxBatchBytes) {
        break
      }

      const chunk = dequeueChunk()
      if (!chunk) break

      batch += chunk.data
      callbacks.push(...chunk.callbacks)

      if (byteLength(batch) >= maxBatchBytes) {
        break
      }
    }

    if (!batch) return

    writing = true
    options.write(batch, () => {
      writing = false
      for (const callback of callbacks) {
        callback()
      }
      schedule()
    })
  }

  return {
    enqueue(data, enqueueOptions) {
      if (disposed || !data) return

      const droppable = enqueueOptions?.droppable !== false
      let nextData = data
      let droppedBytes = droppable ? dropPendingDroppableChunks(byteLength(nextData)) : 0

      if (droppable && pendingBytes + byteLength(nextData) > maxPendingBytes) {
        const trimmed = trimIncomingChunk(nextData)
        nextData = trimmed.data
        droppedBytes += trimmed.droppedBytes
      }

      enqueueDropNotice(droppedBytes)
      enqueueChunk({
        data: nextData,
        droppable,
        callbacks: enqueueOptions?.callback ? [enqueueOptions.callback] : []
      })
      schedule()
    },
    setPaused(nextPaused) {
      if (disposed || paused === nextPaused) return
      paused = nextPaused
      if (!paused) {
        schedule()
      }
    },
    flush,
    dispose() {
      disposed = true
      queue.length = 0
      pendingBytes = 0
      if (frameHandle !== null) {
        cancelFrame(frameHandle)
        frameHandle = null
      }
    },
    getPendingBytes() {
      return pendingBytes
    }
  }
}
