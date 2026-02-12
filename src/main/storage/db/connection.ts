import Database from 'better-sqlite3'
import { join } from 'path'
import * as fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { upgradeAgentTaskMetadataSupport } from './migrations/add-todos-support'
import { upgradeMcpToolStateSupport } from './migrations/add-mcp-tool-state-support'
import { upgradeMcpToolCallSupport } from './migrations/add-mcp-tool-call-support'
import { upgradeContentPartsSupport } from './migrations/add-content-parts-support'
import { upgradeSkillsSupport } from './migrations/add-skills-support'
import { upgradeMessageIndexSupport } from './migrations/add-message-index-support'
import { upgradeBastionCommentSupport } from './migrations/add-bastion-comment-support'
import { IndexDBMigrator } from './indexdb-migrator'
import { getUserDataPath } from '../../config/edition'
const logger = createLogger('db')

const INIT_DB_PATH = getInitDbPath()
const INIT_CDB_PATH = getInitChatermDbPath()

let currentUserId: number | null = null
let mainWindowWebContents: Electron.WebContents | null = null

/**
 * Set main window WebContents reference for cross-process communication during migration
 */
export function setMainWindowWebContents(webContents: Electron.WebContents | null): void {
  mainWindowWebContents = webContents
}

function getUserDatabasePath(userId: number, dbType: 'complete' | 'chaterm'): string {
  const userDir = join(getUserDataPath(), DB_DIR_NAME, `${userId}`)
  const dbName = dbType === 'complete' ? 'complete_data.db' : 'chaterm_data.db'
  return join(userDir, dbName)
}

export function getChatermDbPathForUser(userId: number): string {
  return getUserDatabasePath(userId, 'chaterm')
}

/**
 * Get the database storage directory name.
 * We use 'chaterm_db' instead of 'databases' because Chromium may manage
 * a directory named 'databases' for its Web SQL storage.
 * The early migration (in early-migration.ts) handles moving data from
 * 'databases' to 'chaterm_db' before Chromium initializes.
 */
const DB_DIR_NAME = 'chaterm_db'

function ensureUserDatabaseDir(userId: number): string {
  const userDir = join(getUserDataPath(), DB_DIR_NAME, `${userId}`)
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true })
  }
  return userDir
}

function getLegacyDatabasePath(dbType: 'complete' | 'chaterm'): string {
  const dbName = dbType === 'complete' ? 'complete_data.db' : 'chaterm_data.db'
  return join(getUserDataPath(), DB_DIR_NAME, dbName)
}

function migrateLegacyDatabase(userId: number, dbType: 'complete' | 'chaterm'): boolean {
  const legacyPath = getLegacyDatabasePath(dbType)
  const userPath = getUserDatabasePath(userId, dbType)

  if (fs.existsSync(legacyPath)) {
    try {
      logger.info(`Found legacy ${dbType} database at: ${legacyPath}`)
      logger.info(`Migrating to user directory: ${userPath}`)
      ensureUserDatabaseDir(userId)
      fs.renameSync(legacyPath, userPath)
      logger.info(`Successfully migrated legacy ${dbType} database for user ${userId}`)
      return true
    } catch (error) {
      logger.error(`Failed to migrate legacy ${dbType} database`, { error: error instanceof Error ? error.message : String(error) })
      return false
    }
  }

  return false
}

function getInitChatermDbPath(): string {
  try {
    const { app } = require('electron')
    if (app.isPackaged) {
      return join((process as any).resourcesPath, 'db', 'init_chaterm.db')
    } else {
      return join(__dirname, '../../src/renderer/src/assets/db/init_chaterm.db')
    }
  } catch (error) {
    // Fallback for test environment
    return join(process.cwd(), 'test_data', 'init_chaterm.db')
  }
}

function getInitDbPath(): string {
  try {
    const { app } = require('electron')
    if (app.isPackaged) {
      return join((process as any).resourcesPath, 'db', 'init_data.db')
    } else {
      return join(__dirname, '../../src/renderer/src/assets/db/init_data.db')
    }
  } catch (error) {
    // Fallback for test environment
    return join(process.cwd(), 'test_data', 'init_data.db')
  }
}

export function setCurrentUserId(userId: number | null): void {
  currentUserId = userId
}

export function getCurrentUserId(): number | null {
  return currentUserId
}

export function getGuestUserId(): number {
  return 999999999
}

