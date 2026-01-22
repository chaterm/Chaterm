import Database from 'better-sqlite3'

/**
 * Add content_parts column to agent_ui_messages_v1 table.
 * Stores structured user content (chips + text) so UI can restore mentions.
 */
export async function upgradeContentPartsSupport(db: Database.Database): Promise<void> {
  try {
    const tableInfo = db.prepare('PRAGMA table_info(agent_ui_messages_v1)').all() as Array<{ name?: unknown }>
    const contentPartsColumnExists = tableInfo.some((col) => col.name === 'content_parts')

    if (!contentPartsColumnExists) {
      console.log('Adding content_parts column to agent_ui_messages_v1 table...')
      db.exec('ALTER TABLE agent_ui_messages_v1 ADD COLUMN content_parts TEXT')
      console.log('content_parts column added successfully')
    } else {
      console.log('content_parts column already exists, skipping migration')
    }
  } catch (error) {
    console.error('Failed to upgrade content parts support:', error)
    throw error
  }
}
