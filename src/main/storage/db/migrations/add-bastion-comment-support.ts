import Database from 'better-sqlite3'

/**
 * Add database support for bastion_comment field
 * Add bastion_comment field to t_organization_assets table
 * Used to store plugin-specific comments separately from user-edited comments
 */
export async function upgradeBastionCommentSupport(db: Database.Database): Promise<void> {
  try {
    // Check if bastion_comment field already exists
    const tableInfo = db.prepare('PRAGMA table_info(t_organization_assets)').all()
    const bastionCommentColumnExists = tableInfo.some((col: any) => col.name === 'bastion_comment')

    if (!bastionCommentColumnExists) {
      console.log('Adding bastion_comment column to t_organization_assets table...')
      db.exec('ALTER TABLE t_organization_assets ADD COLUMN bastion_comment TEXT')
      console.log('bastion_comment column added successfully')
    } else {
      console.log('bastion_comment column already exists, skipping migration')
    }
  } catch (error) {
    console.error('Failed to upgrade bastion comment support:', error)
    throw error
  }
}
