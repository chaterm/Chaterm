/**
 * 同步状态管理器
 * 负责全量同步和增量同步的互斥控制，确保数据一致性
 */

import { logger } from '../utils/logger'

export enum SyncType {
  NONE = 'none',
  FULL = 'full',
  INCREMENTAL = 'incremental'
}

export enum SyncState {
  IDLE = 'idle', // 空闲状态
  RUNNING = 'running', // 同步进行中
  PAUSED = 'paused', // 暂停状态
  ERROR = 'error' // 错误状态
}

export interface SyncStatus {
  type: SyncType
  state: SyncState
  startTime?: Date
  progress?: number // 0-100
  message?: string
  error?: Error
}

/**
 * 同步状态管理器
 * 实现同步操作的互斥控制和状态管理
 */
export class SyncStateManager {
  private currentStatus: SyncStatus = {
    type: SyncType.NONE,
    state: SyncState.IDLE
  }

  private pendingOperations: Array<{
    type: SyncType
    priority: number
    resolve: () => void
    reject: (error: Error) => void
  }> = []

  private listeners: Array<(status: SyncStatus) => void> = []

  /**
   * 获取当前同步状态
   */
  getCurrentStatus(): SyncStatus {
    return { ...this.currentStatus }
  }

  /**
   * 检查是否可以开始指定类型的同步
   */
  canStartSync(type: SyncType): boolean {
    // 空闲状态可以开始任何同步
    if (this.currentStatus.state === SyncState.IDLE) {
      return true
    }

    // 如果当前正在进行同步，需要检查优先级
    if (this.currentStatus.state === SyncState.RUNNING) {
      // 全量同步优先级最高，可以中断增量同步
      if (type === SyncType.FULL && this.currentStatus.type === SyncType.INCREMENTAL) {
        return true
      }
      // 其他情况不允许中断
      return false
    }

    return false
  }

  /**
   * 请求开始同步（带排队机制）
   */
  async requestSync(type: SyncType): Promise<void> {
    if (this.canStartSync(type)) {
      // 如果可以立即开始，直接执行
      await this.startSync(type)
      return
    }

    // 否则进入等待队列
    return new Promise((resolve, reject) => {
      const priority = type === SyncType.FULL ? 1 : 2 // 全量同步优先级更高
      this.pendingOperations.push({ type, priority, resolve, reject })

      // 按优先级排序
      this.pendingOperations.sort((a, b) => a.priority - b.priority)

      logger.info(`同步请求已排队: ${type}, 队列长度: ${this.pendingOperations.length}`)
    })
  }

  /**
   * 开始同步
   */
  private async startSync(type: SyncType): Promise<void> {
    // 如果需要中断当前同步
    if (this.currentStatus.state === SyncState.RUNNING && type === SyncType.FULL && this.currentStatus.type === SyncType.INCREMENTAL) {
      logger.warn('全量同步中断增量同步')
      await this.pauseCurrentSync()
    }

    this.updateStatus({
      type,
      state: SyncState.RUNNING,
      startTime: new Date(),
      progress: 0,
      message: `开始${type === SyncType.FULL ? '全量' : '增量'}同步`
    })

    logger.info(`开始${type === SyncType.FULL ? '全量' : '增量'}同步`)
  }

  /**
   * 更新同步进度
   */
  updateProgress(progress: number, message?: string): void {
    if (this.currentStatus.state === SyncState.RUNNING) {
      this.updateStatus({
        ...this.currentStatus,
        progress: Math.max(0, Math.min(100, progress)),
        message
      })
    }
  }

  /**
   * 完成同步
   */
  async finishSync(): Promise<void> {
    if (this.currentStatus.state !== SyncState.RUNNING) {
      logger.warn('尝试完成非运行状态的同步')
      return
    }

    const syncType = this.currentStatus.type
    const duration = this.currentStatus.startTime ? Date.now() - this.currentStatus.startTime.getTime() : 0

    this.updateStatus({
      type: SyncType.NONE,
      state: SyncState.IDLE,
      progress: 100,
      message: `${syncType === SyncType.FULL ? '全量' : '增量'}同步完成`
    })

    logger.info(`${syncType === SyncType.FULL ? '全量' : '增量'}同步完成，耗时: ${duration}ms`)

    // 处理等待队列
    await this.processNextInQueue()
  }

  /**
   * 同步失败
   */
  async failSync(error: Error): Promise<void> {
    const syncType = this.currentStatus.type

    this.updateStatus({
      type: SyncType.NONE,
      state: SyncState.ERROR,
      error,
      message: `${syncType === SyncType.FULL ? '全量' : '增量'}同步失败: ${error.message}`
    })

    logger.error(`${syncType === SyncType.FULL ? '全量' : '增量'}同步失败:`, error)

    // 短暂等待后恢复空闲状态
    setTimeout(async () => {
      this.updateStatus({
        type: SyncType.NONE,
        state: SyncState.IDLE
      })
      await this.processNextInQueue()
    }, 5000) // 5秒后恢复
  }

  /**
   * 暂停当前同步
   */
  private async pauseCurrentSync(): Promise<void> {
    if (this.currentStatus.state === SyncState.RUNNING) {
      this.updateStatus({
        ...this.currentStatus,
        state: SyncState.PAUSED,
        message: '同步已暂停'
      })

      logger.info(`${this.currentStatus.type}同步已暂停`)
    }
  }

  /**
   * 处理等待队列中的下一个操作
   */
  private async processNextInQueue(): Promise<void> {
    if (this.pendingOperations.length === 0) {
      return
    }

    const nextOp = this.pendingOperations.shift()!

    try {
      await this.startSync(nextOp.type)
      nextOp.resolve()
    } catch (error) {
      nextOp.reject(error as Error)
    }
  }

  /**
   * 添加状态监听器
   */
  addStatusListener(listener: (status: SyncStatus) => void): void {
    this.listeners.push(listener)
  }

  /**
   * 移除状态监听器
   */
  removeStatusListener(listener: (status: SyncStatus) => void): void {
    const index = this.listeners.indexOf(listener)
    if (index > -1) {
      this.listeners.splice(index, 1)
    }
  }

  /**
   * 更新状态并通知监听器
   */
  private updateStatus(status: Partial<SyncStatus>): void {
    this.currentStatus = { ...this.currentStatus, ...status }

    // 通知所有监听器
    this.listeners.forEach((listener) => {
      try {
        listener(this.getCurrentStatus())
      } catch (error) {
        logger.error('状态监听器执行失败:', error)
      }
    })
  }

  /**
   * 强制停止所有同步
   */
  async forceStop(): Promise<void> {
    // 清空等待队列
    this.pendingOperations.forEach((op) => {
      op.reject(new Error('同步被强制停止'))
    })
    this.pendingOperations = []

    // 重置状态
    this.updateStatus({
      type: SyncType.NONE,
      state: SyncState.IDLE,
      message: '同步已停止'
    })

    logger.info('所有同步操作已强制停止')
  }

  /**
   * 获取等待队列信息
   */
  getQueueInfo(): { length: number; types: SyncType[] } {
    return {
      length: this.pendingOperations.length,
      types: this.pendingOperations.map((op) => op.type)
    }
  }
}
