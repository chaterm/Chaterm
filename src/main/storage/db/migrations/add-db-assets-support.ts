//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import Database from 'better-sqlite3'
const logger = createLogger('db')

interface TableColumnInfo {
  name: string
  notnull?: number
}

const DB_ASSETS_CREATE_SQL = `
        CREATE TABLE db_assets (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          group_id TEXT,
          group_name TEXT,
          db_type TEXT NOT NULL,
          environment TEXT,
          host TEXT,
          port INTEGER,
          file_path TEXT,
          connection_mode TEXT DEFAULT 'readwrite',
          database_name TEXT,
          schema_name TEXT,
          auth_type TEXT NOT NULL DEFAULT 'password',
          username TEXT,
          password_ciphertext TEXT,
          ssl_mode TEXT,
          jdbc_url TEXT,
          driver_name TEXT,
          driver_class_name TEXT,
          ssh_tunnel_enabled INTEGER DEFAULT 0,
          ssh_tunnel_asset_uuid TEXT,
          options_json TEXT,
          tags_json TEXT,
          status TEXT DEFAULT 'idle',
          last_connected_at TEXT,
          last_tested_at TEXT,
          last_error_code TEXT,
          last_error_message TEXT,
          sort_order INTEGER DEFAULT 0,
          deleted_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `

const DB_ASSETS_COLUMNS = [
  'id',
  'user_id',
  'name',
  'group_id',
  'group_name',
  'db_type',
  'environment',
  'host',
  'port',
  'file_path',
  'connection_mode',
  'database_name',
  'schema_name',
  'auth_type',
  'username',
  'password_ciphertext',
  'ssl_mode',
  'jdbc_url',
  'driver_name',
  'driver_class_name',
  'ssh_tunnel_enabled',
  'ssh_tunnel_asset_uuid',
  'options_json',
  'tags_json',
  'status',
  'last_connected_at',
  'last_tested_at',
  'last_error_code',
  'last_error_message',
  'sort_order',
  'deleted_at',
  'created_at',
  'updated_at'
] as const

function listColumns(db: Database.Database): TableColumnInfo[] {
  return db.prepare("PRAGMA table_info('db_assets')").all() as TableColumnInfo[]
}

function defaultExpressionForColumn(name: string): string {
  switch (name) {
    case 'group_id':
    case 'group_name':
    case 'environment':
    case 'host':
    case 'port':
    case 'file_path':
    case 'database_name':
    case 'schema_name':
    case 'username':
    case 'password_ciphertext':
    case 'ssl_mode':
    case 'jdbc_url':
    case 'driver_name':
    case 'driver_class_name':
    case 'ssh_tunnel_asset_uuid':
    case 'options_json':
    case 'tags_json':
    case 'last_connected_at':
    case 'last_tested_at':
    case 'last_error_code':
    case 'last_error_message':
    case 'deleted_at':
      return 'NULL'
    case 'connection_mode':
      return `'readwrite'`
    case 'auth_type':
      return `'password'`
    case 'ssh_tunnel_enabled':
    case 'sort_order':
      return '0'
    case 'status':
      return `'idle'`
    case 'created_at':
    case 'updated_at':
      return `datetime('now')`
    default:
      throw new Error(`cannot provide default for db_assets.${name}`)
  }
}

function rebuildDbAssetsTable(db: Database.Database, existingColumns: Set<string>): void {
  logger.info('[Migration] Rebuilding db_assets table for SQLite file assets support')
  const rebuild = db.transaction(() => {
    db.exec('ALTER TABLE db_assets RENAME TO db_assets__old')
    db.exec(DB_ASSETS_CREATE_SQL)
    const selectExprs = DB_ASSETS_COLUMNS.map((name) => (existingColumns.has(name) ? name : `${defaultExpressionForColumn(name)} AS ${name}`))
    db.exec(`
      INSERT INTO db_assets (${DB_ASSETS_COLUMNS.join(', ')})
      SELECT ${selectExprs.join(', ')}
      FROM db_assets__old
    `)
    db.exec('DROP TABLE db_assets__old')
  })
  rebuild()
}