function upgradeUserSnippetTable(db: Database.Database): void {
  try {
    // Check if sort_order column exists
    try {
      db.prepare('SELECT sort_order FROM user_snippet_v1 LIMIT 1').get()
    } catch (error) {
      // Column does not exist, need to upgrade table structure

      db.transaction(() => {
        // Add sort_order column
        db.exec('ALTER TABLE user_snippet_v1 ADD COLUMN sort_order INTEGER DEFAULT 0')
        logger.info('Added sort_order column to user_snippet_v1')

        // Initialize sort_order for existing records
        const allRecords = db.prepare('SELECT id FROM user_snippet_v1 ORDER BY created_at ASC').all()
        if (allRecords.length > 0) {
          const updateSortStmt = db.prepare('UPDATE user_snippet_v1 SET sort_order = ? WHERE id = ?')
          allRecords.forEach((record: any, index: number) => {
            updateSortStmt.run((index + 1) * 10, record.id) // Use multiples of 10 to leave space for insertion
          })
          logger.info(`Initialized sort_order for ${allRecords.length} existing records`)
        }
      })()

      logger.info('user_snippet_v1 table upgrade completed')
    }
  } catch (error) {
    logger.error('Failed to upgrade user_snippet_v1 table', { error: error instanceof Error ? error.message : String(error) })
  }
}

function upgradeTAssetsTable(db: Database.Database): void {
  try {
    // Check if asset_type column exists
    try {
      db.prepare('SELECT asset_type FROM t_assets LIMIT 1').get()
    } catch (error) {
      // Column does not exist, need to upgrade table structure
      db.transaction(() => {
        // Add asset_type column
        db.exec("ALTER TABLE t_assets ADD COLUMN asset_type TEXT DEFAULT 'person'")
        logger.info('Added asset_type column to t_assets')
      })()

      logger.info('t_assets table upgrade completed')
    }

    // Additional column upgrade: t_assets.version
    try {
      db.prepare('SELECT version FROM t_assets LIMIT 1').get()
    } catch (e) {
      db.exec('ALTER TABLE t_assets ADD COLUMN version INTEGER NOT NULL DEFAULT 1')
      logger.info('Added version column to t_assets')
    }

    // Additional column upgrade: t_asset_chains.uuid
    try {
      db.prepare('SELECT uuid FROM t_asset_chains LIMIT 1').get()
    } catch (e) {
      // uuid column does not exist, need to add
      db.transaction(() => {
        try {
          db.exec('ALTER TABLE t_asset_chains ADD COLUMN uuid TEXT')
          logger.info('Added uuid column to t_asset_chains')
        } catch (transactionError) {
          logger.error('Error adding uuid column to t_asset_chains', {
            error: transactionError instanceof Error ? transactionError.message : String(transactionError)
          })
          throw transactionError
        }
      })()
    }

    try {
      db.prepare('SELECT version FROM t_asset_chains LIMIT 1').get()
    } catch (e) {
      db.exec('ALTER TABLE t_asset_chains ADD COLUMN version INTEGER NOT NULL DEFAULT 1')
      console.log('Added version column to t_asset_chains')
    }

    try {
      const existingRecords = db.prepare("SELECT key_chain_id FROM t_asset_chains WHERE uuid IS NULL OR uuid = ''").all()

      if (existingRecords.length > 0) {
        db.transaction(() => {
          const updateUuidStmt = db.prepare('UPDATE t_asset_chains SET uuid = ? WHERE key_chain_id = ?')
          existingRecords.forEach((record: { key_chain_id: string | number }) => {
            updateUuidStmt.run(uuidv4(), record.key_chain_id)
          })
        })()
        logger.info(`Auto-filled uuid for ${existingRecords.length} existing t_asset_chains records`)
      }
    } catch (fillError) {
      logger.error('Error filling uuid for t_asset_chains', { error: fillError instanceof Error ? fillError.message : String(fillError) })
    }

    // Additional column: t_assets.need_proxy
    try {
      db.prepare('SELECT need_proxy FROM t_assets LIMIT 1').get()
    } catch (e) {
      db.exec('ALTER TABLE t_assets ADD COLUMN need_proxy INTEGER DEFAULT 0')
      logger.info('Added need_proxy column to t_assets')
    }

    // Additional column upgrade: t_assets.proxy_name
    try {
      db.prepare('SELECT proxy_name FROM t_assets LIMIT 1').get()
    } catch (e) {
      db.exec('ALTER TABLE t_assets ADD COLUMN proxy_name TEXT DEFAULT ""')
      logger.info('Added proxy_name column to t_assets')
    }

    // Add composite unique constraint: asset_ip + username + port + label + asset_type
    try {
      // Always drop old indexes if they exist
      db.exec('DROP INDEX IF EXISTS idx_assets_unique_ip_user_port')
      db.exec('DROP INDEX IF EXISTS idx_assets_unique_ip_user_port_label')

      // Check if new index already exists
      const newIdx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_assets_unique_ip_user_port_label_type'").get()

      if (!newIdx) {
        // Ensure all records with NULL asset_type are set to default value 'person'
        db.exec("UPDATE t_assets SET asset_type = 'person' WHERE asset_type IS NULL OR asset_type = ''")

        // First clean up possible duplicate data (on quintuple dimension), keep the latest record
        db.exec(`
 DELETE FROM t_assets
 WHERE id NOT IN (
 SELECT MAX(id)
 FROM t_assets
 GROUP BY asset_ip, username, port, label, asset_type
 )
 `)

        // Create new composite unique index (including asset_type)
        db.exec(`
 CREATE UNIQUE INDEX idx_assets_unique_ip_user_port_label_type
 ON t_assets(asset_ip, username, port, label, asset_type)
 `)
        logger.info('Added unique constraint for asset_ip + username + port + label + asset_type')
      }
    } catch (constraintError) {
      logger.error('Failed to add unique constraint', { error: constraintError instanceof Error ? constraintError.message : String(constraintError) })
    }
  } catch (error) {
    logger.error('Failed to upgrade t_assets table', { error: error instanceof Error ? error.message : String(error) })
  }
}

