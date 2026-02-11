import Database from 'better-sqlite3'

import { createLogger } from '@logging'

const logger = createLogger('db')

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
      logger.info('Adding bastion_comment column to t_organization_assets table...')
      db.exec('ALTER TABLE t_organization_assets ADD COLUMN bastion_comment TEXT')
      logger.info('bastion_comment column added successfully')
    } else {
      logger.info('bastion_comment column already exists, skipping migration')
    }
  } catch (error) {
    logger.error('Failed to upgrade bastion comment support', { error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
