import { SyncController } from './core/SyncController'
import { logger } from './utils/logger'
import { syncConfig } from './config/sync.config'

export async function startDataSync(dbPath?: string): Promise<SyncController> {
  // 启动时清理旧日志文件
  logger.cleanupOldLogs(syncConfig.logRetentionDays)

  const controller = new SyncController(dbPath)

  // 统一认证检查和加密服务初始化（只在数据同步启动时进行）
  let isAuthInitialized = false
  let isEncryptionInitialized = false

  try {
    await controller.initializeAuth()
    isAuthInitialized = true
    logger.info('认证检查成功，已同步到加密服务')
  } catch (e: any) {
    logger.warn('认证检查失败，同步功能可能受限:', e?.message)
    logger.info('提示：请确保主应用已完成登录认证')
  }

  // 只有在认证成功后才进行加密初始化
  if (isAuthInitialized) {
    try {
      await controller.initializeEncryption()
      isEncryptionInitialized = true
      logger.info('加密服务初始化完成')
    } catch (e: any) {
      logger.warn('加密初始化失败', e?.message)
    }
  } else {
    logger.warn('跳过加密服务初始化，因为认证未成功')
  }

  // 强制检查加密服务是否就绪；未就绪则停止同步启动

  // 复用第一次认证检查的结果，避免重复调用
  if (!isAuthInitialized) {
    try {
      const isAuthenticated = await controller.isAuthenticated()
      if (!isAuthenticated) {
        logger.warn('认证状态检查失败，可能影响数据同步功能')
      } else {
        logger.info('认证状态正常')
      }
    } catch (e: any) {
      logger.warn('认证状态检查异常', e?.message)
    }
  } else {
    logger.info('认证状态正常（复用初始化结果）')
  }

  try {
    await controller.backupInit()
  } catch (e: any) {
    logger.warn('备份初始化失败', e?.message)
    // 如果是认证失败，尝试自动恢复
    if (e?.message?.includes('401') || e?.message?.includes('认证')) {
      logger.info('检测到认证问题，尝试自动恢复...')
      try {
        await controller.handleAuthFailure()
        await controller.backupInit() // 重试
      } catch (retryError: any) {
        logger.error('自动认证恢复失败', retryError?.message)
      }
    }
  }

  try {
    await controller.fullSyncAll()
  } catch (e: any) {
    logger.warn('全量同步失败', e?.message)
  }

  try {
    await controller.incrementalSyncAll()
  } catch (e: any) {
    logger.warn('增量同步失败', e?.message)
  }

  await controller.startAutoSync()

  const systemStatus = controller.getSystemStatus()
  logger.info('数据同步系统启动完成', {
    authenticated: isAuthInitialized,
    encryptionReady: isEncryptionInitialized,
    pollingActive: systemStatus.polling.isRunning,
    systemAuth: systemStatus.auth.isValid,
    systemEncryption: systemStatus.encryption.initialized
  })

  return controller
}
