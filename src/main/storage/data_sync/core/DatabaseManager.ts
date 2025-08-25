import Database from 'better-sqlite3'
import { Asset, AssetChain, ChangeRecord } from '../models/SyncTypes'
import { logger } from '../utils/logger'

export class DatabaseManager {
  private db: Database.Database
  // 预编译常用SQL语句以提高性能
  private markSyncedStmt: Database.Statement
  private markConflictStmt: Database.Statement
  private updateVersionStmt: Database.Statement
  private updateChainVersionStmt: Database.Statement

  constructor(private dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')

    // 预编译常用SQL语句
    this.markSyncedStmt = this.db.prepare(`UPDATE change_log SET sync_status = 'synced' WHERE id = ?`)
    this.markConflictStmt = this.db.prepare(`UPDATE change_log SET sync_status = 'failed', error_message = ? WHERE id = ?`)
    this.updateVersionStmt = this.db.prepare(`UPDATE t_assets SET version = ?, updated_at = datetime('now') WHERE uuid = ?`)
    this.updateChainVersionStmt = this.db.prepare(`UPDATE t_asset_chains SET version = ?, updated_at = datetime('now') WHERE uuid = ?`)

    this.ensureMetaTables()
    this.ensureChangeTriggers()
  }

  private ensureMetaTables() {
    // 同步相关的表和索引已在数据库服务初始化时自动检测并创建
    // 这里不需要额外操作
  }

  /**
   * 控制是否记录触发器（用于应用远端变更时抑制回声）
   * @param enabled 是否启用远程应用保护
   */
  setRemoteApplyGuard(enabled: boolean) {
    const flag = enabled ? '1' : null
    // 创建/更新标记
    if (enabled) {
      this.db.prepare(`INSERT INTO sync_meta(key, value) VALUES('apply_remote_guard', '1') ON CONFLICT(key) DO UPDATE SET value='1'`).run()
    } else {
      this.db.prepare(`DELETE FROM sync_meta WHERE key = 'apply_remote_guard'`).run()
    }
  }

