import { DatabaseManager } from './DatabaseManager'
import { ApiClient } from './ApiClient'
import { logger } from '../utils/logger'
import { ChangeRecord, ServerChangeLog, SyncResponse } from '../models/SyncTypes'
import { syncConfig } from '../config/sync.config'
import { Semaphore } from '../utils/semaphore'
import { getEncryptionService } from '../services/EncryptionRegistry'
import { decryptPayload, encryptPayload } from '../utils/combinedEncryption'

export class SyncEngine {
  constructor(
    private db: DatabaseManager,
    private api: ApiClient
  ) {}

  async incrementalSync(tableName: string): Promise<SyncResponse> {
    const pending = this.db.getPendingChanges().filter((c) => c.table_name === tableName)
    if (pending.length === 0) {
      return { success: true, message: 'No pending changes to sync', synced_count: 0, failed_count: 0 }
    }

    // Intelligently compress change records (if enabled)
    const compressedChanges = syncConfig.compressionEnabled ? this.compressChanges(pending) : pending
    if (syncConfig.compressionEnabled) {
      this.logCompressionStats(pending, compressedChanges, 'Batch incremental')
    }

    // Batch processing
    const batches: ChangeRecord[][] = []
    for (let i = 0; i < compressedChanges.length; i += syncConfig.batchSize) {
      batches.push(compressedChanges.slice(i, i + syncConfig.batchSize))
    }

    const semaphore = new Semaphore(syncConfig.maxConcurrentBatches)
    let totalSynced = 0
    let totalFailed = 0

    await Promise.all(
      batches.map(async (batch) => {
        const release = await semaphore.acquire()
        try {
          const data = await Promise.all(
            batch.map((b) => this.prepareRecordForUpload(tableName, { ...b.change_data, operation_type: b.operation_type }))
          )
          const res = await this.withRetry(() => this.api.incrementalSync(tableName, data))

          const conflictUUIDs = new Set((res.conflicts || []).map((c) => c.uuid))
          const conflictIds = batch.filter((b) => conflictUUIDs.has(b.record_uuid)).map((b) => b.id)
          const successIds = batch.filter((b) => !conflictUUIDs.has(b.record_uuid)).map((b) => b.id)

          // Mark status
          this.db.markChangesSynced(successIds)
          if (conflictIds.length > 0) {
            const reason = (res.conflicts || []).map((c) => `${c.uuid}:${c.reason}`).join(',')
            this.db.markChangesConflict(conflictIds, reason)
          }

          // For successful UPDATE records, update local version number to server version number
          for (const b of batch) {
            if (!conflictUUIDs.has(b.record_uuid) && b.operation_type === 'UPDATE') {
              const current = b.change_data?.version
              if (typeof current === 'number' && current > 0) {
                const newVersion = current + 1
                // Version number increments after server update succeeds, so local should sync to server version number
                this.db.setVersion(tableName, b.record_uuid, newVersion)
              } else {
                console.log(`Skip version update: UUID=${b.record_uuid}, version=${current} (type=${typeof current})`)
              }
            }
          }

          totalSynced += successIds.length
          totalFailed += conflictIds.length
        } catch (e: any) {
          // Check if it's a network connection error
          if (e?.message === 'NETWORK_UNAVAILABLE' || e?.isNetworkError) {
            logger.warn('Server unavailable, skip batch upload')
            // Network errors are not counted as failures
          } else {
            logger.error('Batch upload failed', e?.message)
            totalFailed += batch.length
          }
        } finally {
          release()
        }
      })
    )

    return { success: totalFailed === 0, message: 'Incremental sync completed', synced_count: totalSynced, failed_count: totalFailed }
  }

  /**
   * Smart incremental sync - automatically select optimal processing strategy based on data volume
   */
  async incrementalSyncSmart(tableName: string): Promise<SyncResponse> {
    const totalChanges = this.db.getTotalPendingChangesCount(tableName)

    logger.info(`Smart sync analysis: ${tableName} has ${totalChanges} pending changes`)

    // Dynamically select strategy based on configured threshold
    if (totalChanges <= syncConfig.largeDataThreshold) {
      return await this.incrementalSync(tableName)
    }
    // Large data volume: use enhanced pagination processing
    return await this.incrementalSyncLargeData(tableName)
  }

