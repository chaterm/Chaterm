import { DatabaseManager } from './DatabaseManager'
import { ApiClient } from './ApiClient'
import { logger } from '../utils/logger'
import { ChangeRecord, ServerChangeLog, SyncResponse } from '../models/SyncTypes'
import { syncConfig } from '../config/sync.config'
import { Semaphore } from '../utils/semaphore'
import { getEncryptionService } from '../services/EncryptionRegistry'
import { decryptPayload, encryptPayload } from '../utils/combinedEncryption'

export class SyncEngine {
  constructor(
    private db: DatabaseManager,
    private api: ApiClient
  ) {}

  async incrementalSync(tableName: string): Promise<SyncResponse> {
    const pending = this.db.getPendingChanges().filter((c) => c.table_name === tableName)
    if (pending.length === 0) {
      return { success: true, message: '无待同步变更', synced_count: 0, failed_count: 0 }
    }

    // 智能压缩变更记录（如果启用）
    const compressedChanges = syncConfig.compressionEnabled ? this.compressChanges(pending) : pending
    if (syncConfig.compressionEnabled) {
      this.logCompressionStats(pending, compressedChanges, '批量增量')
    }

    // 分批
    const batches: ChangeRecord[][] = []
    for (let i = 0; i < compressedChanges.length; i += syncConfig.batchSize) {
      batches.push(compressedChanges.slice(i, i + syncConfig.batchSize))
    }

    const semaphore = new Semaphore(syncConfig.maxConcurrentBatches)
    let totalSynced = 0
    let totalFailed = 0

    await Promise.all(
      batches.map(async (batch) => {
        const release = await semaphore.acquire()
        try {
          const data = await Promise.all(
            batch.map((b) => this.prepareRecordForUpload(tableName, { ...b.change_data, operation_type: b.operation_type }))
          )
          const res = await this.withRetry(() => this.api.incrementalSync(tableName, data))

          const conflictUUIDs = new Set((res.conflicts || []).map((c) => c.uuid))
          const conflictIds = batch.filter((b) => conflictUUIDs.has(b.record_uuid)).map((b) => b.id)
          const successIds = batch.filter((b) => !conflictUUIDs.has(b.record_uuid)).map((b) => b.id)

          // 标记状态
          this.db.markChangesSynced(successIds)
          if (conflictIds.length > 0) {
            const reason = (res.conflicts || []).map((c) => `${c.uuid}:${c.reason}`).join(',')
            this.db.markChangesConflict(conflictIds, reason)
          }

          // 对成功的 UPDATE 记录，更新本地版本号为服务器版本号
          for (const b of batch) {
            if (!conflictUUIDs.has(b.record_uuid) && b.operation_type === 'UPDATE') {
              const current = b.change_data?.version
              if (typeof current === 'number' && current > 0) {
                const newVersion = current + 1
                // 服务器更新成功后版本号会递增，所以本地也要同步到服务器的版本号
                this.db.setVersion(tableName, b.record_uuid, newVersion)
              } else {
                console.log(` 跳过版本号更新: UUID=${b.record_uuid}, 版本=${current} (类型=${typeof current})`)
              }
            }
          }

          totalSynced += successIds.length
          totalFailed += conflictIds.length
        } catch (e: any) {
          // 检查是否是网络连接错误
          if (e?.message === 'NETWORK_UNAVAILABLE' || e?.isNetworkError) {
            logger.warn('服务器不可用，跳过批次上传')
            // 网络错误不计入失败次数
          } else {
            logger.error('批次上传失败', e?.message)
            totalFailed += batch.length
          }
        } finally {
          release()
        }
      })
    )

    return { success: totalFailed === 0, message: '增量同步完成', synced_count: totalSynced, failed_count: totalFailed }
  }

