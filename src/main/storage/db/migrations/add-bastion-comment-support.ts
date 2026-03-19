import Database from 'better-sqlite3'
const logger = createLogger('db')

/**
 * Upgrade t_organization_assets table schema:
 * - Add bastion_comment field for storing plugin-specific comments separately from user-edited comments
 * - Add data_source field to distinguish manually added assets ('manual') from auto-refreshed assets ('refresh')
 */
export async function upgradeBastionCommentSupport(db: Database.Database): Promise<void> {
  try {
    const tableInfo = db.prepare('PRAGMA table_info(t_organization_assets)').all()

    // Add bastion_comment column
    const bastionCommentColumnExists = tableInfo.some((col: any) => col.name === 'bastion_comment')
    if (!bastionCommentColumnExists) {
      logger.info('Adding bastion_comment column to t_organization_assets table...')
      db.exec('ALTER TABLE t_organization_assets ADD COLUMN bastion_comment TEXT')
      logger.info('bastion_comment column added successfully')
    }

    // Add data_source column
    const dataSourceColumnExists = tableInfo.some((col: any) => col.name === 'data_source')
    if (!dataSourceColumnExists) {
      logger.info('Adding data_source column to t_organization_assets table...')
      db.exec("ALTER TABLE t_organization_assets ADD COLUMN data_source TEXT DEFAULT 'refresh'")
      logger.info('data_source column added successfully')
    }
  } catch (error) {
    logger.error('Failed to upgrade t_organization_assets table', { error: error })
    throw error
  }
}
