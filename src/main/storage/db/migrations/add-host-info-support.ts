import Database from 'better-sqlite3'
const logger = createLogger('db')

/**
 * Add hosts column to agent_ui_messages_v1 table.
 * Stores JSON array of Host objects for each message.
 */
export async function upgradeHostInfoSupport(db: Database.Database): Promise<void> {
  try {
    const tableInfo = db.prepare('PRAGMA table_info(agent_ui_messages_v1)').all() as Array<{
      name?: unknown
    }>

    const hostsExists = tableInfo.some((col) => col.name === 'hosts')

    if (!hostsExists) {
      logger.info('Adding hosts column to agent_ui_messages_v1 table...')
      db.exec('ALTER TABLE agent_ui_messages_v1 ADD COLUMN hosts TEXT')
      logger.info('hosts column added successfully')
    } else {
      logger.info('hosts column already exists, skipping migration')
    }
  } catch (error) {
    logger.error('Failed to upgrade host info support', { error: error })
    throw error
  }
}
