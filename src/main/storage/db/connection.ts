import Database from 'better-sqlite3'
import { join } from 'path'
import * as fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { upgradeAgentTaskMetadataSupport } from './migrations/add-todos-support'
import { upgradeMcpToolStateSupport } from './migrations/add-mcp-tool-state-support'
import { upgradeMcpToolCallSupport } from './migrations/add-mcp-tool-call-support'
import { IndexDBMigrator } from './indexdb-migrator'
import { getUserDataPath } from '../../config/edition'

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
  const userDir = join(getUserDataPath(), 'databases', `${userId}`)
  const dbName = dbType === 'complete' ? 'complete_data.db' : 'chaterm_data.db'
  return join(userDir, dbName)
}

export function getChatermDbPathForUser(userId: number): string {
  return getUserDatabasePath(userId, 'chaterm')
}

function ensureUserDatabaseDir(userId: number): string {
  const userDir = join(getUserDataPath(), 'databases', `${userId}`)
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true })
  }
  return userDir
}

function getLegacyDatabasePath(dbType: 'complete' | 'chaterm'): string {
  const dbName = dbType === 'complete' ? 'complete_data.db' : 'chaterm_data.db'
  return join(getUserDataPath(), 'databases', dbName)
}

function migrateLegacyDatabase(userId: number, dbType: 'complete' | 'chaterm'): boolean {
  const legacyPath = getLegacyDatabasePath(dbType)
  const userPath = getUserDatabasePath(userId, dbType)

  if (fs.existsSync(legacyPath)) {
    try {
      console.log(`Found legacy ${dbType} database at: ${legacyPath}`)
      console.log(`[PACKAGE] Migrating to user directory: ${userPath}`)
      ensureUserDatabaseDir(userId)
      fs.renameSync(legacyPath, userPath)
      console.log(`Successfully migrated legacy ${dbType} database for user ${userId}`)
      return true
    } catch (error) {
      console.error(`Failed to migrate legacy ${dbType} database:`, error)
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
        console.log('Added sort_order column to user_snippet_v1')

        // Initialize sort_order for existing records
        const allRecords = db.prepare('SELECT id FROM user_snippet_v1 ORDER BY created_at ASC').all()
        if (allRecords.length > 0) {
          const updateSortStmt = db.prepare('UPDATE user_snippet_v1 SET sort_order = ? WHERE id = ?')
          allRecords.forEach((record: any, index: number) => {
            updateSortStmt.run((index + 1) * 10, record.id) // Use multiples of 10 to leave space for insertion
          })
          console.log(`Initialized sort_order for ${allRecords.length} existing records`)
        }
      })()

      console.log('user_snippet_v1 table upgrade completed')
    }
  } catch (error) {
    console.error('Failed to upgrade user_snippet_v1 table:', error)
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
        console.log('Added asset_type column to t_assets')
      })()

      console.log('t_assets table upgrade completed')
    }

    // Additional column upgrade: t_assets.version
    try {
      db.prepare('SELECT version FROM t_assets LIMIT 1').get()
    } catch (e) {
      db.exec('ALTER TABLE t_assets ADD COLUMN version INTEGER NOT NULL DEFAULT 1')
      console.log('Added version column to t_assets')
    }

    // Additional column upgrade: t_asset_chains.uuid
    try {
      db.prepare('SELECT uuid FROM t_asset_chains LIMIT 1').get()
    } catch (e) {
      // uuid column does not exist, need to add
      db.transaction(() => {
        try {
          db.exec('ALTER TABLE t_asset_chains ADD COLUMN uuid TEXT')
          console.log('Added uuid column to t_asset_chains')
        } catch (transactionError) {
          console.error('Error adding uuid column to t_asset_chains:', transactionError)
          throw transactionError
        }
      })()
    }

    // Check and fill missing UUIDs
    try {
      const existingRecords = db.prepare("SELECT key_chain_id FROM t_asset_chains WHERE uuid IS NULL OR uuid = ''").all()

      if (existingRecords.length > 0) {
        db.transaction(() => {
          const updateUuidStmt = db.prepare('UPDATE t_asset_chains SET uuid = ? WHERE key_chain_id = ?')
          existingRecords.forEach((record: { key_chain_id: string | number }) => {
            updateUuidStmt.run(uuidv4(), record.key_chain_id)
          })
        })()
        console.log(`Auto-filled uuid for ${existingRecords.length} existing t_asset_chains records`)
      }
    } catch (fillError) {
      console.error('Error filling uuid for t_asset_chains:', fillError)
    }

    // Additional column: t_assets.need_proxy
    try {
      db.prepare('SELECT need_proxy FROM t_assets LIMIT 1').get()
    } catch (e) {
      db.exec('ALTER TABLE t_assets ADD COLUMN need_proxy INTEGER DEFAULT 0')
      console.log('Added need_proxy column to t_assets')
    }

    // Additional column upgrade: t_assets.proxy_name
    try {
      db.prepare('SELECT proxy_name FROM t_assets LIMIT 1').get()
    } catch (e) {
      db.exec('ALTER TABLE t_assets ADD COLUMN proxy_name TEXT DEFAULT ""')
      console.log('Added proxy_name column to t_assets')
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
        console.log('Added unique constraint for asset_ip + username + port + label + asset_type')
      }
    } catch (constraintError) {
      console.error('Failed to add unique constraint:', constraintError)
    }
  } catch (error) {
    console.error('Failed to upgrade t_assets table:', error)
  }
}

