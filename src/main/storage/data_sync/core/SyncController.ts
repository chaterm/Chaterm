import { ApiClient } from './ApiClient'
import { DatabaseManager } from './DatabaseManager'
import { SyncEngine } from './SyncEngine'
import { PollingManager } from '../services/PollingManager'
import { SafeBatchSyncManager } from './SafeBatchSyncManager'
import { FullSyncTimerManager } from '../services/FullSyncTimerManager'
import { syncConfig } from '../config/sync.config'
import { logger } from '../utils/logger'
import { EnvelopeEncryptionService } from '../envelope_encryption/service'
import { setEncryptionService } from '../services/EncryptionRegistry'
import type { EncryptionServiceStatus } from '../envelope_encryption/service'

export class SyncController {
  private api: ApiClient
  private db: DatabaseManager
  private engine: SyncEngine
  private pollingManager: PollingManager
  private safeBatchSync: SafeBatchSyncManager
  private fullSyncTimer: FullSyncTimerManager
  private encryptionService: EnvelopeEncryptionService

  constructor(dbPathOverride?: string) {
    this.api = new ApiClient()
    const dbPath = dbPathOverride || syncConfig.dbPath
    this.db = new DatabaseManager(dbPath)
    this.engine = new SyncEngine(this.db, this.api)
    this.pollingManager = new PollingManager(this.db, this.api, this.engine, {
      initialInterval: syncConfig.syncIntervalMs,
      adaptivePolling: true
    })
    this.safeBatchSync = new SafeBatchSyncManager(this.api, this.db)

    // 初始化全量同步定时器
    this.fullSyncTimer = new FullSyncTimerManager(
      {
        intervalHours: 1, // 每1小时执行一次全量同步
        enableOnStart: false // 不自动启动，由数据同步开关控制
      },
      // 全量同步回调函数
      async () => {
        await this.performScheduledFullSync()
      },
      // 冲突检查回调函数：检查增量同步是否正在进行
      async () => {
        const pollingStatus = this.pollingManager.getStatus()
        return pollingStatus.isPerforming // 返回true表示增量同步正在进行，需要跳过全量同步
      }
    )

    // Initialize envelope encryption service and place in registry for data_sync usage
    this.encryptionService = new EnvelopeEncryptionService()
    setEncryptionService(this.encryptionService)
  }

  async initializeEncryption(userId?: string): Promise<void> {
    try {
      const r = await this.encryptionService.initialize(userId, true)
      if (!r.success) {
        logger.warn(`加密服务初始化失败: ${r.message}`)
      } else {
        logger.info('加密服务初始化成功')
      }
    } catch (e: any) {
      logger.warn('加密服务初始化异常', e?.message)
    }
  }

  /**
   * Get encryption service status
   */
  getEncryptionStatus(): EncryptionServiceStatus {
    return this.encryptionService.getStatus()
  }

  /**
   * Whether encryption service is ready for use
   */
  isEncryptionReady(): boolean {
    return this.encryptionService.getStatus().initialized === true
  }

  async initializeAndLogin(): Promise<void> {
    if (!syncConfig.username || !syncConfig.password) {
      throw new Error('缺少用户名或密码，请设置环境变量 USERNAME 与 PASSWORD')
    }
    const info = await this.api.login(syncConfig.username, syncConfig.password)
    logger.info(`用户 ${info.user_id} 登录，设备 ${info.device_id}`)
  }

  async backupInit(): Promise<void> {
    const res = await this.api.backupInit()
    logger.info(`备份初始化: ${res.message}`, res.table_mappings)
  }

  async fullSyncAll(): Promise<void> {
    const lastSeq = this.db.getLastSequenceId()
    if (lastSeq > 0) {
      logger.info('检测到已初始化(last_sequence_id>0)，跳过全量同步')
      return
    }

    logger.info('开始智能首次同步...')

    // 智能全量同步 - 根据数据量自动选择最优模式
    await this.smartFullSync('t_assets_sync')
    await this.smartFullSync('t_asset_chains_sync')

    logger.info('智能首次同步完成')
  }

  /**
   * 统一安全同步 - 使用SafeBatchSyncManager统一处理所有场景
   */
  private async smartFullSync(tableName: string): Promise<void> {
    try {
      logger.info(`开始统一安全同步: ${tableName}`)

      // 使用统一的安全分批同步管理器
      // 内部会根据数据量和本地修改情况自动选择最优策略
      await this.safeBatchSync.performSafeBatchSync(tableName, 500, (current: number, total: number, percentage: number) => {
        logger.info(`${tableName} 同步进度: ${current}/${total} (${percentage}%)`)
      })
    } catch (error) {
      logger.error(`${tableName} 统一安全同步失败:`, error)
      throw error
    }
  }

