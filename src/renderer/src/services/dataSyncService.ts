import { getStoredUserConfigSnapshot, resolveDataSyncPreference } from './userConfigStoreService'
import { chatSyncService } from './chatSyncService'
import { userConfigSyncService } from './userConfigSyncService'
import { editorConfigSyncService } from './editorConfigSyncService'
import { userRulesSyncService } from './userRulesSyncService'
import { aiPreferencesSyncService } from './aiPreferencesSyncService'

const logger = createRendererLogger('service.dataSync')

const parseDataSyncPolicyEnabled = (): boolean | null => {
  const raw = import.meta.env.RENDERER_DATA_SYNC_ENABLED
  if (typeof raw !== 'string') return null
  const normalized = raw.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return null
}

/**
 * All config sync services, iterated for lifecycle operations.
 */
const allConfigSyncServices = [userConfigSyncService, editorConfigSyncService, userRulesSyncService, aiPreferencesSyncService]

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
      if (parseDataSyncPolicyEnabled() === false) {
        logger.info('Data sync disabled by enterprise policy')
        await this.disableDataSync().catch((error) => {
          logger.error('Failed to enforce data sync disabled policy', { error })
        })
        this.isInitialized = true
        return
      }

      // Check if it's a guest user
      const isSkippedLogin = localStorage.getItem('login-skipped') === 'true'
      const token = localStorage.getItem('ctm-token')

      if (isSkippedLogin || token === 'guest_token') {
        logger.info('Guest user detected, skipping data sync initialization')
        this.isInitialized = true
        return
      }

      const rawConfig = await getStoredUserConfigSnapshot()
      const isDataSyncEnabled = resolveDataSyncPreference(rawConfig, true) === 'enabled'
      logger.info('User data sync config', { enabled: isDataSyncEnabled })

      if (isDataSyncEnabled) {
        await this.enableDataSync()
      } else {
        logger.info('Data sync is disabled, not starting sync service')
      }

      this.isInitialized = true
      logger.info('Data sync service initialization completed')
    } catch (error) {
      logger.error('Data sync service initialization failed', { error: error })
    }
  }

  /**
   * Enable data sync
   */
  async enableDataSync(): Promise<boolean> {
    try {
      if (parseDataSyncPolicyEnabled() === false) {
        logger.info('Data sync enable blocked by enterprise policy')
        return false
      }
      logger.info('Enabling data sync...')

      if (!window.api?.setDataSyncEnabled) {
        logger.error('Data sync API not available')
        return false
      }

      const result = await window.api.setDataSyncEnabled(true)

      if (result?.success) {
        logger.info('Data sync successfully enabled, initializing chat sync and all config sync services...')

        // Enable chat sync as part of unified dataSync switch (failure does not block others)
        await chatSyncService.enable().catch((e) => {
          logger.error('Chat sync enable failed', { error: e })
        })

        // Initialize all config sync services (failure does not block others)
        await Promise.allSettled(
          allConfigSyncServices.map((svc) =>
            svc.initialize().catch((e) => {
              logger.error('Config sync service initialization failed', { error: e })
            })
          )
        )

        return true
      } else {
        logger.error('Failed to enable data sync', { error: result?.error })
        return false
      }
    } catch (error) {
      logger.error('Error occurred while enabling data sync', { error: error })
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
        logger.info('Data sync successfully disabled, stopping chat sync and all config sync services')

        // Disable chat sync as part of unified dataSync switch
        try {
          await chatSyncService.disable()
        } catch (e) {
          logger.error('Chat sync disable failed', { error: e })
        }

        // Stop all config sync services
        for (const svc of allConfigSyncServices) {
          svc.stop()
        }

        return true
      } else {
        logger.error('Failed to disable data sync', { error: result?.error })
        return false
      }
    } catch (error) {
      logger.error('Error occurred while disabling data sync', { error: error })
      return false
    }
  }

  /**
   * Reset initialization status (for scenarios like user switching)
   */
  reset(): void {
    this.isInitialized = false
    chatSyncService.reset()
    for (const svc of allConfigSyncServices) {
      svc.reset()
    }
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