function ensureDbAssetsSqliteColumns(db: Database.Database): void {
  const columns = listColumns(db)
  const byName = new Map(columns.map((col) => [col.name, col]))
  const hostNotNull = byName.get('host')?.notnull === 1
  const portNotNull = byName.get('port')?.notnull === 1
  if (hostNotNull || portNotNull) {
    rebuildDbAssetsTable(db, new Set(byName.keys()))
    return
  }

  if (!byName.has('group_id')) {
    logger.info('[Migration] Adding group_id column to db_assets table')
    db.exec(`ALTER TABLE db_assets ADD COLUMN group_id TEXT`)
  }
  if (!byName.has('file_path')) {
    logger.info('[Migration] Adding file_path column to db_assets table')
    db.exec(`ALTER TABLE db_assets ADD COLUMN file_path TEXT`)
  }
  if (!byName.has('connection_mode')) {
    logger.info('[Migration] Adding connection_mode column to db_assets table')
    db.exec(`ALTER TABLE db_assets ADD COLUMN connection_mode TEXT DEFAULT 'readwrite'`)
  }
}

/**
 * Database migration to add database asset support.
 * Creates:
 * - db_assets: persistent metadata + ciphered credentials for database assets
 *   (MySQL, PostgreSQL, SQLite file assets)
 * - db_connection_sessions: optional transient session ledger; live driver
 *   handles stay in the main-process runtime, only metadata is persisted
 */
export async function upgradeDbAssetsSupport(db: Database.Database): Promise<void> {
  try {
    const assetsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='db_assets'").get()
    const groupsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='db_asset_groups'").get()

    if (!assetsExists) {
      logger.info('[Migration] Creating db_assets table')
      db.exec(DB_ASSETS_CREATE_SQL)
      logger.info('[Migration] db_assets table created')
    } else {
      ensureDbAssetsSqliteColumns(db)
    }

    db.exec(`CREATE INDEX IF NOT EXISTS idx_db_assets_user_id ON db_assets(user_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_db_assets_type ON db_assets(db_type)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_db_assets_group_name ON db_assets(group_name)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_db_assets_group_id ON db_assets(group_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_db_assets_status ON db_assets(status)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_db_assets_user_deleted ON db_assets(user_id, deleted_at)`)

    if (!groupsExists) {
      logger.info('[Migration] Creating db_asset_groups table')
      db.exec(`
        CREATE TABLE db_asset_groups (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          parent_id TEXT,
          sort_order INTEGER DEFAULT 0,
          deleted_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `)
      logger.info('[Migration] db_asset_groups table created')
    }

    db.exec(`CREATE INDEX IF NOT EXISTS idx_db_asset_groups_user_id ON db_asset_groups(user_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_db_asset_groups_parent_id ON db_asset_groups(parent_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_db_asset_groups_user_deleted ON db_asset_groups(user_id, deleted_at)`)

    const sessionsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='db_connection_sessions'").get()

    if (!sessionsExists) {
      logger.info('[Migration] Creating db_connection_sessions table')
      db.exec(`
        CREATE TABLE db_connection_sessions (
          id TEXT PRIMARY KEY,
          asset_id TEXT NOT NULL,
          user_id INTEGER NOT NULL,
          session_status TEXT NOT NULL,
          connected_at TEXT,
          disconnected_at TEXT,
          last_health_check_at TEXT,
          runtime_meta_json TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_db_conn_sessions_asset ON db_connection_sessions(asset_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_db_conn_sessions_status ON db_connection_sessions(session_status)`)
      logger.info('[Migration] db_connection_sessions table created')
    }
  } catch (error) {
    logger.error('[Migration] Failed to upgrade db_assets support', { error })
    throw error
  }
}
