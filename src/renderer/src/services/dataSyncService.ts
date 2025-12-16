import { userConfigStore } from './userConfigStoreService'

/**
 * Data sync service - manages data sync start and stop in renderer process
 */
export class DataSyncService {
  private static instance: DataSyncService | null = null
  private isInitialized = false

  // eslint-disable-next-line @typescript-eslint/no-empty-function
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
      console.log('Data sync service already initialized, skipping duplicate initialization')
      return
    }

    try {
      console.log('Initializing data sync service...')

      // Check if it's a guest user
      const isSkippedLogin = localStorage.getItem('login-skipped') === 'true'
      const token = localStorage.getItem('ctm-token')

      if (isSkippedLogin || token === 'guest_token') {
        console.log('Guest user detected, skipping data sync initialization')
        this.isInitialized = true
        return
      }

      // Get user config
      const userConfig = await userConfigStore.getConfig()

      if (!userConfig) {
        console.log('Unable to get user config, skipping data sync initialization')
        return
      }

      // Check if data sync is enabled
      const isDataSyncEnabled = userConfig.dataSync === 'enabled'
      console.log(`User data sync config: ${isDataSyncEnabled ? 'enabled' : 'disabled'}`)

      if (isDataSyncEnabled) {
        await this.enableDataSync()
      } else {
        console.log('Data sync is disabled, not starting sync service')
      }

      this.isInitialized = true
      console.log('Data sync service initialization completed')
    } catch (error) {
      console.error('Data sync service initialization failed:', error)
    }
  }

  /**
   * Enable data sync
   */
  async enableDataSync(): Promise<boolean> {
    try {
      console.log('Enabling data sync...')

      if (!window.api?.setDataSyncEnabled) {
        console.error('Data sync API not available')
        return false
      }

      const result = await window.api.setDataSyncEnabled(true)

      if (result?.success) {
        console.log('Data sync successfully enabled, background sync task is in progress...')
        return true
      } else {
        console.error('Failed to enable data sync:', result?.error)
        return false
      }
    } catch (error) {
      console.error('Error occurred while enabling data sync:', error)
      return false
    }
  }

  /**
   * Disable data sync
   */
  async disableDataSync(): Promise<boolean> {
    try {
      console.log('Disabling data sync...')

      if (!window.api?.setDataSyncEnabled) {
        console.error('Data sync API not available')
        return false
      }

      const result = await window.api.setDataSyncEnabled(false)

      if (result?.success) {
        console.log('Data sync successfully disabled')
        return true
      } else {
        console.error('Failed to disable data sync:', result?.error)
        return false
      }
    } catch (error) {
      console.error('Error occurred while disabling data sync:', error)
      return false
    }
  }

  /**
   * Reset initialization status (for scenarios like user switching)
   */
  reset(): void {
    this.isInitialized = false
    console.log('Data sync service status has been reset')
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
