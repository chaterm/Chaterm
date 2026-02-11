// Unified logging system - main process entry point
// Uses electron-log with one daily file, NDJSON format,
// sanitization hooks, and IPC bridge for renderer/preload processes.

import log from 'electron-log/main'
import type Logger from 'electron-log'
import { app, ipcMain, shell } from 'electron'
import * as path from 'path'
import type { LogLevel, LoggerLike, LogWritePayload } from './types'
import {
  AUDIT_EVENTS,
  MAX_MESSAGE_LENGTH,
  resolveChannel
} from './types'
import { sanitizeHook } from './sanitizer'
import { formatNdjsonLine } from './ndjson'
import { loadConfig, getConfig } from './logConfigStore'
import { runRetention } from './retention'
import { enableCapture, RAW_CONSOLE } from './mainVendorConsoleCapture'
import { buildLogFileName } from './logFileName'

// Map from our LogLevel to electron-log level index for filtering
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
}

let unifiedLogger: Logger.MainLogger | null = null

/**
 * Check if a log entry qualifies as an audit event (always written even when disabled)
 */
function isAuditEntry(level: LogLevel, meta?: Record<string, unknown>): boolean {
  return (
    level === 'error' ||
    (typeof meta?.event === 'string' && AUDIT_EVENTS.has(meta.event))
  )
}

/**
 * Check if the given level passes the configured threshold
 */
function shouldLog(level: LogLevel): boolean {
  const config = getConfig()
  return LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[config.level]
}

/**
 * Truncate message to MAX_MESSAGE_LENGTH
 */
function truncateMessage(message: string): string {
  if (message.length <= MAX_MESSAGE_LENGTH) return message
  return message.slice(0, MAX_MESSAGE_LENGTH) + `...[truncated, total ${message.length}]`
}

function getOrCreateLogger(): Logger.MainLogger {
  if (unifiedLogger) return unifiedLogger

  const logger = log.create({ logId: 'chaterm' }) as unknown as Logger.MainLogger

  // Configure file transport
  const config = getConfig()
  const fileTransport = logger.transports.file
  fileTransport.resolvePathFn = () =>
    path.join(app.getPath('userData'), 'logs', buildLogFileName())
  fileTransport.maxSize = config.maxFileSizeMB * 1024 * 1024
  fileTransport.format = formatNdjsonLine as any

  // Disable console transport in production (we handle console separately)
  if (process.env.NODE_ENV !== 'development') {
    logger.transports.console.level = false
  }

  // Disable IPC transport (we handle IPC ourselves)
  if (logger.transports.ipc) {
    logger.transports.ipc.level = false
  }

  // Attach sanitization hook
  logger.hooks.push(sanitizeHook)

  unifiedLogger = logger
  return logger
}

/**
 * Create a logger instance for a given module in the main process.
 */
export function createLogger(module: string): LoggerLike {
  const channel = resolveChannel(module)
  const elLogger = getOrCreateLogger()

  const write = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    const config = getConfig()

    // When disabled, only write audit events and errors
    if (!config.enabled && !isAuditEntry(level, meta)) return

    // Level filtering
    if (!shouldLog(level)) return

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      process: 'main' as const,
      channel,
      module,
      message: truncateMessage(message),
      ...meta
    }

    elLogger[level](entry)
  }

  return {
    debug: (message, meta) => write('debug', message, meta),
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta)
  }
}

/**
 * Validate incoming log:write IPC payload
 */
function validatePayload(payload: unknown): payload is LogWritePayload {
  if (typeof payload !== 'object' || payload === null) return false
  const p = payload as Record<string, unknown>
  if (typeof p.level !== 'string' || !['debug', 'info', 'warn', 'error'].includes(p.level)) return false
  if (typeof p.process !== 'string' || !['main', 'preload', 'renderer'].includes(p.process)) return false
  if (typeof p.module !== 'string' || p.module.length === 0) return false
  if (typeof p.message !== 'string') return false
  if (p.meta !== undefined && (typeof p.meta !== 'object' || p.meta === null)) return false
  return true
}

/**
 * Register the IPC handler for renderer/preload log writes
 */
export function registerLogIpcHandler(): void {
  ipcMain.handle('log:write', (_event, payload: unknown) => {
    if (!validatePayload(payload)) {
      RAW_CONSOLE.warn('[logging] Invalid log:write payload received:', payload)
      return { success: false, error: 'Invalid payload' }
    }

    const channel = resolveChannel(payload.module)
    const elLogger = getOrCreateLogger()
    const config = getConfig()

    // When disabled, only write audit events and errors
    if (!config.enabled && !isAuditEntry(payload.level, payload.meta)) {
      return { success: true }
    }

    // Level filtering
    if (!shouldLog(payload.level)) {
      return { success: true }
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level: payload.level,
      process: payload.process,
      channel,
      module: payload.module,
      message: truncateMessage(payload.message),
      ...payload.meta
    }

    elLogger[payload.level](entry)
    return { success: true }
  })

  // Open log directory handler
  ipcMain.handle('logging:openDir', async () => {
    const logDir = path.join(app.getPath('userData'), 'logs')
    await shell.openPath(logDir)
  })
}

/**
 * Initialize the unified logging system.
 * Must be called early in the main process startup.
 */
export function initLogging(): void {
  // Load config from disk
  loadConfig()

  const config = getConfig()
  RAW_CONSOLE.info(
    `[logging] Initialized: level=${config.level}, enabled=${config.enabled}, ` +
    `retention=${config.retentionDays}d, maxFile=${config.maxFileSizeMB}MB, maxTotal=${config.maxTotalSizeMB}MB`
  )

  // Pre-create unified logger
  getOrCreateLogger()

  // Register IPC handler for renderer/preload
  registerLogIpcHandler()

  // Enable vendor console capture
  const vendorLogger = createLogger('vendor')
  enableCapture(vendorLogger)

  // Log startup audit event
  const processLogger = createLogger('process')
  processLogger.info('Application started', { event: 'app.startup' })

  // Schedule retention cleanup (async, non-blocking)
  scheduleRetention()
}

/**
 * Schedule periodic retention cleanup
 */
function scheduleRetention(): void {
  const runCleanup = async () => {
    try {
      const config = getConfig()
      await runRetention({
        retentionDays: config.retentionDays,
        maxTotalSizeMB: config.maxTotalSizeMB
      })
    } catch (err) {
      RAW_CONSOLE.error('[logging] Retention cleanup failed:', err)
    }
  }

  // Run once at startup (delayed)
  setTimeout(runCleanup, 5000)

  // Run every 6 hours
  setInterval(runCleanup, 6 * 60 * 60 * 1000)
}

/**
 * Log a renderer crash event (audit event, always written)
 */
export function logRendererCrash(details: {
  webContentsId: number
  reason: string
  exitCode: number
}): void {
  const processLogger = createLogger('process')
  processLogger.error('Renderer process crashed', {
    event: 'renderer.crash',
    webContentsId: details.webContentsId,
    reason: details.reason,
    exitCode: details.exitCode
  })
}

// Re-export types and utilities for convenience
export type { LoggerLike, LogLevel, LogChannel, LogWritePayload } from './types'
export { getConfig, updateConfig } from './logConfigStore'
