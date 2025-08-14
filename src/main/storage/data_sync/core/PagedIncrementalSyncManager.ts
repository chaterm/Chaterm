/**
 * 分页增量同步管理器
 * 专门处理大数据量场景下的渐进式增量同步
 */

import { ApiClient } from './ApiClient'
import { DatabaseManager } from './DatabaseManager'
import { logger } from '../utils/logger'
import { ChangeRecord, SyncResponse } from '../models/SyncTypes'
import { Semaphore } from '../utils/semaphore'

interface PagedSyncSession {
  sessionId: string
  tableName: string
  totalChanges: number
  processedChanges: number
  currentOffset: number
  pageSize: number
  startTime: Date
  lastProcessedId?: string
  status: 'running' | 'paused' | 'completed' | 'failed'
}

interface PagedSyncConfig {
  pageSize: number
  maxConcurrentPages: number
  maxRetries: number
  retryDelay: number
  compressionThreshold: number
}

interface PagedSyncProgress {
  sessionId: string
  totalChanges: number
  processedChanges: number
  currentPage: number
  totalPages: number
  percentage: number
  estimatedTimeRemaining: number
  throughput: number // 条/秒
}

/**
 * 分页增量同步管理器
 * 解决大数据量场景下的性能和用户体验问题
 */
export class PagedIncrementalSyncManager {
  private sessions: Map<string, PagedSyncSession> = new Map()
  private defaultConfig: PagedSyncConfig

  constructor(
    private apiClient: ApiClient,
    private dbManager: DatabaseManager,
    config?: Partial<PagedSyncConfig>
  ) {
    this.defaultConfig = {
      pageSize: 500, // 每页处理500条变更
      maxConcurrentPages: 2, // 最多2个页面并发处理
      maxRetries: 3, // 最大重试3次
      retryDelay: 1000, // 重试延迟1秒
      compressionThreshold: 10, // 超过10条相同记录进行压缩
      ...config
    }
  }

  /**
   * 开始分页增量同步
   */
  async startPagedIncrementalSync(
    tableName: string,
    config?: Partial<PagedSyncConfig>,
    onProgress?: (progress: PagedSyncProgress) => void
  ): Promise<SyncResponse> {
    const sessionConfig = { ...this.defaultConfig, ...config }
    const sessionId = this.generateSessionId()

    try {
      logger.info(`开始分页增量同步: ${tableName}, 会话: ${sessionId}`)

      // 1. 获取总变更数量（不加载数据）
      const totalChanges = await this.getTotalPendingChangesCount(tableName)
      if (totalChanges === 0) {
        return { success: true, message: '无待同步变更', synced_count: 0, failed_count: 0 }
      }

      // 2. 创建同步会话
      const session: PagedSyncSession = {
        sessionId,
        tableName,
        totalChanges,
        processedChanges: 0,
        currentOffset: 0,
        pageSize: sessionConfig.pageSize,
        startTime: new Date(),
        status: 'running'
      }

      this.sessions.set(sessionId, session)
      logger.info(`创建同步会话: 总变更 ${totalChanges} 条, 页大小 ${sessionConfig.pageSize}`)

      // 3. 执行分页同步
      const result = await this.executePagedSync(session, sessionConfig, onProgress)

      // 4. 清理会话
      this.sessions.delete(sessionId)

      return result
    } catch (error) {
      logger.error(`分页增量同步失败: ${sessionId}`, error)
      this.sessions.delete(sessionId)
      throw error
    }
  }

  /**
   * 执行分页同步
   */
  private async executePagedSync(
    session: PagedSyncSession,
    config: PagedSyncConfig,
    onProgress?: (progress: PagedSyncProgress) => void
  ): Promise<SyncResponse> {
    const semaphore = new Semaphore(config.maxConcurrentPages)
    let totalSynced = 0
    let totalFailed = 0

    const totalPages = Math.ceil(session.totalChanges / session.pageSize)
    let currentPage = 0

    while (session.currentOffset < session.totalChanges && session.status === 'running') {
      currentPage++

      try {
        const release = await semaphore.acquire()

        try {
          // 获取当前页的变更记录
          const pageChanges = await this.getPendingChangesPage(session.tableName, session.pageSize, session.currentOffset)

          if (pageChanges.length === 0) {
            break // 没有更多数据
          }

          // 压缩变更记录（可选优化）
          const compressedChanges = this.compressChanges(pageChanges)

          logger.info(`处理页面 ${currentPage}/${totalPages}: ${pageChanges.length} 条变更 (压缩后: ${compressedChanges.length})`)

          // 同步当前页
          const pageResult = await this.syncChangesPage(session.tableName, compressedChanges, config)

          // 更新会话状态
          session.processedChanges += pageChanges.length
          session.currentOffset += session.pageSize

          totalSynced += pageResult.synced_count || 0
          totalFailed += pageResult.failed_count || 0

          // 报告进度
          if (onProgress) {
            const progress = this.calculateProgress(session, currentPage, totalPages)
            onProgress(progress)
          }

          // 小延迟，避免过度占用资源
          await this.delay(50)
        } finally {
          release()
        }
      } catch (error) {
        logger.error(`处理页面 ${currentPage} 失败:`, error)

        // 重试逻辑
        if (currentPage <= config.maxRetries) {
          logger.info(`重试页面 ${currentPage}`)
          await this.delay(config.retryDelay)
          currentPage-- // 重试当前页
          continue
        } else {
          totalFailed += session.pageSize // 估算失败数量
          session.currentOffset += session.pageSize // 跳过失败的页面
        }
      }
    }

    // 更新会话状态
    session.status = totalFailed === 0 ? 'completed' : 'failed'

    const result: SyncResponse = {
      success: totalFailed === 0,
      message: `分页增量同步完成: 成功 ${totalSynced}, 失败 ${totalFailed}`,
      synced_count: totalSynced,
      failed_count: totalFailed
    }

    logger.info(`分页增量同步结果: ${JSON.stringify(result)}`)
    return result
  }