  /**
   * Large data volume incremental sync - enhanced pagination processing
   * Integrates core advantages of PagedIncrementalSyncManager
   */
  private async incrementalSyncLargeData(tableName: string): Promise<SyncResponse> {
    const startTime = Date.now()
    const totalChanges = this.db.getTotalPendingChangesCount(tableName)

    if (totalChanges === 0) {
      return { success: true, message: 'No pending changes to sync', synced_count: 0, failed_count: 0 }
    }

    // Adaptive page size
    const adaptivePageSize = this.calculateOptimalPageSize(totalChanges)
    const totalPages = Math.ceil(totalChanges / adaptivePageSize)

    logger.info(`Large data sync started: ${tableName}, total ${totalChanges} records, ${totalPages} pages, page size ${adaptivePageSize}`)

    let totalSynced = 0
    let totalFailed = 0
    let currentPage = 1
    let offset = 0

    // Concurrency control
    const semaphore = new Semaphore(syncConfig.maxConcurrentPages)
    const pagePromises: Promise<void>[] = []

    while (offset < totalChanges) {
      const pageOffset = offset
      const pageNumber = currentPage

      // Create page processing task
      const pagePromise = semaphore.acquire().then(async (release) => {
        try {
          const pageResult = await this.processLargeDataPage(tableName, adaptivePageSize, pageOffset, pageNumber, totalPages)

          totalSynced += pageResult.synced
          totalFailed += pageResult.failed
        } catch (error) {
          logger.error(`Page ${pageNumber} processing failed:`, error)
          totalFailed += adaptivePageSize // Estimate failed count
        } finally {
          release()
        }
      })

      pagePromises.push(pagePromise)

      offset += adaptivePageSize
      currentPage++

      // Control concurrency count, avoid creating too many Promises
      if (pagePromises.length >= syncConfig.maxConcurrentPages * 2) {
        await Promise.all(pagePromises.splice(0, syncConfig.maxConcurrentPages))
      }
    }

    // Wait for all pages to complete processing
    await Promise.all(pagePromises)

    const duration = Date.now() - startTime
    const throughput = Math.round(totalSynced / (duration / 1000))

    const message = `Large data sync completed: ${totalPages} pages, ${totalSynced} succeeded, ${totalFailed} failed, duration ${duration}ms, throughput ${throughput} records/sec`

    return {
      success: totalFailed === 0,
      message,
      synced_count: totalSynced,
      failed_count: totalFailed
    }
  }

  /**
   * Process a batch of change records
   */
  private async processBatchChanges(tableName: string, changes: ChangeRecord[]): Promise<SyncResponse> {
    const semaphore = new Semaphore(syncConfig.maxConcurrentBatches)
    let batchSynced = 0
    let batchFailed = 0

    // Intelligently compress current page's change records (if enabled)
    const compressedChanges = syncConfig.compressionEnabled ? this.compressChanges(changes) : changes
    if (syncConfig.compressionEnabled) {
      this.logCompressionStats(changes, compressedChanges, 'Pagination')
    }

    // Split page data into smaller batches
    const batches: ChangeRecord[][] = []
    for (let i = 0; i < compressedChanges.length; i += syncConfig.batchSize) {
      batches.push(compressedChanges.slice(i, i + syncConfig.batchSize))
    }

    await Promise.all(
      batches.map(async (batch) => {
        const release = await semaphore.acquire()
        try {
          const data = await Promise.all(
            batch.map((b) => this.prepareRecordForUpload(tableName, { ...b.change_data, operation_type: b.operation_type }))
          )
          const res = await this.withRetry(() => this.api.incrementalSync(tableName, data))

          const conflictUUIDs = new Set((res.conflicts || []).map((c) => c.uuid))
          const conflictIds = batch.filter((b) => conflictUUIDs.has(b.record_uuid)).map((b) => b.id)
          const successIds = batch.filter((b) => !conflictUUIDs.has(b.record_uuid)).map((b) => b.id)

          // Mark status
          this.db.markChangesSynced(successIds)
          if (conflictIds.length > 0) {
            const reason = (res.conflicts || []).map((c) => `${c.uuid}:${c.reason}`).join(',')
            this.db.markChangesConflict(conflictIds, reason)
          }

          batchSynced += successIds.length
          batchFailed += conflictIds.length
        } catch (e: any) {
          // Check if it's a network connection error
          if (e?.message === 'NETWORK_UNAVAILABLE' || e?.isNetworkError) {
            logger.warn('Server unavailable, skip batch upload')
            // Network errors are not counted as failures
          } else {
            logger.error('Batch upload failed', e?.message)
            batchFailed += batch.length
          }
        } finally {
          release()
        }
      })
    )

    return {
      success: batchFailed === 0,
      message: 'Batch processing completed',
      synced_count: batchSynced,
      failed_count: batchFailed
    }
  }

