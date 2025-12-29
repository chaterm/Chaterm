import { syncConfig } from '../config/sync.config'
import * as fs from 'fs'
import * as path from 'path'
import { getUserDataPath } from '../../../config/edition'

type Level = 'debug' | 'info' | 'warn' | 'error'

const levelPriority: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
}

interface LogEntry {
  timestamp: string
  level: Level
  message: string
  meta?: any
  deviceId?: string
  component?: string
  operation?: string
  duration?: number
  error?: {
    name: string
    message: string
    stack?: string
  }
}

class StructuredLogger {
  private logDir: string
  private logFile: string
  private currentDate: string
  private fileLoggingEnabled: boolean

  constructor() {
    // Use the global userData path configuration
    this.logDir = path.join(getUserDataPath(), 'logs', 'sync')
    this.currentDate = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
    this.logFile = path.join(this.logDir, `sync-${this.currentDate}.log`)

    // Read whether to enable file logging from environment variables or config
    this.fileLoggingEnabled = process.env.ENABLE_FILE_LOGGING !== 'false' && syncConfig.fileLoggingEnabled !== false

    this.ensureLogDirectory()
  }

  private ensureLogDirectory(): void {
    if (this.fileLoggingEnabled && !fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
  }

  private shouldLog(level: Level): boolean {
    return levelPriority[level] >= levelPriority[syncConfig.logLevel]
  }

  private getCurrentLogFile(): string {
    const today = new Date().toISOString().split('T')[0]
    if (today !== this.currentDate) {
      this.currentDate = today
      this.logFile = path.join(this.logDir, `sync-${this.currentDate}.log`)
    }
    return this.logFile
  }

  private formatLogEntry(
    level: Level,
    message: string,
    meta?: any,
    options?: {
      component?: string
      operation?: string
      duration?: number
      error?: Error
    }
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      deviceId: syncConfig.deviceId
    }

    if (meta !== undefined) {
      entry.meta = meta
    }

    if (options?.component) {
      entry.component = options.component
    }

    if (options?.operation) {
      entry.operation = options.operation
    }

    if (options?.duration !== undefined) {
      entry.duration = options.duration
    }

    if (options?.error) {
      entry.error = {
        name: options.error.name,
        message: options.error.message,
        stack: options.error.stack
      }
    }

    return entry
  }

  private writeToFile(entry: LogEntry): void {
    if (!this.fileLoggingEnabled) {
      return
    }

    try {
      const logFile = this.getCurrentLogFile()
      const logLine = JSON.stringify(entry) + '\n'
      fs.appendFileSync(logFile, logLine)
    } catch (error) {
      // If file write fails, at least output to console
      console.error('Failed to write to log file:', error)
    }
  }

  private log(
    level: Level,
    message: string,
    meta?: any,
    options?: {
      component?: string
      operation?: string
      duration?: number
      error?: Error
    }
  ): void {
    if (!this.shouldLog(level)) {
      return
    }

    const entry = this.formatLogEntry(level, message, meta, options)

    // Console output (formatted)
    const consoleMessage = `[${entry.timestamp}] [${level.toUpperCase()}] ${message}`
    const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : level === 'debug' ? console.debug : console.log

    if (meta !== undefined) {
      consoleMethod(consoleMessage, meta)
    } else {
      consoleMethod(consoleMessage)
    }

    // Write to file (structured)
    this.writeToFile(entry)
  }

  debug(message: string, meta?: any, options?: { component?: string; operation?: string; duration?: number }): void {
    this.log('debug', message, meta, options)
  }

  info(message: string, meta?: any, options?: { component?: string; operation?: string; duration?: number }): void {
    this.log('info', message, meta, options)
  }

  warn(message: string, meta?: any, options?: { component?: string; operation?: string; duration?: number }): void {
    this.log('warn', message, meta, options)
  }

  error(message: string, meta?: any, options?: { component?: string; operation?: string; duration?: number; error?: Error }): void {
    this.log('error', message, meta, options)
  }

  // Performance monitoring log
  performance(operation: string, duration: number, success: boolean, meta?: any): void {
    this.info(
      `Performance: ${operation}`,
      {
        duration,
        success,
        ...meta
      },
      {
        component: 'performance',
        operation,
        duration
      }
    )
  }

  // Sync operation log
  sync(operation: string, message: string, meta?: any): void {
    this.info(message, meta, {
      component: 'sync',
      operation
    })
  }

  // Network request log
  network(method: string, url: string, status: number, duration: number, error?: Error): void {
    const level = error ? 'error' : status >= 400 ? 'warn' : 'info'
    this.log(
      level,
      `${method} ${url} - ${status}`,
      {
        method,
        url,
        status,
        duration
      },
      {
        component: 'network',
        operation: `${method} ${url}`,
        duration,
        error
      }
    )
  }

  /**
   * Set whether to enable file logging
   * @param enabled Whether to enable file logging
   */
  setFileLoggingEnabled(enabled: boolean): void {
    this.fileLoggingEnabled = enabled
    if (enabled) {
      this.ensureLogDirectory()
    }
  }

  /**
   * Get current log file path
   */
  getCurrentLogFilePath(): string {
    return this.getCurrentLogFile()
  }

  /**
   * Clean up old log files (keep logs from the last N days)
   * @param daysToKeep Number of days to keep, default 7 days
   */
  cleanupOldLogs(daysToKeep: number = 7): void {
    if (!this.fileLoggingEnabled || !fs.existsSync(this.logDir)) {
      return
    }

    try {
      const files = fs.readdirSync(this.logDir)
      const now = new Date()
      const cutoffDate = new Date(now.getTime() - daysToKeep * 24 * 60 * 60 * 1000)

      files.forEach((file) => {
        if (file.startsWith('sync-') && file.endsWith('.log')) {
          const filePath = path.join(this.logDir, file)
          const stats = fs.statSync(filePath)

          if (stats.mtime < cutoffDate) {
            fs.unlinkSync(filePath)
            console.log(`Cleaned up old log file: ${file}`)
          }
        }
      })
    } catch (error) {
      console.error('Failed to cleanup old logs:', error)
    }
  }
}

export const logger = new StructuredLogger()