function upgradeSnippetGroups(db: Database.Database): void {
  try {
    // Check if group_uuid column exists in user_snippet_v1
    try {
      db.prepare('SELECT group_uuid FROM user_snippet_v1 LIMIT 1').get()
    } catch (error) {
      db.exec('ALTER TABLE user_snippet_v1 ADD COLUMN group_uuid TEXT')
      logger.info('Added group_uuid column to user_snippet_v1')
    }

    // Check if uuid column exists in user_snippet_v1
    try {
      db.prepare('SELECT uuid FROM user_snippet_v1 LIMIT 1').get()
    } catch (error) {
      db.exec('ALTER TABLE user_snippet_v1 ADD COLUMN uuid TEXT')
      logger.info('Added uuid column to user_snippet_v1')

      // Backfill uuid for existing records
      const existingRecords = db.prepare("SELECT id FROM user_snippet_v1 WHERE uuid IS NULL OR uuid = ''").all()
      if (existingRecords.length > 0) {
        db.transaction(() => {
          const updateUuidStmt = db.prepare('UPDATE user_snippet_v1 SET uuid = ? WHERE id = ?')
          existingRecords.forEach((record: any) => {
            updateUuidStmt.run(uuidv4(), record.id)
          })
        })()
        logger.info(`Backfilled uuid for ${existingRecords.length} existing user_snippet_v1 records`)
      }
    }
  } catch (error) {
    logger.error('Failed to upgrade snippet groups', { error: error instanceof Error ? error.message : String(error) })
  }
}

/**
 * Apply all database migrations to ensure schema consistency.
 * This must be called for both newly created and existing databases.
 */
async function applyAllMigrations(db: Database.Database): Promise<void> {
  upgradeTAssetsTable(db)
  upgradeUserSnippetTable(db)
  await upgradeAgentTaskMetadataSupport(db)
  await upgradeMcpToolStateSupport(db)
  await upgradeMcpToolCallSupport(db)
  await upgradeContentPartsSupport(db)
  upgradeSnippetGroups(db)
  upgradeSkillsSupport(db)
  await upgradeMessageIndexSupport(db)
  await upgradeBastionCommentSupport(db)
}

