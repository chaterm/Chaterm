import { logger } from '../utils/logger'

export interface FullSyncTimerConfig {
  intervalHours: number // Timer interval in hours
  enableOnStart: boolean // Whether to automatically enable timer on start
}

export interface FullSyncTimerStatus {
  isEnabled: boolean // Whether the timer is enabled
  isRunning: boolean // Whether full sync is currently running
  intervalMs: number // Timer interval in milliseconds
  lastFullSyncTime: Date | null // Last full sync time
  nextFullSyncTime: Date | null // Next full sync time
  totalFullSyncs: number // Total number of full syncs
  successfulFullSyncs: number // Number of successful full syncs
}

/**
 * Full sync timer manager
 * Responsible for periodically executing full sync to ensure local data stays consistent with server
 */
export class FullSyncTimerManager {
  private config: FullSyncTimerConfig
  private status: FullSyncTimerStatus
  private timer: NodeJS.Timeout | null = null
  private isShuttingDown = false
  private fullSyncCallback: (() => Promise<void>) | null = null
  private conflictCheckCallback: (() => Promise<boolean>) | null = null

  constructor(config?: Partial<FullSyncTimerConfig>, fullSyncCallback?: () => Promise<void>, conflictCheckCallback?: () => Promise<boolean>) {
    this.config = {
      intervalHours: 1, // Default: execute every 1 hour
      enableOnStart: false, // Default: do not auto-start
      ...config
    }

    this.status = {
      isEnabled: false,
      isRunning: false,
      intervalMs: this.config.intervalHours * 60 * 60 * 1000, // Convert to milliseconds
      lastFullSyncTime: null,
      nextFullSyncTime: null,
      totalFullSyncs: 0,
      successfulFullSyncs: 0
    }

    this.fullSyncCallback = fullSyncCallback || null
    this.conflictCheckCallback = conflictCheckCallback || null
  }

  /**
   * Set full sync callback function
   */
  setFullSyncCallback(callback: () => Promise<void>): void {
    this.fullSyncCallback = callback
    logger.debug('Full sync callback function has been set')
  }

  /**
   * Set conflict check callback function
   * Returns true if there is a conflict (incremental sync is in progress), should skip full sync
   */
  setConflictCheckCallback(callback: () => Promise<boolean>): void {
    this.conflictCheckCallback = callback
    logger.debug('Conflict check callback function has been set')
  }

  /**
   * Start full sync timer
   */
  async start(): Promise<void> {
    if (this.status.isEnabled) {
      logger.warn('Full sync timer is already running')
      return
    }

    if (!this.fullSyncCallback) {
      throw new Error('Full sync callback function not set, cannot start timer')
    }

    this.status.isEnabled = true
    this.isShuttingDown = false

    // Calculate next execution time
    this.updateNextFullSyncTime()

    logger.info(
      `Full sync timer started, interval: ${this.config.intervalHours} hours, next execution: ${this.status.nextFullSyncTime?.toLocaleString()}`
    )

    this.scheduleNextFullSync()
  }

  /**
   * Stop full sync timer
   */
  async stop(): Promise<void> {
    if (!this.status.isEnabled) {
      logger.debug('Full sync timer is not running')
      return
    }

    logger.info('Stopping full sync timer...')

    // Mark shutdown state
    this.isShuttingDown = true
    this.status.isEnabled = false

    // Clear timer
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    // Wait for current full sync operation to complete (max 30 seconds)
    await this.waitForCurrentFullSync(30000)

    // Reset state
    this.status.nextFullSyncTime = null

    logger.info('Full sync timer stopped')
  }

  /**
   * Execute full sync immediately
   */
  async syncNow(): Promise<boolean> {
    if (!this.fullSyncCallback) {
      logger.error('Full sync callback function not set, cannot execute full sync')
      return false
    }

    if (this.status.isRunning) {
      logger.warn('Full sync is already in progress, skipping this request')
      return false
    }

    logger.info('Manually triggering full sync...')
    return await this.performFullSync()
  }

