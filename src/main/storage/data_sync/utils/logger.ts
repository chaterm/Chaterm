import { syncConfig } from '../config/sync.config'
import * as fs from 'fs'
import * as path from 'path'

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

  constructor() {
    this.logDir = process.env.LOG_DIR || './logs'
    this.logFile = path.join(this.logDir, 'sync.log')
    this.ensureLogDirectory()
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
  }

  private shouldLog(level: Level): boolean {
    return levelPriority[level] >= levelPriority[syncConfig.logLevel]
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
    try {
      const logLine = JSON.stringify(entry) + '\n'
      fs.appendFileSync(this.logFile, logLine)
    } catch (error) {
      // 如果写文件失败，至少输出到控制台
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

    // 控制台输出（格式化）
    const consoleMessage = `[${entry.timestamp}] [${level.toUpperCase()}] ${message}`
    const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : level === 'debug' ? console.debug : console.log

    if (meta !== undefined) {
      consoleMethod(consoleMessage, meta)
    } else {
      consoleMethod(consoleMessage)
    }

    // 写入文件（结构化）
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

  // 性能监控日志
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

  // 同步操作日志
  sync(operation: string, message: string, meta?: any): void {
    this.info(message, meta, {
      component: 'sync',
      operation
    })
  }

  // 网络请求日志
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
}

export const logger = new StructuredLogger()
