import { SyncController } from './core/SyncController'
import { logger } from './utils/logger'
import { syncConfig } from './config/sync.config'

export async function startDataSync(dbPath?: string): Promise<SyncController> {
  // Clean up old log files on startup
  logger.cleanupOldLogs(syncConfig.logRetentionDays)

  const controller = new SyncController(dbPath)

  // Unified auth check and encryption service initialization (only during data sync startup)
  let isAuthInitialized = false
  let isEncryptionInitialized = false

  try {
    await controller.initializeAuth()
    isAuthInitialized = true
    logger.info('Auth check successful, synced to encryption service')
  } catch (e: any) {
    logger.warn('Auth check failed, sync functionality may be limited:', e?.message)
    logger.info('Note: Please ensure the main application has completed login authentication')
  }

  // Only initialize encryption after successful authentication
  if (isAuthInitialized) {
    try {
      await controller.initializeEncryption()
      isEncryptionInitialized = true
      logger.info('Encryption service initialization completed')
    } catch (e: any) {
      logger.warn('Encryption initialization failed', e?.message)
    }
  } else {
    logger.warn('Skipping encryption service initialization due to failed authentication')
  }

  // Force check if encryption service is ready; stop sync startup if not ready

  // Reuse the first auth check result to avoid duplicate calls
  if (!isAuthInitialized) {
    try {
      const isAuthenticated = await controller.isAuthenticated()
      if (!isAuthenticated) {
        logger.warn('Auth status check failed, may affect data sync functionality')
      } else {
        logger.info('Auth status is normal')
      }
    } catch (e: any) {
      logger.warn('Auth status check exception', e?.message)
    }
  } else {
    logger.info('Auth status is normal (reusing initialization result)')
  }

  try {
    await controller.backupInit()
  } catch (e: any) {
    logger.warn('Backup initialization failed', e?.message)
    // If authentication failed, try automatic recovery
    if (e?.message?.includes('401') || e?.message?.includes('auth')) {
      logger.info('Detected authentication issue, attempting automatic recovery...')
      try {
        await controller.handleAuthFailure()
        await controller.backupInit() // Retry
      } catch (retryError: any) {
        logger.error('Automatic auth recovery failed', retryError?.message)
      }
    }
  }

  try {
    await controller.fullSyncAll()
  } catch (e: any) {
    logger.warn('Full sync failed', e?.message)
  }

  try {
    await controller.incrementalSyncAll()
  } catch (e: any) {
    logger.warn('Incremental sync failed', e?.message)
  }

  await controller.startAutoSync()

  const systemStatus = controller.getSystemStatus()
  logger.info('Data sync system startup completed', {
    authenticated: isAuthInitialized,
    encryptionReady: isEncryptionInitialized,
    pollingActive: systemStatus.polling.isRunning,
    systemAuth: systemStatus.auth.isValid,
    systemEncryption: systemStatus.encryption.initialized
  })

  return controller
}
