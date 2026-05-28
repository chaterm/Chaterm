import Database from 'better-sqlite3'
const logger = createLogger('db')

/**
 * Add last_used_at column to linux_commands_history for time-decay scoring.
 * Backfills existing rows with update_time value where available.
 */
export async function upgradeHistoryScoringSupport(db: Database.Database): Promise<void> {
  try {
    const columnExists = db.prepare("SELECT name FROM pragma_table_info('linux_commands_history') WHERE name='last_used_at'").get()

    if (!columnExists) {
      logger.info('Adding last_used_at column to linux_commands_history...')
      db.exec(`
        ALTER TABLE linux_commands_history ADD COLUMN last_used_at INTEGER NOT NULL DEFAULT 0
      `)
      // Backfill: derive from update_time if it's a valid datetime string, else use 0
      db.exec(`
        UPDATE linux_commands_history
        SET last_used_at = CAST(strftime('%s', update_time) AS INTEGER)
        WHERE update_time IS NOT NULL AND update_time != ''
      `)
      logger.info('last_used_at column added and backfilled successfully')
    } else {
      logger.info('last_used_at column already exists, skipping migration')
    }
  } catch (error) {
    logger.error('Failed to upgrade history scoring support', { error: error })
    throw error
  }
}