  private ensureChangeTriggers() {
    // 资产表 INSERT/UPDATE/DELETE
    this.db.exec(`
      DROP TRIGGER IF EXISTS tr_assets_insert;
      CREATE TRIGGER IF NOT EXISTS tr_assets_insert AFTER INSERT ON t_assets
      WHEN (SELECT value FROM sync_meta WHERE key = 'apply_remote_guard') IS NULL
      BEGIN
        INSERT INTO change_log (id, table_name, record_uuid, operation_type, change_data)
        VALUES (hex(randomblob(8)) || '-' || hex(randomblob(4)) || '-' || hex(randomblob(4)) || '-' || hex(randomblob(4)) || '-' || hex(randomblob(12)),
                't_assets_sync', NEW.uuid, 'INSERT', json_object(
                  'uuid', NEW.uuid,
                  'label', NEW.label,
                  'asset_ip', NEW.asset_ip,
                  'group_name', NEW.group_name,
                  'auth_type', NEW.auth_type,
                  'port', NEW.port,
                  'username', NEW.username,
                  'password', NEW.password,
                  'key_chain_id', NEW.key_chain_id,
                                  'favorite', NEW.favorite,
                'asset_type', NEW.asset_type,
                'created_at', NEW.created_at,
                'updated_at', NEW.updated_at,
                'version', NEW.version
              ));
        -- 设置同步信号标记
        INSERT INTO sync_meta(key, value) VALUES('sync_signal', datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value=datetime('now');
      END;
    `)

    this.db.exec(`
      DROP TRIGGER IF EXISTS tr_assets_update;
      CREATE TRIGGER IF NOT EXISTS tr_assets_update AFTER UPDATE ON t_assets
      WHEN (SELECT value FROM sync_meta WHERE key = 'apply_remote_guard') IS NULL
      BEGIN
        INSERT INTO change_log (id, table_name, record_uuid, operation_type, change_data, before_data)
        VALUES (hex(randomblob(8)) || '-' || hex(randomblob(4)) || '-' || hex(randomblob(4)) || '-' || hex(randomblob(4)) || '-' || hex(randomblob(12)),
                't_assets_sync', NEW.uuid, 'UPDATE', json_object(
                  'uuid', NEW.uuid,
                  'label', NEW.label,
                  'asset_ip', NEW.asset_ip,
                  'group_name', NEW.group_name,
                  'auth_type', NEW.auth_type,
                  'port', NEW.port,
                  'username', NEW.username,
                  'password', NEW.password,
                  'key_chain_id', NEW.key_chain_id,
                  'favorite', NEW.favorite,
                  'asset_type', NEW.asset_type,
                  'created_at', NEW.created_at,
                  'updated_at', NEW.updated_at,
                  'version', NEW.version
                ), json_object(
                  'uuid', OLD.uuid,
                  'label', OLD.label,
                  'asset_ip', OLD.asset_ip,
                  'group_name', OLD.group_name,
                  'auth_type', OLD.auth_type,
                  'port', OLD.port,
                  'username', OLD.username,
                  'password', OLD.password,
                  'key_chain_id', OLD.key_chain_id,
                  'favorite', OLD.favorite,
                  'asset_type', OLD.asset_type,
                  'created_at', OLD.created_at,
                  'updated_at', OLD.updated_at,
                  'version', OLD.version
                ));
        -- 设置同步信号标记
        INSERT INTO sync_meta(key, value) VALUES('sync_signal', datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value=datetime('now');
      END;
    `)

    this.db.exec(`
      DROP TRIGGER IF EXISTS tr_assets_delete;
      CREATE TRIGGER IF NOT EXISTS tr_assets_delete AFTER DELETE ON t_assets
      WHEN (SELECT value FROM sync_meta WHERE key = 'apply_remote_guard') IS NULL
      BEGIN
        INSERT INTO change_log (id, table_name, record_uuid, operation_type, change_data, before_data)
        VALUES (hex(randomblob(8)) || '-' || hex(randomblob(4)) || '-' || hex(randomblob(4)) || '-' || hex(randomblob(4)) || '-' || hex(randomblob(12)),
                't_assets_sync', OLD.uuid, 'DELETE', json_object('uuid', OLD.uuid, 'version', OLD.version), json_object('uuid', OLD.uuid, 'version', OLD.version));
        -- 设置同步信号标记
        INSERT INTO sync_meta(key, value) VALUES('sync_signal', datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value=datetime('now');
      END;
    `)

    // 资产链表触发器
    this.db.exec(`
      DROP TRIGGER IF EXISTS tr_chains_insert;
      CREATE TRIGGER IF NOT EXISTS tr_chains_insert AFTER INSERT ON t_asset_chains
      WHEN (SELECT value FROM sync_meta WHERE key = 'apply_remote_guard') IS NULL
      BEGIN
        INSERT INTO change_log (id, table_name, record_uuid, operation_type, change_data)
        VALUES (hex(randomblob(8)) || '-' || hex(randomblob(4)) || '-' || hex(randomblob(4)) || '-' || hex(randomblob(4)) || '-' || hex(randomblob(12)),
                't_asset_chains_sync', NEW.uuid, 'INSERT', json_object(
                  'key_chain_id', NEW.key_chain_id,
                  'uuid', NEW.uuid,
                  'chain_name', NEW.chain_name,
                  'chain_type', NEW.chain_type,
                  'chain_private_key', NEW.chain_private_key,
                  'chain_public_key', NEW.chain_public_key,
                  'passphrase', NEW.passphrase,
                  'created_at', NEW.created_at,
                  'updated_at', NEW.updated_at,
                  'version', NEW.version
                ));
        -- 设置同步信号标记
        INSERT INTO sync_meta(key, value) VALUES('sync_signal', datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value=datetime('now');
      END;
    `)

    this.db.exec(`
      DROP TRIGGER IF EXISTS tr_chains_update;
      CREATE TRIGGER IF NOT EXISTS tr_chains_update AFTER UPDATE ON t_asset_chains
      WHEN (SELECT value FROM sync_meta WHERE key = 'apply_remote_guard') IS NULL
      BEGIN
        INSERT INTO change_log (id, table_name, record_uuid, operation_type, change_data, before_data)
        VALUES (hex(randomblob(8)) || '-' || hex(randomblob(4)) || '-' || hex(randomblob(4)) || '-' || hex(randomblob(4)) || '-' || hex(randomblob(12)),
                't_asset_chains_sync', NEW.uuid, 'UPDATE', json_object(
                  'key_chain_id', NEW.key_chain_id,
                  'uuid', NEW.uuid,
                  'chain_name', NEW.chain_name,
                  'chain_type', NEW.chain_type,
                  'chain_private_key', NEW.chain_private_key,
                  'chain_public_key', NEW.chain_public_key,
                  'passphrase', NEW.passphrase,
                  'created_at', NEW.created_at,
                  'updated_at', NEW.updated_at,
                  'version', NEW.version
                ), json_object(
                  'key_chain_id', OLD.key_chain_id,
                  'uuid', OLD.uuid,
                  'chain_name', OLD.chain_name,
                  'chain_type', OLD.chain_type,
                  'chain_private_key', OLD.chain_private_key,
                  'chain_public_key', OLD.chain_public_key,
                  'passphrase', OLD.passphrase,
                  'created_at', OLD.created_at,
                  'updated_at', OLD.updated_at,
                  'version', OLD.version
                ));
        -- 设置同步信号标记
        INSERT INTO sync_meta(key, value) VALUES('sync_signal', datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value=datetime('now');
      END;
    `)

    this.db.exec(`
      DROP TRIGGER IF EXISTS tr_chains_delete;
      CREATE TRIGGER IF NOT EXISTS tr_chains_delete AFTER DELETE ON t_asset_chains
      WHEN (SELECT value FROM sync_meta WHERE key = 'apply_remote_guard') IS NULL
      BEGIN
        INSERT INTO change_log (id, table_name, record_uuid, operation_type, change_data, before_data)
        VALUES (hex(randomblob(8)) || '-' || hex(randomblob(4)) || '-' || hex(randomblob(4)) || '-' || hex(randomblob(4)) || '-' || hex(randomblob(12)),
                't_asset_chains_sync', OLD.uuid, 'DELETE', json_object('uuid', OLD.uuid, 'version', OLD.version), json_object('uuid', OLD.uuid, 'version', OLD.version));
        -- 设置同步信号标记
        INSERT INTO sync_meta(key, value) VALUES('sync_signal', datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value=datetime('now');
      END;
    `)
  }

