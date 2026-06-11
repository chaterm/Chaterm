export interface TerminalOutputBuffer {
  push: (data: string) => void
  flush: () => void
  dispose: () => void
}

interface TerminalOutputBufferOptions {
  send: (data: string) => void
  maxBufferBytes?: number
  flushIntervalMs?: number
}

const DEFAULT_MAX_BUFFER_BYTES = 64 * 1024
const DEFAULT_FLUSH_INTERVAL_MS = 16

export const createTerminalOutputBuffer = (options: TerminalOutputBufferOptions): TerminalOutputBuffer => {
  const maxBufferBytes = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES
  const flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS
  let chunks: string[] = []
  let bufferedBytes = 0
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const clearFlushTimer = () => {
    if (!flushTimer) return
    clearTimeout(flushTimer)
    flushTimer = null
  }

  const flush = () => {
    clearFlushTimer()
    if (!bufferedBytes) return

    const data = chunks.join('')
    chunks = []
    bufferedBytes = 0
    options.send(data)
  }

  const scheduleFlush = () => {
    if (flushTimer || disposed) return
    flushTimer = setTimeout(flush, flushIntervalMs)
  }

  return {
    push(data) {
      if (disposed || !data) return

      chunks.push(data)
      bufferedBytes += data.length

      if (bufferedBytes >= maxBufferBytes) {
        flush()
        return
      }

      scheduleFlush()
    },
    flush,
    dispose() {
      disposed = true
      clearFlushTimer()
      chunks = []
      bufferedBytes = 0
    }
  }
}
