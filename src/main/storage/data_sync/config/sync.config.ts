import dotenv from 'dotenv'

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
  encryptionKey: process.env.ENCRYPTION_KEY
}