  /**
   * 获取待同步变更总数（不加载数据）
   */
  private async getTotalPendingChangesCount(tableName: string): Promise<number> {
    const db = await this.dbManager.getDatabase()
    const result = await db.get(
      `
            SELECT COUNT(*) as count 
            FROM change_log 
            WHERE sync_status = 'pending' AND table_name = ?
        `,
      [tableName]
    )

    return result?.count || 0
  }

  /**
   * 分页获取待同步变更
   */
  private async getPendingChangesPage(tableName: string, limit: number, offset: number): Promise<ChangeRecord[]> {
    const db = await this.dbManager.getDatabase()

    const rows = await db.all(
      `
            SELECT * FROM change_log 
            WHERE sync_status = 'pending' AND table_name = ?
            ORDER BY datetime(created_at) ASC 
            LIMIT ? OFFSET ?
        `,
      [tableName, limit, offset]
    )

    return rows.map((r: any) => ({
      ...r,
      change_data: r.change_data ? JSON.parse(r.change_data) : null,
      before_data: r.before_data ? JSON.parse(r.before_data) : null
    })) as ChangeRecord[]
  }

  /**
   * 压缩变更记录
   * 将同一记录的多次变更合并为最终状态
   */
  private compressChanges(changes: ChangeRecord[]): ChangeRecord[] {
    const recordMap = new Map<string, ChangeRecord>()

    for (const change of changes) {
      const key = `${change.table_name}-${change.record_uuid}`
      const existing = recordMap.get(key)

      if (!existing) {
        recordMap.set(key, change)
        continue
      }

      // 合并变更逻辑
      if (change.operation_type === 'DELETE') {
        // DELETE 操作覆盖之前的所有操作
        recordMap.set(key, change)
      } else if (existing.operation_type === 'DELETE') {
        // 如果已有 DELETE，保持不变
        continue
      } else if (existing.operation_type === 'INSERT' && change.operation_type === 'UPDATE') {
        // INSERT + UPDATE = INSERT（使用最新数据）
        recordMap.set(key, {
          ...change,
          operation_type: 'INSERT',
          change_data: change.change_data
        })
      } else {
        // 其他情况使用最新的变更
        recordMap.set(key, change)
      }
    }

    const compressed = Array.from(recordMap.values())

    if (compressed.length < changes.length) {
      logger.info(`变更压缩: ${changes.length} -> ${compressed.length} (减少 ${changes.length - compressed.length})`)
    }

    return compressed
  }

  /**
   * 同步变更页面
   */
  private async syncChangesPage(tableName: string, changes: ChangeRecord[], config: PagedSyncConfig): Promise<SyncResponse> {
    try {
      // 准备上传数据
      const data = changes.map((change) => ({
        ...change.change_data,
        operation_type: change.operation_type
      }))

      // 调用API上传
      const response = await this.apiClient.incrementalSync(tableName, data)

      // 处理响应
      if (response.success) {
        // 标记成功的变更为已同步
        const successIds = changes.map((c) => c.id)
        this.dbManager.markChangesSynced(successIds)
      }

      return response
    } catch (error) {
      logger.error(`同步变更页面失败:`, error)
      throw error
    }
  }

  /**
   * 计算同步进度
   */
  private calculateProgress(session: PagedSyncSession, currentPage: number, totalPages: number): PagedSyncProgress {
    const elapsed = Date.now() - session.startTime.getTime()
    const percentage = Math.round((session.processedChanges / session.totalChanges) * 100)

    // 计算吞吐量（条/秒）
    const throughput = session.processedChanges / (elapsed / 1000)

    // 估算剩余时间
    const remainingChanges = session.totalChanges - session.processedChanges
    const estimatedTimeRemaining = throughput > 0 ? remainingChanges / throughput : 0

    return {
      sessionId: session.sessionId,
      totalChanges: session.totalChanges,
      processedChanges: session.processedChanges,
      currentPage,
      totalPages,
      percentage,
      estimatedTimeRemaining: Math.round(estimatedTimeRemaining),
      throughput: Math.round(throughput)
    }
  }

  /**
   * 暂停同步会话
   */
  async pauseSync(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId)
    if (session && session.status === 'running') {
      session.status = 'paused'
      logger.info(`同步会话已暂停: ${sessionId}`)
      return true
    }
    return false
  }

  /**
   * 恢复同步会话
   */
  async resumeSync(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId)
    if (session && session.status === 'paused') {
      session.status = 'running'
      logger.info(`同步会话已恢复: ${sessionId}`)
      return true
    }
    return false
  }

  /**
   * 取消同步会话
   */
  async cancelSync(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.status = 'failed'
      this.sessions.delete(sessionId)
      logger.info(`同步会话已取消: ${sessionId}`)
      return true
    }
    return false
  }

  /**
   * 获取会话状态
   */
  getSessionStatus(sessionId: string): PagedSyncSession | null {
    return this.sessions.get(sessionId) || null
  }

  /**
   * 获取所有活跃会话
   */
  getActiveSessions(): PagedSyncSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.status === 'running')
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `paged-sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 延迟工具函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

export { PagedSyncSession, PagedSyncConfig, PagedSyncProgress }