  getLastSequenceId(): number {
    const row = this.db.prepare(`SELECT value FROM sync_meta WHERE key = 'last_sequence_id'`).get() as { value?: string } | undefined
    return row?.value ? Number(row.value) : 0
  }

  setLastSequenceId(seq: number) {
    const up = this.db.prepare(`INSERT INTO sync_meta(key, value) VALUES('last_sequence_id', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
    up.run(String(seq))
  }

  getAssets(lastSyncTime?: Date): Asset[] {
    const sql = lastSyncTime ? `SELECT * FROM t_assets WHERE datetime(updated_at) > datetime(?)` : `SELECT * FROM t_assets`
    const stmt = this.db.prepare(sql)
    const rows = lastSyncTime ? stmt.all(lastSyncTime.toISOString()) : stmt.all()
    return rows as Asset[]
  }

  getAssetChains(lastSyncTime?: Date): AssetChain[] {
    const sql = lastSyncTime ? `SELECT * FROM t_asset_chains WHERE datetime(updated_at) > datetime(?)` : `SELECT * FROM t_asset_chains`
    const stmt = this.db.prepare(sql)
    const rows = lastSyncTime ? stmt.all(lastSyncTime.toISOString()) : stmt.all()
    return rows as AssetChain[]
  }

  /**
   * 获取待同步的变更记录
   * @returns 待同步的变更记录数组
   */
  getPendingChanges(): ChangeRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM change_log WHERE sync_status = 'pending' ORDER BY datetime(created_at) ASC
    `)
    const rows = stmt.all()
    return rows.map((r: any) => ({
      ...r,
      change_data: r.change_data ? JSON.parse(r.change_data) : null,
      before_data: r.before_data ? JSON.parse(r.before_data) : null
    })) as ChangeRecord[]
  }

