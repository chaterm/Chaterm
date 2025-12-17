import { ApiClient } from './ApiClient'
import { DatabaseManager } from './DatabaseManager'
import { SyncEngine } from './SyncEngine'
import { PollingManager } from '../services/PollingManager'
import { SafeBatchSyncManager } from './SafeBatchSyncManager'
import { FullSyncTimerManager } from '../services/FullSyncTimerManager'
import { SyncStateManager, SyncType, SyncState, type SyncStatus } from './SyncStateManager'
import { syncConfig } from '../config/sync.config'
import { logger } from '../utils/logger'
import { EnvelopeEncryptionService } from '../envelope_encryption/service'
import { setEncryptionService } from '../services/EncryptionRegistry'
import type { EncryptionServiceStatus } from '../envelope_encryption/service'

export class SyncController {
  private api: ApiClient
  private db: DatabaseManager
  private engine: SyncEngine
  private pollingManager: PollingManager
  private safeBatchSync: SafeBatchSyncManager
  private fullSyncTimer: FullSyncTimerManager
  private syncStateManager: SyncStateManager
  private encryptionService: EnvelopeEncryptionService

  // Simplified real-time sync
  private static instance: SyncController | null = null

  constructor(dbPathOverride?: string) {
    this.api = new ApiClient()
    const dbPath = dbPathOverride || syncConfig.dbPath
    this.db = new DatabaseManager(dbPath)
    this.engine = new SyncEngine(this.db, this.api)
    this.pollingManager = new PollingManager(this.db, this.api, this.engine, {
      initialInterval: syncConfig.syncIntervalMs,
      adaptivePolling: true
    })
    this.safeBatchSync = new SafeBatchSyncManager(this.api, this.db)

    // Initialize sync state manager
    this.syncStateManager = new SyncStateManager()

    // Add status listener
    this.syncStateManager.addStatusListener((status: SyncStatus) => {
      logger.info(`Sync status changed: ${status.type} - ${status.state}`, {
        progress: status.progress,
        message: status.message,
        startTime: status.startTime,
        error: status.error?.message
      })
    })

    // Initialize full sync timer
    this.fullSyncTimer = new FullSyncTimerManager(
      {
        intervalHours: 1, // Execute full sync every 1 hour
        enableOnStart: false // Don't auto-start, controlled by data sync switch
      },
      // Full sync callback function
      async () => {
        await this.performScheduledFullSyncWithStateManagement()
      },
      // Conflict check callback: check if sync is in progress
      async () => {
        const currentStatus = this.syncStateManager.getCurrentStatus()
        return currentStatus.state === SyncState.RUNNING // Return true if sync is in progress, need to skip
      }
    )

    // Initialize envelope encryption service and place in registry for data_sync usage
    this.encryptionService = new EnvelopeEncryptionService()
    setEncryptionService(this.encryptionService)

    // Set global instance for static method calls
    SyncController.instance = this
  }

  async initializeEncryption(userId?: string): Promise<void> {
    try {
      const r = await this.encryptionService.initialize(userId, true)
      if (!r.success) {
        logger.warn(`Encryption service initialization failed: ${r.message}`)
      } else {
        logger.info('Encryption service initialization successful')
      }
    } catch (e: any) {
      logger.warn('Encryption service initialization exception', e?.message)
    }
  }

  /**
   * Get encryption service status
   */
  getEncryptionStatus(): EncryptionServiceStatus {
    return this.encryptionService.getStatus()
  }

  /**
   * Whether encryption service is ready for use
   */
  isEncryptionReady(): boolean {
    return this.encryptionService.getStatus().initialized === true
  }

  async initializeAuth(): Promise<void> {
    // Directly get auth info, getAuthToken() internally includes validity check
    const currentToken = await this.api.getAuthToken()
    const currentUserId = await this.api.getCurrentUserId()

    if (!currentToken || !currentUserId) {
      throw new Error('No valid authentication token found. Please ensure you have logged in through the main application')
    }

    this.encryptionService.setAuthInfo(currentToken, currentUserId)
  }

