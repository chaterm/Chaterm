import * as dotenv from 'dotenv'
import { getDeviceId } from './devideId'
import { getChatermDbPathForUser, getCurrentUserId } from '../../db/connection'
import { getSyncUrl } from '../../../config/edition'
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
  encryptionKey?: string // passphrase to derive AES key

  // Large data volume processing configuration
  largeDataThreshold: number // Large data volume threshold
  pageSize: number // Page size
  maxConcurrentPages: number // Maximum concurrent pages
  adaptivePageSize: boolean // Adaptive page size
  memoryOptimization: boolean // Memory optimization mode
}

// Get current user's database path
function getCurrentUserDbPath(): string {
  const currentUserId = getCurrentUserId()
  if (currentUserId) {
    return getChatermDbPathForUser(currentUserId)
  }
  // If no current user ID, use environment variable or default path
  return process.env.DB_PATH || './sqliteDB/chaterm_data.db'
}

export const syncConfig: SyncConfig = {
  serverUrl: getSyncUrl(), // Edition-specific sync server URL
  apiVersion: 'v1',
  dbPath: getCurrentUserDbPath(),
  deviceId: getDeviceId(), // Use motherboard ID
  username: process.env.USERNAME,
  password: process.env.PASSWORD,
  syncIntervalMs: 120000, // 2 minutes
  batchSize: 100,
  maxConcurrentBatches: 3,
  compressionEnabled: true, // Enable intelligent data compression
  encryptionKey: process.env.ENCRYPTION_KEY,

  // Large data volume processing configuration
  largeDataThreshold: 5000, // More than 5000 records is considered large data volume
  pageSize: 1000, // Page size: 1000 records
  maxConcurrentPages: 2, // Maximum 2 concurrent pages
  adaptivePageSize: true, // Adaptive page size
  memoryOptimization: true // Memory optimization mode
}
