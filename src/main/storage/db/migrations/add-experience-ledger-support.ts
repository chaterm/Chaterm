import Database from 'better-sqlite3'
const logger = createLogger('db')

export async function upgradeExperienceLedgerSupport(db: Database.Database): Promise<void> {
  try {
    const tableInfo = db.prepare('PRAGMA table_info(agent_task_metadata_v1)').all()
    const ledgerColumnExists = tableInfo.some((col: any) => col.name === 'experience_ledger')

    if (!ledgerColumnExists) {
      logger.info('Adding experience_ledger column to agent_task_metadata_v1 table...')
      db.exec('ALTER TABLE agent_task_metadata_v1 ADD COLUMN experience_ledger TEXT')
      logger.info('experience_ledger column added successfully')
    } else {
      logger.info('experience_ledger column already exists, skipping migration')
    }

    const result = db
      .prepare(
        `
        UPDATE agent_task_metadata_v1
        SET experience_ledger = '[]'
        WHERE experience_ledger IS NULL
      `
      )
      .run()
    logger.info(`Initialized experience_ledger for ${result.changes} existing tasks`)
  } catch (error) {
    logger.error('Failed to upgrade experience ledger support', { error })
    throw error
  }
}