  /**
   * 智能增量同步 - 根据数据量自动选择最优处理策略
   */
  async incrementalSyncSmart(tableName: string): Promise<SyncResponse> {
    const totalChanges = this.db.getTotalPendingChangesCount(tableName)

    logger.info(`智能同步分析: ${tableName} 有 ${totalChanges} 条待同步变更`)

    // 根据配置的阈值动态选择策略
    if (totalChanges <= syncConfig.largeDataThreshold) {
      return await this.incrementalSync(tableName)
    }
    // 大数据量：使用增强的分页处理
    return await this.incrementalSyncLargeData(tableName)
  }

  /**
   * 大数据量增量同步 - 增强版分页处理
   * 集成 PagedIncrementalSyncManager 的核心优势
   */
  private async incrementalSyncLargeData(tableName: string): Promise<SyncResponse> {
    const startTime = Date.now()
    const totalChanges = this.db.getTotalPendingChangesCount(tableName)

    if (totalChanges === 0) {
      return { success: true, message: '无待同步变更', synced_count: 0, failed_count: 0 }
    }

    // 自适应页面大小
    const adaptivePageSize = this.calculateOptimalPageSize(totalChanges)
    const totalPages = Math.ceil(totalChanges / adaptivePageSize)

    logger.info(`大数据量同步开始: ${tableName}, 总计 ${totalChanges} 条, 分 ${totalPages} 页, 页大小 ${adaptivePageSize}`)

    let totalSynced = 0
    let totalFailed = 0
    let currentPage = 1
    let offset = 0

    // 并发控制
    const semaphore = new Semaphore(syncConfig.maxConcurrentPages)
    const pagePromises: Promise<void>[] = []

    while (offset < totalChanges) {
      const pageOffset = offset
      const pageNumber = currentPage

      // 创建页面处理任务
      const pagePromise = semaphore.acquire().then(async (release) => {
        try {
          const pageResult = await this.processLargeDataPage(tableName, adaptivePageSize, pageOffset, pageNumber, totalPages)

          totalSynced += pageResult.synced
          totalFailed += pageResult.failed
        } catch (error) {
          logger.error(`页面 ${pageNumber} 处理失败:`, error)
          totalFailed += adaptivePageSize // 估算失败数量
        } finally {
          release()
        }
      })

      pagePromises.push(pagePromise)

      offset += adaptivePageSize
      currentPage++

      // 控制并发数量，避免创建过多Promise
      if (pagePromises.length >= syncConfig.maxConcurrentPages * 2) {
        await Promise.all(pagePromises.splice(0, syncConfig.maxConcurrentPages))
      }
    }

    // 等待所有页面处理完成
    await Promise.all(pagePromises)

    const duration = Date.now() - startTime
    const throughput = Math.round(totalSynced / (duration / 1000))

    const message = `大数据量同步完成: ${totalPages} 页, 成功 ${totalSynced}, 失败 ${totalFailed}, 耗时 ${duration}ms, 吞吐量 ${throughput} 条/秒`

    return {
      success: totalFailed === 0,
      message,
      synced_count: totalSynced,
      failed_count: totalFailed
    }
  }

