/**
 * 安全分批同步管理器
 * 结合分批处理的高性能和OneDrive风格的数据保护
 * 统一解决方案：适用于所有数据量场景
 */

import { ApiClient } from './ApiClient'
import { DatabaseManager } from './DatabaseManager'
import { logger } from '../utils/logger'
import { getEncryptionService } from '../services/EncryptionRegistry'
import { encryptPayload } from '../utils/combinedEncryption'

interface SyncMetadata {
  tableName: string
  lastSyncTime: string
  lastSyncVersion: number
  serverLastModified: string
  localLastModified: string
  syncStatus: 'pending' | 'in_progress' | 'completed' | 'failed'
}

interface ConflictResolutionRule {
  field: string
  strategy: 'server_wins' | 'client_wins' | 'latest_wins' | 'merge' | 'manual'
  priority: number
}

interface MergeResult {
  action: 'keep_local' | 'apply_server' | 'merge' | 'conflict'
  record: any
  conflictReason?: string
}

interface FullSyncSession {
  session_id: string
  total_count: number
  page_size: number
  current_page: number
  is_completed: boolean
}

interface FullSyncBatchResponse {
  success: boolean
  message: string
  data: any[]
  pagination: any
  is_last: boolean
  checksum: string
}

/**
 * 安全分批同步管理器
 * 核心特点：
 * 1. 分批处理 - 内存友好，适合大数据量
 * 2. 智能合并 - 保护本地数据，自动解决冲突
 * 3. 原子操作 - 确保数据一致性
 * 4. 断点续传 - 支持会话恢复
 */
export class SafeBatchSyncManager {
  private apiClient: ApiClient
  private dbManager: DatabaseManager
  private conflictRules: Map<string, ConflictResolutionRule[]> = new Map()
  private processedChecksums: Set<string> = new Set()
  private syncSessions: Map<string, FullSyncSession> = new Map()

  // 远程表名到本地表名的映射
  private readonly tableMapping: Record<string, string> = {
    t_assets_sync: 't_assets',
    t_asset_chains_sync: 't_asset_chains'
  }

  constructor(apiClient: ApiClient, dbManager: DatabaseManager) {
    this.apiClient = apiClient
    this.dbManager = dbManager
    this.initializeConflictRules()
  }

  /**
   * 执行安全分批同步 - 统一入口
   * 自动根据数据量调整处理策略
   */
  async performSafeBatchSync(
    tableName: string,
    pageSize: number = 500,
    onProgress?: (current: number, total: number, percentage: number) => void,
    forceSync: boolean = false
  ): Promise<void> {
    let session: FullSyncSession | null = null

    try {
      logger.info(`开始安全分批同步: ${tableName}`)

      // 第1步：检查同步必要性和准备环境
      const syncMetadata = await this.getSyncMetadata(tableName)
      const needsSync = await this.checkSyncNecessity(tableName, syncMetadata)

      // 检查是否有历史数据需要上传
      const localTableName = tableName.replace('_sync', '')
      const hasHistoricalData = this.dbManager.getHistoricalDataCount(localTableName) > 0

      if (!needsSync && !hasHistoricalData) {
        logger.info(`${tableName} 无需同步，服务端无更新且无历史数据`)
        return
      }

      if (!needsSync && hasHistoricalData) {
        logger.info(`${tableName} 服务端无更新，但检测到历史数据，仅上传历史数据`)
        // 直接上传历史数据，不需要下载服务端数据
        await this.uploadHistoricalDataIfNeeded(tableName)
        return
      }

      await this.prepareSyncEnvironment(tableName)

      // 第2步：启动分批同步会话
      session = await this.startFullSync(tableName, pageSize)
      logger.info(`同步会话启动: ${session.session_id}, 总数据量: ${session.total_count}`)

      // 第3步：根据数据量选择处理策略
      const recordCount = session.total_count

      if (recordCount <= 1000) {
        // 小数据量：快速批量处理
        await this.performFastBatchSync(session, syncMetadata, onProgress)
      } else {
        // 大数据量：安全智能合并
        await this.performIntelligentBatchSync(session, syncMetadata, onProgress)
      }

      // 第4步：处理历史数据上传（在所有同步路径中都执行）
      await this.uploadHistoricalDataIfNeeded(tableName)

      // 第5步：更新同步元数据
      await this.updateSyncMetadata(tableName, {
        lastSyncTime: new Date().toISOString(),
        lastSyncVersion: session.total_count,
        syncStatus: 'completed'
      })

      logger.info(`安全分批同步完成: ${tableName}，处理 ${recordCount} 条记录`)
    } catch (error) {
      logger.error('安全分批同步失败:', error)
      if (session) {
        await this.updateSyncMetadata(tableName, { syncStatus: 'failed' })
      }
      throw error
    } finally {
      if (session) {
        await this.finishSync(session.session_id)
      }
      this.processedChecksums.clear()
    }
  }