  async backupInit(): Promise<void> {
    const res = await this.api.backupInit()
    logger.info(`Backup initialization: ${res.message}`, res.table_mappings)
  }

  async fullSyncAll(): Promise<{ success: boolean; message: string; synced_count?: number; failed_count?: number }> {
    const lastSeq = this.db.getLastSequenceId()

    // Check if there is historical data that needs to be synced
    const hasHistoricalData = await this.checkForHistoricalData()

    if (lastSeq > 0 && !hasHistoricalData) {
      logger.info('Detected initialized (last_sequence_id>0) with no historical data, skipping full sync')
      return { success: true, message: 'Initialized, skipping full sync', synced_count: 0, failed_count: 0 }
    }

    if (hasHistoricalData) {
      logger.info('Detected historical data that needs to be synced, executing full sync...')
    } else {
      logger.info('Starting forced full sync...')
    }

    try {
      // Smart full sync - automatically select optimal mode based on data volume
      let syncedCount = 0
      let failedCount = 0

      try {
        if (this.isEncryptionReady()) {
          await this.smartFullSync('t_assets_sync')
          syncedCount++
        } else {
          logger.warn('Encryption service not ready, skipping t_assets_sync full sync (upload/download)')
        }
      } catch (error: any) {
        if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
          logger.warn('Server unavailable, skipping t_assets_sync sync')
        } else {
          failedCount++
          throw error
        }
      }

      try {
        if (this.isEncryptionReady()) {
          await this.smartFullSync('t_asset_chains_sync')
          syncedCount++
        } else {
          logger.warn('Encryption service not ready, skipping t_asset_chains_sync full sync (upload/download)')
        }
      } catch (error: any) {
        if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
          logger.warn('Server unavailable, skipping t_asset_chains_sync sync')
        } else {
          failedCount++
          throw error
        }
      }

      // If all syncs were skipped due to server unavailability
      if (syncedCount === 0 && failedCount === 0) {
        const message = 'Server unavailable, sync operation skipped'
        logger.warn(message)
        return { success: true, message, synced_count: 0, failed_count: 0 }
      }

