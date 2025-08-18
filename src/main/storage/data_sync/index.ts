import { SyncController } from './core/SyncController'
import { logger } from './utils/logger'
import { syncConfig } from './config/sync.config'

export async function startDataSync(dbPath?: string): Promise<SyncController> {
  // 启动时清理旧日志文件
  logger.cleanupOldLogs(syncConfig.logRetentionDays)

  const controller = new SyncController(dbPath)

  // 🔧 统一认证检查和初始化
  try {
    await controller.initializeAuth()
    logger.info('认证检查成功，已同步到加密服务')
  } catch (e: any) {
    logger.warn('认证检查失败，同步功能可能受限:', e?.message)
    logger.info('提示：请确保主应用已完成登录认证')
  }

  try {
    await controller.initializeEncryption()
    logger.info('加密服务初始化完成')
  } catch (e: any) {
    logger.warn('加密初始化失败', e?.message)
  }

  // 强制检查加密服务是否就绪；未就绪则停止同步启动
  // 在测试环境中可以跳过加密检查
  if (process.env.SKIP_ENCRYPTION_CHECK !== 'true') {
    try {
      if (!controller.isEncryptionReady()) {
        const status = controller.getEncryptionStatus()
        throw new Error(`Envelope encryption not ready, aborting data sync. status=${JSON.stringify(status)}`)
      }
    } catch (err: any) {
      logger.error('Pre-start check failed: encryption service not ready', err?.message)
      throw err
    }
  } else {
    logger.info('跳过加密服务检查（测试模式）')
  }

  // 🔧 检查认证状态
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
    authenticated: systemStatus.auth.isValid,
    encryptionReady: systemStatus.encryption.initialized,
    pollingActive: systemStatus.polling.isRunning
  })

  return controller
}
