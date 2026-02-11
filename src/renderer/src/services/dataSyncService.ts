import { userConfigStore } from './userConfigStoreService'

const logger = createRendererLogger('service.dataSync')

/**
 * Data sync service - manages data sync start and stop in renderer process
 */
export class DataSyncService {
  private static instance: DataSyncService | null = null
  private isInitialized = false

  private constructor() {
    // Private constructor for singleton pattern
  }

  static getInstance(): DataSyncService {
    if (!DataSyncService.instance) {
      DataSyncService.instance = new DataSyncService()
    }
    return DataSyncService.instance
  }

  /**
   * Initialize data sync service (synchronous version, blocks caller)
   * Called after user login, checks user config and decides whether to start data sync
   * Only normally logged-in users will enable data sync, guest users are skipped
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.info('Data sync service already initialized, skipping duplicate initialization')
      return
    }

    try {
      logger.info('Initializing data sync service...')

      // Check if it's a guest user
      const isSkippedLogin = localStorage.getItem('login-skipped') === 'true'
      const token = localStorage.getItem('ctm-token')

      if (isSkippedLogin || token === 'guest_token') {
        logger.info('Guest user detected, skipping data sync initialization')
        this.isInitialized = true
        return
      }

      // Get user config
      const userConfig = await userConfigStore.getConfig()

      if (!userConfig) {
        logger.info('Unable to get user config, skipping data sync initialization')
        return
      }

      // Check if data sync is enabled
      const isDataSyncEnabled = userConfig.dataSync === 'enabled'
      logger.info('User data sync config', { enabled: isDataSyncEnabled })

      if (isDataSyncEnabled) {
        await this.enableDataSync()
      } else {
        logger.info('Data sync is disabled, not starting sync service')
      }

      this.isInitialized = true
      logger.info('Data sync service initialization completed')
    } catch (error) {
      logger.error('Data sync service initialization failed', { error: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * Enable data sync
   */
  async enableDataSync(): Promise<boolean> {
    try {
      logger.info('Enabling data sync...')

      if (!window.api?.setDataSyncEnabled) {
        logger.error('Data sync API not available')
        return false
      }

      const result = await window.api.setDataSyncEnabled(true)

      if (result?.success) {
        logger.info('Data sync successfully enabled, background sync task is in progress...')
        return true
      } else {
        logger.error('Failed to enable data sync', { error: result?.error })
        return false
      }
    } catch (error) {
      logger.error('Error occurred while enabling data sync', { error: error instanceof Error ? error.message : String(error) })
      return false
    }
  }

  /**
   * Disable data sync
   */
  async disableDataSync(): Promise<boolean> {
    try {
      logger.info('Disabling data sync...')

      if (!window.api?.setDataSyncEnabled) {
        logger.error('Data sync API not available')
        return false
      }

      const result = await window.api.setDataSyncEnabled(false)

      if (result?.success) {
        logger.info('Data sync successfully disabled')
        return true
      } else {
        logger.error('Failed to disable data sync', { error: result?.error })
        return false
      }
    } catch (error) {
      logger.error('Error occurred while disabling data sync', { error: error instanceof Error ? error.message : String(error) })
      return false
    }
  }

  /**
   * Reset initialization status (for scenarios like user switching)
   */
  reset(): void {
    this.isInitialized = false
    logger.info('Data sync service status has been reset')
  }

  /**
   * Check if already initialized
   */
  getInitializationStatus(): boolean {
    return this.isInitialized
  }
}

// Export singleton instance
export const dataSyncService = DataSyncService.getInstance()
