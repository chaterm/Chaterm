import * as dotenv from 'dotenv'

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
}

export const syncConfig: SyncConfig = {
  serverUrl: process.env.SERVER_URL || 'http://localhost:8080',
  apiVersion: process.env.API_VERSION || 'v1',
  dbPath: process.env.DB_PATH || './sqliteDB/chaterm_data.db',
  deviceId: process.env.DEVICE_ID || 'device-default',
  username: process.env.USERNAME,
  password: process.env.PASSWORD,
  syncIntervalMs: Number(process.env.SYNC_INTERVAL_MS || 120000), // 2 minutes
  batchSize: Number(process.env.BATCH_SIZE || 100),
  maxConcurrentBatches: Number(process.env.MAX_CONCURRENT_BATCHES || 3),
  compressionEnabled: (process.env.COMPRESSION_ENABLED || 'true') === 'true',
  logLevel: (process.env.LOG_LEVEL as SyncConfig['logLevel']) || 'info',
  encryptionKey: process.env.ENCRYPTION_KEY,
  fileLoggingEnabled: process.env.ENABLE_FILE_LOGGING !== 'false', // 默认启用文件日志
  logRetentionDays: Number(process.env.LOG_RETENTION_DAYS || 7) // 默认保留7天日志
}
