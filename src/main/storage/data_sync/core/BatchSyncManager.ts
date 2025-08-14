/**
 * 分批全量同步管理器
 * 提供安全的分批同步功能，避免重复存储和内存溢出
 */

import { ApiClient } from './ApiClient'
import { DatabaseManager } from './DatabaseManager'
import { logger } from '../utils/logger'

interface FullSyncSession {
  session_id: string
  user_id: string
  table_name: string
  start_time: string
  total_count: number
  current_page: number
  page_size: number
  is_completed: boolean
}

interface PaginationInfo {
  page: number
  page_size: number
  total: number
  total_pages: number
  has_more: boolean
}

interface FullSyncBatchResponse {
  success: boolean
  message: string
  session_id: string
  data: any[]
  pagination: PaginationInfo
  is_last: boolean
  checksum: string
}

/**
 * 安全的分批全量同步管理器
 */
class BatchSyncManager {
  protected apiClient: ApiClient
  protected dbManager: DatabaseManager
  private syncSessions: Map<string, FullSyncSession> = new Map()
  protected processedChecksums: Set<string> = new Set() // 防重复校验和

  constructor(apiClient: ApiClient, dbManager: DatabaseManager) {
    this.apiClient = apiClient
    this.dbManager = dbManager
  }

  /**
   * 执行分批同步
   */
  async performBatchSync(
    tableName: string,
    pageSize: number = 300,
    onProgress?: (current: number, total: number, percentage: number) => void
  ): Promise<void> {
    let session = null

    try {
      logger.info(`开始分批同步: ${tableName}`)

      // 第1步：启动同步会话
      session = await this.startFullSync(tableName, pageSize)
      logger.info(`同步会话启动成功: ${session.session_id}, 总数据量: ${session.total_count}`)

      let currentPage = 1
      const totalPages = Math.ceil(session.total_count / session.page_size)

      // 第2步：创建临时表用于存储新数据
      const tempTableName = await this.createTempTable(tableName)
      logger.info(`创建临时表: ${tempTableName}`)

      // 第3步：分批获取并存储数据
      while (currentPage <= totalPages) {
        try {
          const batchData = await this.getBatchData(session.session_id, currentPage)

          // 防重复检查
          if (this.processedChecksums.has(batchData.checksum)) {
            logger.warn(`批次 ${currentPage} 已处理过，跳过 (checksum: ${batchData.checksum})`)
            currentPage++
            continue
          }

          // 存储批次数据到临时表
          await this.storeBatchData(tempTableName, batchData.data)
          this.processedChecksums.add(batchData.checksum)

          // 进度回调
          if (onProgress) {
            const percentage = Math.round((currentPage / totalPages) * 100)
            onProgress(currentPage, totalPages, percentage)
          }

          logger.info(`处理批次 ${currentPage}/${totalPages}，数据量: ${batchData.data.length}`)

          if (batchData.is_last) break
          currentPage++

          // 小延迟避免服务器压力
          await this.delay(50)
        } catch (error) {
          logger.error(`处理批次 ${currentPage} 失败:`, error)

          // 重试逻辑
          if (currentPage <= 3) {
            logger.info(`重试批次 ${currentPage}`)
            await this.delay(1000)
            continue
          } else {
            throw error
          }
        }
      }

      // 第4步：原子性替换数据
      await this.atomicReplaceData(tableName, tempTableName)
      logger.info(`原子替换完成: ${tableName}`)
    } catch (error) {
      logger.error('分批同步失败:', error)
      throw error
    } finally {
      if (session) {
        await this.finishSync(session.session_id)
      }
      this.processedChecksums.clear()
    }
  }

  /**
   * 启动全量同步会话
   */
  async startFullSync(tableName: string, pageSize: number = 300): Promise<FullSyncSession> {
    const response = await this.apiClient.post('/api/v1/sync/full-sync/start', {
      table_name: tableName,
      page_size: pageSize
    })

    if (!response.success) {
      throw new Error(`启动同步失败: ${response.message}`)
    }

    const session = response.session as FullSyncSession
    this.syncSessions.set(session.session_id, session)
    return session
  }

