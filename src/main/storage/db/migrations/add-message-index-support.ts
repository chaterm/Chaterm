import Database from 'better-sqlite3'

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
      console.log('Adding message_index column to agent_api_conversation_history_v1 table...')
      db.exec('ALTER TABLE agent_api_conversation_history_v1 ADD COLUMN message_index INTEGER')
      console.log('message_index column added successfully')
    }
  } catch (error) {
    console.error('Failed to upgrade message index support:', error)
    throw error
  }
}
