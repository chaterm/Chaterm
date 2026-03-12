/**
 * ChatSyncScheduler - Conditional timer for Chat Sync V2
 *
 * Scheduling rules:
 * - Default 30-second polling interval
 * - Polling only active when AI Tab is visible
 * - Immediate trigger on: login, app start, AI Tab becoming visible
 * - Manual sync always executes regardless of AI Tab state
 * - Full sync only on first login or manual sync-now
 */

import type { ChatSyncEngine } from '../core/ChatSyncEngine'
import { DEFAULT_POLL_INTERVAL_MS } from '../models/ChatSyncTypes'
const logger = createLogger('chat-sync-scheduler')

export class ChatSyncScheduler {
  private engine: ChatSyncEngine
  private pollIntervalMs: number
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private isAiTabVisible = false
  private isEnabled = false
  private hasRunInitialSync = false

  constructor(engine: ChatSyncEngine, pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS) {
    this.engine = engine
    this.pollIntervalMs = pollIntervalMs
  }

  /**
   * Enable the scheduler and start polling.
   * Triggers an initial sync immediately.
   */
  async enable(): Promise<void> {
    if (this.isEnabled) return

    this.isEnabled = true
    logger.info('Chat sync scheduler enabled')

    // Run initial cleanup of remote-deleted tasks
    await this.engine.runRemoteDeletedCleanup()

    // Trigger initial sync
    if (!this.hasRunInitialSync) {
      this.hasRunInitialSync = true
      this._triggerSync()
    }

    this._startPolling()
  }

  /**
   * Disable the scheduler and stop polling.
   */
  disable(): void {
    this.isEnabled = false
    this._stopPolling()
    logger.info('Chat sync scheduler disabled')
  }

  /**
   * Set AI Tab visibility state.
   * When tab becomes visible, triggers an immediate sync.
   */
  setAiTabVisible(visible: boolean): void {
    const wasVisible = this.isAiTabVisible
    this.isAiTabVisible = visible

    logger.info('AI Tab visibility changed', { visible })

    if (!wasVisible && visible && this.isEnabled) {
      // AI Tab just became visible - trigger immediate sync
      this._triggerSync()

      // Also run cleanup for remote-deleted tasks
      this.engine.runRemoteDeletedCleanup().catch((error) => {
        logger.error('Remote deleted cleanup failed on tab visible', { error })
      })
    }
  }

  /**
   * Manual sync now - always executes regardless of AI Tab state.
   */
  async syncNow(): Promise<void> {
    if (!this.isEnabled) {
      logger.warn('Sync requested but scheduler is disabled')
      return
    }

    logger.info('Manual sync triggered')
    try {
      await this.engine.runSyncCycle()
    } catch (error) {
      logger.error('Manual sync failed', { error })
    }
  }

  /**
   * Called when user logs in successfully.
   * Triggers immediate sync.
   */
  async onLoginSuccess(): Promise<void> {
    if (!this.isEnabled) return

    logger.info('Login success - triggering sync')
    // Run cleanup for remote-deleted tasks
    await this.engine.runRemoteDeletedCleanup()
    this._triggerSync()
  }

  /**
   * Get current scheduler status.
   */
  getStatus(): {
    enabled: boolean
    aiTabVisible: boolean
    polling: boolean
    engineStatus: ReturnType<ChatSyncEngine['getStatus']>
  } {
    return {
      enabled: this.isEnabled,
      aiTabVisible: this.isAiTabVisible,
      polling: this.pollTimer !== null,
      engineStatus: this.engine.getStatus()
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private _startPolling(): void {
    if (this.pollTimer) return

    this.pollTimer = setInterval(() => {
      this._onPollTick()
    }, this.pollIntervalMs)

    logger.info('Polling started', { intervalMs: this.pollIntervalMs })
  }

  private _stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
      logger.info('Polling stopped')
    }
  }

  private _onPollTick(): void {
    if (!this.isEnabled) return

    // Only poll when AI Tab is visible
    if (!this.isAiTabVisible) {
      return
    }

    this._triggerSync()
  }

  private _triggerSync(): void {
    // Fire-and-forget, the engine handles its own locking
    this.engine.runSyncCycle().catch((error) => {
      logger.error('Sync cycle failed', { error })
    })
  }

  /**
   * Cleanup resources.
   */
  destroy(): void {
    this.disable()
  }
}
