import { SyncController } from './core/SyncController'
const logger = createLogger('sync')

export class AuthExpiredError extends Error {
  code = 'AUTH_EXPIRED'

  constructor() {
    super('AUTH_EXPIRED')
    this.name = 'AuthExpiredError'
  }
}

export async function startDataSync(dbPath?: string, onAuthFailure?: () => void): Promise<SyncController> {
  // Set when ApiClient fires a 401 during startup so we can abort before startAutoSync.
  let authFailedDuringStartup = false

  const controller = new SyncController(dbPath, {
    onAuthFailure: () => {
      authFailedDuringStartup = true
      onAuthFailure?.()
    }
  })

  const abortStartupForAuthFailure = async (message: string): Promise<never> => {
    logger.warn(message)
    await controller.destroy()
    throw new AuthExpiredError()
  }

  // Unified auth check and encryption service initialization (only during data sync startup)
  let isAuthInitialized = false
  let isEncryptionInitialized = false

  try {
    await controller.initializeAuth()
    isAuthInitialized = true
    logger.info('Auth check successful, synced to encryption service')
  } catch (e: any) {
    logger.warn('Auth check failed, sync functionality may be limited', { error: e?.message })
    logger.info('Note: Please ensure the main application has completed login authentication')
  }

  // Only initialize encryption after successful authentication
  if (isAuthInitialized) {
    try {
      await controller.initializeEncryption()
      isEncryptionInitialized = true
      logger.info('Encryption service initialization completed')
    } catch (e: any) {
      logger.warn('Encryption initialization failed', { error: e?.message })
    }
  } else {
    logger.warn('Skipping encryption service initialization due to failed authentication')
  }

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
      logger.warn('Auth status check exception', { error: e?.message })
    }
  } else {
    logger.info('Auth status is normal (reusing initialization result)')
  }

  try {
    await controller.backupInit()
  } catch (e: any) {
    logger.warn('Backup initialization failed', { error: e?.message })
  }

  // If a 401 was received at any point during startup, abort before starting the polling loop.
  // Caller (main/index.ts) keeps dataSyncController null so a subsequent disable IPC is not needed.
  if (authFailedDuringStartup) {
    await abortStartupForAuthFailure('Auth failure detected during startup, aborting data sync startup')
  }

  try {
    await controller.incrementalSyncAll()
  } catch (e: any) {
    logger.warn('Incremental sync failed', { error: e?.message })
  }

  if (authFailedDuringStartup) {
    await abortStartupForAuthFailure('Auth failure detected after incremental sync, aborting data sync startup')
  }

  try {
    await controller.fullSyncAll()
  } catch (e: any) {
    logger.warn('Full sync failed', { error: e?.message })
  }

  if (authFailedDuringStartup) {
    await abortStartupForAuthFailure('Auth failure detected after full sync, aborting data sync startup')
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
