/**
 * IndexedDB to SQLite data migrator
 * Handles migration of three data sources: aliases, userConfig, keyValueStore
 */

import Database from 'better-sqlite3'
import { ipcMain } from 'electron'
import { safeStringify } from './json-serializer'

import { createLogger } from '@logging'

const logger = createLogger('db')

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
    // Validate userId during construction
    if (!userId || userId <= 0) {
      throw new Error('Invalid userId for migration')
    }
  }

  /**
   * Synchronous migration method with retry
   */
  async migrateAllDataWithRetry(maxRetries: number = 3): Promise<boolean> {
    logger.info('[Migration] Starting migration with retry, max attempts', { value: maxRetries })

    // First check if all migrations are already complete
    if (this.checkAllMigrationsComplete()) {
      logger.info('[Migration] [OK] All data already migrated and validated')
      return true
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`[Migration] Attempt ${attempt}/${maxRetries}`)

        await this.migrateAllData()

        // Verify migration success (including data validation)
        if (this.checkAllMigrationsComplete()) {
          logger.info('[Migration] [OK] Migration completed and validated successfully')
          return true
        }

        logger.info(`[Migration] [WARNING] Migration incomplete, will retry...`)
      } catch (error: any) {
        logger.error(`[Migration] [ERROR] Attempt ${attempt} failed`, { error: error instanceof Error ? error.message : String(error) })

        // Clear all status markers on failure
        this.db.prepare('DELETE FROM indexdb_migration_status').run()

        if (attempt < maxRetries) {
          logger.info('[Migration] Waiting 1 second before retry...')
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }
    }

    logger.error(`[Migration] [ERROR] Migration failed after ${maxRetries} attempts`)
    return false
  }

  /**
   * Main migration function
   */
  async migrateAllData(): Promise<void> {
    logger.info(`[Migration] Starting migration for user ${this.userId}`)

    await this.migrateAliases()
    await this.migrateUserConfig()
    await this.migrateKeyValueStore()
  }

  /**
   * Migrate aliases data
   */
  private async migrateAliases(): Promise<void> {
    const status = this.getMigrationStatus('aliases')
    if (status?.migrated === 1) {
      logger.info('[Migration] [OK] Aliases already migrated, skip')
      return
    }

    logger.info('[Migration] Starting aliases migration...')

    try {
      const data = await this.requestIndexDBData('aliases')

      if (!data || !Array.isArray(data)) {
        logger.info('[Migration] No aliases data to migrate')
        this.markMigrationComplete('aliases', 0)
        return
      }

      logger.info(`[Migration] Read ${data.length} aliases from IndexedDB`)

      // Transaction ensures atomicity
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
      logger.info(`[Migration] [OK] Aliases migration completed: ${data.length} records`)
    } catch (error: any) {
      this.markMigrationFailed('aliases', error.message)
      throw error
    }
  }

  /**
   * Migrate user configuration
   */
  private async migrateUserConfig(): Promise<void> {
    const status = this.getMigrationStatus('userConfig')
    if (status?.migrated === 1) {
      logger.info('[Migration] [OK] UserConfig already migrated, skip')
      return
    }

    logger.info('[Migration] Starting userConfig migration...')

    try {
      const data = await this.requestIndexDBData('userConfig')

      if (!data) {
        logger.info('[Migration] No userConfig data to migrate')
        this.markMigrationComplete('userConfig', 0)
        return
      }

      logger.info('[Migration] Read userConfig from IndexedDB')

      // Serialize entire configuration object
      const result = await safeStringify(data)
      if (!result.success) {
        throw new Error(`Failed to serialize userConfig: ${result.error}`)
      }

      // Insert into key_value_store table
      this.db
        .prepare(
          `
 INSERT OR REPLACE INTO key_value_store (key, value, updated_at)
 VALUES (?, ?, ?)
 `
        )
        .run('userConfig', result.data, Date.now())

      this.markMigrationComplete('userConfig', 1)
      logger.info('[Migration] [OK] UserConfig migration completed')
    } catch (error: any) {
      this.markMigrationFailed('userConfig', error.message)
      throw error
    }
  }

  /**
   * Migrate key-value store
   */
  private async migrateKeyValueStore(): Promise<void> {
    const status = this.getMigrationStatus('keyValueStore')
    if (status?.migrated === 1) {
      logger.info('[Migration] [OK] KeyValueStore already migrated, skip')
      return
    }

    logger.info('[Migration] Starting keyValueStore migration...')

    try {
      const data = await this.requestIndexDBData('keyValueStore')

      if (!data || !Array.isArray(data)) {
        logger.info('[Migration] No keyValueStore data to migrate')
        this.markMigrationComplete('keyValueStore', 0)
        return
      }

      logger.info(`[Migration] Read ${data.length} key-value pairs from IndexedDB`)

      // First serialize all data (must be done outside transaction because safeStringify is async)
      const serializedData: Array<{ key: string; value: string }> = []
      for (const item of data) {
        const result = await safeStringify(item.value)
        if (result.success) {
          serializedData.push({
            key: item.key,
            value: result.data!
          })
        } else {
          logger.warn(`[Migration] Failed to serialize key "${item.key}": ${result.error}`)
        }
      }

      // Transaction ensures atomicity
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
      logger.info(`[Migration] [OK] KeyValueStore migration completed: ${data.length} records`)
    } catch (error: any) {
      this.markMigrationFailed('keyValueStore', error.message)
      throw error
    }
  }

  /**
   * Cross-process request for IndexedDB data
   */
  private async requestIndexDBData(dataSource: string): Promise<any> {
    logger.info(`[Migration] Requesting ${dataSource} data from renderer...`)
    const startTime = Date.now()

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const elapsed = Date.now() - startTime
        logger.error(`[Migration] [ERROR] Timeout after ${elapsed}ms waiting for ${dataSource}`)
        reject(new Error(`Timeout waiting for IndexedDB data: ${dataSource}`))
      }, 30000)

      this.sender.send('indexdb-migration:request-data', dataSource)

      ipcMain.once(`indexdb-migration:data-response:${dataSource}`, (_event, data) => {
        clearTimeout(timeout)
        const elapsed = Date.now() - startTime
        logger.info(`[Migration] [OK] Received ${dataSource} data in ${elapsed}ms`)

        if (data && data.error) {
          reject(new Error(data.error))
        } else {
          resolve(data)
        }
      })
    })
  }

  /**
   * Get migration status
   */
  private getMigrationStatus(dataSource: string): MigrationStatus | null {
    const row = this.db.prepare('SELECT * FROM indexdb_migration_status WHERE data_source = ?').get(dataSource) as MigrationStatus | undefined

    return row || null
  }

  /**
   * Mark migration as complete
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

    // Immediately validate
    if (!this.validateMigration(dataSource, count)) {
      throw new Error(`Migration validation failed for ${dataSource}`)
    }
  }

  /**
   * Mark migration as failed
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
   * Validate migration data integrity
   */
  private validateMigration(dataSource: string, expectedCount: number): boolean {
    try {
      // 1. Check migration status
      const status = this.getMigrationStatus(dataSource)
      if (!status || status.migrated !== 1) {
        return false
      }

      // 2. Verify record count
      if (status.record_count !== expectedCount) {
        logger.error(`[Migration] Record count mismatch for ${dataSource}`, { expected: expectedCount, got: status.record_count })
        return false
      }

      // 3. Verify data readability
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
        logger.error(`[Migration] No data found for ${dataSource}`)
        return false
      }

      // 4. Verify key fields are not null (using aliases as example)
      if (dataSource === 'aliases' && expectedCount > 0) {
        const result = this.db.prepare('SELECT COUNT(*) as count FROM t_aliases WHERE alias IS NULL OR command IS NULL').get() as { count: number }
        if (result.count > 0) {
          logger.error(`[Migration] Found ${result.count} aliases with null fields`)
          return false
        }
      }

      logger.info(`[Migration] [OK] Validation passed for ${dataSource}`)
      return true
    } catch (error) {
      logger.error(`[Migration] Validation failed for ${dataSource}`, { error: error instanceof Error ? error.message : String(error) })
      return false
    }
  }

  /**
   * Check if all migrations are complete (enhanced version)
   */
  private checkAllMigrationsComplete(): boolean {
    const sources = ['aliases', 'userConfig', 'keyValueStore']

    for (const source of sources) {
      const status = this.getMigrationStatus(source)
      if (!status || status.migrated !== 1) {
        return false
      }

      // Add data integrity validation
      const expectedCount = status.record_count || 0
      if (!this.validateMigration(source, expectedCount)) {
        // Validation failed, clear status marker for next retry
        logger.warn(`[Migration] Clearing invalid migration status for ${source}`)
        this.db.prepare('DELETE FROM indexdb_migration_status WHERE data_source = ?').run(source)
        return false
      }
    }

    return true
  }
}
