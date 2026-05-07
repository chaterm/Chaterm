//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import Database from 'better-sqlite3'
const logger = createLogger('db')

/**
 * Adds `workspace` and `db_context` columns to `agent_task_metadata_v1`.
 *
 * - `workspace` TEXT NOT NULL DEFAULT 'server'
 *     Marks a task as belonging to the classic SSH/terminal workspace
 *     ('server') or the DB-AI ChatBot workspace ('database'). Existing rows
 *     and rows inserted by code paths that never set the column fall back
 *     to 'server', preserving historical behaviour.
 * - `db_context` TEXT (nullable)
 *     JSON-serialised `DbAiRequestContext` captured at task creation time
 *     for workspace='database'. Never set for workspace='server'.
 *
 * Idempotent - safe to re-run on already-migrated databases.
 */
export async function upgradeTaskWorkspaceSupport(db: Database.Database): Promise<void> {
  try {
    const tableInfo = db.prepare('PRAGMA table_info(agent_task_metadata_v1)').all() as Array<{ name: string }>
    const workspaceExists = tableInfo.some((col) => col.name === 'workspace')
    const dbContextExists = tableInfo.some((col) => col.name === 'db_context')

    if (!workspaceExists) {
      logger.info('Adding workspace column to agent_task_metadata_v1 table')
      // SQLite ALTER TABLE ADD COLUMN with a non-literal DEFAULT is not
      // allowed, but a literal string DEFAULT is fine. This also applies
      // the default to every existing row immediately.
      db.exec("ALTER TABLE agent_task_metadata_v1 ADD COLUMN workspace TEXT NOT NULL DEFAULT 'server'")
      logger.info('workspace column added successfully')
    } else {
      logger.info('workspace column already exists, skipping migration')
    }

    if (!dbContextExists) {
      logger.info('Adding db_context column to agent_task_metadata_v1 table')
      db.exec('ALTER TABLE agent_task_metadata_v1 ADD COLUMN db_context TEXT')
      logger.info('db_context column added successfully')
    } else {
      logger.info('db_context column already exists, skipping migration')
    }

    // Defensive: ensure any NULL workspace values (e.g. rows inserted by a
    // concurrent writer between ALTER and here) are normalised to 'server'.
    const result = db.prepare("UPDATE agent_task_metadata_v1 SET workspace = 'server' WHERE workspace IS NULL").run()
    if (result.changes > 0) {
      logger.info('Normalised workspace to server for existing rows', { changes: result.changes })
    }
  } catch (error) {
    logger.error('Failed to upgrade task workspace support', { error })
    throw error
  }
}
