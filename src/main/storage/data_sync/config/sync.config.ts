import * as dotenv from 'dotenv'
import { getDeviceId } from './devideId'
import { getChatermDbPathForUser, getCurrentUserId } from '../../db/connection'
dotenv.config()

export interface SyncConfig {
  serverUrl: string
  apiVersion: string
  dbPath: string
  deviceId: string
  username?: string
  password?: string
  syncIntervalMs: number
  batchSize: number
  maxConcurrentBatches: number
  compressionEnabled: boolean
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  encryptionKey?: string // passphrase to derive AES key
  fileLoggingEnabled?: boolean // 是否启用文件日志
  logRetentionDays?: number // 日志保留天数

  // 大数据量处理配置
  largeDataThreshold: number // 大数据量阈值
  pageSize: number // 分页大小
  maxConcurrentPages: number // 最大并发页面数
  adaptivePageSize: boolean // 自适应页面大小
  memoryOptimization: boolean // 内存优化模式
}

// 获取当前用户的数据库路径
function getCurrentUserDbPath(): string {
  const currentUserId = getCurrentUserId()
  if (currentUserId) {
    return getChatermDbPathForUser(currentUserId)
  }
  // 如果没有当前用户ID，使用环境变量或默认路径
  return process.env.DB_PATH || './sqliteDB/chaterm_data.db'
}

export const syncConfig: SyncConfig = {
  serverUrl: 'http://localhost:8001',
  apiVersion: 'v1',
  dbPath: getCurrentUserDbPath(),
  deviceId: getDeviceId(), // 使用主板id
  username: process.env.USERNAME,
  password: process.env.PASSWORD,
  syncIntervalMs: 120000, // 2 minutes
  batchSize: 100,
  maxConcurrentBatches: 3,
  compressionEnabled: true, // 启用数据智能压缩
  logLevel: 'info',
  encryptionKey: process.env.ENCRYPTION_KEY,
  fileLoggingEnabled: process.env.ENABLE_FILE_LOGGING !== 'false', // 默认启用文件日志
  logRetentionDays: 7, // 默认保留7天日志

  // 大数据量处理配置
  largeDataThreshold: 5000, // 5000条以上为大数据量
  pageSize: 1000, // 分页大小1000条
  maxConcurrentPages: 2, // 最多2个页面并发
  adaptivePageSize: true, // 自适应页面大小
  memoryOptimization: true // 内存优化模式
}
