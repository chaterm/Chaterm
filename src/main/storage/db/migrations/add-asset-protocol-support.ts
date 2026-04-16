//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import Database from 'better-sqlite3'
const logger = createLogger('db')

/**
 * Database migration to add protocol column to t_assets table.
 * Adds a 'protocol' column (default 'ssh') directly to t_assets.
 * Also drops the legacy t_asset_protocol table if it exists.
 */
export async function upgradeAssetProtocolSupport(db: Database.Database): Promise<void> {
  try {
    // Add protocol column to t_assets if not exists
    try {
      db.prepare('SELECT protocol FROM t_assets LIMIT 1').get()
    } catch (e) {
      db.exec("ALTER TABLE t_assets ADD COLUMN protocol TEXT DEFAULT 'ssh'")
      logger.info('[Migration] Added protocol column to t_assets')
    }

    // Drop legacy t_asset_protocol table if it exists
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='t_asset_protocol'").get()
    if (tableExists) {
      // Migrate any telnet records from old table to new column before dropping
      try {
        const telnetRecords = db.prepare("SELECT asset_uuid FROM t_asset_protocol WHERE protocol = 'telnet'").all() as { asset_uuid: string }[]
        if (telnetRecords.length > 0) {
          const updateStmt = db.prepare("UPDATE t_assets SET protocol = 'telnet' WHERE uuid = ?")
          for (const record of telnetRecords) {
            updateStmt.run(record.asset_uuid)
          }
          logger.info('[Migration] Migrated telnet protocol records to t_assets', {
            event: 'migration.protocol.migrate',
            count: telnetRecords.length
          })
        }
      } catch (err) {
        logger.warn('[Migration] Could not migrate protocol records', { error: err })
      }

      db.exec('DROP TABLE t_asset_protocol')
      logger.info('[Migration] Dropped legacy t_asset_protocol table')
    }
  } catch (error) {
    logger.error('[Migration] Failed to upgrade asset protocol support', { error: error })
    throw error
  }
}
