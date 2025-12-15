/**
 * IndexedDB 到 SQLite 数据迁移器
 * 处理 aliases、userConfig、keyValueStore 三个数据源的迁移
 */

import Database from 'better-sqlite3'
import { ipcMain } from 'electron'
import { safeStringify } from './json-serializer'

interface MigrationStatus {
  data_source: string
  migrated: number
  migrated_at?: number
  record_count?: number
  error_message?: string
}

export class IndexDBMigrator {
  constructor(
    private db: Database.Database,
    private userId: number,
    private sender: Electron.WebContents
  ) {
    // 构造时验证 userId
    if (!userId || userId <= 0) {
      throw new Error('Invalid userId for migration')
    }
  }

  /**
   * 带重试的同步迁移方法
   */
  async migrateAllDataWithRetry(maxRetries: number = 3): Promise<boolean> {
    console.log('[Migration] Starting migration with retry, max attempts:', maxRetries)

    // 先检查是否已全部迁移完成
    if (this.checkAllMigrationsComplete()) {
      console.log('[Migration] [OK] All data already migrated and validated')
      return true
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Migration] Attempt ${attempt}/${maxRetries}`)

        await this.migrateAllData()

        // 验证迁移是否成功(包含数据校验)
        if (this.checkAllMigrationsComplete()) {
          console.log('[Migration] [OK] Migration completed and validated successfully')
          return true
        }

        console.log(`[Migration] [WARNING] Migration incomplete, will retry...`)
      } catch (error: any) {
        console.error(`[Migration] [ERROR] Attempt ${attempt} failed:`, error.message)

        // 失败时清除所有状态标记
        this.db.prepare('DELETE FROM indexdb_migration_status').run()

        if (attempt < maxRetries) {
          console.log('[Migration] Waiting 1 second before retry...')
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }
    }

    console.error('[Migration] [ERROR] Migration failed after', maxRetries, 'attempts')
    return false
  }

  /**
   * 主迁移函数
   */
  async migrateAllData(): Promise<void> {
    console.log(`[Migration] Starting migration for user ${this.userId}`)

    await this.migrateAliases()
    await this.migrateUserConfig()
    await this.migrateKeyValueStore()
  }

  /**
   * 迁移别名数据
   */
  private async migrateAliases(): Promise<void> {
    const status = this.getMigrationStatus('aliases')
    if (status?.migrated === 1) {
      console.log('[Migration] [OK] Aliases already migrated, skip')
      return
    }

    console.log('[Migration] Starting aliases migration...')

    try {
      const data = await this.requestIndexDBData('aliases')

      if (!data || !Array.isArray(data)) {
        console.log('[Migration] No aliases data to migrate')
        this.markMigrationComplete('aliases', 0)
        return
      }

      console.log(`[Migration] Read ${data.length} aliases from IndexedDB`)

      // 事务保证原子性
      this.db.transaction(() => {
        const stmt = this.db.prepare(`
 INSERT OR REPLACE INTO t_aliases (id, alias, command, created_at)
 VALUES (?, ?, ?, ?)
 `)
        data.forEach((item: any) => {
          stmt.run(item.id, item.alias, item.command, item.createdAt || Date.now())
        })
      })()

      this.markMigrationComplete('aliases', data.length)
      console.log(`[Migration] [OK] Aliases migration completed: ${data.length} records`)
    } catch (error: any) {
      this.markMigrationFailed('aliases', error.message)
      throw error
    }
  }

  /**
   * 迁移用户配置
   */
  private async migrateUserConfig(): Promise<void> {
    const status = this.getMigrationStatus('userConfig')
    if (status?.migrated === 1) {
      console.log('[Migration] [OK] UserConfig already migrated, skip')
      return
    }

    console.log('[Migration] Starting userConfig migration...')

    try {
      const data = await this.requestIndexDBData('userConfig')

      if (!data) {
        console.log('[Migration] No userConfig data to migrate')
        this.markMigrationComplete('userConfig', 0)
        return
      }

      console.log('[Migration] Read userConfig from IndexedDB')

      // 序列化整个配置对象
      const result = await safeStringify(data)
      if (!result.success) {
        throw new Error(`Failed to serialize userConfig: ${result.error}`)
      }

      // 插入到 key_value_store 表
      this.db
        .prepare(
          `
 INSERT OR REPLACE INTO key_value_store (key, value, updated_at)
 VALUES (?, ?, ?)
 `
        )
        .run('userConfig', result.data, Date.now())

      this.markMigrationComplete('userConfig', 1)
      console.log('[Migration] [OK] UserConfig migration completed')
    } catch (error: any) {
      this.markMigrationFailed('userConfig', error.message)
      throw error
    }
  }

  /**
   * 迁移键值对存储
   */
  private async migrateKeyValueStore(): Promise<void> {
    const status = this.getMigrationStatus('keyValueStore')
    if (status?.migrated === 1) {
      console.log('[Migration] [OK] KeyValueStore already migrated, skip')
      return
    }

    console.log('[Migration] Starting keyValueStore migration...')

    try {
      const data = await this.requestIndexDBData('keyValueStore')

      if (!data || !Array.isArray(data)) {
        console.log('[Migration] No keyValueStore data to migrate')
        this.markMigrationComplete('keyValueStore', 0)
        return
      }

      console.log(`[Migration] Read ${data.length} key-value pairs from IndexedDB`)

      // 先序列化所有数据（必须在事务外完成，因为 safeStringify 是异步的）
      const serializedData: Array<{ key: string; value: string }> = []
      for (const item of data) {
        const result = await safeStringify(item.value)
        if (result.success) {
          serializedData.push({
            key: item.key,
            value: result.data!
          })
        } else {
          console.warn(`[Migration] Failed to serialize key "${item.key}": ${result.error}`)
        }
      }

      // 事务保证原子性
      this.db.transaction(() => {
        const stmt = this.db.prepare(`
 INSERT OR REPLACE INTO key_value_store (key, value, updated_at)
 VALUES (?, ?, ?)
 `)
        serializedData.forEach((item) => {
          stmt.run(item.key, item.value, Date.now())
        })
      })()

      this.markMigrationComplete('keyValueStore', data.length)
      console.log(`[Migration] [OK] KeyValueStore migration completed: ${data.length} records`)
    } catch (error: any) {
      this.markMigrationFailed('keyValueStore', error.message)
      throw error
    }
  }

  /**
   * 跨进程请求 IndexedDB 数据
   */
  private async requestIndexDBData(dataSource: string): Promise<any> {
    console.log(`[Migration] Requesting ${dataSource} data from renderer...`)
    const startTime = Date.now()

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const elapsed = Date.now() - startTime
        console.error(`[Migration] [ERROR] Timeout after ${elapsed}ms waiting for ${dataSource}`)
        reject(new Error(`Timeout waiting for IndexedDB data: ${dataSource}`))
      }, 30000)

      this.sender.send('indexdb-migration:request-data', dataSource)

      ipcMain.once(`indexdb-migration:data-response:${dataSource}`, (_event, data) => {
        clearTimeout(timeout)
        const elapsed = Date.now() - startTime
        console.log(`[Migration] [OK] Received ${dataSource} data in ${elapsed}ms`)

        if (data && data.error) {
          reject(new Error(data.error))
        } else {
          resolve(data)
        }
      })
    })
  }

  /**
   * 获取迁移状态
   */
  private getMigrationStatus(dataSource: string): MigrationStatus | null {
    const row = this.db.prepare('SELECT * FROM indexdb_migration_status WHERE data_source = ?').get(dataSource) as MigrationStatus | undefined

    return row || null
  }

  /**
   * 标记迁移完成
   */
  private markMigrationComplete(dataSource: string, count: number): void {
    this.db
      .prepare(
        `
 INSERT OR REPLACE INTO indexdb_migration_status
 (data_source, migrated, migrated_at, record_count)
 VALUES (?, 1, ?, ?)
 `
      )
      .run(dataSource, Date.now(), count)

    // 立即校验
    if (!this.validateMigration(dataSource, count)) {
      throw new Error(`Migration validation failed for ${dataSource}`)
    }
  }

  /**
   * 标记迁移失败
   */
  private markMigrationFailed(dataSource: string, error: string): void {
    this.db
      .prepare(
        `
 INSERT OR REPLACE INTO indexdb_migration_status
 (data_source, migrated, error_message)
 VALUES (?, 0, ?)
 `
      )
      .run(dataSource, error)
  }

  /**
   * 验证迁移数据完整性
   */
  private validateMigration(dataSource: string, expectedCount: number): boolean {
    try {
      // 1. 检查迁移状态
      const status = this.getMigrationStatus(dataSource)
      if (!status || status.migrated !== 1) {
        return false
      }

      // 2. 验证记录数
      if (status.record_count !== expectedCount) {
        console.error(`[Migration] Record count mismatch for ${dataSource}:`, `expected ${expectedCount}, got ${status.record_count}`)
        return false
      }

      // 3. 验证数据可读性
      let actualCount = 0
      if (dataSource === 'aliases') {
        const result = this.db.prepare('SELECT COUNT(*) as count FROM t_aliases').get() as { count: number }
        actualCount = result.count
      } else if (dataSource === 'userConfig') {
        const result = this.db.prepare("SELECT COUNT(*) as count FROM key_value_store WHERE key = 'userConfig'").get() as { count: number }
        actualCount = result.count
      } else if (dataSource === 'keyValueStore') {
        const result = this.db.prepare("SELECT COUNT(*) as count FROM key_value_store WHERE key != 'userConfig'").get() as { count: number }
        actualCount = result.count
      }

      if (actualCount === 0 && expectedCount > 0) {
        console.error(`[Migration] No data found for ${dataSource}`)
        return false
      }

      // 4. 验证关键字段非空(以 aliases 为例)
      if (dataSource === 'aliases' && expectedCount > 0) {
        const result = this.db.prepare('SELECT COUNT(*) as count FROM t_aliases WHERE alias IS NULL OR command IS NULL').get() as { count: number }
        if (result.count > 0) {
          console.error(`[Migration] Found ${result.count} aliases with null fields`)
          return false
        }
      }

      console.log(`[Migration] [OK] Validation passed for ${dataSource}`)
      return true
    } catch (error) {
      console.error(`[Migration] Validation failed for ${dataSource}:`, error)
      return false
    }
  }

  /**
   * 检查所有迁移是否完成(增强版)
   */
  private checkAllMigrationsComplete(): boolean {
    const sources = ['aliases', 'userConfig', 'keyValueStore']

    for (const source of sources) {
      const status = this.getMigrationStatus(source)
      if (!status || status.migrated !== 1) {
        return false
      }

      // 增加数据完整性校验
      const expectedCount = status.record_count || 0
      if (!this.validateMigration(source, expectedCount)) {
        // 校验失败,清除状态标记以便下次重试
        console.warn(`[Migration] Clearing invalid migration status for ${source}`)
        this.db.prepare('DELETE FROM indexdb_migration_status WHERE data_source = ?').run(source)
        return false
      }
    }

    return true
  }
}
