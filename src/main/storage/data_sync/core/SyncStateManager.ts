/**
 * Sync State Manager
 * Manages mutual exclusion control between full sync and incremental sync to ensure data consistency
 * Supports sync toggle management and user switching handling
 */

import { logger } from '../utils/logger'

export enum SyncType {
  NONE = 'none',
  FULL = 'full',
  INCREMENTAL = 'incremental'
}

export enum SyncState {
  DISABLED = 'disabled', // Sync is disabled
  IDLE = 'idle', // Idle state
  RUNNING = 'running', // Sync in progress
  PAUSED = 'paused', // Paused state
  ERROR = 'error' // Error state
}

export interface SyncStatus {
  type: SyncType
  state: SyncState
  enabled: boolean // Whether sync is enabled
  currentUserId?: number // Current user ID
  startTime?: Date
  progress?: number // 0-100
  message?: string
  error?: Error
  lastSyncTime?: Date // Last sync time
}

/**
 * Sync State Manager
 * Implements mutual exclusion control and state management for sync operations
 */
export class SyncStateManager {
  private currentStatus: SyncStatus = {
    type: SyncType.NONE,
    state: SyncState.DISABLED,
    enabled: false
  }

  private pendingOperations: Array<{
    type: SyncType
    priority: number
    resolve: () => void
    reject: (error: Error) => void
  }> = []

  private listeners: Array<(status: SyncStatus) => void> = []

  /**
   * Get current sync status
   */
  getCurrentStatus(): SyncStatus {
    return { ...this.currentStatus }
  }

  /**
   * Enable sync
   */
  enableSync(userId?: number): void {
    this.updateStatus({
      enabled: true,
      currentUserId: userId,
      state: SyncState.IDLE,
      message: 'Sync enabled'
    })
    logger.info(`Sync enabled${userId ? ` (user: ${userId})` : ''}`)
  }

  /**
   * Disable sync
   */
  disableSync(): void {
    // If sync is in progress, stop it first
    if (this.currentStatus.state === SyncState.RUNNING) {
      this.forceStop()
    }

    this.updateStatus({
      enabled: false,
      state: SyncState.DISABLED,
      type: SyncType.NONE,
      message: 'Sync disabled'
    })
    logger.info('Sync disabled')
  }

  /**
   * Check if sync is enabled
   */
  isSyncEnabled(): boolean {
    return this.currentStatus.enabled
  }

  /**
   * Handle user switching
   */
  async switchUser(newUserId: number): Promise<void> {
    const previousUserId = this.currentStatus.currentUserId

    if (previousUserId === newUserId) {
      logger.info(`User unchanged (${newUserId}), no switch needed`)
      return
    }

    logger.info(`User switching: ${previousUserId} -> ${newUserId}`)

    // Stop all current sync operations
    await this.forceStop()

    // Update user ID, keep sync enabled state
    this.updateStatus({
      currentUserId: newUserId,
      state: this.currentStatus.enabled ? SyncState.IDLE : SyncState.DISABLED,
      type: SyncType.NONE,
      message: `Switched to user ${newUserId}`
    })
  }

  /**
   * Check if sync of specified type can be started
   */
  canStartSync(type: SyncType): boolean {
    // If sync is not enabled, cannot start sync
    if (!this.currentStatus.enabled) {
      return false
    }

    // Idle state can start any sync
    if (this.currentStatus.state === SyncState.IDLE) {
      return true
    }

    // If sync is currently in progress, need to check priority
    if (this.currentStatus.state === SyncState.RUNNING) {
      // Full sync has highest priority, can interrupt incremental sync
      if (type === SyncType.FULL && this.currentStatus.type === SyncType.INCREMENTAL) {
        return true
      }
      // Other cases do not allow interruption
      return false
    }

    return false
  }

  /**
   * Request to start sync (with queuing mechanism)
   */
  async requestSync(type: SyncType): Promise<void> {
    if (this.canStartSync(type)) {
      // If can start immediately, execute directly
      await this.startSync(type)
      return
    }

    // Otherwise enter waiting queue
    return new Promise((resolve, reject) => {
      const priority = type === SyncType.FULL ? 1 : 2 // Full sync has higher priority
      this.pendingOperations.push({ type, priority, resolve, reject })

      // Sort by priority
      this.pendingOperations.sort((a, b) => a.priority - b.priority)

      logger.info(`Sync request queued: ${type}, queue length: ${this.pendingOperations.length}`)
    })
  }