  /**
   * 获取批次数据
   */
  async getBatchData(sessionId: string, page: number): Promise<FullSyncBatchResponse> {
    const response = await this.apiClient.post('/api/v1/sync/full-sync/batch', {
      session_id: sessionId,
      page: page
    })

    if (!response.success) {
      throw new Error(`获取批次数据失败: ${response.message}`)
    }

    return response as FullSyncBatchResponse
  }

  /**
   * 创建临时表
   */
  async createTempTable(originalTableName: string): Promise<string> {
    const tempTableName = `${originalTableName}_temp_${Date.now()}`
    const db = await this.dbManager.getDatabase()

    // 获取原始表结构
    const tableSchema = await db.get(
      `
            SELECT sql FROM sqlite_master 
            WHERE type='table' AND name=?
        `,
      [originalTableName]
    )

    if (!tableSchema) {
      throw new Error(`无法获取表结构: ${originalTableName}`)
    }

    // 创建临时表（修改表名）
    const tempTableSql = tableSchema.sql.replace(new RegExp(`CREATE TABLE ${originalTableName}`, 'i'), `CREATE TABLE ${tempTableName}`)

    await db.exec(tempTableSql)
    logger.info(`临时表创建成功: ${tempTableName}`)

    return tempTableName
  }

  /**
   * 存储批次数据到临时表
   */
  async storeBatchData(tempTableName: string, data: any[]): Promise<void> {
    if (!data || data.length === 0) return

    const db = await this.dbManager.getDatabase()

    await db.transaction(async (tx: any) => {
      for (const record of data) {
        const fields = Object.keys(record).filter((key) => key !== 'id')
        const placeholders = fields.map(() => '?').join(', ')
        const values = fields.map((field) => record[field])

        const sql = `
                    INSERT OR REPLACE INTO ${tempTableName} (${fields.join(', ')}) 
                    VALUES (${placeholders})
                `

        await tx.run(sql, values)
      }
    })

    logger.info(`批次数据存储完成，记录数: ${data.length}`)
  }

  /**
   * 原子性替换数据
   */
  async atomicReplaceData(originalTableName: string, tempTableName: string): Promise<void> {
    const db = await this.dbManager.getDatabase()
    const backupTableName = `${originalTableName}_backup_${Date.now()}`

    await db.transaction(async (tx: any) => {
      try {
        // 1. 将原表重命名为备份表
        await tx.exec(`ALTER TABLE ${originalTableName} RENAME TO ${backupTableName}`)

        // 2. 将临时表重命名为原表
        await tx.exec(`ALTER TABLE ${tempTableName} RENAME TO ${originalTableName}`)

        // 3. 删除备份表
        await tx.exec(`DROP TABLE ${backupTableName}`)

        logger.info(`数据替换成功: ${originalTableName}`)
      } catch (error) {
        logger.error('原子替换失败，尝试回滚:', error)

        // 尝试回滚
        try {
          await tx.exec(`ALTER TABLE ${backupTableName} RENAME TO ${originalTableName}`)
          await tx.exec(`DROP TABLE ${tempTableName}`)
          logger.info('回滚成功')
        } catch (rollbackError) {
          logger.error('回滚也失败了:', rollbackError)
        }

        throw error
      }
    })
  }

  /**
   * 完成同步会话
   */
  async finishSync(sessionId: string): Promise<void> {
    try {
      await this.apiClient.delete(`/api/v1/sync/full-sync/finish/${sessionId}`)
      this.syncSessions.delete(sessionId)
      logger.info(`同步会话完成: ${sessionId}`)
    } catch (error) {
      logger.warn('完成同步会话失败:', error)
    }
  }

  /**
   * 延迟工具函数
   */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * 获取同步进度
   */
  getProgress(sessionId: string): { current: number; total: number; percentage: number } | null {
    const session = this.syncSessions.get(sessionId)
    if (!session) return null

    return {
      current: session.current_page,
      total: Math.ceil(session.total_count / session.page_size),
      percentage: Math.round((session.current_page / Math.ceil(session.total_count / session.page_size)) * 100)
    }
  }
}

export { BatchSyncManager, FullSyncSession, FullSyncBatchResponse, PaginationInfo }
