import Database from 'better-sqlite3'

export async function upgradeAgentTaskMetadataSupport(db: Database.Database): Promise<void> {
  try {
    // 检查 todos 字段是否已存在
    const tableInfo = db.prepare('PRAGMA table_info(agent_task_metadata_v1)').all()
    const todosColumnExists = tableInfo.some((col: any) => col.name === 'todos')

    if (!todosColumnExists) {
      console.log('Adding todos column to agent_task_metadata_v1 table...')
      db.exec('ALTER TABLE agent_task_metadata_v1 ADD COLUMN todos TEXT')
      console.log('Todos column added successfully')
    } else {
      console.log('Todos column already exists, skipping migration')
    }

    // 为现有任务初始化空的 todos 数组
    const updateStmt = db.prepare(`
      UPDATE agent_task_metadata_v1 
      SET todos = '[]' 
      WHERE todos IS NULL
    `)
    const result = updateStmt.run()
    console.log(`Initialized todos for ${result.changes} existing tasks`)
  } catch (error) {
    console.error('Failed to upgrade todos support:', error)
    throw error
  }
}