      const message = hasHistoricalData ? 'Historical data sync completed' : 'Forced full sync completed'
      logger.info(message)
      return { success: true, message, synced_count: syncedCount, failed_count: failedCount }
    } catch (error: any) {
      const errorMessage = hasHistoricalData ? 'Historical data sync failed' : 'Forced full sync failed'
      logger.error(`${errorMessage}:`, error)
      return { success: false, message: `${errorMessage}: ${error?.message || error}`, synced_count: 0, failed_count: 1 }
    }
  }

  /**
   * Check if there is historical data that needs to be synced
   * Historical data refers to: data that exists in local data tables but not in change_log
   */
  private async checkForHistoricalData(): Promise<boolean> {
    try {
      // Check t_assets table
      const assetsCount = this.db.getHistoricalDataCount('t_assets')
      // Check t_asset_chains table
      const chainsCount = this.db.getHistoricalDataCount('t_asset_chains')

      const hasHistoricalData = assetsCount > 0 || chainsCount > 0

      logger.info(
        `📊 Historical data detection result: t_assets=${assetsCount} items, t_asset_chains=${chainsCount} items, needs sync=${hasHistoricalData}`
      )

      return hasHistoricalData
    } catch (error) {
      logger.warn('⚠️ Failed to check historical data, defaulting to full sync:', error)
      return true // Conservative handling on error, execute full sync
    }
  }

  /**
   * Smart full sync - true full sync, includes upload and download
   */
  private async smartFullSync(tableName: string): Promise<void> {
    try {
      logger.info(`Starting smart full sync: ${tableName}`)

      // Step 1: Upload local historical data (if any)
      try {
        await this.safeBatchSync.performSafeBatchSync(tableName, 500, (current: number, total: number, percentage: number) => {
          logger.info(`${tableName} upload progress: ${current}/${total} (${percentage}%)`)
        })
      } catch (error: any) {
        if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
          logger.warn(`Server unavailable, skipping ${tableName} upload operation`)
          return
        }
        throw error
      }

      // Step 2: Full download from server
      try {
        logger.info(`Starting full download from server: ${tableName}`)
        const downloadedCount = await this.engine.fullSyncAndApply(tableName)
        logger.info(`${tableName} full download completed: ${downloadedCount} items`)
      } catch (error: any) {
        if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
          logger.warn(`Server unavailable, skipping ${tableName} download operation`)
          return
        }
        throw error
      }
    } catch (error: any) {
      // If it's a network error, don't throw exception, just log warning
      if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
        logger.warn(`Server unavailable, ${tableName} smart full sync skipped`)
        return
      }
      logger.error(`${tableName} smart full sync failed:`, error)
      throw error
    }
  }

  async incrementalSyncAll(): Promise<{ success: boolean; message: string; synced_count?: number; failed_count?: number }> {
    try {
      let syncedCount = 0
      let failedCount = 0

      // The table name assigned by the server is the sync table, such as t_assets_sync / t_asset_chains_sync
      // Use smart sync, automatically select the optimal scheme based on data volume
      try {
        if (this.isEncryptionReady()) {
          await this.engine.incrementalSyncSmart('t_assets_sync')
          syncedCount++
        } else {
          logger.warn('Encryption service not ready, skipping t_assets_sync incremental sync')
        }
      } catch (error: any) {
        if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
          logger.warn('Server unavailable, skipping t_assets_sync incremental sync')
        } else {
          failedCount++
          throw error
        }
      }

      try {
        if (this.isEncryptionReady()) {
          await this.engine.incrementalSyncSmart('t_asset_chains_sync')
          syncedCount++
        } else {
          logger.warn('Encryption service not ready, skipping t_asset_chains_sync incremental sync')
        }
      } catch (error: any) {
        if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
          logger.warn('Server unavailable, skipping t_asset_chains_sync incremental sync')
        } else {
          failedCount++
          throw error
        }
      }

      // Download and apply cloud changes
      try {
        if (this.isEncryptionReady()) {
          await this.engine.downloadAndApplyCloudChanges()
        } else {
          logger.warn('Encryption service not ready, skipping cloud changes download and application')
        }
      } catch (error: any) {
        if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
          logger.warn('Server unavailable, skipping cloud changes download')
        } else {
          throw error
        }
      }

      // If all syncs were skipped due to server unavailability
      if (syncedCount === 0 && failedCount === 0) {
        const message = 'Server unavailable, incremental sync skipped'
        logger.warn(message)
        return { success: true, message, synced_count: 0, failed_count: 0 }
      }

      logger.info('Incremental sync completed')
      return { success: true, message: 'Incremental sync completed', synced_count: syncedCount, failed_count: failedCount }
    } catch (error: any) {
      // If it's a network error, return success but record warning
      if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
        const message = 'Server unavailable, incremental sync skipped'
        logger.warn(message)
        return { success: true, message, synced_count: 0, failed_count: 0 }
      }
      logger.error('Incremental sync failed:', error)
      return { success: false, message: `Incremental sync failed: ${error?.message || error}`, synced_count: 0, failed_count: 1 }
    }
  }

  /**
   * Manually trigger smart incremental sync
   */
  async smartIncrementalSyncAll(): Promise<{ assets: any; chains: any }> {
    const assetsResult = await this.engine.incrementalSyncSmart('t_assets_sync')
    const chainsResult = await this.engine.incrementalSyncSmart('t_asset_chains_sync')

    // Download and apply cloud changes
    await this.engine.downloadAndApplyCloudChanges()

    return {
      assets: assetsResult,
      chains: chainsResult
    }
  }

  /**
   * Execute scheduled full sync (called by FullSyncTimerManager) - original version, for compatibility
   * Currently not used, kept for future reference
   */
  /*
  private async _performScheduledFullSync(): Promise<void> {
    const wasRunning = this.pollingManager.getStatus().isRunning
    try {
      logger.info('Starting scheduled full sync...')

      // Pause incremental sync polling to avoid conflicts
      if (wasRunning) {
        await this.pollingManager.stopPolling()
      }

      // Execute full sync
      await this.smartFullSync('t_assets_sync')
      await this.smartFullSync('t_asset_chains_sync')

      logger.info('Scheduled full sync completed')
    } catch (error) {
      logger.error('Scheduled full sync failed:', error)
      throw error // Let FullSyncTimerManager record failure
    } finally {
      // Restore incremental sync polling
      if (wasRunning) {
        await this.pollingManager.startPolling()
      }
    }
  }
  */

  /**
   * Scheduled full sync with state management (new version)
   */
  private async performScheduledFullSyncWithStateManagement(): Promise<void> {
    try {
      // Request full sync through state manager
      await this.syncStateManager.requestSync(SyncType.FULL)

      // Execute actual full sync logic
      await this.executeFullSyncLogic()

      // Mark sync completed
      await this.syncStateManager.finishSync()
    } catch (error) {
      // Mark sync failed
      await this.syncStateManager.failSync(error as Error)
      throw error
    }
  }

  /**
   * Actual full sync execution logic
   */
  private async executeFullSyncLogic(): Promise<void> {
    const wasRunning = this.pollingManager.getStatus().isRunning

    try {
      // Update progress: start phase
      this.syncStateManager.updateProgress(10, 'Preparing full sync...')

      // Pause incremental sync polling to avoid conflicts
      if (wasRunning) {
        await this.pollingManager.stopPolling()
        this.syncStateManager.updateProgress(20, 'Incremental sync polling paused')
      }

      // Execute full sync - asset table
      this.syncStateManager.updateProgress(30, 'Syncing asset data...')
      await this.smartFullSync('t_assets_sync')

      // Execute full sync - asset chain table
      this.syncStateManager.updateProgress(70, 'Syncing asset chain data...')
      await this.smartFullSync('t_asset_chains_sync')

      this.syncStateManager.updateProgress(100, 'Full sync completed')
      logger.info('Scheduled full sync completed')
    } finally {
      // Restore incremental sync polling
      if (wasRunning) {
        await this.pollingManager.startPolling()
      }
    }
  }

  /**
   * Start automatic polling sync
   */
  async startAutoSync(): Promise<void> {
    await this.pollingManager.startPolling()
    await this.fullSyncTimer.start()
    logger.info('Automatic sync started (including incremental sync polling and full sync timer)')
  }

  /**
   * Stop automatic polling sync
   */
  async stopAutoSync(): Promise<void> {
    await this.fullSyncTimer.stop()
    await this.pollingManager.stopPolling()
    logger.info('Automatic sync stopped (including incremental sync polling and full sync timer)')
  }

  /**
   * Get polling status
   */
  getPollingStatus() {
    return this.pollingManager.getStatus()
  }

  /**
   * Execute incremental sync immediately (with state management)
   */
  async syncNow(): Promise<boolean> {
    try {
      // Check if incremental sync can be started
      if (!this.syncStateManager.canStartSync(SyncType.INCREMENTAL)) {
        const currentStatus = this.syncStateManager.getCurrentStatus()
        logger.warn(`Cannot start incremental sync, current status: ${currentStatus.type} - ${currentStatus.state}`)
        return false
      }

      // Request incremental sync through state manager
      await this.syncStateManager.requestSync(SyncType.INCREMENTAL)

      // Execute actual incremental sync
      const result = await this.pollingManager.pollNow()

      // Mark sync as completed
      await this.syncStateManager.finishSync()

      return result
    } catch (error) {
      // Mark sync as failed
      await this.syncStateManager.failSync(error as Error)
      return false
    }
  }

  /**
   * Execute full sync immediately (with state management)
   */
  async fullSyncNow(): Promise<boolean> {
    try {
      // Check if full sync can be started
      if (!this.syncStateManager.canStartSync(SyncType.FULL)) {
        const currentStatus = this.syncStateManager.getCurrentStatus()
        logger.warn(`Cannot start full sync, current status: ${currentStatus.type} - ${currentStatus.state}`)

        // If currently incremental sync, full sync can interrupt it
        if (currentStatus.type === SyncType.INCREMENTAL && currentStatus.state === SyncState.RUNNING) {
          logger.info('Full sync will interrupt current incremental sync')
        } else {
          return false
        }
      }

      // Request full sync through state manager
      await this.syncStateManager.requestSync(SyncType.FULL)

      // Execute actual full sync logic
      await this.executeFullSyncLogic()

      // Mark sync as completed
      await this.syncStateManager.finishSync()

      return true
    } catch (error) {
      // Mark sync as failed
      await this.syncStateManager.failSync(error as Error)
      return false
    }
  }

  /**
   * Get full sync timer status
   */
  getFullSyncTimerStatus() {
    return this.fullSyncTimer.getStatus()
  }

  /**
   * Update full sync interval
   */
  updateFullSyncInterval(intervalHours: number): void {
    this.fullSyncTimer.updateInterval(intervalHours)
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    try {
      logger.info('Starting sync controller resource cleanup...')

      // 1. Stop automatic polling sync and full sync timer
      await this.stopAutoSync()

      // 2. Wait for current sync operation to complete (max 5 seconds)
      await this.waitForCurrentSync()

      // 3. Clean up full sync timer resources
      await this.fullSyncTimer.destroy()

      // 4. Clean up API resources
      this.api.destroy()

      logger.info('Sync controller resources cleanup completed')
    } catch (error) {
      logger.error('Error cleaning up sync controller resources:', error)
    }
  }

  /**
   * Wait for current sync operation to complete
   */
  private async waitForCurrentSync(timeoutMs: number = 5000): Promise<void> {
    try {
      const startTime = Date.now()

      // Check if there is a sync operation in progress
      while (this.isSyncInProgress() && Date.now() - startTime < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      if (this.isSyncInProgress()) {
        logger.warn('Sync operation timeout, forcing stop')
      } else {
        logger.info('Current sync operation completed')
      }
    } catch (error) {
      logger.error('Error waiting for sync operation to complete:', error)
    }
  }

  /**
   * Check if there is a sync operation in progress (using state manager)
   */
  private isSyncInProgress(): boolean {
    const currentStatus = this.syncStateManager.getCurrentStatus()
    return currentStatus.state === SyncState.RUNNING
  }

  /**
   * Check if there is a sync operation in progress (original version, maintained for compatibility)
   * Currently unused, kept for future reference
   */
  /*
  private _isSyncInProgressLegacy(): boolean {
    // Check polling status and full sync status
    const pollingStatus = this.pollingManager.getStatus()
    const fullSyncStatus = this.fullSyncTimer.getStatus()
    return pollingStatus.isRunning || fullSyncStatus.isRunning
  }
  */

  /**
   * Check authentication status
   */
  async isAuthenticated(): Promise<boolean> {
    return await this.api.isAuthenticated()
  }

  /**
   * Get authentication status details
   */
  getAuthStatus() {
    return this.api.getAuthStatus()
  }

  /**
   * Handle authentication failure
   * When API call returns 401, directly stop sync operations
   */
  async handleAuthFailure(): Promise<boolean> {
    try {
      logger.warn('Authentication failure detected, stopping sync operations')

      // Stop all sync operations
      await this.stopAutoSync()

      logger.info('Sync operations stopped, please re-login through main application to restore sync functionality')
      return false
    } catch (error) {
      logger.error('Error stopping sync operations:', error)
      return false
    }
  }

  /**
   * Get system status (enhanced version, includes state manager information)
   */
  getSystemStatus() {
    const syncStatus = this.syncStateManager.getCurrentStatus()
    return {
      // New: unified sync status
      sync: {
        type: syncStatus.type,
        state: syncStatus.state,
        progress: syncStatus.progress,
        message: syncStatus.message,
        startTime: syncStatus.startTime,
        error: syncStatus.error,
        canStartIncremental: this.syncStateManager.canStartSync(SyncType.INCREMENTAL),
        canStartFull: this.syncStateManager.canStartSync(SyncType.FULL)
      },
      // Original detailed status information
      polling: this.pollingManager.getStatus(),
      fullSyncTimer: this.fullSyncTimer.getStatus(),
      encryption: this.encryptionService.getStatus(),
      auth: this.api.getAuthStatus(),
      database: {
        path: 'database',
        lastSequenceId: this.db.getLastSequenceId()
      }
    }
  }

  /**
   * Get simplified sync status (for UI display)
   */
  getSyncStatus(): SyncStatus {
    return this.syncStateManager.getCurrentStatus()
  }

  /**
   * Get sync state manager instance
   */
  getSyncStateManager(): SyncStateManager {
    return this.syncStateManager
  }

  /**
   * Add sync status listener
   */
  addSyncStatusListener(listener: (status: SyncStatus) => void): void {
    this.syncStateManager.addStatusListener(listener)
  }

  /**
   * Remove sync status listener
   */
  removeSyncStatusListener(listener: (status: SyncStatus) => void): void {
    this.syncStateManager.removeStatusListener(listener)
  }

  /**
   * Cancel current sync operation
   */
  async cancelCurrentSync(): Promise<boolean> {
    try {
      const currentStatus = this.syncStateManager.getCurrentStatus()

      if (currentStatus.state !== SyncState.RUNNING) {
        logger.warn('No sync operation in progress to cancel')
        return false
      }

      logger.info(`Canceling current sync operation: ${currentStatus.type}`)

      // Execute corresponding cancel operation based on sync type
      if (currentStatus.type === SyncType.INCREMENTAL) {
        await this.pollingManager.stopPolling()
      } else if (currentStatus.type === SyncType.FULL) {
        // Full sync cancel logic (if needed)
        // More complex logic may be needed here to safely interrupt full sync
      }

      // Force stop sync
      await this.syncStateManager.forceStop()

      return true
    } catch (error) {
      logger.error('Failed to cancel sync operation:', error)
      return false
    }
  }

  /**
   * Get sync statistics
   */
  getSyncStats() {
    return {
      lastSequenceId: this.db.getLastSequenceId(),
      pendingChanges: this.db.getPendingChanges?.()?.length || 0,
      pollingStatus: this.pollingManager.getStatus(),
      fullSyncStatus: this.fullSyncTimer.getStatus(),
      encryptionStatus: this.encryptionService.getStatus()
    }
  }

  /**
   * Static method: trigger incremental sync
   * Can be called from anywhere to trigger sync immediately after data changes
   */
  static async triggerIncrementalSync(): Promise<void> {
    try {
      if (!SyncController.instance) {
        logger.warn('⚠️ SyncController instance not initialized, skipping incremental sync trigger')
        return
      }

      const instance = SyncController.instance

      // Check if there is a sync operation in progress
      const pollingStatus = instance.pollingManager.getStatus()
      if (pollingStatus.isPerforming) {
        logger.debug('⏸️ Incremental sync in progress, skipping trigger')
        return
      }

      // Check authentication status
      if (!(await instance.isAuthenticated())) {
        logger.debug('⚠️ Authentication invalid, skipping incremental sync trigger')
        return
      }

      logger.info('📊 Data change triggered incremental sync')

      // Execute incremental sync
      const result = await instance.incrementalSyncAll()

      if (result.success) {
        logger.info(`Triggered incremental sync completed: synced ${result.synced_count} tables`)
      } else {
        logger.warn(`Triggered incremental sync failed: ${result.message}`)
      }
    } catch (error) {
      logger.error('Exception triggering incremental sync:', error)
      // Don't throw exception to avoid affecting database operations
    }
  }
}
