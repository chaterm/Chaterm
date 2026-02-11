// Preload process logger adapter
// Sends log entries to main process via ipcRenderer.invoke('log:write')

import { ipcRenderer } from 'electron'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogWritePayload {
  level: LogLevel
  process: 'preload'
  module: string
  message: string
  meta?: Record<string, unknown>
}

interface LoggerLike {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

/**
 * Create a logger for use in the preload script.
 * Logs are sent directly to main process via ipcRenderer.invoke.
 */
export function createPreloadLogger(module: string): LoggerLike {
  const write = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    const payload: LogWritePayload = {
      level,
      process: 'preload',
      module,
      message,
      meta
    }

    ipcRenderer.invoke('log:write', payload).catch(() => {
      // Silently drop if IPC is not available (e.g., during shutdown)
    })
  }

  return {
    debug: (message, meta) => write('debug', message, meta),
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta)
  }
}