  private async withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelay = 500): Promise<T> {
    let lastErr: any
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn()
      } catch (e) {
        lastErr = e
        const delay = Math.min(10000, baseDelay * Math.pow(2, i))
        await new Promise((res) => setTimeout(res, delay))
      }
    }
    throw lastErr
  }

  async downloadAndApplyCloudChanges(): Promise<{ applied: number; lastSeq: number }> {
    let since = this.db.getLastSequenceId()
    let applied = 0
    let lastSeq = since

    // Enable remote apply guard to suppress trigger writing to change_log
    this.db.setRemoteApplyGuard(true)
    try {
      let hasMore = true
      while (hasMore) {
        const { changes, hasMore: nextHasMore, lastSequenceId } = await this.api.getChanges(since, syncConfig.batchSize)
        if (!changes || changes.length === 0) {
          hasMore = false
          break
        }

        for (const ch of changes) {
          await this.applySingleChange(ch)
          applied += 1
          lastSeq = Math.max(lastSeq, ch.sequence_id)
        }

        this.db.setLastSequenceId(lastSeq)
        hasMore = !!nextHasMore
        if (hasMore) {
          since = lastSequenceId
        }
      }
    } finally {
      this.db.setRemoteApplyGuard(false)
    }

    logger.info(`Download and apply cloud changes completed: ${applied} records, lastSeq=${lastSeq}`)
    return { applied, lastSeq }
  }

  async fullSyncAndApply(tableName: string): Promise<number> {
    // Full pull and apply, default to INSERT mode upsert
    this.db.setRemoteApplyGuard(true)
    try {
      const res = await this.api.fullSync(tableName)
      const list = res.data || []
      let applied = 0
      for (const raw of list) {
        const data = await this.maybeDecryptChange(tableName, raw)
        if (tableName === 't_assets_sync') {
          this.applyToAssets('INSERT', data)
        } else if (tableName === 't_asset_chains_sync') {
          this.applyToAssetChains('INSERT', data)
        }
        applied += 1
      }
      logger.info(`Full sync application completed: ${tableName}, total ${applied} records`)
      return applied
    } finally {
      this.db.setRemoteApplyGuard(false)
    }
  }

  private async applySingleChange(ch: ServerChangeLog) {
    const raw = ch.change_data ? JSON.parse(ch.change_data) : {}

    // Support multiple table name formats (client and server naming conventions)
    let baseTable: string
    let shouldApplyToAssets = false
    let shouldApplyToChains = false

    if (ch.target_table.startsWith('t_assets_sync') || ch.target_table.startsWith('t_sync_assets')) {
      baseTable = 't_assets_sync'
      shouldApplyToAssets = true
    } else if (ch.target_table.startsWith('t_asset_chains_sync') || ch.target_table.startsWith('t_sync_asset_chains')) {
      baseTable = 't_asset_chains_sync'
      shouldApplyToChains = true
    } else {
      baseTable = ch.target_table
      logger.warn(`Unrecognized table name: ${ch.target_table}, skip application`)
      return
    }

    const data = await this.maybeDecryptChange(baseTable, raw)

    if (shouldApplyToAssets) {
      this.applyToAssets(ch.operation_type, data)
    } else if (shouldApplyToChains) {
      this.applyToAssetChains(ch.operation_type, data)
    }
  }

  private async maybeDecryptChange(tableName: string, data: any): Promise<any> {
    if (!data) return data
    try {
      const service = getEncryptionService()
      logger.info('Encryption service status:', service ? 'Obtained' : 'Not obtained')

      if (tableName === 't_assets_sync') {
        const cipher: string | undefined = typeof data.data_cipher_text === 'string' ? data.data_cipher_text : undefined
        if (cipher) {
          logger.info('Starting to decrypt t_assets_sync data...')
          const sensitive = await decryptPayload(cipher, service)
          if (sensitive && sensitive.password !== undefined) {
            data.password = sensitive.password
          }
          if (sensitive && sensitive.username !== undefined) {
            data.username = sensitive.username
          }
          if (sensitive && sensitive.need_proxy !== undefined) {
            data.need_proxy = sensitive.need_proxy
          }
          if (sensitive && sensitive.proxy_name !== undefined) {
            data.proxy_name = sensitive.proxy_name
          }
        }
      } else if (tableName === 't_asset_chains_sync') {
        const cipher: string | undefined = typeof data.data_cipher_text === 'string' ? data.data_cipher_text : undefined
        if (cipher) {
          logger.info('Starting to decrypt t_asset_chains_sync data...')
          const sensitive = await decryptPayload(cipher, service)
          if (sensitive.chain_private_key !== undefined) {
            data.chain_private_key = sensitive.chain_private_key
          }
          if (sensitive.passphrase !== undefined) {
            data.passphrase = sensitive.passphrase
          }
          if (sensitive.chain_public_key !== undefined) {
            data.chain_public_key = sensitive.chain_public_key
          }
        }
      }
      if ('data_cipher_text' in data) {
        delete data.data_cipher_text
      }

      // Fix: Filter fields by table name, only keep fields for the corresponding table
      data = this.filterFieldsByTable(tableName, data)
    } catch (e) {
      logger.warn('New format ciphertext decryption failed, apply as-is', e)
      logger.error('Decryption exception details:', {
        error: e,
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined
      })
    }

    return data
  }

  /**
   * Filter fields by table name, only keep fields for the corresponding table
   * @param tableName Table name
   * @param data Data object
   * @returns Filtered data object
   */
  private filterFieldsByTable(tableName: string, data: any): any {
    if (!data || typeof data !== 'object') return data

    // Define valid fields for each table
    const tableFields = {
      t_assets_sync: [
        'uuid',
        'label',
        'asset_ip',
        'group_name',
        'auth_type',
        'port',
        'username',
        'password',
        'key_chain_id',
        'favorite',
        'asset_type',
        'need_proxy',
        'proxy_name',
        'created_at',
        'updated_at',
        'version'
      ],
      t_asset_chains_sync: [
        'key_chain_id',
        'uuid',
        'chain_name',
        'chain_type',
        'chain_private_key',
        'passphrase',
        'created_at',
        'updated_at',
        'version'
      ]
    }

    const validFields = tableFields[tableName as keyof typeof tableFields]
    if (!validFields) {
      logger.warn(`Unknown table name: ${tableName}, return original data`)
      return data
    }

    // Only keep valid fields
    const filteredData: any = {}
    validFields.forEach((field) => {
      if (field in data) {
        filteredData[field] = data[field]
      }
    })
    return filteredData
  }

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
        if (record.chain_public_key !== undefined && record.chain_public_key !== null) sensitive.chain_public_key = record.chain_public_key
        if (Object.keys(sensitive).length > 0) {
          try {
            const combined = await encryptPayload(sensitive, service)
            const { chain_private_key, passphrase, chain_public_key, ...rest } = record
            return { ...rest, data_cipher_text: combined }
          } catch {
            // If sensitive fields exist but encryption fails, throw error to prevent plaintext upload
            throw new Error('Failed to encrypt sensitive fields for t_asset_chains_sync')
          }
        }
      }
    } catch (e) {
      // Encryption or service acquisition failure should interrupt sync to prevent plaintext leakage
      throw e instanceof Error ? e : new Error(String(e))
    }
    // Backend already supports raw data format, no need for standardization
    return record
  }

  private applyToAssets(op: string, data: any) {
    if (!data) return
    switch (op) {
      case 'INSERT':
      case 'UPDATE':
        this.db.upsertAsset({
          uuid: data.uuid,
          label: data.label,
          asset_ip: data.asset_ip,
          group_name: data.group_name,
          auth_type: data.auth_type,
          port: data.port,
          username: data.username,
          password: data.password,
          key_chain_id: data.key_chain_id ?? undefined,
          favorite: data.favorite ?? 2, // Keep original integer value, default to 2 (not favorited)
          asset_type: data.asset_type,
          need_proxy: data.need_proxy ?? 0, // Fix: Use underscore naming, default to 0 (no proxy needed)
          proxy_name: data.proxy_name ?? '', // Fix: Use underscore naming, default to empty string
          created_at: data.created_at ?? new Date().toISOString(),
          updated_at: data.updated_at ?? new Date().toISOString(),
          version: typeof data.version === 'number' ? data.version : 1
        } as any)
        break
      case 'DELETE':
        if (data?.uuid) this.db.deleteAssetByUUID(data.uuid)
        break
    }
  }

  private applyToAssetChains(op: string, data: any) {
    if (!data) return
    switch (op) {
      case 'INSERT':
      case 'UPDATE':
        this.db.upsertAssetChain({
          key_chain_id: data.key_chain_id,
          uuid: data.uuid,
          chain_name: data.chain_name,
          chain_type: data.chain_type,
          chain_private_key: data.chain_private_key,
          chain_public_key: data.chain_public_key,
          passphrase: data.passphrase,
          created_at: data.created_at ?? new Date().toISOString(),
          updated_at: data.updated_at ?? new Date().toISOString(),
          version: typeof data.version === 'number' ? data.version : 1
        } as any)
        break
      case 'DELETE':
        if (data?.uuid) this.db.deleteAssetChainByUUID(data.uuid)
        break
    }
  }

  /**
   * Intelligently compress change records
   * Merge multiple changes for the same record into final state, reducing sync workload
   *
   * Compression rules:
   * 1. DELETE operation overrides all previous operations
   * 2. INSERT + UPDATE = INSERT (use latest data)
   * 3. Multiple UPDATEs merge into the last UPDATE
   * 4. Deleted records ignore subsequent operations
   * 5. INSERT + DELETE = no operation (record never existed)
   *
   * @param changes Original change record array
   * @returns Compressed change record array
   */
  private compressChanges(changes: ChangeRecord[]): ChangeRecord[] {
    if (changes.length <= 1) {
      return changes // No compression needed
    }

    const recordMap = new Map<string, ChangeRecord>()
    const deletedRecords = new Set<string>() // Track deleted records

    for (const change of changes) {
      const key = `${change.table_name}-${change.record_uuid}`
      const existing = recordMap.get(key)

      if (!existing) {
        recordMap.set(key, change)
        if (change.operation_type === 'DELETE') {
          deletedRecords.add(key)
        }
        continue
      }

      // Merge change logic
      if (change.operation_type === 'DELETE') {
        if (existing.operation_type === 'INSERT') {
          // INSERT + DELETE = no operation (record never truly existed)
          recordMap.delete(key)
          deletedRecords.add(key)
        } else {
          // UPDATE + DELETE = DELETE
          recordMap.set(key, change)
          deletedRecords.add(key)
        }
      } else if (deletedRecords.has(key)) {
        // If record has been deleted, ignore subsequent INSERT/UPDATE operations
        // This is rare in practice, but needs to be handled for data consistency
        continue
      } else if (existing.operation_type === 'INSERT' && change.operation_type === 'UPDATE') {
        // INSERT + UPDATE = INSERT (use latest data)
        recordMap.set(key, {
          ...change,
          operation_type: 'INSERT',
          change_data: change.change_data,
          // Keep original INSERT ID to maintain order
          id: existing.id
        })
      } else if (existing.operation_type === 'UPDATE' && change.operation_type === 'UPDATE') {
        // UPDATE + UPDATE = UPDATE (use latest data)
        recordMap.set(key, {
          ...change,
          // Keep first UPDATE ID to maintain order
          id: existing.id
        })
      } else {
        // Other cases use the latest change
        recordMap.set(key, change)
      }
    }

    const compressed = Array.from(recordMap.values())

    // Sort by original ID to maintain operation order consistency
    compressed.sort((a, b) => {
      // Use numeric ID sorting, if ID is not a number then sort as string
      const aId = typeof a.id === 'number' ? a.id : parseInt(a.id as string, 10)
      const bId = typeof b.id === 'number' ? b.id : parseInt(b.id as string, 10)

      if (!isNaN(aId) && !isNaN(bId)) {
        return aId - bId
      }

      // If cannot convert to number, sort as string
      return String(a.id).localeCompare(String(b.id))
    })

    return compressed
  }

  /**
   * Calculate optimal page size
   * Adaptively adjust based on data volume and system configuration
   */
  private calculateOptimalPageSize(totalChanges: number): number {
    if (!syncConfig.adaptivePageSize) {
      return syncConfig.pageSize
    }

    // Adaptive algorithm based on total data volume
    if (totalChanges <= 10000) {
      return Math.min(syncConfig.pageSize, 1000) // Small data volume uses smaller pages
    } else if (totalChanges <= 50000) {
      return Math.min(syncConfig.pageSize * 1.5, 1500) // Medium data volume
    } else {
      return Math.min(syncConfig.pageSize * 2, 2000) // Large data volume uses larger pages
    }
  }

  /**
   * Process a single page of large data volume
   * Integrates intelligent compression and memory optimization
   */
  private async processLargeDataPage(
    tableName: string,
    pageSize: number,
    offset: number,
    pageNumber: number,
    totalPages: number
  ): Promise<{ synced: number; failed: number }> {
    try {
      // Paginated data retrieval (memory optimization)
      const pageChanges = this.db.getPendingChangesPage(tableName, pageSize, offset)

      if (pageChanges.length === 0) {
        return { synced: 0, failed: 0 }
      }

      logger.debug(`Processing page ${pageNumber}/${totalPages}: ${pageChanges.length} changes`)

      // Apply intelligent compression
      const compressedChanges = syncConfig.compressionEnabled ? this.compressChanges(pageChanges) : pageChanges

      if (syncConfig.compressionEnabled && compressedChanges.length < pageChanges.length) {
        logger.debug(`Page ${pageNumber} compressed: ${pageChanges.length} -> ${compressedChanges.length}`)
      }

      // Process compressed changes
      const result = await this.processBatchChanges(tableName, compressedChanges)

      // Memory optimization: timely cleanup of large objects
      if (syncConfig.memoryOptimization) {
        // Force garbage collection hint (in supported environments)
        if (global.gc && pageNumber % 10 === 0) {
          global.gc()
        }
      }

      return {
        synced: result.synced_count || 0,
        failed: result.failed_count || 0
      }
    } catch (error) {
      logger.error(`Page ${pageNumber} processing exception:`, error)
      return { synced: 0, failed: pageSize }
    }
  }

  /**
   * Analyze compression effectiveness and record detailed statistics
   * @param original Original change records
   * @param compressed Compressed change records
   * @param context Context information (e.g., "Batch sync" or "Page sync")
   */
  private logCompressionStats(original: ChangeRecord[], compressed: ChangeRecord[], context: string = 'Sync'): void {
    if (original.length === compressed.length) {
      return // No compression effect, don't log
    }

    const reduction = original.length - compressed.length
    const reductionPercentage = Math.round((reduction / original.length) * 100)

    // Statistics of operation type distribution
    const originalStats = this.getOperationStats(original)
    const compressedStats = this.getOperationStats(compressed)

    logger.info(`${context} compression statistics:`, {
      originalCount: original.length,
      compressedCount: compressed.length,
      reduction: reduction,
      compressionRate: `${reductionPercentage}%`,
      originalDistribution: originalStats,
      compressedDistribution: compressedStats
    })
  }

  /**
   * Statistics of operation type distribution
   * @param changes Change record array
   * @returns Operation type statistics object
   */
  private getOperationStats(changes: ChangeRecord[]): Record<string, number> {
    const stats: Record<string, number> = { INSERT: 0, UPDATE: 0, DELETE: 0 }

    for (const change of changes) {
      if (change.operation_type in stats) {
        stats[change.operation_type]++
      }
    }

    return stats
  }
}
