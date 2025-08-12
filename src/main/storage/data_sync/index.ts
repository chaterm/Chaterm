import { SyncController } from './core/SyncController'
import { logger } from './utils/logger'

export async function startDataSync(dbPath?: string): Promise<SyncController> {
  const controller = new SyncController(dbPath)
  try {
    await controller.initializeAndLogin()
  } catch (e: any) {
    logger.warn('登录失败，继续以未登录状态运行同步（若服务端需要登录则可能失败）', e?.message)
  }
  try {
    await controller.initializeEncryption()
  } catch (e: any) {
    logger.warn('加密初始化失败', e?.message)
  }

  try {
    await controller.backupInit()
  } catch (e: any) {
    logger.warn('备份初始化失败', e?.message)
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
  return controller
}