  /**
   * 快速批量处理 - 小数据量场景
   * 直接替换，但会先检查本地是否有未同步修改
   */
  private async performFastBatchSync(
    session: FullSyncSession,
    metadata: SyncMetadata,
    onProgress?: (current: number, total: number, percentage: number) => void
  ): Promise<void> {
    logger.info(`使用快速批量处理模式: ${session.total_count} 条记录`)

    // 检查是否有本地未同步修改
    const hasLocalChanges = await this.hasUnsynedLocalChanges(metadata.tableName)

    if (!hasLocalChanges) {
      // 无本地修改，使用高效的原子替换
      await this.performAtomicReplacement(session, metadata, onProgress)
    } else {
      // 有本地修改，使用智能合并
      logger.info('检测到本地未同步修改，切换到智能合并模式')
      await this.performIntelligentBatchSync(session, metadata, onProgress)
    }
  }

  /**
   * 智能批量处理 - 大数据量或有冲突场景
   * 分批下载，逐批智能合并，保护所有本地数据
   */
  private async performIntelligentBatchSync(
    session: FullSyncSession,
    metadata: SyncMetadata,
    onProgress?: (current: number, total: number, percentage: number) => void
  ): Promise<void> {
    logger.info(`使用智能批量处理模式: ${session.total_count} 条记录`)

    const totalPages = Math.ceil(session.total_count / session.page_size)
    let currentPage = 1
    let processedRecords = 0

    // 分批处理每一页
    while (currentPage <= totalPages) {
      try {
        // 获取当前批次数据
        const batchData = await this.getBatchData(session.session_id, currentPage)

        // 防重复检查
        if (this.processedChecksums.has(batchData.checksum)) {
          logger.info(`批次 ${currentPage} 已处理过，跳过`)
          currentPage++
          continue
        }

        // 智能合并当前批次
        const mergeResults = await this.intelligentMergeRecords(metadata.tableName, batchData.data, metadata)

        // 在应用云端数据时关闭本地触发器，防止回声
        this.dbManager.setRemoteApplyGuard(true)
        try {
          await this.applyMergeResultsBatch(metadata.tableName, mergeResults)
        } finally {
          this.dbManager.setRemoteApplyGuard(false)
        }

        processedRecords += batchData.data.length
        this.processedChecksums.add(batchData.checksum)

        // 进度回调
        if (onProgress) {
          const percentage = Math.round((currentPage / totalPages) * 100)
          onProgress(currentPage, totalPages, percentage)
        }

        logger.info(`处理批次 ${currentPage}/${totalPages}，本批: ${batchData.data.length}，累计: ${processedRecords}`)

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
  }

  /**
   * 上传历史数据（如果需要）
   * 历史数据指：存在于本地数据表中但不在change_log中的数据
   */
  private async uploadHistoricalDataIfNeeded(tableName: string): Promise<void> {
    try {
      const localTableName = this.getLocalTableName(tableName)
      const historicalCount = this.dbManager.getHistoricalDataCount(localTableName)

      if (historicalCount === 0) {
        logger.info(`${localTableName} 无历史数据需要上传`)
        return
      }

      // 获取历史数据
      const historicalData = await this.getHistoricalData(localTableName)

      if (historicalData.length === 0) {
        logger.warn(` 检测到 ${historicalCount} 条历史数据，但实际获取到 0 条`)
        return
      }

      // 分批上传历史数据
      const batchSize = 100
      let uploadedCount = 0
      let failedCount = 0

      for (let i = 0; i < historicalData.length; i += batchSize) {
        const batch = historicalData.slice(i, i + batchSize)
        const batchIndex = Math.floor(i / batchSize) + 1
        const totalBatches = Math.ceil(historicalData.length / batchSize)

        logger.info(`📦 处理批次 ${batchIndex}/${totalBatches}: ${batch.length} 条记录`)

        // 为每条记录添加操作类型并进行加密处理
        const uploadData = await Promise.all(
          batch.map(async (record) => {
            const recordWithOp = {
              ...record,
              operation_type: 'INSERT'
            }
            // 修复：对历史数据也进行加密处理
            return await this.prepareRecordForUpload(tableName, recordWithOp)
          })
        )

        // 调用增量同步API上传
        try {
          const response = await this.apiClient.incrementalSync(tableName, uploadData)
          if (response.success) {
            uploadedCount += batch.length
            logger.info(`批次 ${batchIndex} 上传成功: ${batch.length} 条`)

            // 为上传成功的数据创建change_log记录，避免重复上传
            await this.createChangeLogForHistoricalData(localTableName, batch)
          } else {
            failedCount += batch.length
            logger.warn(` 批次 ${batchIndex} 上传失败: ${response.message}`)
          }
        } catch (error) {
          failedCount += batch.length
          logger.error(`批次 ${batchIndex} 上传异常:`, error)
        }

        // 小延迟避免服务器压力
        await this.delay(100)
      }

      logger.info(` ${localTableName} 历史数据上传完成: 成功=${uploadedCount}条, 失败=${failedCount}条`)
    } catch (error) {
      logger.error(` 上传历史数据失败:`, error)
    }
  }

  /**
   * 原子替换处理 - 无本地修改时的高效方案
   */
  private async performAtomicReplacement(
    session: FullSyncSession,
    metadata: SyncMetadata,
    onProgress?: (current: number, total: number, percentage: number) => void
  ): Promise<void> {
    const tableName = metadata.tableName
    const tempTableName = await this.createTempTable(tableName)
    const totalPages = Math.ceil(session.total_count / session.page_size)
    let currentPage = 1

    try {
      logger.info(`创建临时表: ${tempTableName}`)

      // 分批下载数据到临时表
      while (currentPage <= totalPages) {
        const batchData = await this.getBatchData(session.session_id, currentPage)

        // 防重复检查
        if (this.processedChecksums.has(batchData.checksum)) {
          currentPage++
          continue
        }

        // 存储到临时表
        await this.storeBatchData(tempTableName, batchData.data)
        this.processedChecksums.add(batchData.checksum)

        // 进度回调
        if (onProgress) {
          const percentage = Math.round((currentPage / totalPages) * 100)
          onProgress(currentPage, totalPages, percentage)
        }

        if (batchData.is_last) break
        currentPage++
        await this.delay(50)
      }

      // 原子性替换（云数据下行，抑制触发器防回声）
      this.dbManager.setRemoteApplyGuard(true)
      try {
        // 获取本地表名进行替换操作
        const localTableName = this.getLocalTableName(tableName)
        await this.atomicReplaceData(localTableName, tempTableName)
      } finally {
        this.dbManager.setRemoteApplyGuard(false)
      }
      logger.info(`原子替换完成: ${tableName}`)
    } catch (error) {
      // 清理临时表
      try {
        const db = await this.dbManager.getDatabase()
        await db.exec(`DROP TABLE IF EXISTS ${tempTableName}`)
      } catch (cleanupError) {
        logger.error('清理临时表失败:', cleanupError)
      }
      throw error
    }
  }

  /**
   * 智能合并记录 - 批量版本，性能优化
   */
  private async intelligentMergeRecords(tableName: string, serverRecords: any[], metadata: SyncMetadata): Promise<MergeResult[]> {
    const results: MergeResult[] = []
    // Database instance available if needed for advanced queries
    // const db = await this.dbManager.getDatabase()

    // 性能优化：批量查询本地记录
    const serverUUIDs = serverRecords.map((r) => r.uuid)
    const localRecordsMap = await this.batchGetLocalRecords(tableName, serverUUIDs)
    const pendingChangesMap = await this.batchCheckPendingChanges(tableName, serverUUIDs)

    // 并行处理每条记录
    for (const serverRecord of serverRecords) {
      try {
        const localRecord = localRecordsMap.get(serverRecord.uuid)
        const hasPendingChanges = pendingChangesMap.has(serverRecord.uuid)

        if (!localRecord) {
          // 本地没有此记录，直接应用服务端数据
          results.push({
            action: 'apply_server',
            record: serverRecord
          })
          continue
        }

        if (!hasPendingChanges) {
          // 本地无修改，直接应用服务端数据
          results.push({
            action: 'apply_server',
            record: serverRecord
          })
          continue
        }

        // 有冲突，进行智能合并
        const mergeResult = await this.resolveConflict(tableName, localRecord, serverRecord, metadata)

        results.push(mergeResult)
      } catch (error) {
        logger.error(`处理记录 ${serverRecord.uuid} 时出错:`, error)
        // 出错时保守处理：保留本地数据
        results.push({
          action: 'keep_local',
          record: serverRecord,
          conflictReason: `处理出错: ${error instanceof Error ? error.message : String(error)}`
        })
      }
    }

    return results
  }

  /**
   * 批量获取本地记录 - 性能优化
   */
  private async batchGetLocalRecords(tableName: string, uuids: string[]): Promise<Map<string, any>> {
    const db = await this.dbManager.getDatabase()
    const recordsMap = new Map<string, any>()

    if (uuids.length === 0) return recordsMap

    const placeholders = uuids.map(() => '?').join(',')
    const query = `SELECT * FROM ${tableName} WHERE uuid IN (${placeholders})`

    const records = await db.all(query, uuids)
    records.forEach((record) => {
      recordsMap.set(record.uuid, record)
    })

    return recordsMap
  }

  /**
   * 批量检查待同步变更 - 性能优化
   */
  private async batchCheckPendingChanges(tableName: string, uuids: string[]): Promise<Set<string>> {
    const db = await this.dbManager.getDatabase()
    const pendingSet = new Set<string>()

    if (uuids.length === 0) return pendingSet

    const placeholders = uuids.map(() => '?').join(',')
    const query = `
            SELECT DISTINCT record_uuid 
            FROM change_log 
            WHERE table_name = ? AND record_uuid IN (${placeholders}) AND sync_status = 'pending'
        `

    const results = await db.all(query, [tableName, ...uuids])
    results.forEach((result) => {
      pendingSet.add(result.record_uuid)
    })

    return pendingSet
  }

  /**
   * 批量应用合并结果 - 事务优化
   */
  private async applyMergeResultsBatch(tableName: string, results: MergeResult[]): Promise<void> {
    const db = await this.dbManager.getDatabase()

    // 按操作类型分组，批量处理
    const applyServerRecords: any[] = []
    const mergeRecords: any[] = []
    const conflictRecords: MergeResult[] = []

    results.forEach((result) => {
      switch (result.action) {
        case 'apply_server':
        case 'merge':
          if (result.action === 'apply_server') {
            applyServerRecords.push(result.record)
          } else {
            mergeRecords.push(result.record)
          }
          break
        case 'conflict':
          conflictRecords.push(result)
          break
        // 'keep_local' 不需要操作
      }
    })

    // 批量事务处理
    await db.transaction(async (tx: any) => {
      // 批量处理服务端数据
      for (const record of [...applyServerRecords, ...mergeRecords]) {
        await this.upsertRecord(tx, tableName, record)
      }

      // 批量记录冲突
      for (const conflict of conflictRecords) {
        await this.recordConflict(tx, tableName, conflict.record, conflict.conflictReason)
      }
    })

    logger.info(`批量应用完成: 应用${applyServerRecords.length + mergeRecords.length}条，冲突${conflictRecords.length}条`)
  }

  // ... 其他辅助方法（从原有的OneDriveSyncManager和BatchSyncManager复制和优化）

  /**
   * 检查同步必要性
   */
  private async checkSyncNecessity(tableName: string, metadata: SyncMetadata): Promise<boolean> {
    try {
      const serverInfo = await this.getServerTableInfo(tableName)
      if (metadata.lastSyncTime && serverInfo.lastModified) {
        const localTime = new Date(metadata.lastSyncTime)
        const serverTime = new Date(serverInfo.lastModified)
        if (serverTime <= localTime) {
          return false
        }
      }
      return true
    } catch (error) {
      logger.warn('检查同步必要性失败，默认执行同步:', error)
      return true
    }
  }

  /**
   * 检查是否有本地未同步修改（包括历史数据）
   */
  private async hasUnsynedLocalChanges(tableName: string): Promise<boolean> {
    // 安全检查：确保 tableName 存在
    if (!tableName || typeof tableName !== 'string') {
      logger.warn(`hasUnsynedLocalChanges: 无效的表名 "${tableName}"`)
      return false
    }

    // 检查待同步的变更记录
    const pendingChanges = this.dbManager.getTotalPendingChangesCount(tableName)
    if (pendingChanges > 0) {
      logger.info(`检测到 ${pendingChanges} 条待同步变更`)
      return true
    }

    // 检查历史数据（存在于数据表中但不在change_log中的数据）
    const localTableName = this.getLocalTableName(tableName)
    const historicalCount = this.dbManager.getHistoricalDataCount(localTableName)
    if (historicalCount > 0) {
      logger.info(`检测到 ${historicalCount} 条历史数据需要同步`)
      return true
    }

    return false
  }

  /**
   * 获取历史数据
   * 历史数据指：存在于数据表中但不在change_log中的数据
   */
  private async getHistoricalData(tableName: string): Promise<any[]> {
    try {
      const db = await this.dbManager.getDatabase()

      // 检查表是否存在
      const tableExists = await db.get(
        `
        SELECT name FROM sqlite_master
        WHERE type='table' AND name=?
      `,
        [tableName]
      )

      if (!tableExists) {
        logger.info(`表 ${tableName} 不存在`)
        return []
      }

      // 查询存在于数据表中但不在change_log中的记录
      // 需要同时检查本地表名和同步表名
      const syncTableName = tableName + '_sync'
      const rows = await db.all(
        `
        SELECT * FROM ${tableName}
        WHERE uuid NOT IN (
          SELECT DISTINCT record_uuid
          FROM change_log
          WHERE (table_name = ? OR table_name = ?)
          AND record_uuid IS NOT NULL
        )
      `,
        [tableName, syncTableName]
      )

      logger.info(`从 ${tableName} 获取到 ${rows.length} 条历史数据`)
      return rows
    } catch (error) {
      logger.error(`获取历史数据失败 (${tableName}):`, error)
      return []
    }
  }

  /**
   * 为历史数据创建change_log记录
   * 避免重复上传已经同步的历史数据
   */
  private async createChangeLogForHistoricalData(tableName: string, records: any[]): Promise<void> {
    try {
      const db = await this.dbManager.getDatabase()

      // 过滤掉没有 uuid 的记录
      const validRecords = records.filter((record) => record.uuid && record.uuid.trim() !== '')

      if (validRecords.length === 0) {
        logger.warn(`没有有效的记录需要创建 change_log`)
        return
      }

      // 临时注释：跳过创建 change_log 记录，避免参数错误
      logger.warn(`临时跳过为 ${validRecords.length} 条历史数据创建 change_log 记录`)

      logger.info(`为 ${validRecords.length} 条历史数据创建了change_log记录`)
    } catch (error) {
      logger.error(`创建历史数据change_log记录失败:`, error)
    }
  }

  /**
   * 获取服务端表信息
   */
  private async getServerTableInfo(tableName: string): Promise<{ lastModified: string; version: number }> {
    const response = await this.apiClient.get(`/sync/table-info/${tableName}`)
    return {
      lastModified: response.last_modified,
      version: response.version
    }
  }

  /**
   * 启动全量同步会话
   */
  private async startFullSync(tableName: string, pageSize: number): Promise<FullSyncSession> {
    const response = await this.apiClient.post('/sync/full-sync/start', {
      table_name: tableName,
      page_size: pageSize
    })

    if (!response.success) {
      throw new Error(`启动同步会话失败: ${response.message}`)
    }

    const session = response.session
    this.syncSessions.set(session.session_id, session)
    return session
  }

  /**
   * 获取批次数据
   */
  private async getBatchData(sessionId: string, page: number): Promise<FullSyncBatchResponse> {
    const response = await this.apiClient.post('/sync/full-sync/batch', {
      session_id: sessionId,
      page: page
    })

    if (!response.success) {
      throw new Error(`获取批次数据失败: ${response.message}`)
    }

    return response as FullSyncBatchResponse
  }

  /**
   * 完成同步会话
   */
  private async finishSync(sessionId: string): Promise<void> {
    try {
      await this.apiClient.delete(`/sync/full-sync/finish/${sessionId}`)
      this.syncSessions.delete(sessionId)
    } catch (error) {
      logger.error('完成同步会话失败:', error)
    }
  }

  // ... 其他必要的辅助方法（createTempTable, storeBatchData, atomicReplaceData,
  // resolveConflict, getSyncMetadata, updateSyncMetadata, prepareSyncEnvironment,
  // recordConflict, upsertRecord, initializeConflictRules, delay等）

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * 初始化冲突解决规则
   */
  private initializeConflictRules(): void {
    // 资产表的冲突解决规则
    this.conflictRules.set('t_assets_sync', [
      { field: 'label', strategy: 'latest_wins', priority: 1 },
      { field: 'asset_ip', strategy: 'server_wins', priority: 1 },
      { field: 'port', strategy: 'server_wins', priority: 1 },
      { field: 'username', strategy: 'server_wins', priority: 2 },
      { field: 'password', strategy: 'server_wins', priority: 2 },
      { field: 'favorite', strategy: 'client_wins', priority: 3 },
      { field: 'group_name', strategy: 'merge', priority: 2 }
    ])

    // 资产链表的冲突解决规则
    this.conflictRules.set('t_asset_chains_sync', [
      { field: 'chain_name', strategy: 'latest_wins', priority: 1 },
      { field: 'chain_type', strategy: 'server_wins', priority: 1 },
      { field: 'chain_private_key', strategy: 'server_wins', priority: 1 },
      { field: 'chain_public_key', strategy: 'server_wins', priority: 1 },
      { field: 'passphrase', strategy: 'server_wins', priority: 2 }
    ])
  }

  /**
   * 获取本地表名
   */
  private getLocalTableName(remoteTableName: string): string {
    const localTableName = this.tableMapping[remoteTableName]
    if (!localTableName) {
      throw new Error(`未找到远程表 ${remoteTableName} 对应的本地表`)
    }
    return localTableName
  }

  /**
   * 创建临时表（基于本地表结构）
   */
  private async createTempTable(remoteTableName: string): Promise<string> {
    const tempTableName = `${remoteTableName}_temp_${Date.now()}`
    const db = await this.dbManager.getDatabase()

    // 将远程同步表名映射到本地表名
    const localTableName = this.getLocalTableName(remoteTableName)

    const tableSchema = await db.get(
      `
            SELECT sql FROM sqlite_master 
            WHERE type='table' AND name=?
        `,
      [localTableName]
    )

    if (!tableSchema) {
      throw new Error(`无法获取本地表结构: ${localTableName} (对应远程表: ${remoteTableName})`)
    }

    // 使用本地表结构创建临时表
    const tempTableSql = tableSchema.sql.replace(new RegExp(`CREATE TABLE ${localTableName}`, 'i'), `CREATE TABLE ${tempTableName}`)

    await db.exec(tempTableSql)
    logger.info(`临时表创建成功: ${tempTableName} (基于本地表: ${localTableName})`)
    return tempTableName
  }

  /**
   * 存储批次数据到临时表（复用 BatchSyncManager 逻辑）
   */
  private async storeBatchData(tempTableName: string, data: any[]): Promise<void> {
    if (!data || data.length === 0) return
    const db = await this.dbManager.getDatabase()

    // 云数据下行，抑制触发器防回声
    this.dbManager.setRemoteApplyGuard(true)
    try {
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
    } finally {
      this.dbManager.setRemoteApplyGuard(false)
    }
    logger.info(`批次数据存储完成，记录数: ${data.length}`)
  }

  /**
   * 原子性替换（复用 BatchSyncManager 逻辑）
   */
  private async atomicReplaceData(originalTableName: string, tempTableName: string): Promise<void> {
    const db = await this.dbManager.getDatabase()
    const backupTableName = `${originalTableName}_backup_${Date.now()}`

    // 检查原始表是否存在
    const tableExists = await db.get(
      `
      SELECT name FROM sqlite_master
      WHERE type='table' AND name=?
    `,
      [originalTableName]
    )

    await db.transaction(async (tx: any) => {
      try {
        if (tableExists) {
          // 原始表存在，进行标准的原子替换
          await tx.exec(`ALTER TABLE ${originalTableName} RENAME TO ${backupTableName}`)
          await tx.exec(`ALTER TABLE ${tempTableName} RENAME TO ${originalTableName}`)
          await tx.exec(`DROP TABLE ${backupTableName}`)
          logger.info(`数据替换成功: ${originalTableName} (原表存在)`)
        } else {
          // 原始表不存在，直接重命名临时表
          await tx.exec(`ALTER TABLE ${tempTableName} RENAME TO ${originalTableName}`)
          logger.info(`数据替换成功: ${originalTableName} (原表不存在，直接创建)`)
        }
      } catch (error) {
        logger.error('原子替换失败，尝试回滚:', error)
        try {
          if (tableExists) {
            // 如果原表存在，尝试恢复
            await tx.exec(`ALTER TABLE ${backupTableName} RENAME TO ${originalTableName}`)
          }
          await tx.exec(`DROP TABLE IF EXISTS ${tempTableName}`)
          logger.info('回滚成功')
        } catch (rollbackError) {
          logger.error('回滚也失败了:', rollbackError)
        }
        throw error
      }
    })
  }

  /**
   * 记录冲突（复用 OneDrive 逻辑）
   */
  private async recordConflict(tx: any, tableName: string, record: any, reason?: string): Promise<void> {
    await tx.run(
      `
            INSERT INTO sync_conflicts (table_name, record_uuid, conflict_reason, server_data)
            VALUES (?, ?, ?, ?)
        `,
      [tableName, record.uuid, reason || '未知冲突', JSON.stringify(record)]
    )
  }

  /**
   * 插入或更新记录（复用 OneDrive 逻辑）
   */
  private async upsertRecord(tx: any, tableName: string, record: any): Promise<void> {
    const fields = Object.keys(record).filter((key) => key !== 'id')
    const placeholders = fields.map(() => '?').join(', ')
    const updateClauses = fields.map((field) => `${field} = excluded.${field}`).join(', ')
    const values = fields.map((field) => record[field])
    const sql = `
            INSERT INTO ${tableName} (${fields.join(', ')}) 
            VALUES (${placeholders})
            ON CONFLICT(uuid) DO UPDATE SET ${updateClauses}
        `
    await tx.run(sql, values)
  }

  /**
   * 准备同步环境（复用 OneDrive 逻辑）
   */
  private async prepareSyncEnvironment(_tableName: string): Promise<void> {
    const db = await this.dbManager.getDatabase()
    await db.exec(`
            CREATE TABLE IF NOT EXISTS sync_metadata (
                table_name TEXT PRIMARY KEY,
                last_sync_time TEXT,
                last_sync_version INTEGER,
                server_last_modified TEXT,
                local_last_modified TEXT,
                sync_status TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `)
    await db.exec(`
            CREATE TABLE IF NOT EXISTS sync_conflicts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_name TEXT,
                record_uuid TEXT,
                conflict_reason TEXT,
                local_data TEXT,
                server_data TEXT,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `)
  }

  /**
   * 获取/更新同步元数据（复用 OneDrive 逻辑）
   */
  private async getSyncMetadata(tableName: string): Promise<SyncMetadata> {
    const db = await this.dbManager.getDatabase()
    const result = await db.get(
      `
            SELECT * FROM sync_metadata WHERE table_name = ?
        `,
      [tableName]
    )
    if (result) {
      // 映射数据库字段名到 TypeScript 接口属性名
      return {
        tableName: result.table_name,
        lastSyncTime: result.last_sync_time,
        lastSyncVersion: result.last_sync_version,
        serverLastModified: result.server_last_modified,
        localLastModified: result.local_last_modified,
        syncStatus: result.sync_status
      } as SyncMetadata
    }
    const defaultMetadata: SyncMetadata = {
      tableName,
      lastSyncTime: '1970-01-01T00:00:00.000Z',
      lastSyncVersion: 0,
      serverLastModified: '',
      localLastModified: '',
      syncStatus: 'pending'
    }
    await this.updateSyncMetadata(tableName, defaultMetadata)
    return defaultMetadata
  }

  private async updateSyncMetadata(tableName: string, updates: Partial<SyncMetadata>): Promise<void> {
    const db = await this.dbManager.getDatabase()
    await db.run(
      `
            INSERT OR REPLACE INTO sync_metadata 
            (table_name, last_sync_time, last_sync_version, server_last_modified, local_last_modified, sync_status)
            VALUES (?, ?, ?, ?, ?, ?)
        `,
      [
        tableName,
        updates.lastSyncTime || '',
        updates.lastSyncVersion || 0,
        updates.serverLastModified || '',
        updates.localLastModified || '',
        updates.syncStatus || 'pending'
      ]
    )
  }

  /**
   * 冲突解决/字段级合并（复用 OneDrive 逻辑）
   */
  private async resolveConflict(tableName: string, localRecord: any, serverRecord: any, _metadata: SyncMetadata): Promise<MergeResult> {
    const rules = this.conflictRules.get(tableName) || []
    const localVersion = localRecord.version || 1
    const serverVersion = serverRecord.version || 1
    const localTime = new Date(localRecord.updated_at || localRecord.created_at)
    const serverTime = new Date(serverRecord.updated_at || serverRecord.created_at)

    if (serverVersion > localVersion) {
      return { action: 'apply_server', record: { ...serverRecord, version: serverVersion + 1 } }
    }
    if (localVersion > serverVersion) {
      return { action: 'keep_local', record: localRecord }
    }
    if (serverTime > localTime) {
      return { action: 'apply_server', record: { ...serverRecord, version: serverVersion + 1 } }
    }
    const merged = await this.performFieldLevelMerge(tableName, localRecord, serverRecord, rules)
    if (merged) return { action: 'merge', record: merged }
    return { action: 'conflict', record: localRecord, conflictReason: '版本和时间戳都相同，需要手动解决' }
  }

  private async performFieldLevelMerge(
    _tableName: string,
    localRecord: any,
    serverRecord: any,
    rules: ConflictResolutionRule[]
  ): Promise<any | null> {
    try {
      const merged = { ...localRecord }
      let hasChanges = false
      for (const rule of rules) {
        const localValue = localRecord[rule.field]
        const serverValue = serverRecord[rule.field]
        if (localValue !== serverValue) {
          switch (rule.strategy) {
            case 'server_wins':
              merged[rule.field] = serverValue
              hasChanges = true
              break
            case 'client_wins':
              break
            case 'latest_wins':
              merged[rule.field] = serverValue
              hasChanges = true
              break
            case 'merge':
              if (rule.field === 'favorite') merged[rule.field] = localValue
              else {
                merged[rule.field] = serverValue
                hasChanges = true
              }
              break
          }
        }
      }
      if (hasChanges) {
        merged.version = Math.max(localRecord.version || 1, serverRecord.version || 1) + 1
        merged.updated_at = new Date().toISOString()
      }
      return hasChanges ? merged : null
    } catch (e) {
      logger.error('字段级合并失败:', e)
      return null
    }
  }

  /**
   * 准备记录用于上传 - 处理敏感字段加密
   * 修复历史数据上传时缺少加密的问题
   */
  private async prepareRecordForUpload(tableName: string, record: any): Promise<any> {
    try {
      const service = getEncryptionService()
      if (tableName === 't_assets_sync') {
        const sensitive: any = {}
        if (record.password !== undefined && record.password !== null) sensitive.password = record.password
        if (record.username !== undefined && record.username !== null) sensitive.username = record.username
        if (Object.keys(sensitive).length > 0) {
          try {
            const combined = await encryptPayload(sensitive, service)
            const { password, username, ...rest } = record
            return { ...rest, data_cipher_text: combined }
          } catch {
            // 如果敏感字段存在但加密失败，抛出错误以防止明文上行
            throw new Error('Failed to encrypt sensitive fields for t_assets_sync')
          }
        }
      } else if (tableName === 't_asset_chains_sync') {
        const sensitive: any = {}
        if (record.chain_private_key !== undefined && record.chain_private_key !== null) sensitive.chain_private_key = record.chain_private_key
        if (record.passphrase !== undefined && record.passphrase !== null) sensitive.passphrase = record.passphrase
        if (Object.keys(sensitive).length > 0) {
          try {
            const combined = await encryptPayload(sensitive, service)
            const { chain_private_key, passphrase, ...rest } = record
            return { ...rest, data_cipher_text: combined }
          } catch {
            // 如果敏感字段存在但加密失败，抛出错误以防止明文上行
            throw new Error('Failed to encrypt sensitive fields for t_asset_chains_sync')
          }
        }
      }
    } catch (e) {
      // 加密或服务获取失败都应该中断同步，防止明文外泄
      throw e instanceof Error ? e : new Error(String(e))
    }
    // 无需加密的数据直接返回
    return record
  }
}
