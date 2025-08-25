import { logger } from '../utils/logger'

export interface FullSyncTimerConfig {
  intervalHours: number // 定时器间隔（小时）
  enableOnStart: boolean // 启动时是否自动开启定时器
}

export interface FullSyncTimerStatus {
  isEnabled: boolean // 定时器是否启用
  isRunning: boolean // 是否正在执行全量同步
  intervalMs: number // 定时器间隔（毫秒）
  lastFullSyncTime: Date | null // 上次全量同步时间
  nextFullSyncTime: Date | null // 下次全量同步时间
  totalFullSyncs: number // 总全量同步次数
  successfulFullSyncs: number // 成功的全量同步次数
}

/**
 * 全量同步定时器管理器
 * 负责定期执行全量同步，确保本地数据与服务端保持一致
 */
export class FullSyncTimerManager {
  private config: FullSyncTimerConfig
  private status: FullSyncTimerStatus
  private timer: NodeJS.Timeout | null = null
  private isShuttingDown = false
  private fullSyncCallback: (() => Promise<void>) | null = null
  private conflictCheckCallback: (() => Promise<boolean>) | null = null

  constructor(config?: Partial<FullSyncTimerConfig>, fullSyncCallback?: () => Promise<void>, conflictCheckCallback?: () => Promise<boolean>) {
    this.config = {
      intervalHours: 1, // 默认每1小时执行一次
      enableOnStart: false, // 默认不自动启动
      ...config
    }

    this.status = {
      isEnabled: false,
      isRunning: false,
      intervalMs: this.config.intervalHours * 60 * 60 * 1000, // 转换为毫秒
      lastFullSyncTime: null,
      nextFullSyncTime: null,
      totalFullSyncs: 0,
      successfulFullSyncs: 0
    }

    this.fullSyncCallback = fullSyncCallback || null
    this.conflictCheckCallback = conflictCheckCallback || null
  }

  /**
   * 设置全量同步回调函数
   */
  setFullSyncCallback(callback: () => Promise<void>): void {
    this.fullSyncCallback = callback
    logger.debug('全量同步回调函数已设置')
  }

  /**
   * 设置冲突检查回调函数
   * 返回true表示有冲突（增量同步正在进行），应该跳过全量同步
   */
  setConflictCheckCallback(callback: () => Promise<boolean>): void {
    this.conflictCheckCallback = callback
    logger.debug('冲突检查回调函数已设置')
  }

  /**
   * 启动全量同步定时器
   */
  async start(): Promise<void> {
    if (this.status.isEnabled) {
      logger.warn('全量同步定时器已在运行中')
      return
    }

    if (!this.fullSyncCallback) {
      throw new Error('全量同步回调函数未设置，无法启动定时器')
    }

    this.status.isEnabled = true
    this.isShuttingDown = false

    // 计算下次执行时间
    this.updateNextFullSyncTime()

    logger.info(`全量同步定时器已启动，间隔: ${this.config.intervalHours}小时，下次执行: ${this.status.nextFullSyncTime?.toLocaleString()}`)

    this.scheduleNextFullSync()
  }

  /**
   * 停止全量同步定时器
   */
  async stop(): Promise<void> {
    if (!this.status.isEnabled) {
      logger.debug('全量同步定时器未运行')
      return
    }

    logger.info('开始停止全量同步定时器...')

    // 标记停止状态
    this.isShuttingDown = true
    this.status.isEnabled = false

    // 清除定时器
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    // 等待当前正在进行的全量同步操作完成（最多等待30秒）
    await this.waitForCurrentFullSync(30000)

    // 重置状态
    this.status.nextFullSyncTime = null

    logger.info('全量同步定时器已停止')
  }

  /**
   * 立即执行一次全量同步
   */
  async syncNow(): Promise<boolean> {
    if (!this.fullSyncCallback) {
      logger.error('全量同步回调函数未设置，无法执行全量同步')
      return false
    }

    if (this.status.isRunning) {
      logger.warn('全量同步正在进行中，跳过本次请求')
      return false
    }

    logger.info('手动触发全量同步...')
    return await this.performFullSync()
  }