  /**
   * 处理一批变更记录
   */
  private async processBatchChanges(tableName: string, changes: ChangeRecord[]): Promise<SyncResponse> {
    const semaphore = new Semaphore(syncConfig.maxConcurrentBatches)
    let batchSynced = 0
    let batchFailed = 0

    // 智能压缩当前页的变更记录（如果启用）
    const compressedChanges = syncConfig.compressionEnabled ? this.compressChanges(changes) : changes
    if (syncConfig.compressionEnabled) {
      this.logCompressionStats(changes, compressedChanges, '分页')
    }

    // 将页面数据再分成小批次
    const batches: ChangeRecord[][] = []
    for (let i = 0; i < compressedChanges.length; i += syncConfig.batchSize) {
      batches.push(compressedChanges.slice(i, i + syncConfig.batchSize))
    }

    await Promise.all(
      batches.map(async (batch) => {
        const release = await semaphore.acquire()
        try {
          const data = await Promise.all(
            batch.map((b) => this.prepareRecordForUpload(tableName, { ...b.change_data, operation_type: b.operation_type }))
          )
          const res = await this.withRetry(() => this.api.incrementalSync(tableName, data))

          const conflictUUIDs = new Set((res.conflicts || []).map((c) => c.uuid))
          const conflictIds = batch.filter((b) => conflictUUIDs.has(b.record_uuid)).map((b) => b.id)
          const successIds = batch.filter((b) => !conflictUUIDs.has(b.record_uuid)).map((b) => b.id)

          // 标记状态
          this.db.markChangesSynced(successIds)
          if (conflictIds.length > 0) {
            const reason = (res.conflicts || []).map((c) => `${c.uuid}:${c.reason}`).join(',')
            this.db.markChangesConflict(conflictIds, reason)
          }

          batchSynced += successIds.length
          batchFailed += conflictIds.length
        } catch (e: any) {
          // 检查是否是网络连接错误
          if (e?.message === 'NETWORK_UNAVAILABLE' || e?.isNetworkError) {
            logger.warn('服务器不可用，跳过批次上传')
            // 网络错误不计入失败次数
          } else {
            logger.error('批次上传失败', e?.message)
            batchFailed += batch.length
          }
        } finally {
          release()
        }
      })
    )

    return {
      success: batchFailed === 0,
      message: '批次处理完成',
      synced_count: batchSynced,
      failed_count: batchFailed
    }
  }

