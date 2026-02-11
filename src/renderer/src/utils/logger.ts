// Renderer process logger adapter
// Sends log entries to main process via window.api.log IPC bridge

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogWritePayload {
  level: LogLevel
  process: 'renderer'
  module: string
  message: string
  meta?: Record<string, unknown>
}

export interface LoggerLike {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

/**
 * Create a logger for use in the renderer process.
 * Logs are sent to the main process via window.api.log().
 */
export function createRendererLogger(module: string): LoggerLike {
  const write = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    const payload: LogWritePayload = {
      level,
      process: 'renderer',
      module,
      message,
      meta
    }

    try {
      window.api.log(payload)
    } catch {
      // Fallback to console if IPC bridge is not available
      // (e.g., during early renderer initialization)
      // eslint-disable-next-line no-console
      console[level === 'debug' ? 'log' : level](`[${module}] ${message}`, meta || '')
    }
  }

  return {
    debug: (message, meta) => write('debug', message, meta),
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta)
  }
}
