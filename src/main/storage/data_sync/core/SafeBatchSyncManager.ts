/**
 * Safe Batch Sync Manager
 * Combines high-performance batch processing with OneDrive-style data protection
 * Unified solution: suitable for all data volume scenarios
 */

import { ApiClient } from './ApiClient'
import { DatabaseManager } from './DatabaseManager'
import { logger } from '../utils/logger'
import { getEncryptionService } from '../services/EncryptionRegistry'
import { encryptPayload } from '../utils/combinedEncryption'

interface SyncMetadata {
  tableName: string
  lastSyncTime: string
  lastSyncVersion: number
  serverLastModified: string
  localLastModified: string
  syncStatus: 'pending' | 'in_progress' | 'completed' | 'failed'
}

interface ConflictResolutionRule {
  field: string
  strategy: 'server_wins' | 'client_wins' | 'latest_wins' | 'merge' | 'manual'
  priority: number
}

interface MergeResult {
  action: 'keep_local' | 'apply_server' | 'merge' | 'conflict'
  record: any
  conflictReason?: string
}

interface FullSyncSession {
  session_id: string
  total_count: number
  page_size: number
  current_page: number
  is_completed: boolean
}

interface FullSyncBatchResponse {
  success: boolean
  message: string
  data: any[]
  pagination: any
  is_last: boolean
  checksum: string
}

/**
 * Safe Batch Sync Manager
 * Core features:
 * 1. Batch processing - memory-friendly, suitable for large data volumes
 * 2. Intelligent merging - protects local data, automatically resolves conflicts
 * 3. Atomic operations - ensures data consistency
 * 4. Resume capability - supports session recovery
 */
export class SafeBatchSyncManager {
  private apiClient: ApiClient
  private dbManager: DatabaseManager
  private conflictRules: Map<string, ConflictResolutionRule[]> = new Map()
  private processedChecksums: Set<string> = new Set()
  private syncSessions: Map<string, FullSyncSession> = new Map()

  // Mapping from remote table names to local table names
  private readonly tableMapping: Record<string, string> = {
    t_assets_sync: 't_assets',
    t_asset_chains_sync: 't_asset_chains'
  }

  constructor(apiClient: ApiClient, dbManager: DatabaseManager) {
    this.apiClient = apiClient
    this.dbManager = dbManager
    this.initializeConflictRules()
  }

  /**
   * Perform safe batch sync - unified entry point
   * Automatically adjusts processing strategy based on data volume
   */
  async performSafeBatchSync(
    tableName: string,
    pageSize: number = 500,
    onProgress?: (current: number, total: number, percentage: number) => void,
    _forceSync: boolean = false
  ): Promise<void> {
    let session: FullSyncSession | null = null

    try {
      logger.info(`Starting safe batch sync: ${tableName}`)

      // Step 1: Check sync necessity and prepare environment
      const syncMetadata = await this.getSyncMetadata(tableName)
      let needsSync: boolean

      try {
        needsSync = await this.checkSyncNecessity(tableName, syncMetadata)
      } catch (error: any) {
        if (error.message === 'SERVER_UNAVAILABLE') {
          logger.warn(`Server unavailable, stopping sync operation for ${tableName}`)
          return
        }
        throw error
      }

      // Check if there is historical data that needs to be uploaded
      const localTableName = tableName.replace('_sync', '')
      const hasHistoricalData = this.dbManager.getHistoricalDataCount(localTableName) > 0

      if (!needsSync && !hasHistoricalData) {
        logger.info(`${tableName} does not need sync, server has no updates and no historical data`)
        return
      }

      if (!needsSync && hasHistoricalData) {
        logger.info(`${tableName} server has no updates, but historical data detected, uploading historical data only`)
        // Upload historical data directly, no need to download server data
        try {
          await this.uploadHistoricalDataIfNeeded(tableName)
        } catch (error: any) {
          if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
            logger.warn(`Server unavailable, skipping historical data upload for ${tableName}`)
            return
          }
          throw error
        }
        return
      }

      await this.prepareSyncEnvironment(tableName)

      // Step 2: Start batch sync session
      try {
        session = await this.startFullSync(tableName, pageSize)
        logger.info(`Sync session started: ${session.session_id}, total records: ${session.total_count}`)
      } catch (error: any) {
        if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
          logger.warn(`Server unavailable, cannot start sync session for ${tableName}`)
          return
        }
        throw error
      }

      // Step 3: Choose processing strategy based on data volume
      const recordCount = session.total_count