export async function initDatabase(userId?: number): Promise<Database.Database> {
  const isSkippedLogin = !userId && localStorage.getItem('login-skipped') === 'true'
  const targetUserId = userId || (isSkippedLogin ? getGuestUserId() : currentUserId)

  if (!targetUserId) {
    throw new Error('User ID is required for database initialization')
  }

  try {
    ensureUserDatabaseDir(targetUserId)
    const COMPLETE_DB_PATH = getUserDatabasePath(targetUserId, 'complete')

    if (!fs.existsSync(COMPLETE_DB_PATH)) {
      const migrated = migrateLegacyDatabase(targetUserId, 'complete')

      if (!migrated) {
        logger.info('Target database does not exist, initializing from init_data.db')
        if (!fs.existsSync(INIT_DB_PATH)) {
          throw new Error('Initial database (init_data.db) not found')
        }
        const sourceDb = new Database(INIT_DB_PATH, { readonly: true })
        await sourceDb.backup(COMPLETE_DB_PATH)
        sourceDb.close()
      }
    } else {
      logger.info('Target database already exists, skipping initialization')
    }

    const db = new Database(COMPLETE_DB_PATH)
    logger.info('Complete database connection established', { path: COMPLETE_DB_PATH })
    return db
  } catch (error) {
    logger.error('Complete database initialization failed', { error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

export async function initChatermDatabase(userId?: number): Promise<Database.Database> {
  const targetUserId = userId || currentUserId
  if (!targetUserId) {
    throw new Error('User ID is required for Chaterm database initialization')
  }

  ensureUserDatabaseDir(targetUserId)
  const Chaterm_DB_PATH = getUserDatabasePath(targetUserId, 'chaterm')

  logger.info(`initChatermDatabase for user: ${targetUserId}`)

  try {
    if (!fs.existsSync(INIT_CDB_PATH)) {
      throw new Error(`Initial database (init_chaterm.db) not found at ${INIT_CDB_PATH}`)
    }

    const targetDbExists = fs.existsSync(Chaterm_DB_PATH)

    if (!targetDbExists) {
      const migrated = migrateLegacyDatabase(targetUserId, 'chaterm')

      if (!migrated) {
        logger.info('Target Chaterm database does not exist. Copying from initial database.')
        const sourceDb = new Database(INIT_CDB_PATH, { readonly: true, fileMustExist: true })
        try {
          await sourceDb.backup(Chaterm_DB_PATH)
          logger.info('Chaterm database successfully copied.')
        } finally {
          sourceDb.close()
        }

        // Apply migrations to newly created database to ensure schema consistency
        // This is critical: init_chaterm.db may not contain all latest tables (e.g., skills_state)
        const newDb = new Database(Chaterm_DB_PATH)
        try {
          logger.info('Applying migrations to newly created database...')
          await applyAllMigrations(newDb)
          logger.info('Migrations applied successfully to new database.')
        } finally {
          newDb.close()
        }
      } else {
        // Legacy database was migrated, apply migrations to ensure consistency
        const migratedDb = new Database(Chaterm_DB_PATH)
        try {
          logger.info('Applying migrations to migrated legacy database...')
          await applyAllMigrations(migratedDb)
          logger.info('Migrations applied successfully to migrated database.')
        } finally {
          migratedDb.close()
        }
      }
    } else {
      logger.info('Target Chaterm database exists. Attempting schema synchronization.')
      let mainDb: Database.Database | null = null
      let initDb: Database.Database | null = null
      try {
        mainDb = new Database(Chaterm_DB_PATH)
        initDb = new Database(INIT_CDB_PATH, { readonly: true, fileMustExist: true })

        const initTables = initDb.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {
          name: string
          sql: string
        }[]

        for (const initTable of initTables) {
          const tableName = initTable.name
          const createTableSql = initTable.sql

          const tableExists = mainDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(tableName)

          if (!tableExists) {
            logger.info(`Creating missing table: ${tableName}`)
            mainDb.exec(createTableSql)
          }
        }

        // Perform necessary upgrades
        await applyAllMigrations(mainDb)
      } finally {
        if (mainDb) mainDb.close()
        if (initDb) initDb.close()
      }
    }

    const db = new Database(Chaterm_DB_PATH)
    logger.info('Chaterm database connection established')

    // ==================== IndexedDB to SQLite Data Migration ====================
    if (mainWindowWebContents && !mainWindowWebContents.isDestroyed()) {
      try {
        logger.info('Starting IndexedDB migration check', { userId: targetUserId })
        const migrator = new IndexDBMigrator(db, targetUserId, mainWindowWebContents)
        const migrationSuccess = await migrator.migrateAllDataWithRetry(3)

        if (migrationSuccess) {
          logger.info('Migration completed successfully')
          logger.info('Please restart the application manually to complete the migration')
        } else {
          logger.warn('Migration failed, will fallback to IndexedDB')
        }
      } catch (error) {
        logger.error('Migration error', { error: error instanceof Error ? error.message : String(error) })
      }
    } else {
      logger.info('Skip migration: mainWindow not available')
    }

    return db
  } catch (error) {
    logger.error('Chaterm database initialization failed', { error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
