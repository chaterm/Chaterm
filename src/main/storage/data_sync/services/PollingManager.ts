import { ApiClient } from '../core/ApiClient'
import { DatabaseManager } from '../core/DatabaseManager'
import { SyncEngine } from '../core/SyncEngine'
import { logger } from '../utils/logger'

export interface PollingConfig {
  initialInterval: number // 初始轮询间隔(ms)
  maxInterval: number // 最大轮询间隔(ms)
  minInterval: number // 最小轮询间隔(ms)
  backoffMultiplier: number // 退避倍数
  adaptivePolling: boolean // 是否启用自适应轮询
}

export interface PollingStatus {
  isRunning: boolean
  isPerforming: boolean
  currentInterval: number
  lastPollTime: Date | null
  consecutiveErrors: number
  totalPolls: number
  successfulPolls: number
}

export class PollingManager {
  private config: PollingConfig
  private status: PollingStatus
  private pollingTimer: NodeJS.Timeout | null = null
  private isShuttingDown = false

  constructor(
    private db: DatabaseManager,
    _api: ApiClient,
    private syncEngine: SyncEngine,
    config?: Partial<PollingConfig>
  ) {
    this.config = {
      initialInterval: 30000, // 30秒
      maxInterval: 300000, // 5分钟
      minInterval: 10000, // 10秒
      backoffMultiplier: 1.5,
      adaptivePolling: true,
      ...config
    }

    this.status = {
      isRunning: false,
      isPerforming: false,
      currentInterval: this.config.initialInterval,
      lastPollTime: null,
      consecutiveErrors: 0,
      totalPolls: 0,
      successfulPolls: 0
    }
  }

  /**
   * 启动轮询
   */
  async startPolling(): Promise<void> {
    if (this.status.isRunning) {
      logger.warn('轮询已在运行中')
      return
    }

    this.status.isRunning = true
    this.isShuttingDown = false
    logger.info(`开始轮询同步，间隔: ${this.status.currentInterval}ms`)

    this.scheduleNextPoll()
  }

