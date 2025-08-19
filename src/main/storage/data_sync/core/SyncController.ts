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

  // 简化的实时同步
  private static instance: SyncController | null = null

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

    // 设置全局实例，用于静态方法调用
    SyncController.instance = this
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

  async initializeAuth(): Promise<void> {
    // 直接获取认证信息，getAuthToken() 内部已包含有效性检查
    const currentToken = await this.api.getAuthToken()
    const currentUserId = await this.api.getCurrentUserId()

    // 添加调试信息
    logger.info(`认证初始化调试信息:`, {
      hasToken: !!currentToken,
      tokenLength: currentToken?.length || 0,
      tokenPrefix: currentToken?.substring(0, 20) + '...',
      userId: currentUserId,
      authStatus: this.api.getAuthStatus()
    })

    if (!currentToken || !currentUserId) {
      throw new Error('未找到有效的认证令牌。请确保已通过主应用登录')
    }

    this.encryptionService.setAuthInfo(currentToken, currentUserId)
    logger.info(`已使用现有认证信息，用户 ${currentUserId}，已同步到加密服务`)
  }

  async backupInit(): Promise<void> {
    const res = await this.api.backupInit()
    logger.info(`备份初始化: ${res.message}`, res.table_mappings)
  }

  async fullSyncAll(): Promise<{ success: boolean; message: string; synced_count?: number; failed_count?: number }> {
    const lastSeq = this.db.getLastSequenceId()

    // 检查是否有历史数据需要同步
    const hasHistoricalData = await this.checkForHistoricalData()

    // //临时修改：强制执行全量同步用于测试
    // 🔍 调试日志：跟踪同步流程
    logger.info('🔍 SyncController.smartFullSync - 开始智能全量同步')
    logger.info(`🔍 参数: lastSeq=${lastSeq}, hasHistoricalData=${hasHistoricalData}`)

    // if (lastSeq > 0 && !hasHistoricalData) {
    //   logger.info('检测到已初始化(last_sequence_id>0)且无历史数据，跳过全量同步')
    //   return { success: true, message: '已初始化，跳过全量同步', synced_count: 0, failed_count: 0 }
    // }

    logger.info(`临时测试模式：强制执行全量同步 (lastSeq=${lastSeq}, hasHistoricalData=${hasHistoricalData})`)

    if (hasHistoricalData) {
      logger.info('检测到历史数据需要同步，执行全量同步...')
    } else {
      logger.info('开始强制全量同步（测试模式）...')
    }

    try {
      // 智能全量同步 - 根据数据量自动选择最优模式
      await this.smartFullSync('t_assets_sync')
      await this.smartFullSync('t_asset_chains_sync')

      const message = hasHistoricalData ? '历史数据同步完成（测试模式）' : '强制全量同步完成（测试模式）'
      logger.info(message)
      return { success: true, message, synced_count: 2, failed_count: 0 }
    } catch (error: any) {
      const errorMessage = hasHistoricalData ? '历史数据同步失败（测试模式）' : '强制全量同步失败（测试模式）'
      logger.error(`${errorMessage}:`, error)
      return { success: false, message: `${errorMessage}: ${error?.message || error}`, synced_count: 0, failed_count: 1 }
    }
  }

  /**
   * 检查是否有历史数据需要同步
   * 历史数据指：存在于本地数据表中但不在change_log中的数据
   */
  private async checkForHistoricalData(): Promise<boolean> {
    try {
      logger.info('🔍 开始检查历史数据...')

      // 检查 t_assets 表
      const assetsCount = this.db.getHistoricalDataCount('t_assets')
      // 检查 t_asset_chains 表
      const chainsCount = this.db.getHistoricalDataCount('t_asset_chains')

      const hasHistoricalData = assetsCount > 0 || chainsCount > 0

      logger.info(`📊 历史数据检测结果: t_assets=${assetsCount}条, t_asset_chains=${chainsCount}条, 需要同步=${hasHistoricalData}`)

      return hasHistoricalData
    } catch (error) {
      logger.warn('⚠️ 检查历史数据失败，默认执行全量同步:', error)
      return true // 出错时保守处理，执行全量同步
    }
  }

  /**
   * 智能全量同步 - 真正的全量同步，包含上传和下载
   */
  private async smartFullSync(tableName: string): Promise<void> {
    try {
      logger.info(`开始智能全量同步: ${tableName}`)

      // 第1步：上传本地历史数据（如果有的话）
      await this.safeBatchSync.performSafeBatchSync(tableName, 500, (current: number, total: number, percentage: number) => {
        logger.info(`${tableName} 上传进度: ${current}/${total} (${percentage}%)`)
      })

      // 第2步：从服务端全量下载数据
      logger.info(`开始从服务端全量下载: ${tableName}`)
      const downloadedCount = await this.engine.fullSyncAndApply(tableName)
      logger.info(`${tableName} 全量下载完成: ${downloadedCount} 条`)
    } catch (error) {
      logger.error(`${tableName} 智能全量同步失败:`, error)
      throw error
    }
  }

  async incrementalSyncAll(): Promise<{ success: boolean; message: string; synced_count?: number; failed_count?: number }> {
    try {
      // 服务端分配的表名是 sync 表，如 t_assets_sync / t_asset_chains_sync
      // 使用智能同步，自动根据数据量选择最优方案
      await this.engine.incrementalSyncSmart('t_assets_sync')
      await this.engine.incrementalSyncSmart('t_asset_chains_sync')

      // 下载并应用云端变更
      await this.engine.downloadAndApplyCloudChanges()

      logger.info('增量同步完成')
      return { success: true, message: '增量同步完成', synced_count: 2, failed_count: 0 }
    } catch (error: any) {
      logger.error('增量同步失败:', error)
      return { success: false, message: `增量同步失败: ${error?.message || error}`, synced_count: 0, failed_count: 1 }
    }
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

  /**
   * 检查认证状态
   */
  async isAuthenticated(): Promise<boolean> {
    return await this.api.isAuthenticated()
  }

  /**
   * 获取认证状态详情
   */
  getAuthStatus() {
    return this.api.getAuthStatus()
  }

  /**
   * 处理认证失败的情况
   * 当API调用返回401时，直接停止同步操作
   */
  async handleAuthFailure(): Promise<boolean> {
    try {
      logger.warn('检测到认证失败，停止同步操作')

      // 停止所有同步操作
      await this.stopAutoSync()

      logger.info('已停止同步操作，请通过主应用重新登录以恢复同步功能')
      return false
    } catch (error) {
      logger.error('停止同步操作时出错:', error)
      return false
    }
  }

  /**
   * 获取系统状态
   */
  getSystemStatus() {
    return {
      polling: this.pollingManager.getStatus(),
      fullSyncTimer: this.fullSyncTimer.getStatus(),
      encryption: this.encryptionService.getStatus(),
      auth: this.api.getAuthStatus(),
      database: {
        path: 'database',
        lastSequenceId: this.db.getLastSequenceId()
      }
    }
  }

  /**
   * 获取同步统计信息
   */
  getSyncStats() {
    return {
      lastSequenceId: this.db.getLastSequenceId(),
      pendingChanges: this.db.getPendingChanges?.()?.length || 0,
      pollingStatus: this.pollingManager.getStatus(),
      fullSyncStatus: this.fullSyncTimer.getStatus(),
      encryptionStatus: this.encryptionService.getStatus()
    }
  }

  /**
   * 静态方法：触发增量同步
   * 可以从任何地方调用，用于数据变更后立即触发同步
   */
  static async triggerIncrementalSync(): Promise<void> {
    try {
      if (!SyncController.instance) {
        logger.warn('⚠️ SyncController 实例未初始化，跳过增量同步触发')
        return
      }

      const instance = SyncController.instance

      // 检查是否有正在进行的同步操作
      const pollingStatus = instance.pollingManager.getStatus()
      if (pollingStatus.isPerforming) {
        logger.debug('⏸️ 增量同步正在进行中，跳过触发')
        return
      }

      // 检查认证状态
      if (!(await instance.isAuthenticated())) {
        logger.debug('⚠️ 认证失效，跳过增量同步触发')
        return
      }

      logger.info('🚀 数据变更触发增量同步')

      // 执行增量同步
      const result = await instance.incrementalSyncAll()

      if (result.success) {
        logger.info(`触发的增量同步完成: 同步${result.synced_count}个表`)
      } else {
        logger.warn(`⚠️ 触发的增量同步失败: ${result.message}`)
      }
    } catch (error) {
      logger.error('💥 触发增量同步异常:', error)
      // 不抛出异常，避免影响数据库操作
    }
  }
}
