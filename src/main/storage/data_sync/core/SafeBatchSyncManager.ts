/**
 * 安全分批同步管理器
 * 结合分批处理的高性能和OneDrive风格的数据保护
 * 统一解决方案：适用于所有数据量场景
 */

import { ApiClient } from './ApiClient'
import { DatabaseManager } from './DatabaseManager'
import { logger } from '../utils/logger'

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
    onProgress?: (current: number, total: number, percentage: number) => void
  ): Promise<void> {
    let session = null

    try {
      logger.info(`开始安全分批同步: ${tableName}`)

      // 第1步：检查同步必要性和准备环境
      const syncMetadata = await this.getSyncMetadata(tableName)
      const needsSync = await this.checkSyncNecessity(tableName, syncMetadata)

      if (!needsSync) {
        logger.info(`${tableName} 无需同步，服务端无更新`)
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

      // 第4步：更新同步元数据
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
        await this.atomicReplaceData(tableName, tempTableName)
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
    const db = await this.dbManager.getDatabase()

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
   * 检查是否有本地未同步修改
   */
  private async hasUnsynedLocalChanges(tableName: string): Promise<boolean> {
    const db = await this.dbManager.getDatabase()
    const result = await db.get(
      `
            SELECT COUNT(*) as count 
            FROM change_log 
            WHERE table_name = ? AND sync_status = 'pending'
        `,
      [tableName]
    )
    return (result?.count || 0) > 0
  }

  /**
   * 获取服务端表信息
   */
  private async getServerTableInfo(tableName: string): Promise<{ lastModified: string; version: number }> {
    const response = await this.apiClient.get(`/api/v1/sync/table-info/${tableName}`)
    return {
      lastModified: response.last_modified,
      version: response.version
    }
  }

  /**
   * 启动全量同步会话
   */
  private async startFullSync(tableName: string, pageSize: number): Promise<FullSyncSession> {
    const response = await this.apiClient.post('/api/v1/sync/full-sync/start', {
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
   * 完成同步会话
   */
  private async finishSync(sessionId: string): Promise<void> {
    try {
      await this.apiClient.delete(`/api/v1/sync/full-sync/finish/${sessionId}`)
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
   * 创建临时表（复用 BatchSyncManager 逻辑）
   */
  private async createTempTable(originalTableName: string): Promise<string> {
    const tempTableName = `${originalTableName}_temp_${Date.now()}`
    const db = await this.dbManager.getDatabase()

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

    const tempTableSql = tableSchema.sql.replace(new RegExp(`CREATE TABLE ${originalTableName}`, 'i'), `CREATE TABLE ${tempTableName}`)

    await db.exec(tempTableSql)
    logger.info(`临时表创建成功: ${tempTableName}`)
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

    await db.transaction(async (tx: any) => {
      try {
        await tx.exec(`ALTER TABLE ${originalTableName} RENAME TO ${backupTableName}`)
        await tx.exec(`ALTER TABLE ${tempTableName} RENAME TO ${originalTableName}`)
        await tx.exec(`DROP TABLE ${backupTableName}`)
        logger.info(`数据替换成功: ${originalTableName}`)
      } catch (error) {
        logger.error('原子替换失败，尝试回滚:', error)
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
  private async prepareSyncEnvironment(tableName: string): Promise<void> {
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
    if (result) return result as SyncMetadata
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
  private async resolveConflict(tableName: string, localRecord: any, serverRecord: any, metadata: SyncMetadata): Promise<MergeResult> {
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

  private async performFieldLevelMerge(tableName: string, localRecord: any, serverRecord: any, rules: ConflictResolutionRule[]): Promise<any | null> {
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
}
