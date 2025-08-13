import { syncConfig } from '../config/sync.config'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

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
    // 使用与数据库相同的用户数据目录
    const userDataPath = app.getPath('userData')
    this.logDir = path.join(userDataPath, 'logs', 'sync')
    this.currentDate = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
    this.logFile = path.join(this.logDir, `sync-${this.currentDate}.log`)

    // 从环境变量或配置中读取是否启用文件日志
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

  /**
   * 设置是否启用文件日志
   * @param enabled 是否启用文件日志
   */
  setFileLoggingEnabled(enabled: boolean): void {
    this.fileLoggingEnabled = enabled
    if (enabled) {
      this.ensureLogDirectory()
    }
  }

  /**
   * 获取当前日志文件路径
   */
  getCurrentLogFilePath(): string {
    return this.getCurrentLogFile()
  }

  /**
   * 清理旧的日志文件（保留最近N天的日志）
   * @param daysToKeep 保留的天数，默认7天
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