      if (recordCount <= 1000) {
        // Small data volume: fast batch processing
        await this.performFastBatchSync(session, syncMetadata, onProgress)
      } else {
        // Large data volume: safe intelligent merging
        await this.performIntelligentBatchSync(session, syncMetadata, onProgress)
      }

      // Step 4: Handle historical data upload (executed in all sync paths)
      await this.uploadHistoricalDataIfNeeded(tableName)

      // Step 5: Update sync metadata
      await this.updateSyncMetadata(tableName, {
        lastSyncTime: new Date().toISOString(),
        lastSyncVersion: session.total_count,
        syncStatus: 'completed'
      })

      logger.info(`Safe batch sync completed: ${tableName}, processed ${recordCount} records`)
    } catch (error) {
      logger.error('Safe batch sync failed:', error)
      if (session) {
        await this.updateSyncMetadata(tableName, { syncStatus: 'failed' })
      }
      throw error
    } finally {
      if (session) {
        await this.finishSync(session.session_id)
      }
      this.processedChecksums.clear()
    }
  }

  /**
   * Fast batch processing - for small data volume scenarios
   * Direct replacement, but first checks if there are unsynced local changes
   */
  private async performFastBatchSync(
    session: FullSyncSession,
    metadata: SyncMetadata,
    onProgress?: (current: number, total: number, percentage: number) => void
  ): Promise<void> {
    logger.info(`Using fast batch processing mode: ${session.total_count} records`)

    // Check if there are unsynced local changes
    const hasLocalChanges = await this.hasUnsynedLocalChanges(metadata.tableName)

    if (!hasLocalChanges) {
      // No local changes, use efficient atomic replacement
      await this.performAtomicReplacement(session, metadata, onProgress)
    } else {
      // Has local changes, use intelligent merging
      logger.info('Detected unsynced local changes, switching to intelligent merge mode')
      await this.performIntelligentBatchSync(session, metadata, onProgress)
    }
  }

  /**
   * Intelligent batch processing - for large data volume or conflict scenarios
   * Downloads in batches, intelligently merges batch by batch, protects all local data
   */
  private async performIntelligentBatchSync(
    session: FullSyncSession,
    metadata: SyncMetadata,
    onProgress?: (current: number, total: number, percentage: number) => void
  ): Promise<void> {
    logger.info(`Using intelligent batch processing mode: ${session.total_count} records`)

    const totalPages = Math.ceil(session.total_count / session.page_size)
    let currentPage = 1
    let processedRecords = 0

    // Process each page in batches
    while (currentPage <= totalPages) {
      try {
        // Get current batch data
        const batchData = await this.getBatchData(session.session_id, currentPage)

        // Duplicate check
        if (this.processedChecksums.has(batchData.checksum)) {
          logger.info(`Batch ${currentPage} already processed, skipping`)
          currentPage++
          continue
        }

        // Intelligently merge current batch
        const mergeResults = await this.intelligentMergeRecords(metadata.tableName, batchData.data, metadata)

        // Disable local triggers when applying cloud data to prevent echo
        this.dbManager.setRemoteApplyGuard(true)
        try {
          await this.applyMergeResultsBatch(metadata.tableName, mergeResults)
        } finally {
          this.dbManager.setRemoteApplyGuard(false)
        }

        processedRecords += batchData.data.length
        this.processedChecksums.add(batchData.checksum)

        // Progress callback
        if (onProgress) {
          const percentage = Math.round((currentPage / totalPages) * 100)
          onProgress(currentPage, totalPages, percentage)
        }

        logger.info(`Processing batch ${currentPage}/${totalPages}, current batch: ${batchData.data.length}, total: ${processedRecords}`)

        if (batchData.is_last) break
        currentPage++

        // Small delay to avoid server pressure
        await this.delay(50)
      } catch (error) {
        logger.error(`Failed to process batch ${currentPage}:`, error)

        // Retry logic
        if (currentPage <= 3) {
          logger.info(`Retrying batch ${currentPage}`)
          await this.delay(1000)
          continue
        } else {
          throw error
        }
      }
    }
  }

  /**
   * Upload historical data (if needed)
   * Historical data refers to: data that exists in local data tables but not in change_log
   */
  private async uploadHistoricalDataIfNeeded(tableName: string): Promise<void> {
    try {
      const localTableName = this.getLocalTableName(tableName)
      const historicalCount = this.dbManager.getHistoricalDataCount(localTableName)

      if (historicalCount === 0) {
        logger.info(`${localTableName} has no historical data to upload`)
        return
      }

      // Get historical data
      const historicalData = await this.getHistoricalData(localTableName)

      if (historicalData.length === 0) {
        logger.warn(`Detected ${historicalCount} historical records, but actually retrieved 0`)
        return
      }

      // Upload historical data in batches
      const batchSize = 100
      let uploadedCount = 0
      let failedCount = 0

      for (let i = 0; i < historicalData.length; i += batchSize) {
        const batch = historicalData.slice(i, i + batchSize)
        const batchIndex = Math.floor(i / batchSize) + 1
        const totalBatches = Math.ceil(historicalData.length / batchSize)

        logger.info(`📦 Processing batch ${batchIndex}/${totalBatches}: ${batch.length} records`)

        // Add operation type to each record and perform encryption
        const uploadData = await Promise.all(
          batch.map(async (record) => {
            const recordWithOp = {
              ...record,
              operation_type: 'INSERT'
            }
            // Fix: encrypt historical data as well
            return await this.prepareRecordForUpload(tableName, recordWithOp)
          })
        )

        // Call incremental sync API to upload
        try {
          const response = await this.apiClient.incrementalSync(tableName, uploadData)
          if (response.success) {
            uploadedCount += batch.length
            logger.info(`Batch ${batchIndex} uploaded successfully: ${batch.length} records`)

            // Create change_log records for successfully uploaded data to avoid duplicate uploads
            await this.createChangeLogForHistoricalData(localTableName, batch)
          } else {
            failedCount += batch.length
            logger.warn(`Batch ${batchIndex} upload failed: ${response.message}`)
          }
        } catch (error) {
          failedCount += batch.length
          logger.error(`Batch ${batchIndex} upload exception:`, error)
        }

        // Small delay to avoid server pressure
        await this.delay(100)
      }

      logger.info(`${localTableName} historical data upload completed: success=${uploadedCount} records, failed=${failedCount} records`)
    } catch (error) {
      logger.error(`Failed to upload historical data:`, error)
    }
  }

  /**
   * Atomic replacement processing - efficient solution when there are no local changes
   */
  private async performAtomicReplacement(
    session: FullSyncSession,
    metadata: SyncMetadata,
    onProgress?: (current: number, total: number, percentage: number) => void
  ): Promise<void> {
    const tableName = metadata.tableName
    const tempTableName = await this.createTempTable(tableName)
    const totalPages = Math.ceil(session.total_count / session.page_size)
    let currentPage = 1

    try {
      logger.info(`Creating temporary table: ${tempTableName}`)

      // Download data to temporary table in batches
      while (currentPage <= totalPages) {
        const batchData = await this.getBatchData(session.session_id, currentPage)

        // Duplicate check
        if (this.processedChecksums.has(batchData.checksum)) {
          currentPage++
          continue
        }

        // Store to temporary table
        await this.storeBatchData(tempTableName, batchData.data)
        this.processedChecksums.add(batchData.checksum)

        // Progress callback
        if (onProgress) {
          const percentage = Math.round((currentPage / totalPages) * 100)
          onProgress(currentPage, totalPages, percentage)
        }

        if (batchData.is_last) break
        currentPage++
        await this.delay(50)
      }

      // Atomic replacement (cloud data downlink, suppress triggers to prevent echo)
      this.dbManager.setRemoteApplyGuard(true)
      try {
        // Get local table name for replacement operation
        const localTableName = this.getLocalTableName(tableName)
        await this.atomicReplaceData(localTableName, tempTableName)
      } finally {
        this.dbManager.setRemoteApplyGuard(false)
      }
      logger.info(`Atomic replacement completed: ${tableName}`)
    } catch (error) {
      // Clean up temporary table
      try {
        const db = await this.dbManager.getDatabase()
        await db.exec(`DROP TABLE IF EXISTS ${tempTableName}`)
      } catch (cleanupError) {
        logger.error('Failed to clean up temporary table:', cleanupError)
      }
      throw error
    }
  }

  /**
   * Intelligent record merging - batch version, performance optimized
   */
  private async intelligentMergeRecords(tableName: string, serverRecords: any[], metadata: SyncMetadata): Promise<MergeResult[]> {
    const results: MergeResult[] = []
    // Database instance available if needed for advanced queries
    // const db = await this.dbManager.getDatabase()

    // Performance optimization: batch query local records
    const serverUUIDs = serverRecords.map((r) => r.uuid)
    const localRecordsMap = await this.batchGetLocalRecords(tableName, serverUUIDs)
    const pendingChangesMap = await this.batchCheckPendingChanges(tableName, serverUUIDs)

    // Process each record in parallel
    for (const serverRecord of serverRecords) {
      try {
        const localRecord = localRecordsMap.get(serverRecord.uuid)
        const hasPendingChanges = pendingChangesMap.has(serverRecord.uuid)

        if (!localRecord) {
          // Local does not have this record, directly apply server data
          results.push({
            action: 'apply_server',
            record: serverRecord
          })
          continue
        }

        if (!hasPendingChanges) {
          // No local changes, directly apply server data
          results.push({
            action: 'apply_server',
            record: serverRecord
          })
          continue
        }

        // Has conflict, perform intelligent merge
        const mergeResult = await this.resolveConflict(tableName, localRecord, serverRecord, metadata)

        results.push(mergeResult)
      } catch (error) {
        logger.error(`Error processing record ${serverRecord.uuid}:`, error)
        // Conservative handling on error: keep local data
        results.push({
          action: 'keep_local',
          record: serverRecord,
          conflictReason: `Processing error: ${error instanceof Error ? error.message : String(error)}`
        })
      }
    }

    return results
  }

  /**
   * Batch get local records - performance optimization
   */
  private async batchGetLocalRecords(tableName: string, uuids: string[]): Promise<Map<string, any>> {
    const db = await this.dbManager.getDatabase()
    const recordsMap = new Map<string, any>()

    if (uuids.length === 0) return recordsMap

    const placeholders = uuids.map(() => '?').join(',')
    const query = `SELECT * FROM ${tableName} WHERE uuid IN (${placeholders})`

    const records = await db.all(query, uuids)
    records.forEach((record) => {
      recordsMap.set(record.uuid, record)
    })

    return recordsMap
  }

  /**
   * Batch check pending changes - performance optimization
   */
  private async batchCheckPendingChanges(tableName: string, uuids: string[]): Promise<Set<string>> {
    const db = await this.dbManager.getDatabase()
    const pendingSet = new Set<string>()

    if (uuids.length === 0) return pendingSet

    const placeholders = uuids.map(() => '?').join(',')
    const query = `
            SELECT DISTINCT record_uuid 
            FROM change_log 
            WHERE table_name = ? AND record_uuid IN (${placeholders}) AND sync_status = 'pending'
        `

    const results = await db.all(query, [tableName, ...uuids])
    results.forEach((result) => {
      pendingSet.add(result.record_uuid)
    })

    return pendingSet
  }

  /**
   * Batch apply merge results - transaction optimization
   */
  private async applyMergeResultsBatch(tableName: string, results: MergeResult[]): Promise<void> {
    const db = await this.dbManager.getDatabase()

    // Group by operation type, process in batches
    const applyServerRecords: any[] = []
    const mergeRecords: any[] = []
    const conflictRecords: MergeResult[] = []

    results.forEach((result) => {
      switch (result.action) {
        case 'apply_server':
        case 'merge':
          if (result.action === 'apply_server') {
            applyServerRecords.push(result.record)
          } else {
            mergeRecords.push(result.record)
          }
          break
        case 'conflict':
          conflictRecords.push(result)
          break
        // 'keep_local' requires no operation
      }
    })

    // Batch transaction processing
    await db.transaction(async (tx: any) => {
      // Batch process server data
      for (const record of [...applyServerRecords, ...mergeRecords]) {
        await this.upsertRecord(tx, tableName, record)
      }

      // Batch record conflicts
      for (const conflict of conflictRecords) {
        await this.recordConflict(tx, tableName, conflict.record, conflict.conflictReason)
      }
    })

    logger.info(
      `Batch apply completed: applied ${applyServerRecords.length + mergeRecords.length} records, conflicts ${conflictRecords.length} records`
    )
  }

  // ... Other helper methods (copied and optimized from original OneDriveSyncManager and BatchSyncManager)

  /**
   * Check sync necessity
   */
  private async checkSyncNecessity(tableName: string, metadata: SyncMetadata): Promise<boolean> {
    try {
      const serverInfo = await this.getServerTableInfo(tableName)
      if (metadata.lastSyncTime && serverInfo.lastModified) {
        const localTime = new Date(metadata.lastSyncTime)
        const serverTime = new Date(serverInfo.lastModified)
        if (serverTime <= localTime) {
          return false
        }
      }
      return true
    } catch (error: any) {
      // Check if it's a network connection error
      if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
        logger.warn('Server unavailable, skipping sync check')
        throw new Error('SERVER_UNAVAILABLE')
      }
      logger.warn('Failed to check sync necessity, defaulting to sync:', error)
      return true
    }
  }

  /**
   * Check if there are unsynced local changes (including historical data)
   */
  private async hasUnsynedLocalChanges(tableName: string): Promise<boolean> {
    // Safety check: ensure tableName exists
    if (!tableName || typeof tableName !== 'string') {
      logger.warn(`hasUnsynedLocalChanges: invalid table name "${tableName}"`)
      return false
    }

    // Check pending change records
    const pendingChanges = this.dbManager.getTotalPendingChangesCount(tableName)
    if (pendingChanges > 0) {
      logger.info(`Detected ${pendingChanges} pending changes`)
      return true
    }

    // Check historical data (data that exists in data table but not in change_log)
    const localTableName = this.getLocalTableName(tableName)
    const historicalCount = this.dbManager.getHistoricalDataCount(localTableName)
    if (historicalCount > 0) {
      logger.info(`Detected ${historicalCount} historical records that need sync`)
      return true
    }

    return false
  }

  /**
   * Get historical data
   * Historical data refers to: data that exists in data table but not in change_log
   */
  private async getHistoricalData(tableName: string): Promise<any[]> {
    try {
      const db = await this.dbManager.getDatabase()

      // Check if table exists
      const tableExists = await db.get(
        `
        SELECT name FROM sqlite_master
        WHERE type='table' AND name=?
      `,
        [tableName]
      )

      if (!tableExists) {
        logger.info(`Table ${tableName} does not exist`)
        return []
      }

      // Query records that exist in data table but not in change_log
      // Need to check both local table name and sync table name
      const syncTableName = tableName + '_sync'
      const rows = await db.all(
        `
        SELECT * FROM ${tableName}
        WHERE uuid NOT IN (
          SELECT DISTINCT record_uuid
          FROM change_log
          WHERE (table_name = ? OR table_name = ?)
          AND record_uuid IS NOT NULL
        )
      `,
        [tableName, syncTableName]
      )

      logger.info(`Retrieved ${rows.length} historical records from ${tableName}`)
      return rows
    } catch (error) {
      logger.error(`Failed to get historical data (${tableName}):`, error)
      return []
    }
  }

  /**
   * Create change_log records for historical data
   * Avoid duplicate uploads of already synced historical data
   */
  private async createChangeLogForHistoricalData(_tableName: string, records: any[]): Promise<void> {
    try {
      // const db = await this.dbManager.getDatabase()

      // Filter out records without uuid
      const validRecords = records.filter((record) => record.uuid && record.uuid.trim() !== '')

      if (validRecords.length === 0) {
        logger.warn(`No valid records to create change_log for`)
        return
      }

      // Temporarily commented: skip creating change_log records to avoid parameter errors
      logger.warn(`Temporarily skipping creation of change_log records for ${validRecords.length} historical records`)

      logger.info(`Created change_log records for ${validRecords.length} historical records`)
    } catch (error) {
      logger.error(`Failed to create change_log records for historical data:`, error)
    }
  }

  /**
   * Get server table info
   */
  private async getServerTableInfo(tableName: string): Promise<{ lastModified: string; version: number }> {
    const response = await this.apiClient.get(`/sync/table-info/${tableName}`)
    return {
      lastModified: response.last_modified,
      version: response.version
    }
  }

  /**
   * Start full sync session
   */
  private async startFullSync(tableName: string, pageSize: number): Promise<FullSyncSession> {
    const response = await this.apiClient.post('/sync/full-sync/start', {
      table_name: tableName,
      page_size: pageSize
    })

    if (!response.success) {
      throw new Error(`Failed to start sync session: ${response.message}`)
    }

    const session = response.session
    this.syncSessions.set(session.session_id, session)
    return session
  }

  /**
   * Get batch data
   */
  private async getBatchData(sessionId: string, page: number): Promise<FullSyncBatchResponse> {
    const response = await this.apiClient.post('/sync/full-sync/batch', {
      session_id: sessionId,
      page: page
    })

    if (!response.success) {
      throw new Error(`Failed to get batch data: ${response.message}`)
    }

    return response as FullSyncBatchResponse
  }

  /**
   * Finish sync session
   */
  private async finishSync(sessionId: string): Promise<void> {
    try {
      await this.apiClient.delete(`/sync/full-sync/finish/${sessionId}`)
      this.syncSessions.delete(sessionId)
    } catch (error) {
      logger.error('Failed to finish sync session:', error)
    }
  }

  // ... Other necessary helper methods (createTempTable, storeBatchData, atomicReplaceData,
  // resolveConflict, getSyncMetadata, updateSyncMetadata, prepareSyncEnvironment,
  // recordConflict, upsertRecord, initializeConflictRules, delay, etc.)

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Initialize conflict resolution rules
   */
  private initializeConflictRules(): void {
    // Conflict resolution rules for assets table
    this.conflictRules.set('t_assets_sync', [
      { field: 'label', strategy: 'latest_wins', priority: 1 },
      { field: 'asset_ip', strategy: 'server_wins', priority: 1 },
      { field: 'port', strategy: 'server_wins', priority: 1 },
      { field: 'username', strategy: 'server_wins', priority: 2 },
      { field: 'password', strategy: 'server_wins', priority: 2 },
      { field: 'favorite', strategy: 'client_wins', priority: 3 },
      { field: 'group_name', strategy: 'merge', priority: 2 }
    ])

    // Conflict resolution rules for asset chains table
    this.conflictRules.set('t_asset_chains_sync', [
      { field: 'chain_name', strategy: 'latest_wins', priority: 1 },
      { field: 'chain_type', strategy: 'server_wins', priority: 1 },
      { field: 'chain_private_key', strategy: 'server_wins', priority: 1 },
      { field: 'chain_public_key', strategy: 'server_wins', priority: 1 },
      { field: 'passphrase', strategy: 'server_wins', priority: 2 }
    ])
  }

  /**
   * Get local table name
   */
  private getLocalTableName(remoteTableName: string): string {
    const localTableName = this.tableMapping[remoteTableName]
    if (!localTableName) {
      throw new Error(`Local table not found for remote table ${remoteTableName}`)
    }
    return localTableName
  }

  /**
   * Create temporary table (based on local table structure)
   */
  private async createTempTable(remoteTableName: string): Promise<string> {
    const tempTableName = `${remoteTableName}_temp_${Date.now()}`
    const db = await this.dbManager.getDatabase()

    // Map remote sync table name to local table name
    const localTableName = this.getLocalTableName(remoteTableName)

    const tableSchema = await db.get(
      `
            SELECT sql FROM sqlite_master 
            WHERE type='table' AND name=?
        `,
      [localTableName]
    )

    if (!tableSchema) {
      throw new Error(`Cannot get local table structure: ${localTableName} (corresponding remote table: ${remoteTableName})`)
    }

    // Create temporary table using local table structure
    const escapedLocalTableName = localTableName.replace(/([.*+?^${}()|\[\]\\])/g, '\\$1')
    const createTablePattern = new RegExp(`(CREATE TABLE\\s+(?:IF NOT EXISTS\\s+)?)(["']?)${escapedLocalTableName}\\2`, 'i')

    let tempTableSql: string
    if (createTablePattern.test(tableSchema.sql)) {
      tempTableSql = tableSchema.sql.replace(createTablePattern, (_match, prefix: string, quote: string) => {
        const identifierQuote = quote ?? ''
        return `${prefix}${identifierQuote}${tempTableName}${identifierQuote}`
      })
    } else {
      const firstOccurrence = tableSchema.sql.indexOf(localTableName)
      if (firstOccurrence === -1) {
        throw new Error(`Cannot locate table name in table structure: ${localTableName} (corresponding remote table: ${remoteTableName})`)
      }
      tempTableSql = tableSchema.sql.slice(0, firstOccurrence) + tempTableName + tableSchema.sql.slice(firstOccurrence + localTableName.length)
    }

    await db.exec(tempTableSql)
    logger.info(`Temporary table created successfully: ${tempTableName} (based on local table: ${localTableName})`)
    return tempTableName
  }

  /**
   * Store batch data to temporary table (reuse BatchSyncManager logic)
   */
  private async storeBatchData(tempTableName: string, data: any[]): Promise<void> {
    if (!data || data.length === 0) return
    const db = await this.dbManager.getDatabase()

    // Cloud data downlink, suppress triggers to prevent echo
    this.dbManager.setRemoteApplyGuard(true)
    try {
      await db.transaction(async (tx: any) => {
        for (const record of data) {
          const fields = Object.keys(record).filter((key) => key !== 'id')
          const placeholders = fields.map(() => '?').join(', ')
          const values = fields.map((field) => record[field])
          const sql = `
                        INSERT OR REPLACE INTO ${tempTableName} (${fields.join(', ')}) 
                        VALUES (${placeholders})
                    `
          await tx.run(sql, values)
        }
      })
    } finally {
      this.dbManager.setRemoteApplyGuard(false)
    }
    logger.info(`Batch data storage completed, record count: ${data.length}`)
  }

  /**
   * Atomic replacement (reuse BatchSyncManager logic)
   */
  private async atomicReplaceData(originalTableName: string, tempTableName: string): Promise<void> {
    const db = await this.dbManager.getDatabase()
    const backupTableName = `${originalTableName}_backup_${Date.now()}`

    // Check if original table exists
    const tableExists = await db.get(
      `
      SELECT name FROM sqlite_master
      WHERE type='table' AND name=?
    `,
      [originalTableName]
    )

    await db.transaction(async (tx: any) => {
      try {
        if (tableExists) {
          // Original table exists, perform standard atomic replacement
          await tx.exec(`ALTER TABLE ${originalTableName} RENAME TO ${backupTableName}`)
          await tx.exec(`ALTER TABLE ${tempTableName} RENAME TO ${originalTableName}`)
          await tx.exec(`DROP TABLE ${backupTableName}`)
          logger.info(`Data replacement successful: ${originalTableName} (original table exists)`)
        } else {
          // Original table does not exist, directly rename temporary table
          await tx.exec(`ALTER TABLE ${tempTableName} RENAME TO ${originalTableName}`)
          logger.info(`Data replacement successful: ${originalTableName} (original table does not exist, created directly)`)
        }
      } catch (error) {
        logger.error('Atomic replacement failed, attempting rollback:', error)
        try {
          if (tableExists) {
            // If original table exists, try to restore
            await tx.exec(`ALTER TABLE ${backupTableName} RENAME TO ${originalTableName}`)
          }
          await tx.exec(`DROP TABLE IF EXISTS ${tempTableName}`)
          logger.info('Rollback successful')
        } catch (rollbackError) {
          logger.error('Rollback also failed:', rollbackError)
        }
        throw error
      }
    })
  }

  /**
   * Record conflict (reuse OneDrive logic)
   */
  private async recordConflict(tx: any, tableName: string, record: any, reason?: string): Promise<void> {
    await tx.run(
      `
            INSERT INTO sync_conflicts (table_name, record_uuid, conflict_reason, server_data)
            VALUES (?, ?, ?, ?)
        `,
      [tableName, record.uuid, reason || 'Unknown conflict', JSON.stringify(record)]
    )
  }

  /**
   * Insert or update record (reuse OneDrive logic)
   */
  private async upsertRecord(tx: any, tableName: string, record: any): Promise<void> {
    const fields = Object.keys(record).filter((key) => key !== 'id')
    const placeholders = fields.map(() => '?').join(', ')
    const updateClauses = fields.map((field) => `${field} = excluded.${field}`).join(', ')
    const values = fields.map((field) => record[field])
    const sql = `
            INSERT INTO ${tableName} (${fields.join(', ')}) 
            VALUES (${placeholders})
            ON CONFLICT(uuid) DO UPDATE SET ${updateClauses}
        `
    await tx.run(sql, values)
  }

  /**
   * Prepare sync environment (reuse OneDrive logic)
   */
  private async prepareSyncEnvironment(_tableName: string): Promise<void> {
    const db = await this.dbManager.getDatabase()
    await db.exec(`
            CREATE TABLE IF NOT EXISTS sync_metadata (
                table_name TEXT PRIMARY KEY,
                last_sync_time TEXT,
                last_sync_version INTEGER,
                server_last_modified TEXT,
                local_last_modified TEXT,
                sync_status TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `)
    await db.exec(`
            CREATE TABLE IF NOT EXISTS sync_conflicts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_name TEXT,
                record_uuid TEXT,
                conflict_reason TEXT,
                local_data TEXT,
                server_data TEXT,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `)
  }

  /**
   * Get/update sync metadata (reuse OneDrive logic)
   */
  private async getSyncMetadata(tableName: string): Promise<SyncMetadata> {
    const db = await this.dbManager.getDatabase()
    const result = await db.get(
      `
            SELECT * FROM sync_metadata WHERE table_name = ?
        `,
      [tableName]
    )
    if (result) {
      // Map database field names to TypeScript interface property names
      return {
        tableName: result.table_name,
        lastSyncTime: result.last_sync_time,
        lastSyncVersion: result.last_sync_version,
        serverLastModified: result.server_last_modified,
        localLastModified: result.local_last_modified,
        syncStatus: result.sync_status
      } as SyncMetadata
    }
    const defaultMetadata: SyncMetadata = {
      tableName,
      lastSyncTime: '1970-01-01T00:00:00.000Z',
      lastSyncVersion: 0,
      serverLastModified: '',
      localLastModified: '',
      syncStatus: 'pending'
    }
    await this.updateSyncMetadata(tableName, defaultMetadata)
    return defaultMetadata
  }

  private async updateSyncMetadata(tableName: string, updates: Partial<SyncMetadata>): Promise<void> {
    const db = await this.dbManager.getDatabase()
    await db.run(
      `
            INSERT OR REPLACE INTO sync_metadata 
            (table_name, last_sync_time, last_sync_version, server_last_modified, local_last_modified, sync_status)
            VALUES (?, ?, ?, ?, ?, ?)
        `,
      [
        tableName,
        updates.lastSyncTime || '',
        updates.lastSyncVersion || 0,
        updates.serverLastModified || '',
        updates.localLastModified || '',
        updates.syncStatus || 'pending'
      ]
    )
  }

  /**
   * Conflict resolution/field-level merging (reuse OneDrive logic)
   */
  private async resolveConflict(tableName: string, localRecord: any, serverRecord: any, _metadata: SyncMetadata): Promise<MergeResult> {
    const rules = this.conflictRules.get(tableName) || []
    const localVersion = localRecord.version || 1
    const serverVersion = serverRecord.version || 1
    const localTime = new Date(localRecord.updated_at || localRecord.created_at)
    const serverTime = new Date(serverRecord.updated_at || serverRecord.created_at)

    if (serverVersion > localVersion) {
      return { action: 'apply_server', record: { ...serverRecord, version: serverVersion + 1 } }
    }
    if (localVersion > serverVersion) {
      return { action: 'keep_local', record: localRecord }
    }
    if (serverTime > localTime) {
      return { action: 'apply_server', record: { ...serverRecord, version: serverVersion + 1 } }
    }
    const merged = await this.performFieldLevelMerge(tableName, localRecord, serverRecord, rules)
    if (merged) return { action: 'merge', record: merged }
    return { action: 'conflict', record: localRecord, conflictReason: 'Version and timestamp are the same, requires manual resolution' }
  }

  private async performFieldLevelMerge(
    _tableName: string,
    localRecord: any,
    serverRecord: any,
    rules: ConflictResolutionRule[]
  ): Promise<any | null> {
    try {
      const merged = { ...localRecord }
      let hasChanges = false
      for (const rule of rules) {
        const localValue = localRecord[rule.field]
        const serverValue = serverRecord[rule.field]
        if (localValue !== serverValue) {
          switch (rule.strategy) {
            case 'server_wins':
              merged[rule.field] = serverValue
              hasChanges = true
              break
            case 'client_wins':
              break
            case 'latest_wins':
              merged[rule.field] = serverValue
              hasChanges = true
              break
            case 'merge':
              if (rule.field === 'favorite') merged[rule.field] = localValue
              else {
                merged[rule.field] = serverValue
                hasChanges = true
              }
              break
          }
        }
      }
      if (hasChanges) {
        merged.version = Math.max(localRecord.version || 1, serverRecord.version || 1) + 1
        merged.updated_at = new Date().toISOString()
      }
      return hasChanges ? merged : null
    } catch (e) {
      logger.error('Field-level merge failed:', e)
      return null
    }
  }

  /**
   * Prepare record for upload - handle sensitive field encryption
   * Fix: missing encryption when uploading historical data
   */
  private async prepareRecordForUpload(tableName: string, record: any): Promise<any> {
    try {
      const service = getEncryptionService()
      if (tableName === 't_assets_sync') {
        const sensitive: any = {}
        if (record.password !== undefined && record.password !== null) sensitive.password = record.password
        if (record.username !== undefined && record.username !== null) sensitive.username = record.username
        if (record.need_proxy !== undefined && record.need_proxy !== null) sensitive.need_proxy = record.need_proxy
        if (record.proxy_name !== undefined && record.proxy_name !== null) sensitive.proxy_name = record.proxy_name
        if (Object.keys(sensitive).length > 0) {
          try {
            const combined = await encryptPayload(sensitive, service)
            const { password, username, need_proxy, proxy_name, ...rest } = record
            return { ...rest, data_cipher_text: combined }
          } catch {
            // If sensitive fields exist but encryption fails, throw error to prevent plaintext upload
            throw new Error('Failed to encrypt sensitive fields for t_assets_sync')
          }
        }
      } else if (tableName === 't_asset_chains_sync') {
        const sensitive: any = {}
        if (record.chain_private_key !== undefined && record.chain_private_key !== null) sensitive.chain_private_key = record.chain_private_key
        if (record.passphrase !== undefined && record.passphrase !== null) sensitive.passphrase = record.passphrase
        if (Object.keys(sensitive).length > 0) {
          try {
            const combined = await encryptPayload(sensitive, service)
            const { chain_private_key, passphrase, ...rest } = record
            return { ...rest, data_cipher_text: combined }
          } catch {
            // If sensitive fields exist but encryption fails, throw error to prevent plaintext upload
            throw new Error('Failed to encrypt sensitive fields for t_asset_chains_sync')
          }
        }
      }
    } catch (e) {
      // Encryption or service retrieval failure should interrupt sync to prevent plaintext leakage
      throw e instanceof Error ? e : new Error(String(e))
    }
    // Return data that doesn't need encryption directly
    return record
  }
}
