//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import Database from 'better-sqlite3'

/**
 * Database migration to add skills state support.
 * Creates the skills_state table for storing skill enabled/disabled states.
 */
export function upgradeSkillsSupport(db: Database.Database): void {
  try {
    // Check if skills_state table exists
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='skills_state'").get()

    if (!tableExists) {
      console.log('[Migration] Creating skills_state table...')

      db.exec(`
        CREATE TABLE skills_state (
          skill_name TEXT PRIMARY KEY,
          enabled INTEGER NOT NULL DEFAULT 1,
          config TEXT,
          last_used INTEGER,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
        )
      `)

      // Create index for faster lookups
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_skills_state_enabled
        ON skills_state(enabled)
      `)

      console.log('[Migration] skills_state table created successfully')
    } else {
      console.log('[Migration] skills_state table already exists')
    }
  } catch (error) {
    console.error('[Migration] Failed to upgrade skills support:', error)
    throw error
  }
}
