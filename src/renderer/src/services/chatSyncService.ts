/**
 * Chat Sync Service - Renderer Process
 *
 * Thin wrapper around IPC calls for chat synchronization.
 * Follows the same singleton pattern as DataSyncService.
 */

const logger = createRendererLogger('service.chatSync')

export class ChatSyncService {
  private static instance: ChatSyncService | null = null
  private isInitialized = false

  private constructor() {
    // Private constructor for singleton pattern
  }

  static getInstance(): ChatSyncService {
    if (!ChatSyncService.instance) {
      ChatSyncService.instance = new ChatSyncService()
    }
    return ChatSyncService.instance
  }

  /**
   * Initialize chat sync service after user login.
   * Checks user config and decides whether to enable chat sync.
   * Guest users are skipped.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.info('Chat sync service already initialized, skipping')
      return
    }

    try {
      logger.info('Initializing chat sync service...')

      const isSkippedLogin = localStorage.getItem('login-skipped') === 'true'
      const token = localStorage.getItem('ctm-token')

      if (isSkippedLogin || token === 'guest_token') {
        logger.info('Guest user detected, skipping chat sync initialization')
        this.isInitialized = true
        return
      }

      // Enable chat sync via IPC
      await this.enable()
      this.isInitialized = true
      logger.info('Chat sync service initialization completed')
    } catch (error) {
      logger.error('Chat sync service initialization failed', { error })
    }
  }

  /**
   * Enable chat sync in main process
   */
  async enable(): Promise<boolean> {
    try {
      if (!window.api?.chatSyncSetEnabled) {
        logger.error('Chat sync API not available')
        return false
      }

      const result = await window.api.chatSyncSetEnabled(true)
      if (result?.success) {
        logger.info('Chat sync enabled')
        return true
      } else {
        logger.error('Failed to enable chat sync', { error: result?.error })
        return false
      }
    } catch (error) {
      logger.error('Error enabling chat sync', { error })
      return false
    }
  }

  /**
   * Disable chat sync in main process
   */
  async disable(): Promise<boolean> {
    try {
      if (!window.api?.chatSyncSetEnabled) {
        logger.error('Chat sync API not available')
        return false
      }

      const result = await window.api.chatSyncSetEnabled(false)
      if (result?.success) {
        logger.info('Chat sync disabled')
        return true
      } else {
        logger.error('Failed to disable chat sync', { error: result?.error })
        return false
      }
    } catch (error) {
      logger.error('Error disabling chat sync', { error })
      return false
    }
  }

  /**
   * Get current sync status
   */
  async getStatus(): Promise<{ enabled: boolean; lastSyncAt?: number } | null> {
    try {
      if (!window.api?.chatSyncGetStatus) {
        return null
      }

      const result = await window.api.chatSyncGetStatus()
      if (result?.success) {
        return result.data
      }
      return null
    } catch (error) {
      logger.error('Error getting chat sync status', { error })
      return null
    }
  }

  /**
   * Trigger an immediate sync cycle
   */
  async syncNow(): Promise<boolean> {
    try {
      if (!window.api?.chatSyncSyncNow) {
        logger.error('Chat sync API not available')
        return false
      }

      const result = await window.api.chatSyncSyncNow()
      if (result?.success) {
        logger.info('Manual sync triggered')
        return true
      } else {
        logger.error('Manual sync failed', { error: result?.error })
        return false
      }
    } catch (error) {
      logger.error('Error triggering manual sync', { error })
      return false
    }
  }

  /**
   * Notify main process about AI Tab visibility change
   */
  async setAiTabVisible(visible: boolean): Promise<void> {
    try {
      if (!window.api?.chatSyncSetAiTabVisible) {
        return
      }
      await window.api.chatSyncSetAiTabVisible(visible)
    } catch (error) {
      logger.error('Error setting AI tab visibility', { error })
    }
  }

  /**
   * Reset initialization status (for user switching)
   */
  reset(): void {
    this.isInitialized = false
    logger.info('Chat sync service status has been reset')
  }

  getInitializationStatus(): boolean {
    return this.isInitialized
  }
}

// Export singleton instance
export const chatSyncService = ChatSyncService.getInstance()
