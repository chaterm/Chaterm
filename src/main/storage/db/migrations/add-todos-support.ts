import Database from 'better-sqlite3'
const logger = createLogger('db')

export async function upgradeAgentTaskMetadataSupport(db: Database.Database): Promise<void> {
  try {
    // Check if todos field already exists
    const tableInfo = db.prepare('PRAGMA table_info(agent_task_metadata_v1)').all()
    const todosColumnExists = tableInfo.some((col: any) => col.name === 'todos')

    if (!todosColumnExists) {
      logger.info('Adding todos column to agent_task_metadata_v1 table...')
      db.exec('ALTER TABLE agent_task_metadata_v1 ADD COLUMN todos TEXT')
      logger.info('Todos column added successfully')
    } else {
      logger.info('Todos column already exists, skipping migration')
    }

    // Initialize empty todos array for existing tasks
    const updateStmt = db.prepare(`
      UPDATE agent_task_metadata_v1 
      SET todos = '[]' 
      WHERE todos IS NULL
    `)
    const result = updateStmt.run()
    logger.info(`Initialized todos for ${result.changes} existing tasks`)
  } catch (error) {
    logger.error('Failed to upgrade todos support', { error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
