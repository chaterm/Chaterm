import Database from 'better-sqlite3'
const logger = createLogger('db')

/**
 * Add message_index column to agent_api_conversation_history_v1 table.
 * This column groups content blocks that belong to the same message,
 * fixing the issue where multi-content messages were flattened on restore.
 */
export async function upgradeMessageIndexSupport(db: Database.Database): Promise<void> {
  try {
    const tableInfo = db.prepare('PRAGMA table_info(agent_api_conversation_history_v1)').all()
    const messageIndexColumnExists = tableInfo.some((col: any) => col.name === 'message_index')

    if (!messageIndexColumnExists) {
      logger.info('Adding message_index column to agent_api_conversation_history_v1 table...')
      db.exec('ALTER TABLE agent_api_conversation_history_v1 ADD COLUMN message_index INTEGER')
      logger.info('message_index column added successfully')
    }
  } catch (error) {
    logger.error('Failed to upgrade message index support', { error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
