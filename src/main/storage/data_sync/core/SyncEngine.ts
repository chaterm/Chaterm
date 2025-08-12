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

    // 分批
    const batches: ChangeRecord[][] = []
    for (let i = 0; i < pending.length; i += syncConfig.batchSize) {
      batches.push(pending.slice(i, i + syncConfig.batchSize))
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

          // 对成功的 UPDATE 记录，本地自增 version（减少再次冲突窗口）
          for (const b of batch) {
            if (!conflictUUIDs.has(b.record_uuid) && b.operation_type === 'UPDATE') {
              const current = b.change_data?.version
              if (typeof current === 'number' && current > 0) {
                this.db.bumpVersion(tableName, b.record_uuid, current)
              }
            }
          }

          totalSynced += successIds.length
          totalFailed += conflictIds.length
        } catch (e: any) {
          logger.error('批次上传失败', e?.message)
          totalFailed += batch.length
        } finally {
          release()
        }
      })
    )

    return { success: totalFailed === 0, message: '增量同步完成', synced_count: totalSynced, failed_count: totalFailed }
  }

  /**
   * 智能增量同步 - 根据数据量自动选择分页或批量模式
   */
  async incrementalSyncSmart(tableName: string): Promise<SyncResponse> {
    const totalChanges = this.db.getTotalPendingChangesCount(tableName)

    // 小数据量：使用现有批量方法
    if (totalChanges <= 1000) {
      logger.info(`数据量较小 (${totalChanges}条)，使用批量同步`)
      return await this.incrementalSync(tableName)
    }

    // 大数据量：使用分页处理
    logger.info(`数据量较大 (${totalChanges}条)，使用分页同步`)
    return await this.incrementalSyncPaged(tableName)
  }

  /**
   * 分页增量同步 - 处理大数据量场景
   */
  private async incrementalSyncPaged(tableName: string): Promise<SyncResponse> {
    const pageSize = 500
    let offset = 0
    let totalSynced = 0
    let totalFailed = 0
    let currentPage = 1

    const totalChanges = this.db.getTotalPendingChangesCount(tableName)
    const totalPages = Math.ceil(totalChanges / pageSize)

    logger.info(`开始分页增量同步: ${totalChanges} 条变更，分 ${totalPages} 页处理`)

    while (offset < totalChanges) {
      const pageChanges = this.db.getPendingChangesPage(tableName, pageSize, offset)
      if (pageChanges.length === 0) break

      logger.info(`处理第 ${currentPage}/${totalPages} 页: ${pageChanges.length} 条变更`)

      try {
        // 使用现有的批处理逻辑
        const result = await this.processBatchChanges(tableName, pageChanges)
        totalSynced += result.synced_count || 0
        totalFailed += result.failed_count || 0

        logger.info(`第 ${currentPage} 页完成: 成功 ${result.synced_count}, 失败 ${result.failed_count}`)
      } catch (error) {
        logger.error(`第 ${currentPage} 页处理失败:`, error)
        totalFailed += pageChanges.length
      }

      offset += pageSize
      currentPage++

      // 小延迟，避免过度占用资源
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    const message = `分页增量同步完成: ${totalPages} 页，成功 ${totalSynced}，失败 ${totalFailed}`
    logger.info(message)

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

    // 将页面数据再分成小批次
    const batches: ChangeRecord[][] = []
    for (let i = 0; i < changes.length; i += syncConfig.batchSize) {
      batches.push(changes.slice(i, i + syncConfig.batchSize))
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
          logger.error('批次上传失败', e?.message)
          batchFailed += batch.length
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
      if (tableName === 't_assets_sync') {
        const cipher: string | undefined = typeof data.data_cipher_text === 'string' ? data.data_cipher_text : undefined
        if (cipher) {
          const sensitive = await decryptPayload(cipher, service)
          if (sensitive && sensitive.password !== undefined) data.password = sensitive.password
          if (sensitive && sensitive.username !== undefined) data.username = sensitive.username
        }
      } else if (tableName === 't_asset_chains_sync') {
        const cipher: string | undefined = typeof data.data_cipher_text === 'string' ? data.data_cipher_text : undefined
        if (cipher) {
          const sensitive = await decryptPayload(cipher, service)
          if (sensitive.chain_private_key !== undefined) data.chain_private_key = sensitive.chain_private_key
          if (sensitive.passphrase !== undefined) data.passphrase = sensitive.passphrase
        }
      }
    } catch (e) {
      logger.warn('新格式密文解密失败，按原样应用', e)
    }

    return data
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
            return record
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
            return record
          }
        }
      }
    } catch (e) {
      logger.warn('加密敏感字段失败，按明文上行', e)
    }
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
          favorite: !!data.favorite,
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
}