  /**
   * 分页获取待同步变更
   */
  getPendingChangesPage(tableName: string, limit: number, offset: number): ChangeRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM change_log 
      WHERE sync_status = 'pending' AND table_name = ?
      ORDER BY datetime(created_at) ASC 
      LIMIT ? OFFSET ?
    `)
    const rows = stmt.all(tableName, limit, offset)
    return rows.map((r: any) => ({
      ...r,
      change_data: r.change_data ? JSON.parse(r.change_data) : null,
      before_data: r.before_data ? JSON.parse(r.before_data) : null
    })) as ChangeRecord[]
  }

  /**
   * 获取待同步变更总数
   */
  getTotalPendingChangesCount(tableName: string): number {
    const result = this.db
      .prepare(
        `
      SELECT COUNT(*) as count
      FROM change_log
      WHERE sync_status = 'pending' AND table_name = ?
    `
      )
      .get(tableName) as { count: number } | undefined
    return result?.count || 0
  }

  /**
   * 获取历史数据数量
   * 历史数据指：存在于数据表中但不在change_log中的数据
   */
  getHistoricalDataCount(tableName: string): number {
    try {
      // 检查表是否存在
      const tableExists = this.db
        .prepare(
          `
        SELECT name FROM sqlite_master
        WHERE type='table' AND name=?
      `
        )
        .get(tableName)

      if (!tableExists) {
        console.log(`表 ${tableName} 不存在`)
        return 0
      }

      // 获取表中的总记录数
      const totalStmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`)
      const totalResult = totalStmt.get() as { count: number }
      const totalCount = totalResult.count

      if (totalCount === 0) {
        console.log(`表 ${tableName} 为空`)
        return 0
      }

      // 查询在change_log中已记录的数据数量
      // 需要同时检查本地表名和同步表名
      const syncTableName = tableName + '_sync'
      const loggedStmt = this.db.prepare(`
        SELECT COUNT(DISTINCT record_uuid) as count
        FROM change_log
        WHERE (table_name = ? OR table_name = ?)
        AND record_uuid IS NOT NULL
        AND record_uuid IN (SELECT uuid FROM ${tableName})
      `)
      const loggedResult = loggedStmt.get(tableName, syncTableName) as { count: number }
      const loggedCount = loggedResult.count

      const historicalCount = totalCount - loggedCount

      console.log(`表 ${tableName} 历史数据检测: 总数=${totalCount}, 已记录=${loggedCount}, 历史数据=${historicalCount}`)

      return Math.max(0, historicalCount)
    } catch (error) {
      console.warn(`检查历史数据失败 (${tableName}):`, error)
      return 0
    }
  }

  /**
   * 标记变更记录为已同步
   * @param ids 变更记录ID数组
   */
  markChangesSynced(ids: string[]) {
    if (ids.length === 0) return
    const trx = this.db.transaction((ids: string[]) => {
      for (const id of ids) this.markSyncedStmt.run(id)
    })
    trx(ids)
  }

  /**
   * 标记变更记录为冲突状态
   * @param ids 变更记录ID数组
   * @param reason 冲突原因
   */
  markChangesConflict(ids: string[], reason: string) {
    if (ids.length === 0) return
    const trx = this.db.transaction((ids: string[]) => {
      for (const id of ids) this.markConflictStmt.run(reason, id)
    })
    trx(ids)
  }

  /**
   * 设置记录版本号
   * @param tableName 表名
   * @param uuid 记录UUID
   * @param newVersion 新版本号
   */
  setVersion(tableName: string, uuid: string, newVersion: number) {
    if (!uuid || !newVersion) {
      return
    }

    // 启用远程应用保护，避免版本号更新触发变更记录
    this.setRemoteApplyGuard(true)
    try {
      if (tableName === 't_assets_sync') {
        this.updateVersionStmt.run(newVersion, uuid)
      } else if (tableName === 't_asset_chains_sync') {
        this.updateChainVersionStmt.run(newVersion, uuid)
      } else {
        console.log(`⚠️ 未知表名: ${tableName}`)
      }
    } finally {
      // 确保在任何情况下都会关闭远程应用保护
      this.setRemoteApplyGuard(false)
    }
  }

  /**
   * 递增记录版本号（保留向后兼容）
   * @param tableName 表名
   * @param uuid 记录UUID
   * @param currentVersion 当前版本号
   */
  bumpVersion(tableName: string, uuid: string, currentVersion: number) {
    this.setVersion(tableName, uuid, currentVersion + 1)
  }

  upsertAsset(asset: Asset) {
    const columns = [
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
    ]
    const placeholders = columns.map(() => '?').join(',')

    // 修复：确保所有值都是 SQLite 支持的类型
    const values = columns.map((c) => {
      const value = (asset as any)[c]
      // 将 undefined 转换为 null
      if (value === undefined) return null
      // 确保数字类型正确
      if (typeof value === 'number') return value
      // 确保字符串类型正确
      if (typeof value === 'string') return value
      // 确保布尔值转换为数字
      if (typeof value === 'boolean') return value ? 1 : 0
      // 其他类型转换为字符串
      if (value !== null && typeof value === 'object') {
        return JSON.stringify(value)
      }
      return value
    })

    const sql = `INSERT INTO t_assets (${columns.join(',')}) VALUES (${placeholders})
      ON CONFLICT(uuid) DO UPDATE SET
      label=excluded.label, asset_ip=excluded.asset_ip, group_name=excluded.group_name,
      auth_type=excluded.auth_type, port=excluded.port, username=excluded.username,
      password=excluded.password, key_chain_id=excluded.key_chain_id, favorite=excluded.favorite,
      asset_type=excluded.asset_type, updated_at=excluded.updated_at, version=excluded.version`

    try {
      this.db.prepare(sql).run(...values)
    } catch (error) {
      console.error(' SQLite 执行失败:', error)
      console.error(' SQL:', sql)
      console.error(' Values:', values)
      throw error
    }

    // 直接触发增量同步
    this.triggerIncrementalSync()
  }

  upsertAssetChain(chain: AssetChain) {
    const columns = [
      'key_chain_id',
      'uuid',
      'chain_name',
      'chain_type',
      'chain_private_key',
      'chain_public_key',
      'passphrase',
      'created_at',
      'updated_at',
      'version'
    ]
    const placeholders = columns.map(() => '?').join(',')

    // 修复：确保所有值都是 SQLite 支持的类型
    const values = columns.map((c) => {
      const value = (chain as any)[c]
      // 将 undefined 转换为 null
      if (value === undefined) return null
      // 确保数字类型正确
      if (typeof value === 'number') return value
      // 确保字符串类型正确
      if (typeof value === 'string') return value
      // 确保布尔值转换为数字
      if (typeof value === 'boolean') return value ? 1 : 0
      // 其他类型转换为字符串
      if (value !== null && typeof value === 'object') {
        return JSON.stringify(value)
      }
      return value
    })

    // 修复：使用 INSERT OR REPLACE 替代 ON CONFLICT，避免约束问题
    const sql = `INSERT OR REPLACE INTO t_asset_chains (${columns.join(',')}) VALUES (${placeholders})`

    try {
      this.db.prepare(sql).run(...values)
    } catch (error) {
      console.error(' SQLite 执行失败:', error)
      console.error(' SQL:', sql)
      console.error(' Values:', values)
      throw error
    }

    // 直接触发增量同步
    this.triggerIncrementalSync()
  }

  deleteAssetByUUID(uuid: string) {
    this.db.prepare(`DELETE FROM t_assets WHERE uuid = ?`).run(uuid)

    // 直接触发增量同步
    this.triggerIncrementalSync()
  }

  deleteAssetChainByUUID(uuid: string) {
    this.db.prepare(`DELETE FROM t_asset_chains WHERE uuid = ?`).run(uuid)

    // 直接触发增量同步
    this.triggerIncrementalSync()
  }

  /**
   * 触发增量同步
   * 数据变更后调用，触发立即同步
   */
  private triggerIncrementalSync(): void {
    // 检查是否处于远程应用保护状态，如果是则跳过触发
    try {
      const guardResult = this.db.prepare(`SELECT value FROM sync_meta WHERE key = 'apply_remote_guard'`).get()
      if (guardResult) return
    } catch (error) {
      // 查询失败时继续执行同步
    }

    // 使用动态导入避免循环依赖
    setImmediate(async () => {
      try {
        const { SyncController } = await import('./SyncController')
        await SyncController.triggerIncrementalSync()
      } catch (error) {
        logger.warn('触发增量同步失败:', error)
        // 不抛出异常，避免影响数据库操作
      }
    })
  }

  getLastSyncTime(tableName: string): Date | null {
    const row = this.db.prepare(`SELECT last_sync_time FROM sync_status WHERE table_name = ?`).get(tableName) as
      | { last_sync_time?: string }
      | undefined
    return row?.last_sync_time ? new Date(row.last_sync_time) : null
  }

  setLastSyncTime(tableName: string, time: Date) {
    const exists = this.db.prepare(`SELECT 1 FROM sync_status WHERE table_name = ?`).get(tableName)
    if (exists) {
      this.db
        .prepare(`UPDATE sync_status SET last_sync_time = ?, updated_at = datetime('now') WHERE table_name = ?`)
        .run(time.toISOString(), tableName)
    } else {
      this.db.prepare(`INSERT INTO sync_status (table_name, last_sync_time) VALUES (?, ?)`).run(tableName, time.toISOString())
    }
  }

  /**
   * 获取数据库实例
   * 提供给新的同步管理器使用
   */
  async getDatabase(): Promise<DatabaseTransaction> {
    return new DatabaseTransaction(this.db)
  }
}

/**
 * 数据库事务包装器
 * 提供与新同步管理器兼容的接口
 */
class DatabaseTransaction {
  constructor(private db: Database.Database) {}

  async get(sql: string, params?: any[]): Promise<any> {
    if (params && params.length > 0) {
      return this.db.prepare(sql).get(params)
    } else {
      return this.db.prepare(sql).get()
    }
  }

  async all(sql: string, params?: any[]): Promise<any[]> {
    if (params && params.length > 0) {
      return this.db.prepare(sql).all(params)
    } else {
      return this.db.prepare(sql).all()
    }
  }

  async run(sql: string, params?: any[]): Promise<void> {
    if (params && params.length > 0) {
      this.db.prepare(sql).run(params)
    } else {
      this.db.prepare(sql).run()
    }
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql)
  }

  async transaction<T>(callback: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    // better-sqlite3 事务必须是同步的，所以我们需要特殊处理
    // 对于异步操作，我们不使用 better-sqlite3 的事务，而是手动管理
    try {
      await this.run('BEGIN TRANSACTION')
      const result = await callback(this)
      await this.run('COMMIT')
      return result
    } catch (error) {
      await this.run('ROLLBACK')
      throw error
    }
  }
}
