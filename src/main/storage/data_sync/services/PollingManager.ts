import { ApiClient } from '../core/ApiClient'
import { DatabaseManager } from '../core/DatabaseManager'
import { SyncEngine } from '../core/SyncEngine'
import { logger } from '../utils/logger'

export interface PollingConfig {
  initialInterval: number // Initial polling interval (ms)
  maxInterval: number // Maximum polling interval (ms)
  minInterval: number // Minimum polling interval (ms)
  backoffMultiplier: number // Backoff multiplier
  adaptivePolling: boolean // Whether to enable adaptive polling
}

export interface PollingStatus {
  isRunning: boolean
  isPerforming: boolean
  currentInterval: number
  lastPollTime: Date | null
  consecutiveErrors: number
  totalPolls: number
  successfulPolls: number
}

export class PollingManager {
  private config: PollingConfig
  private status: PollingStatus
  private pollingTimer: NodeJS.Timeout | null = null
  private isShuttingDown = false

  constructor(
    private db: DatabaseManager,
    _api: ApiClient,
    private syncEngine: SyncEngine,
    config?: Partial<PollingConfig>
  ) {
    this.config = {
      initialInterval: 30000, // 30 seconds
      maxInterval: 300000, // 5 minutes
      minInterval: 10000, // 10 seconds
      backoffMultiplier: 1.5,
      adaptivePolling: true,
      ...config
    }

    this.status = {
      isRunning: false,
      isPerforming: false,
      currentInterval: this.config.initialInterval,
      lastPollTime: null,
      consecutiveErrors: 0,
      totalPolls: 0,
      successfulPolls: 0
    }
  }

  /**
   * Start polling
   */
  async startPolling(): Promise<void> {
    if (this.status.isRunning) {
      logger.warn('Polling is already running')
      return
    }

    this.status.isRunning = true
    this.isShuttingDown = false
    logger.info(`Starting polling sync, interval: ${this.status.currentInterval}ms`)

    this.scheduleNextPoll()
  }