  private async withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelay = 500): Promise<T> {
    let lastErr: any
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn()
      } catch (e) {
        lastErr = e
        const delay = Math.min(10000, baseDelay * Math.pow(2, i))
        await new Promise((res) => setTimeout(res, delay))
      }
    }
    throw lastErr
  }

  async downloadAndApplyCloudChanges(): Promise<{ applied: number; lastSeq: number }> {
    let since = this.db.getLastSequenceId()
    let applied = 0
    let lastSeq = since

    // 开启远端应用守卫，抑制触发器写入change_log
    this.db.setRemoteApplyGuard(true)
    try {
      let hasMore = true
      while (hasMore) {
        const { changes, hasMore: nextHasMore, lastSequenceId } = await this.api.getChanges(since, syncConfig.batchSize)
        if (!changes || changes.length === 0) {
          hasMore = false
          break
        }

        for (const ch of changes) {
          await this.applySingleChange(ch)
          applied += 1
          lastSeq = Math.max(lastSeq, ch.sequence_id)
        }

        this.db.setLastSequenceId(lastSeq)
        hasMore = !!nextHasMore
        if (hasMore) {
          since = lastSequenceId
        }
      }
    } finally {
      this.db.setRemoteApplyGuard(false)
    }

    logger.info(`下载并应用云端变更完成: ${applied} 条, lastSeq=${lastSeq}`)
    return { applied, lastSeq }
  }

  async fullSyncAndApply(tableName: string): Promise<number> {
    // 全量拉取并应用，默认按 INSERT 方式 upsert
    this.db.setRemoteApplyGuard(true)
    try {
      const res = await this.api.fullSync(tableName)
      const list = res.data || []
      let applied = 0
      for (const raw of list) {
        const data = await this.maybeDecryptChange(tableName, raw)
        if (tableName === 't_assets_sync') {
          this.applyToAssets('INSERT', data)
        } else if (tableName === 't_asset_chains_sync') {
          this.applyToAssetChains('INSERT', data)
        }
        applied += 1
      }
      logger.info(`全量同步应用完成: ${tableName} 共 ${applied} 条`)
      return applied
    } finally {
      this.db.setRemoteApplyGuard(false)
    }
  }

  private async applySingleChange(ch: ServerChangeLog) {
    const raw = ch.change_data ? JSON.parse(ch.change_data) : {}
    const baseTable = ch.target_table.startsWith('t_assets_sync')
      ? 't_assets_sync'
      : ch.target_table.startsWith('t_asset_chains_sync')
        ? 't_asset_chains_sync'
        : ch.target_table
    const data = await this.maybeDecryptChange(baseTable, raw)
    if (ch.target_table.startsWith('t_assets_sync')) {
      this.applyToAssets(ch.operation_type, data)
    } else if (ch.target_table.startsWith('t_asset_chains_sync')) {
      this.applyToAssetChains(ch.operation_type, data)
    }
  }

  private async maybeDecryptChange(tableName: string, data: any): Promise<any> {
    if (!data) return data
    try {
      const service = getEncryptionService()
      logger.info('加密服务状态:', service ? '已获取' : '未获取')

      if (tableName === 't_assets_sync') {
        const cipher: string | undefined = typeof data.data_cipher_text === 'string' ? data.data_cipher_text : undefined
        if (cipher) {
          logger.info('开始解密 t_assets_sync 数据...')
          const sensitive = await decryptPayload(cipher, service)
          if (sensitive && sensitive.password !== undefined) {
            data.password = sensitive.password
          }
          if (sensitive && sensitive.username !== undefined) {
            data.username = sensitive.username
          }
        }
      } else if (tableName === 't_asset_chains_sync') {
        const cipher: string | undefined = typeof data.data_cipher_text === 'string' ? data.data_cipher_text : undefined
        if (cipher) {
          logger.info('开始解密 t_asset_chains_sync 数据...')
          const sensitive = await decryptPayload(cipher, service)
          if (sensitive.chain_private_key !== undefined) {
            data.chain_private_key = sensitive.chain_private_key
          }
          if (sensitive.passphrase !== undefined) {
            data.passphrase = sensitive.passphrase
          }
        }
      }
      if ('data_cipher_text' in data) {
        delete data.data_cipher_text
      }

      // 修复：根据表名过滤字段，只保留对应表的字段
      data = this.filterFieldsByTable(tableName, data)
    } catch (e) {
      logger.warn('新格式密文解密失败，按原样应用', e)
      logger.error('解密异常详情:', {
        error: e,
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined
      })
    }

    return data
  }

  /**
   * 根据表名过滤字段，只保留对应表的字段
   * @param tableName 表名
   * @param data 数据对象
   * @returns 过滤后的数据对象
   */
  private filterFieldsByTable(tableName: string, data: any): any {
    if (!data || typeof data !== 'object') return data

    // 定义各表的有效字段
    const tableFields = {
      t_assets_sync: [
        'uuid',
        'label',
        'asset_ip',
        'group_name',
        'auth_type',
        'port',
        'username',
        'password',
        'key_chain_id',
        'favorite',
        'asset_type',
        'created_at',
        'updated_at',
        'version'
      ],
      t_asset_chains_sync: [
        'key_chain_id',
        'uuid',
        'chain_name',
        'chain_type',
        'chain_public_key',
        'chain_private_key',
        'passphrase',
        'created_at',
        'updated_at',
        'version'
      ]
    }

    const validFields = tableFields[tableName as keyof typeof tableFields]
    if (!validFields) {
      logger.warn(`未知的表名: ${tableName}，返回原始数据`)
      return data
    }

    // 只保留有效字段
    const filteredData: any = {}
    validFields.forEach((field) => {
      if (field in data) {
        filteredData[field] = data[field]
      }
    })
    return filteredData
  }

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
    // 后端已支持原始数据格式，无需标准化
    return record
  }

  private applyToAssets(op: string, data: any) {
    if (!data) return
    switch (op) {
      case 'INSERT':
      case 'UPDATE':
        this.db.upsertAsset({
          uuid: data.uuid,
          label: data.label,
          asset_ip: data.asset_ip,
          group_name: data.group_name,
          auth_type: data.auth_type,
          port: data.port,
          username: data.username,
          password: data.password,
          key_chain_id: data.key_chain_id ?? undefined,
          favorite: data.favorite ?? 2, // 保持原始整数值，默认为2（未收藏）
          asset_type: data.asset_type,
          created_at: data.created_at ?? new Date().toISOString(),
          updated_at: data.updated_at ?? new Date().toISOString(),
          version: typeof data.version === 'number' ? data.version : 1
        } as any)
        break
      case 'DELETE':
        if (data?.uuid) this.db.deleteAssetByUUID(data.uuid)
        break
    }
  }

  private applyToAssetChains(op: string, data: any) {
    if (!data) return
    switch (op) {
      case 'INSERT':
      case 'UPDATE':
        this.db.upsertAssetChain({
          key_chain_id: data.key_chain_id,
          uuid: data.uuid,
          chain_name: data.chain_name,
          chain_type: data.chain_type,
          chain_private_key: data.chain_private_key,
          chain_public_key: data.chain_public_key,
          passphrase: data.passphrase,
          created_at: data.created_at ?? new Date().toISOString(),
          updated_at: data.updated_at ?? new Date().toISOString(),
          version: typeof data.version === 'number' ? data.version : 1
        } as any)
        break
      case 'DELETE':
        if (data?.uuid) this.db.deleteAssetChainByUUID(data.uuid)
        break
    }
  }

  /**
   * 智能压缩变更记录
   * 将同一记录的多次变更合并为最终状态，减少同步工作量
   *
   * 压缩规则：
   * 1. DELETE 操作覆盖之前的所有操作
   * 2. INSERT + UPDATE = INSERT（使用最新数据）
   * 3. 多个 UPDATE 合并为最后一个 UPDATE
   * 4. 已删除的记录忽略后续操作
   * 5. INSERT + DELETE = 无操作（记录从未存在过）
   *
   * @param changes 原始变更记录数组
   * @returns 压缩后的变更记录数组
   */
  private compressChanges(changes: ChangeRecord[]): ChangeRecord[] {
    if (changes.length <= 1) {
      return changes // 无需压缩
    }

    const recordMap = new Map<string, ChangeRecord>()
    const deletedRecords = new Set<string>() // 跟踪被删除的记录

    for (const change of changes) {
      const key = `${change.table_name}-${change.record_uuid}`
      const existing = recordMap.get(key)

      if (!existing) {
        recordMap.set(key, change)
        if (change.operation_type === 'DELETE') {
          deletedRecords.add(key)
        }
        continue
      }

      // 合并变更逻辑
      if (change.operation_type === 'DELETE') {
        if (existing.operation_type === 'INSERT') {
          // INSERT + DELETE = 无操作（记录从未真正存在过）
          recordMap.delete(key)
          deletedRecords.add(key)
        } else {
          // UPDATE + DELETE = DELETE
          recordMap.set(key, change)
          deletedRecords.add(key)
        }
      } else if (deletedRecords.has(key)) {
        // 如果记录已被删除，忽略后续的 INSERT/UPDATE 操作
        // 这种情况在实际应用中很少见，但为了数据一致性需要处理
        continue
      } else if (existing.operation_type === 'INSERT' && change.operation_type === 'UPDATE') {
        // INSERT + UPDATE = INSERT（使用最新数据）
        recordMap.set(key, {
          ...change,
          operation_type: 'INSERT',
          change_data: change.change_data,
          // 保留原始 INSERT 的 ID 以维持顺序
          id: existing.id
        })
      } else if (existing.operation_type === 'UPDATE' && change.operation_type === 'UPDATE') {
        // UPDATE + UPDATE = UPDATE（使用最新数据）
        recordMap.set(key, {
          ...change,
          // 保留第一个 UPDATE 的 ID 以维持顺序
          id: existing.id
        })
      } else {
        // 其他情况使用最新的变更
        recordMap.set(key, change)
      }
    }

    const compressed = Array.from(recordMap.values())

    // 按原始 ID 排序，保持操作顺序的一致性
    compressed.sort((a, b) => {
      // 使用数字 ID 排序，如果 ID 不是数字则按字符串排序
      const aId = typeof a.id === 'number' ? a.id : parseInt(a.id as string, 10)
      const bId = typeof b.id === 'number' ? b.id : parseInt(b.id as string, 10)

      if (!isNaN(aId) && !isNaN(bId)) {
        return aId - bId
      }

      // 如果无法转换为数字，则按字符串排序
      return String(a.id).localeCompare(String(b.id))
    })

    return compressed
  }

  /**
   * 计算最优页面大小
   * 根据数据量和系统配置自适应调整
   */
  private calculateOptimalPageSize(totalChanges: number): number {
    if (!syncConfig.adaptivePageSize) {
      return syncConfig.pageSize
    }

    // 基于总数据量的自适应算法
    if (totalChanges <= 10000) {
      return Math.min(syncConfig.pageSize, 1000) // 小数据量用较小页面
    } else if (totalChanges <= 50000) {
      return Math.min(syncConfig.pageSize * 1.5, 1500) // 中等数据量
    } else {
      return Math.min(syncConfig.pageSize * 2, 2000) // 大数据量用较大页面
    }
  }

  /**
   * 处理大数据量的单个页面
   * 集成智能压缩和内存优化
   */
  private async processLargeDataPage(
    tableName: string,
    pageSize: number,
    offset: number,
    pageNumber: number,
    totalPages: number
  ): Promise<{ synced: number; failed: number }> {
    try {
      // 分页获取数据（内存优化）
      const pageChanges = this.db.getPendingChangesPage(tableName, pageSize, offset)

      if (pageChanges.length === 0) {
        return { synced: 0, failed: 0 }
      }

      logger.debug(`处理页面 ${pageNumber}/${totalPages}: ${pageChanges.length} 条变更`)

      // 应用智能压缩
      const compressedChanges = syncConfig.compressionEnabled ? this.compressChanges(pageChanges) : pageChanges

      if (syncConfig.compressionEnabled && compressedChanges.length < pageChanges.length) {
        logger.debug(`页面 ${pageNumber} 压缩: ${pageChanges.length} -> ${compressedChanges.length}`)
      }

      // 处理压缩后的变更
      const result = await this.processBatchChanges(tableName, compressedChanges)

      // 内存优化：及时清理大对象
      if (syncConfig.memoryOptimization) {
        // 强制垃圾回收提示（在支持的环境中）
        if (global.gc && pageNumber % 10 === 0) {
          global.gc()
        }
      }

      return {
        synced: result.synced_count || 0,
        failed: result.failed_count || 0
      }
    } catch (error) {
      logger.error(`页面 ${pageNumber} 处理异常:`, error)
      return { synced: 0, failed: pageSize }
    }
  }

  /**
   * 分析压缩效果并记录详细统计信息
   * @param original 原始变更记录
   * @param compressed 压缩后的变更记录
   * @param context 上下文信息（如 "批量同步" 或 "页面同步"）
   */
  private logCompressionStats(original: ChangeRecord[], compressed: ChangeRecord[], context: string = '同步'): void {
    if (original.length === compressed.length) {
      return // 无压缩效果，不记录
    }

    const reduction = original.length - compressed.length
    const reductionPercentage = Math.round((reduction / original.length) * 100)

    // 统计操作类型分布
    const originalStats = this.getOperationStats(original)
    const compressedStats = this.getOperationStats(compressed)

    logger.info(`${context}压缩统计:`, {
      原始记录数: original.length,
      压缩后记录数: compressed.length,
      减少数量: reduction,
      压缩率: `${reductionPercentage}%`,
      原始分布: originalStats,
      压缩后分布: compressedStats
    })
  }

  /**
   * 统计操作类型分布
   * @param changes 变更记录数组
   * @returns 操作类型统计对象
   */
  private getOperationStats(changes: ChangeRecord[]): Record<string, number> {
    const stats: Record<string, number> = { INSERT: 0, UPDATE: 0, DELETE: 0 }

    for (const change of changes) {
      if (change.operation_type in stats) {
        stats[change.operation_type]++
      }
    }

    return stats
  }
}