  /**
   * Start sync
   */
  private async startSync(type: SyncType): Promise<void> {
    // If need to interrupt current sync
    if (this.currentStatus.state === SyncState.RUNNING && type === SyncType.FULL && this.currentStatus.type === SyncType.INCREMENTAL) {
      logger.warn('Full sync interrupting incremental sync')
      await this.pauseCurrentSync()
    }

    this.updateStatus({
      type,
      state: SyncState.RUNNING,
      startTime: new Date(),
      progress: 0,
      message: `Starting ${type === SyncType.FULL ? 'full' : 'incremental'} sync`
    })

    logger.info(`Starting ${type === SyncType.FULL ? 'full' : 'incremental'} sync`)
  }

  /**
   * Update sync progress
   */
  updateProgress(progress: number, message?: string): void {
    if (this.currentStatus.state === SyncState.RUNNING) {
      this.updateStatus({
        ...this.currentStatus,
        progress: Math.max(0, Math.min(100, progress)),
        message
      })
    }
  }

  /**
   * Finish sync
   */
  async finishSync(): Promise<void> {
    if (this.currentStatus.state !== SyncState.RUNNING) {
      logger.warn('Attempting to finish sync that is not in running state')
      return
    }

    const syncType = this.currentStatus.type
    const duration = this.currentStatus.startTime ? Date.now() - this.currentStatus.startTime.getTime() : 0

    this.updateStatus({
      type: SyncType.NONE,
      state: SyncState.IDLE,
      progress: 100,
      lastSyncTime: new Date(),
      message: `${syncType === SyncType.FULL ? 'Full' : 'Incremental'} sync completed`
    })

    logger.info(`${syncType === SyncType.FULL ? 'Full' : 'Incremental'} sync completed, duration: ${duration}ms`)

    // Process waiting queue
    await this.processNextInQueue()
  }

  /**
   * Sync failed
   */
  async failSync(error: Error): Promise<void> {
    const syncType = this.currentStatus.type

    this.updateStatus({
      type: SyncType.NONE,
      state: SyncState.ERROR,
      error,
      message: `${syncType === SyncType.FULL ? 'Full' : 'Incremental'} sync failed: ${error.message}`
    })

    logger.error(`${syncType === SyncType.FULL ? 'Full' : 'Incremental'} sync failed:`, error)

    // Restore idle state after brief wait (only when sync is enabled)
    setTimeout(async () => {
      if (this.currentStatus.enabled) {
        this.updateStatus({
          type: SyncType.NONE,
          state: SyncState.IDLE
        })
        await this.processNextInQueue()
      }
    }, 5000) // Restore after 5 seconds
  }

  /**
   * Pause current sync
   */
  private async pauseCurrentSync(): Promise<void> {
    if (this.currentStatus.state === SyncState.RUNNING) {
      this.updateStatus({
        ...this.currentStatus,
        state: SyncState.PAUSED,
        message: 'Sync paused'
      })

      logger.info(`${this.currentStatus.type} sync paused`)
    }
  }

  /**
   * Process next operation in waiting queue
   */
  private async processNextInQueue(): Promise<void> {
    if (this.pendingOperations.length === 0) {
      return
    }

    const nextOp = this.pendingOperations.shift()!

    try {
      await this.startSync(nextOp.type)
      nextOp.resolve()
    } catch (error) {
      nextOp.reject(error as Error)
    }
  }

  /**
   * Add status listener
   */
  addStatusListener(listener: (status: SyncStatus) => void): void {
    this.listeners.push(listener)
  }

  /**
   * Remove status listener
   */
  removeStatusListener(listener: (status: SyncStatus) => void): void {
    const index = this.listeners.indexOf(listener)
    if (index > -1) {
      this.listeners.splice(index, 1)
    }
  }

  /**
   * Update status and notify listeners
   */
  private updateStatus(status: Partial<SyncStatus>): void {
    this.currentStatus = { ...this.currentStatus, ...status }

    // Notify all listeners
    this.listeners.forEach((listener) => {
      try {
        listener(this.getCurrentStatus())
      } catch (error) {
        logger.error('Status listener execution failed:', error)
      }
    })
  }

  /**
   * Force stop all sync operations
   */
  async forceStop(): Promise<void> {
    // Clear waiting queue
    this.pendingOperations.forEach((op) => {
      op.reject(new Error('Sync force stopped'))
    })
    this.pendingOperations = []

    // Reset state, keep enabled state
    this.updateStatus({
      type: SyncType.NONE,
      state: this.currentStatus.enabled ? SyncState.IDLE : SyncState.DISABLED,
      message: 'Sync stopped'
    })

    logger.info('All sync operations force stopped')
  }

  /**
   * Get waiting queue information
   */
  getQueueInfo(): { length: number; types: SyncType[] } {
    return {
      length: this.pendingOperations.length,
      types: this.pendingOperations.map((op) => op.type)
    }
  }
}