  /**
   * 停止轮询
   */
  async stopPolling(): Promise<void> {
    if (!this.status.isRunning) {
      return
    }

    logger.info('开始停止轮询同步...')

    // 标记停止状态
    this.isShuttingDown = true
    this.status.isRunning = false

    // 清除定时器
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer)
      this.pollingTimer = null
    }

    // 等待当前正在进行的轮询操作完成（最多等待1.5秒）
    await this.waitForCurrentPoll(1500)

    logger.info('轮询同步已停止')
  }

  /**
   * 等待当前轮询操作完成
   */
  private async waitForCurrentPoll(timeoutMs: number = 1500): Promise<void> {
    try {
      const startTime = Date.now()

      // 检查是否有正在进行的轮询操作
      while (this.status.isPerforming && Date.now() - startTime < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      if (this.status.isPerforming) {
        logger.warn('轮询操作超时，强制停止')
      } else {
        logger.info('当前轮询操作已完成')
      }
    } catch (error) {
      logger.error('等待轮询操作完成时出错:', error)
    }
  }

  /**
   * 检查是否有正在进行的轮询操作
   * 目前未使用，保留供将来参考
   */
  /*
  private _isPollingInProgress(): boolean {
    return this.status.isPerforming
  }
  */

  /**
   * 立即执行一次轮询
   */
  async pollNow(): Promise<boolean> {
    return await this.performPoll()
  }

  /**
   * 获取轮询状态
   */
  getStatus(): PollingStatus {
    return { ...this.status }
  }

  /**
   * 调度下次轮询
   */
  private scheduleNextPoll(): void {
    if (this.isShuttingDown || !this.status.isRunning) {
      return
    }

    this.pollingTimer = setTimeout(async () => {
      if (this.isShuttingDown) return

      await this.performPoll()
      this.scheduleNextPoll()
    }, this.status.currentInterval)
  }

  /**
   * 执行轮询检查
   */
  private async performPoll(): Promise<boolean> {
    const startTime = Date.now()
    this.status.totalPolls++
    this.status.lastPollTime = new Date()

    // 标记轮询进行中
    this.status.isPerforming = true

    try {
      logger.debug('开始轮询检查')

      // 1. 上传本地变更
      const uploadResult = await this.uploadLocalChanges()

      // 2. 下载云端变更
      const downloadResult = await this.downloadCloudChanges()

      // 3. 处理成功
      this.handlePollSuccess(uploadResult.hasChanges || downloadResult.hasChanges)

      const duration = Date.now() - startTime
      logger.info(`轮询完成: 上传${uploadResult.count}条, 下载${downloadResult.count}条, 耗时${duration}ms`)

      return true
    } catch (error: any) {
      // 检查是否是网络连接错误
      if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
        // 网络错误时，不记录为失败，只记录警告
        logger.debug('服务器不可用，本次轮询跳过')
        this.handlePollError(error)
        return true // 返回 true 表示轮询正常完成，只是服务器不可用
      }

      this.handlePollError(error)
      return false
    } finally {
      // 清除进行中标志
      this.status.isPerforming = false
    }
  }

  /**
   * 上传本地变更
   */
  private async uploadLocalChanges(): Promise<{ hasChanges: boolean; count: number }> {
    try {
      // 检查是否有待同步的变更
      const pendingChanges = this.db.getPendingChanges()
      if (pendingChanges.length === 0) {
        return { hasChanges: false, count: 0 }
      }

      // 按表名分组上传
      const assetChanges = pendingChanges.filter((c) => c.table_name === 't_assets_sync')
      const chainChanges = pendingChanges.filter((c) => c.table_name === 't_asset_chains_sync')

      let totalUploaded = 0

      if (assetChanges.length > 0) {
        try {
          const result = await this.syncEngine.incrementalSync('t_assets_sync')
          totalUploaded += result.synced_count || 0
        } catch (error: any) {
          if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
            logger.warn('服务器不可用，跳过 t_assets_sync 上传')
          } else {
            throw error
          }
        }
      }

      if (chainChanges.length > 0) {
        try {
          const result = await this.syncEngine.incrementalSync('t_asset_chains_sync')
          totalUploaded += result.synced_count || 0
        } catch (error: any) {
          if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
            logger.warn('服务器不可用，跳过 t_asset_chains_sync 上传')
          } else {
            throw error
          }
        }
      }

      return { hasChanges: totalUploaded > 0, count: totalUploaded }
    } catch (error: any) {
      // 检查是否是网络连接错误
      if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
        logger.warn('服务器不可用，跳过本地变更上传')
        return { hasChanges: false, count: 0 }
      }
      logger.error('上传本地变更失败', error)
      throw error
    }
  }

  /**
   * 下载云端变更
   */
  private async downloadCloudChanges(): Promise<{ hasChanges: boolean; count: number }> {
    try {
      const result = await this.syncEngine.downloadAndApplyCloudChanges()
      return { hasChanges: result.applied > 0, count: result.applied }
    } catch (error: any) {
      // 检查是否是网络连接错误
      if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
        logger.warn('服务器不可用，跳过云端变更下载')
        return { hasChanges: false, count: 0 }
      }
      logger.error('下载云端变更失败', error)
      throw error
    }
  }

  /**
   * 处理轮询成功
   */
  private handlePollSuccess(hasChanges: boolean): void {
    this.status.successfulPolls++
    this.status.consecutiveErrors = 0

    if (this.config.adaptivePolling) {
      this.adjustPollingInterval(hasChanges)
    }
  }

  /**
   * 处理轮询错误
   */
  private handlePollError(error: any): void {
    // 检查是否是网络连接错误
    if (error.message === 'NETWORK_UNAVAILABLE' || error.isNetworkError) {
      // 网络错误不计入连续错误次数，但记录警告
      logger.warn('服务器不可用，轮询将继续尝试')
      return
    }

    this.status.consecutiveErrors++
    logger.error(`轮询失败 (连续${this.status.consecutiveErrors}次)`, error?.message)

    // 指数退避
    if (this.status.consecutiveErrors > 1) {
      const backoffInterval = Math.min(
        this.config.maxInterval,
        this.status.currentInterval * Math.pow(this.config.backoffMultiplier, this.status.consecutiveErrors - 1)
      )
      this.status.currentInterval = backoffInterval
      logger.warn(`调整轮询间隔为: ${this.status.currentInterval}ms`)
    }
  }

  /**
   * 自适应调整轮询间隔
   */
  private adjustPollingInterval(hasChanges: boolean): void {
    if (hasChanges) {
      // 有变更时缩短间隔
      this.status.currentInterval = Math.max(this.config.minInterval, this.status.currentInterval * 0.8)
    } else {
      // 无变更时延长间隔
      this.status.currentInterval = Math.min(this.config.maxInterval, this.status.currentInterval * 1.2)
    }

    logger.debug(`调整轮询间隔为: ${this.status.currentInterval}ms`)
  }
}