  /**
   * Get timer status
   */
  getStatus(): FullSyncTimerStatus {
    return { ...this.status }
  }

  /**
   * Update timer interval
   */
  updateInterval(intervalHours: number): void {
    if (intervalHours <= 0) {
      throw new Error('Timer interval must be greater than 0 hours')
    }

    const oldInterval = this.config.intervalHours
    this.config.intervalHours = intervalHours
    this.status.intervalMs = intervalHours * 60 * 60 * 1000

    logger.info(`Full sync timer interval updated: ${oldInterval} hours -> ${intervalHours} hours`)

    // If timer is running, reschedule
    if (this.status.isEnabled) {
      this.updateNextFullSyncTime()
      this.rescheduleNextFullSync()
    }
  }

  /**
   * Schedule next full sync
   */
  private scheduleNextFullSync(): void {
    if (this.isShuttingDown || !this.status.isEnabled) {
      return
    }

    const now = new Date()
    const delay = this.status.nextFullSyncTime ? Math.max(0, this.status.nextFullSyncTime.getTime() - now.getTime()) : this.status.intervalMs

    this.timer = setTimeout(async () => {
      if (this.isShuttingDown) return

      await this.performFullSync()

      // Schedule next execution
      if (this.status.isEnabled && !this.isShuttingDown) {
        this.updateNextFullSyncTime()
        this.scheduleNextFullSync()
      }
    }, delay)

    logger.debug(`Next full sync will execute in ${Math.round(delay / 1000)} seconds`)
  }

  /**
   * Reschedule next full sync
   */
  private rescheduleNextFullSync(): void {
    // Clear current timer
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    // Reschedule
    this.scheduleNextFullSync()
  }

  /**
   * Perform full sync
   */
  private async performFullSync(): Promise<boolean> {
    if (!this.fullSyncCallback) {
      logger.error('Full sync callback function not set')
      return false
    }

    const startTime = Date.now()
    this.status.totalFullSyncs++

    // Check if there is a conflict check callback
    if (this.conflictCheckCallback && (await this.conflictCheckCallback())) {
      logger.warn('Incremental sync is in progress, skipping this full sync')
      return false
    }

    this.status.isRunning = true

    try {
      logger.info('Starting scheduled full sync...')

      await this.fullSyncCallback()

      // Update success statistics
      this.status.successfulFullSyncs++
      this.status.lastFullSyncTime = new Date()

      const duration = Date.now() - startTime
      logger.info(`Scheduled full sync completed, duration: ${Math.round(duration / 1000)} seconds`)

      return true
    } catch (error: unknown) {
      const duration = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`Scheduled full sync failed, duration: ${Math.round(duration / 1000)} seconds`, errorMessage)
      return false
    } finally {
      this.status.isRunning = false
    }
  }

  /**
   * Update next full sync time
   */
  private updateNextFullSyncTime(): void {
    const now = new Date()
    this.status.nextFullSyncTime = new Date(now.getTime() + this.status.intervalMs)
  }

  /**
   * Wait for current full sync operation to complete
   */
  private async waitForCurrentFullSync(timeoutMs: number = 30000): Promise<void> {
    if (!this.status.isRunning) {
      return
    }

    try {
      const startTime = Date.now()

      logger.info('Waiting for current full sync operation to complete...')

      while (this.status.isRunning && Date.now() - startTime < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }

      if (this.status.isRunning) {
        logger.warn('Full sync operation timed out, forcing stop')
      } else {
        logger.info('Current full sync operation completed')
      }
    } catch (error) {
      logger.error('Error while waiting for full sync operation to complete:', error)
    }
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    try {
      logger.info('Starting cleanup of full sync timer resources...')

      await this.stop()
      this.fullSyncCallback = null
      this.conflictCheckCallback = null

      logger.info('Full sync timer resources cleanup completed')
    } catch (error) {
      logger.error('Error while cleaning up full sync timer resources:', error)
    }
  }
}