  /**
   * Stop polling
   */
  async stopPolling(): Promise<void> {
    if (!this.status.isRunning) {
      return
    }

    logger.info('Stopping polling sync...')

    // Mark stop status
    this.isShuttingDown = true
    this.status.isRunning = false

    // Clear timer
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer)
      this.pollingTimer = null
    }

    // Wait for current polling operation to complete (max 1.5 seconds)
    await this.waitForCurrentPoll(1500)

    logger.info('Polling sync stopped')
  }

  /**
   * Wait for current polling operation to complete
   */
  private async waitForCurrentPoll(timeoutMs: number = 1500): Promise<void> {
    try {
      const startTime = Date.now()

      // Check if there is a polling operation in progress
      while (this.status.isPerforming && Date.now() - startTime < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      if (this.status.isPerforming) {
        logger.warn('Polling operation timeout, forcing stop')
      } else {
        logger.info('Current polling operation completed')
      }
    } catch (error) {
      logger.error('Error waiting for polling operation to complete:', error)
    }
  }

  /**
   * Check if there is a polling operation in progress
   * Currently unused, kept for future reference
   */
  /*
  private _isPollingInProgress(): boolean {
    return this.status.isPerforming
  }
  */

  /**
   * Execute polling immediately
   */
  async pollNow(): Promise<boolean> {
    return await this.performPoll()
  }

  /**
   * Get polling status
   */
  getStatus(): PollingStatus {
    return { ...this.status }
  }

  /**
   * Schedule next poll
   */
  private scheduleNextPoll(): void {
    if (this.isShuttingDown || !this.status.isRunning) {
      return
    }

    this.pollingTimer = setTimeout(async () => {
      if (this.isShuttingDown) return

      await this.performPoll()
      this.scheduleNextPoll()
    }, this.status.currentInterval)
  }

  /**
   * Execute polling check
   */
  private async performPoll(): Promise<boolean> {
    const startTime = Date.now()
    this.status.totalPolls++
    this.status.lastPollTime = new Date()

    // Mark polling in progress
    this.status.isPerforming = true

    try {
      logger.debug('Starting polling check')

      // 1. Upload local changes
      const uploadResult = await this.uploadLocalChanges()

      // 2. Download cloud changes
      const downloadResult = await this.downloadCloudChanges()

      // 3. Handle success
      this.handlePollSuccess(uploadResult.hasChanges || downloadResult.hasChanges)

      const duration = Date.now() - startTime
      logger.info(`Polling completed: uploaded ${uploadResult.count} items, downloaded ${downloadResult.count} items, took ${duration}ms`)

      return true
    } catch (error: any) {
      // Check if it's a network connection error
      if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
        // For network errors, don't record as failure, only log warning
        logger.debug('Server unavailable, skipping this poll')
        this.handlePollError(error)
        return true // Return true to indicate polling completed normally, just server unavailable
      }

      this.handlePollError(error)
      return false
    } finally {
      // Clear in-progress flag
      this.status.isPerforming = false
    }
  }

  /**
   * Upload local changes
   */
  private async uploadLocalChanges(): Promise<{ hasChanges: boolean; count: number }> {
    try {
      // Check if there are pending changes to sync
      const pendingChanges = this.db.getPendingChanges()
      if (pendingChanges.length === 0) {
        return { hasChanges: false, count: 0 }
      }

      // Group uploads by table name
      const assetChanges = pendingChanges.filter((c) => c.table_name === 't_assets_sync')
      const chainChanges = pendingChanges.filter((c) => c.table_name === 't_asset_chains_sync')

      let totalUploaded = 0

      if (assetChanges.length > 0) {
        try {
          const result = await this.syncEngine.incrementalSync('t_assets_sync')
          totalUploaded += result.synced_count || 0
        } catch (error: any) {
          if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
            logger.warn('Server unavailable, skipping t_assets_sync upload')
          } else {
            throw error
          }
        }
      }

      if (chainChanges.length > 0) {
        try {
          const result = await this.syncEngine.incrementalSync('t_asset_chains_sync')
          totalUploaded += result.synced_count || 0
        } catch (error: any) {
          if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
            logger.warn('Server unavailable, skipping t_asset_chains_sync upload')
          } else {
            throw error
          }
        }
      }

      return { hasChanges: totalUploaded > 0, count: totalUploaded }
    } catch (error: any) {
      // Check if it's a network connection error
      if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
        logger.warn('Server unavailable, skipping local changes upload')
        return { hasChanges: false, count: 0 }
      }
      logger.error('Failed to upload local changes', error)
      throw error
    }
  }

  /**
   * Download cloud changes
   */
  private async downloadCloudChanges(): Promise<{ hasChanges: boolean; count: number }> {
    try {
      const result = await this.syncEngine.downloadAndApplyCloudChanges()
      return { hasChanges: result.applied > 0, count: result.applied }
    } catch (error: any) {
      // Check if it's a network connection error
      if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
        logger.warn('Server unavailable, skipping cloud changes download')
        return { hasChanges: false, count: 0 }
      }
      logger.error('Failed to download cloud changes', error)
      throw error
    }
  }

  /**
   * Handle polling success
   */
  private handlePollSuccess(hasChanges: boolean): void {
    this.status.successfulPolls++
    this.status.consecutiveErrors = 0

    if (this.config.adaptivePolling) {
      this.adjustPollingInterval(hasChanges)
    }
  }

  /**
   * Handle polling error
   */
  private handlePollError(error: any): void {
    // Check if it's a network connection error
    if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
      // Network errors don't count towards consecutive errors, but log warning
      logger.warn('Server unavailable, polling will continue to retry')
      return
    }

    this.status.consecutiveErrors++
    logger.error(`Polling failed (consecutive ${this.status.consecutiveErrors} times)`, error?.message)

    // Exponential backoff
    if (this.status.consecutiveErrors > 1) {
      const backoffInterval = Math.min(
        this.config.maxInterval,
        this.status.currentInterval * Math.pow(this.config.backoffMultiplier, this.status.consecutiveErrors - 1)
      )
      this.status.currentInterval = backoffInterval
      logger.warn(`Adjusted polling interval to: ${this.status.currentInterval}ms`)
    }
  }

  /**
   * Adaptively adjust polling interval
   */
  private adjustPollingInterval(hasChanges: boolean): void {
    if (hasChanges) {
      // Shorten interval when there are changes
      this.status.currentInterval = Math.max(this.config.minInterval, this.status.currentInterval * 0.8)
    } else {
      // Extend interval when there are no changes
      this.status.currentInterval = Math.min(this.config.maxInterval, this.status.currentInterval * 1.2)
    }

    logger.debug(`Adjusted polling interval to: ${this.status.currentInterval}ms`)
  }
}