  async incrementalSyncAll(): Promise<void> {
    // 服务端分配的表名是 sync 表，如 t_assets_sync / t_asset_chains_sync
    // 使用智能同步，自动根据数据量选择最优方案
    await this.engine.incrementalSyncSmart('t_assets_sync')
    await this.engine.incrementalSyncSmart('t_asset_chains_sync')

    // 下载并应用云端变更
    await this.engine.downloadAndApplyCloudChanges()
  }

  /**
   * 手动触发智能增量同步
   */
  async smartIncrementalSyncAll(): Promise<{ assets: any; chains: any }> {
    const assetsResult = await this.engine.incrementalSyncSmart('t_assets_sync')
    const chainsResult = await this.engine.incrementalSyncSmart('t_asset_chains_sync')

    // 下载并应用云端变更
    await this.engine.downloadAndApplyCloudChanges()

    return {
      assets: assetsResult,
      chains: chainsResult
    }
  }

  /**
   * 执行定时全量同步（由FullSyncTimerManager调用）
   */
  private async performScheduledFullSync(): Promise<void> {
    const wasRunning = this.pollingManager.getStatus().isRunning
    try {
      logger.info('开始定时全量同步...')

      // 暂停增量同步轮询，避免冲突
      if (wasRunning) {
        await this.pollingManager.stopPolling()
      }

      // 执行全量同步
      await this.smartFullSync('t_assets_sync')
      await this.smartFullSync('t_asset_chains_sync')

      logger.info('定时全量同步完成')
    } catch (error) {
      logger.error('定时全量同步失败:', error)
      throw error // 让FullSyncTimerManager记录失败
    } finally {
      // 恢复增量同步轮询
      if (wasRunning) {
        await this.pollingManager.startPolling()
      }
    }
  }

  /**
   * 启动自动轮询同步
   */
  async startAutoSync(): Promise<void> {
    await this.pollingManager.startPolling()
    await this.fullSyncTimer.start()
    logger.info('自动同步已启动（包括增量同步轮询和全量同步定时器）')
  }

  /**
   * 停止自动轮询同步
   */
  async stopAutoSync(): Promise<void> {
    await this.fullSyncTimer.stop()
    await this.pollingManager.stopPolling()
    logger.info('自动同步已停止（包括增量同步轮询和全量同步定时器）')
  }

  /**
   * 获取轮询状态
   */
  getPollingStatus() {
    return this.pollingManager.getStatus()
  }

  /**
   * 立即执行一次增量同步
   */
  async syncNow(): Promise<boolean> {
    return await this.pollingManager.pollNow()
  }

  /**
   * 立即执行一次全量同步
   */
  async fullSyncNow(): Promise<boolean> {
    return await this.fullSyncTimer.syncNow()
  }

  /**
   * 获取全量同步定时器状态
   */
  getFullSyncTimerStatus() {
    return this.fullSyncTimer.getStatus()
  }

  /**
   * 更新全量同步间隔
   */
  updateFullSyncInterval(intervalHours: number): void {
    this.fullSyncTimer.updateInterval(intervalHours)
  }

  /**
   * 清理资源
   */
  async destroy(): Promise<void> {
    try {
      logger.info('开始清理同步控制器资源...')

      // 1. 停止自动轮询同步和全量同步定时器
      await this.stopAutoSync()

      // 2. 等待当前正在进行的同步操作完成（最多等待5秒）
      await this.waitForCurrentSync()

      // 3. 清理全量同步定时器资源
      await this.fullSyncTimer.destroy()

      // 4. 清理API资源
      this.api.destroy()

      logger.info('同步控制器资源已清理完成')
    } catch (error) {
      logger.error('清理同步控制器资源时出错:', error)
    }
  }

  /**
   * 等待当前同步操作完成
   */
  private async waitForCurrentSync(timeoutMs: number = 5000): Promise<void> {
    try {
      const startTime = Date.now()

      // 检查是否有正在进行的同步操作
      while (this.isSyncInProgress() && Date.now() - startTime < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      if (this.isSyncInProgress()) {
        logger.warn('同步操作超时，强制停止')
      } else {
        logger.info('当前同步操作已完成')
      }
    } catch (error) {
      logger.error('等待同步操作完成时出错:', error)
    }
  }

  /**
   * 检查是否有正在进行的同步操作
   */
  private isSyncInProgress(): boolean {
    // 检查轮询状态和全量同步状态
    const pollingStatus = this.pollingManager.getStatus()
    const fullSyncStatus = this.fullSyncTimer.getStatus()
    return pollingStatus.isRunning || fullSyncStatus.isRunning
  }
}
