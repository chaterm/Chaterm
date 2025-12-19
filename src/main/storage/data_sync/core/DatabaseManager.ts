import Database from 'better-sqlite3'
import { Asset, AssetChain, ChangeRecord } from '../models/SyncTypes'
import { logger } from '../utils/logger'

export class DatabaseManager {
  private db: Database.Database
  // Pre-compile frequently used SQL statements for better performance
  private markSyncedStmt: Database.Statement
  private markConflictStmt: Database.Statement
  private updateVersionStmt: Database.Statement
  private updateChainVersionStmt: Database.Statement

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')

    // Pre-compile frequently used SQL statements
    this.markSyncedStmt = this.db.prepare(`UPDATE change_log SET sync_status = 'synced' WHERE id = ?`)
    this.markConflictStmt = this.db.prepare(`UPDATE change_log SET sync_status = 'failed', error_message = ? WHERE id = ?`)
    this.updateVersionStmt = this.db.prepare(`UPDATE t_assets SET version = ?, updated_at = datetime('now') WHERE uuid = ?`)
    this.updateChainVersionStmt = this.db.prepare(`UPDATE t_asset_chains SET version = ?, updated_at = datetime('now') WHERE uuid = ?`)

    this.ensureMetaTables()
    this.ensureChangeTriggers()
  }

  private ensureMetaTables() {
    // Sync-related tables and indexes are automatically detected and created during database service initialization
    // No additional operations needed here
  }

  /**
   * Control whether to record triggers (used to suppress echo when applying remote changes)
   * @param enabled Whether to enable remote apply guard
   */
  setRemoteApplyGuard(enabled: boolean) {
    // const flag = enabled ? '1' : null
    // Create/update flag
    if (enabled) {
      this.db.prepare(`INSERT INTO sync_meta(key, value) VALUES('apply_remote_guard', '1') ON CONFLICT(key) DO UPDATE SET value='1'`).run()
    } else {
      this.db.prepare(`DELETE FROM sync_meta WHERE key = 'apply_remote_guard'`).run()
    }
  }

  private ensureChangeTriggers() {
    // Asset table INSERT/UPDATE/DELETE triggers
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
                  'need_proxy', NEW.need_proxy,
                  'proxy_name', NEW.proxy_name,
                  'created_at', NEW.created_at,
                  'updated_at', NEW.updated_at,
                  'version', NEW.version
              ));
        -- Set sync signal flag
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
                  'need_proxy', NEW.need_proxy,
                  'proxy_name', NEW.proxy_name,
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
                  'need_proxy', OLD.need_proxy,
                  'proxy_name', OLD.proxy_name,
                  'created_at', OLD.created_at,
                  'updated_at', OLD.updated_at,
                  'version', OLD.version
                ));
        -- Set sync signal flag
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
        -- Set sync signal flag
        INSERT INTO sync_meta(key, value) VALUES('sync_signal', datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value=datetime('now');
      END;
    `)

    // Asset chain table triggers
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
        -- Set sync signal flag
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
        -- Set sync signal flag
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
        -- Set sync signal flag
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
   * Get pending change records to be synced
   * @returns Array of pending change records
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
   * Get pending changes with pagination
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
   * Get total count of pending changes
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
   * Get count of historical data
   * Historical data refers to data that exists in the data table but not in change_log
   */
  getHistoricalDataCount(tableName: string): number {
    try {
      // Check if table exists
      const tableExists = this.db
        .prepare(
          `
        SELECT name FROM sqlite_master
        WHERE type='table' AND name=?
      `
        )
        .get(tableName)

      if (!tableExists) {
        console.log(`Table ${tableName} does not exist`)
        return 0
      }

      // Get total record count in the table
      const totalStmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`)
      const totalResult = totalStmt.get() as { count: number }
      const totalCount = totalResult.count

      if (totalCount === 0) {
        console.log(`Table ${tableName} is empty`)
        return 0
      }

      // Query the count of data already recorded in change_log
      // Need to check both local table name and sync table name
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

      console.log(`Table ${tableName} historical data check: total=${totalCount}, logged=${loggedCount}, historical=${historicalCount}`)

      return Math.max(0, historicalCount)
    } catch (error) {
      console.warn(`Failed to check historical data (${tableName}):`, error)
      return 0
    }
  }

  /**
   * Mark change records as synced
   * @param ids Array of change record IDs
   */
  markChangesSynced(ids: string[]) {
    if (ids.length === 0) return
    const trx = this.db.transaction((ids: string[]) => {
      for (const id of ids) this.markSyncedStmt.run(id)
    })
    trx(ids)
  }

  /**
   * Mark change records as conflicted
   * @param ids Array of change record IDs
   * @param reason Conflict reason
   */
  markChangesConflict(ids: string[], reason: string) {
    if (ids.length === 0) return
    const trx = this.db.transaction((ids: string[]) => {
      for (const id of ids) this.markConflictStmt.run(reason, id)
    })
    trx(ids)
  }

  /**
   * Set record version number
   * @param tableName Table name
   * @param uuid Record UUID
   * @param newVersion New version number
   */
  setVersion(tableName: string, uuid: string, newVersion: number) {
    if (!uuid || !newVersion) {
      return
    }

    // Enable remote apply guard to prevent version update from triggering change records
    this.setRemoteApplyGuard(true)
    try {
      if (tableName === 't_assets_sync') {
        this.updateVersionStmt.run(newVersion, uuid)
      } else if (tableName === 't_asset_chains_sync') {
        this.updateChainVersionStmt.run(newVersion, uuid)
      } else {
        console.log(`⚠️ Unknown table name: ${tableName}`)
      }
    } finally {
      // Ensure remote apply guard is disabled in all cases
      this.setRemoteApplyGuard(false)
    }
  }

  /**
   * Increment record version number (maintains backward compatibility)
   * @param tableName Table name
   * @param uuid Record UUID
   * @param currentVersion Current version number
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
      'need_proxy',
      'proxy_name',
      'created_at',
      'updated_at',
      'version'
    ]
    const placeholders = columns.map(() => '?').join(',')

    // Fix: Ensure all values are SQLite-supported types
    const values = columns.map((c) => {
      const value = (asset as any)[c]
      // Convert undefined to null
      if (value === undefined) return null
      // Ensure number type is correct
      if (typeof value === 'number') return value
      // Ensure string type is correct
      if (typeof value === 'string') return value
      // Ensure boolean values are converted to numbers
      if (typeof value === 'boolean') return value ? 1 : 0
      // Convert other types to strings
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
      asset_type=excluded.asset_type, need_proxy=excluded.need_proxy, proxy_name=excluded.proxy_name,
      updated_at=excluded.updated_at, version=excluded.version`

    try {
      this.db.prepare(sql).run(...values)
    } catch (error) {
      console.error('SQLite execution failed:', error)
      console.error('SQL:', sql)
      console.error('Values:', values)
      throw error
    }

    // Trigger incremental sync directly
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

    // Fix: Ensure all values are SQLite-supported types
    const values = columns.map((c) => {
      const value = (chain as any)[c]
      // Convert undefined to null
      if (value === undefined) return null
      // Ensure number type is correct
      if (typeof value === 'number') return value
      // Ensure string type is correct
      if (typeof value === 'string') return value
      // Ensure boolean values are converted to numbers
      if (typeof value === 'boolean') return value ? 1 : 0
      // Convert other types to strings
      if (value !== null && typeof value === 'object') {
        return JSON.stringify(value)
      }
      return value
    })

    // Fix: Use INSERT OR REPLACE instead of ON CONFLICT to avoid constraint issues
    const sql = `INSERT OR REPLACE INTO t_asset_chains (${columns.join(',')}) VALUES (${placeholders})`

    try {
      this.db.prepare(sql).run(...values)
    } catch (error) {
      console.error('SQLite execution failed:', error)
      console.error('SQL:', sql)
      console.error('Values:', values)
      throw error
    }

    // Trigger incremental sync directly
    this.triggerIncrementalSync()
  }

  deleteAssetByUUID(uuid: string) {
    this.db.prepare(`DELETE FROM t_assets WHERE uuid = ?`).run(uuid)

    // Trigger incremental sync directly
    this.triggerIncrementalSync()
  }

  deleteAssetChainByUUID(uuid: string) {
    this.db.prepare(`DELETE FROM t_asset_chains WHERE uuid = ?`).run(uuid)

    // Trigger incremental sync directly
    this.triggerIncrementalSync()
  }

  /**
   * Trigger incremental sync
   * Called after data changes to trigger immediate sync
   */
  private triggerIncrementalSync(): void {
    // Check if in remote apply guard state, skip trigger if so
    try {
      const guardResult = this.db.prepare(`SELECT value FROM sync_meta WHERE key = 'apply_remote_guard'`).get()
      if (guardResult) return
    } catch (error) {
      // Continue sync execution if query fails
    }

    // Use dynamic import to avoid circular dependencies
    setImmediate(async () => {
      try {
        const { SyncController } = await import('./SyncController')
        await SyncController.triggerIncrementalSync()
      } catch (error) {
        logger.warn('Failed to trigger incremental sync:', error)
        // Don't throw exception to avoid affecting database operations
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
   * Get database instance
   * Provided for use by the new sync manager
   */
  async getDatabase(): Promise<DatabaseTransaction> {
    return new DatabaseTransaction(this.db)
  }
}

/**
 * Database transaction wrapper
 * Provides interface compatible with the new sync manager
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
    // better-sqlite3 transactions must be synchronous, so we need special handling
    // For async operations, we don't use better-sqlite3 transactions, but manage them manually
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