function upgradeSnippetGroups(db: Database.Database): void {
  try {
    // Check if group_uuid column exists in user_snippet_v1
    try {
      db.prepare('SELECT group_uuid FROM user_snippet_v1 LIMIT 1').get()
    } catch (error) {
      db.exec('ALTER TABLE user_snippet_v1 ADD COLUMN group_uuid TEXT')
      console.log('Added group_uuid column to user_snippet_v1')
    }

    // Check if uuid column exists in user_snippet_v1
    try {
      db.prepare('SELECT uuid FROM user_snippet_v1 LIMIT 1').get()
    } catch (error) {
      db.exec('ALTER TABLE user_snippet_v1 ADD COLUMN uuid TEXT')
      console.log('Added uuid column to user_snippet_v1')

      // Backfill uuid for existing records
      const existingRecords = db.prepare("SELECT id FROM user_snippet_v1 WHERE uuid IS NULL OR uuid = ''").all()
      if (existingRecords.length > 0) {
        db.transaction(() => {
          const updateUuidStmt = db.prepare('UPDATE user_snippet_v1 SET uuid = ? WHERE id = ?')
          existingRecords.forEach((record: any) => {
            updateUuidStmt.run(uuidv4(), record.id)
          })
        })()
        console.log(`Backfilled uuid for ${existingRecords.length} existing user_snippet_v1 records`)
      }
    }
  } catch (error) {
    console.error('Failed to upgrade snippet groups:', error)
  }
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
        console.log('Target database does not exist, initializing from:', INIT_DB_PATH)
        if (!fs.existsSync(INIT_DB_PATH)) {
          throw new Error('Initial database (init_data.db) not found')
        }
        const sourceDb = new Database(INIT_DB_PATH, { readonly: true })
        await sourceDb.backup(COMPLETE_DB_PATH)
        sourceDb.close()
      }
    } else {
      console.log('Target database already exists, skipping initialization')
    }

    const db = new Database(COMPLETE_DB_PATH)
    console.log('Complete database connection established at:', COMPLETE_DB_PATH)
    return db
  } catch (error) {
    console.error('Complete database initialization failed:', error)
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

  try {
    if (!fs.existsSync(INIT_CDB_PATH)) {
      throw new Error(`Initial database (init_chaterm.db) not found at ${INIT_CDB_PATH}`)
    }

    const targetDbExists = fs.existsSync(Chaterm_DB_PATH)

    if (!targetDbExists) {
      const migrated = migrateLegacyDatabase(targetUserId, 'chaterm')

      if (!migrated) {
        console.log('Target Chaterm database does not exist. Copying from initial database.')
        const sourceDb = new Database(INIT_CDB_PATH, { readonly: true, fileMustExist: true })
        try {
          await sourceDb.backup(Chaterm_DB_PATH)
          console.log('Chaterm database successfully copied.')
        } finally {
          sourceDb.close()
        }
      }
    } else {
      console.log('Target Chaterm database exists. Attempting schema synchronization.')
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
            console.log(`Creating missing table: ${tableName}`)
            mainDb.exec(createTableSql)
          }
        }

        // Perform necessary upgrades
        upgradeTAssetsTable(mainDb)
        upgradeUserSnippetTable(mainDb)
        upgradeAgentTaskMetadataSupport(mainDb)
        upgradeMcpToolStateSupport(mainDb)
        upgradeMcpToolCallSupport(mainDb)
        upgradeSnippetGroups(mainDb)
      } finally {
        if (mainDb) mainDb.close()
        if (initDb) initDb.close()
      }
    }

    const db = new Database(Chaterm_DB_PATH)
    console.log('Chaterm database connection established at:', Chaterm_DB_PATH)

    // ==================== IndexedDB to SQLite Data Migration ====================
    if (mainWindowWebContents && !mainWindowWebContents.isDestroyed()) {
      try {
        console.log('[Init] Starting IndexedDB migration check for user:', targetUserId)
        const migrator = new IndexDBMigrator(db, targetUserId, mainWindowWebContents)
        const migrationSuccess = await migrator.migrateAllDataWithRetry(3)

        if (migrationSuccess) {
          console.log('[Init] [OK] Migration completed successfully')
          console.log('[Init] [TIP] Please restart the application manually to complete the migration')
        } else {
          console.warn('[Init] [WARNING] Migration failed, will fallback to IndexedDB')
        }
      } catch (error) {
        console.error('[Init] Migration error:', error)
      }
    } else {
      console.log('[Init] Skip migration: mainWindow not available')
    }

    return db
  } catch (error) {
    console.error('Chaterm database initialization failed:', error)
    throw error
  }
}