  /**
   * 获取定时器状态
   */
  getStatus(): FullSyncTimerStatus {
    return { ...this.status }
  }

  /**
   * 更新定时器间隔
   */
  updateInterval(intervalHours: number): void {
    if (intervalHours <= 0) {
      throw new Error('定时器间隔必须大于0小时')
    }

    const oldInterval = this.config.intervalHours
    this.config.intervalHours = intervalHours
    this.status.intervalMs = intervalHours * 60 * 60 * 1000

    logger.info(`全量同步定时器间隔已更新: ${oldInterval}小时 -> ${intervalHours}小时`)

    // 如果定时器正在运行，重新调度
    if (this.status.isEnabled) {
      this.updateNextFullSyncTime()
      this.rescheduleNextFullSync()
    }
  }

  /**
   * 调度下次全量同步
   */
  private scheduleNextFullSync(): void {
    if (this.isShuttingDown || !this.status.isEnabled) {
      return
    }

    const now = new Date()
    const delay = this.status.nextFullSyncTime ? Math.max(0, this.status.nextFullSyncTime.getTime() - now.getTime()) : this.status.intervalMs

    this.timer = setTimeout(async () => {
      if (this.isShuttingDown) return

      await this.performFullSync()

      // 调度下次执行
      if (this.status.isEnabled && !this.isShuttingDown) {
        this.updateNextFullSyncTime()
        this.scheduleNextFullSync()
      }
    }, delay)

    logger.debug(`下次全量同步将在 ${Math.round(delay / 1000)} 秒后执行`)
  }

  /**
   * 重新调度下次全量同步
   */
  private rescheduleNextFullSync(): void {
    // 清除当前定时器
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    // 重新调度
    this.scheduleNextFullSync()
  }

  /**
   * 执行全量同步
   */
  private async performFullSync(): Promise<boolean> {
    if (!this.fullSyncCallback) {
      logger.error('全量同步回调函数未设置')
      return false
    }

    const startTime = Date.now()
    this.status.totalFullSyncs++

    // 检查是否有冲突检查回调
    if (this.conflictCheckCallback && (await this.conflictCheckCallback())) {
      logger.warn('检测到增量同步正在进行中，跳过本次全量同步')
      return false
    }

    this.status.isRunning = true

    try {
      logger.info('开始执行定时全量同步...')

      await this.fullSyncCallback()

      // 更新成功统计
      this.status.successfulFullSyncs++
      this.status.lastFullSyncTime = new Date()

      const duration = Date.now() - startTime
      logger.info(`定时全量同步完成，耗时: ${Math.round(duration / 1000)}秒`)

      return true
    } catch (error: any) {
      const duration = Date.now() - startTime
      logger.error(`定时全量同步失败，耗时: ${Math.round(duration / 1000)}秒`, error?.message)
      return false
    } finally {
      this.status.isRunning = false
    }
  }

  /**
   * 更新下次全量同步时间
   */
  private updateNextFullSyncTime(): void {
    const now = new Date()
    this.status.nextFullSyncTime = new Date(now.getTime() + this.status.intervalMs)
  }

  /**
   * 等待当前全量同步操作完成
   */
  private async waitForCurrentFullSync(timeoutMs: number = 30000): Promise<void> {
    if (!this.status.isRunning) {
      return
    }

    try {
      const startTime = Date.now()

      logger.info('等待当前全量同步操作完成...')

      while (this.status.isRunning && Date.now() - startTime < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }

      if (this.status.isRunning) {
        logger.warn('全量同步操作超时，强制停止')
      } else {
        logger.info('当前全量同步操作已完成')
      }
    } catch (error) {
      logger.error('等待全量同步操作完成时出错:', error)
    }
  }

  /**
   * 清理资源
   */
  async destroy(): Promise<void> {
    try {
      logger.info('开始清理全量同步定时器资源...')

      await this.stop()
      this.fullSyncCallback = null
      this.conflictCheckCallback = null

      logger.info('全量同步定时器资源已清理完成')
    } catch (error) {
      logger.error('清理全量同步定时器资源时出错:', error)
    }
  }
}
