//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import Database from 'better-sqlite3'
const logger = createLogger('db')

interface ColumnInfo {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: unknown
  pk: number
}

/**
 * Database migration to add jumpserver/bastion support fields to k8s_clusters table.
 * Adds the following columns (idempotent, skips if already present):
 * - source_type TEXT DEFAULT 'local'
 * - bastion_uuid TEXT
 * - bastion_asset_address TEXT
 * - bastion_asset_name TEXT
 * - bastion_asset_id_last INTEGER
 *
 * Also creates supporting indexes for source_type filtering and bastion identity lookups.
 */
export async function upgradeK8sJumpserverSupport(db: Database.Database): Promise<void> {
  try {
    // Ensure k8s_clusters table exists before attempting alterations
    const clustersTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='k8s_clusters'").get()

    if (!clustersTableExists) {
      logger.info('[Migration] k8s_clusters table not found, skip jumpserver support upgrade')
      return
    }

    // Detect existing columns via PRAGMA table_info
    const existingColumns = db.prepare('PRAGMA table_info(k8s_clusters)').all() as ColumnInfo[]
    const existingColumnNames = new Set(existingColumns.map((c) => c.name))

    const columnDefinitions: { name: string; ddl: string }[] = [
      { name: 'source_type', ddl: "ALTER TABLE k8s_clusters ADD COLUMN source_type TEXT DEFAULT 'local'" },
      { name: 'bastion_uuid', ddl: 'ALTER TABLE k8s_clusters ADD COLUMN bastion_uuid TEXT' },
      { name: 'bastion_asset_address', ddl: 'ALTER TABLE k8s_clusters ADD COLUMN bastion_asset_address TEXT' },
      { name: 'bastion_asset_name', ddl: 'ALTER TABLE k8s_clusters ADD COLUMN bastion_asset_name TEXT' },
      { name: 'bastion_asset_id_last', ddl: 'ALTER TABLE k8s_clusters ADD COLUMN bastion_asset_id_last INTEGER' }
    ]

    for (const col of columnDefinitions) {
      if (existingColumnNames.has(col.name)) {
        logger.info(`[Migration] k8s_clusters.${col.name} already exists, skip`)
        continue
      }
      db.exec(col.ddl)
      logger.info(`[Migration] Added k8s_clusters.${col.name}`)
    }

    // Create supporting indexes (IF NOT EXISTS makes it idempotent)
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_k8s_clusters_source_type
      ON k8s_clusters(source_type)
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_k8s_clusters_bastion_identity
      ON k8s_clusters(bastion_uuid, bastion_asset_address, bastion_asset_name)
    `)

    logger.info('[Migration] k8s_clusters jumpserver support upgrade completed')
  } catch (error) {
    logger.error('[Migration] Failed to upgrade k8s_clusters jumpserver support', { error: error })
    throw error
  }
}
