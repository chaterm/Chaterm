//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import Database from 'better-sqlite3'
const logger = createLogger('db')

/**
 * Database migration to add database asset support.
 * Creates:
 * - db_assets: persistent metadata + ciphered credentials for database assets
 *   (MySQL, PostgreSQL at launch; schema reserves room for more types)
 * - db_connection_sessions: optional transient session ledger; live driver
 *   handles stay in the main-process runtime, only metadata is persisted
 */
export async function upgradeDbAssetsSupport(db: Database.Database): Promise<void> {
  try {
    const assetsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='db_assets'").get()

    if (!assetsExists) {
      logger.info('[Migration] Creating db_assets table')
      db.exec(`
        CREATE TABLE db_assets (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          group_name TEXT,
          db_type TEXT NOT NULL,
          environment TEXT,
          host TEXT NOT NULL,
          port INTEGER NOT NULL,
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
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_db_assets_user_id ON db_assets(user_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_db_assets_type ON db_assets(db_type)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_db_assets_group_name ON db_assets(group_name)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_db_assets_status ON db_assets(status)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_db_assets_user_deleted ON db_assets(user_id, deleted_at)`)
      logger.info('[Migration] db_assets table created')
    }

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
