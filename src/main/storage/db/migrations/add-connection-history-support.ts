import Database from 'better-sqlite3'
const logger = createLogger('db')

/**
 * Add t_connection_history table to track recent SSH connections.
 * Stores connection metadata for the "Recent Connections" feature in the Workspace sidebar.
 */
export async function upgradeConnectionHistorySupport(db: Database.Database): Promise<void> {
  try {
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='t_connection_history'").get()

    if (!tableExists) {
      logger.info('Creating t_connection_history table...')
      db.exec(`
        CREATE TABLE t_connection_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          asset_uuid TEXT NOT NULL,
          asset_ip TEXT NOT NULL,
          asset_label TEXT,
          asset_port INTEGER DEFAULT 22,
          asset_username TEXT,
          asset_type TEXT NOT NULL,
          organization_id TEXT,
          connected_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)
      logger.info('t_connection_history table created successfully')
    } else {
      logger.info('t_connection_history table already exists, skipping migration')
    }
  } catch (error) {
    logger.error('Failed to upgrade connection history support', { error: error })
    throw error
  }
}
