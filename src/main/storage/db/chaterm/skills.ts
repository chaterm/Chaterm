//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import Database from 'better-sqlite3'
import type { SkillState } from '../../../agent/shared/skills'

/**
 * Get all skill states from database
 */
export function getSkillStatesLogic(db: Database.Database): SkillState[] {
  try {
    const rows = db
      .prepare(
        `
        SELECT skill_id, enabled, config, last_used
        FROM skills_state
        ORDER BY updated_at DESC
      `
      )
      .all() as Array<{
      skill_id: string
      enabled: number
      config: string | null
      last_used: number | null
    }>

    return rows.map((row) => ({
      skillId: row.skill_id,
      enabled: row.enabled === 1,
      config: row.config ? JSON.parse(row.config) : undefined,
      lastUsed: row.last_used ?? undefined
    }))
  } catch (error) {
    console.error('[Skills] Failed to get skill states:', error)
    return []
  }
}

/**
 * Get a specific skill state
 */
export function getSkillStateLogic(db: Database.Database, skillId: string): SkillState | null {
  try {
    const row = db
      .prepare(
        `
        SELECT skill_id, enabled, config, last_used
        FROM skills_state
        WHERE skill_id = ?
      `
      )
      .get(skillId) as
      | {
          skill_id: string
          enabled: number
          config: string | null
          last_used: number | null
        }
      | undefined

    if (!row) return null

    return {
      skillId: row.skill_id,
      enabled: row.enabled === 1,
      config: row.config ? JSON.parse(row.config) : undefined,
      lastUsed: row.last_used ?? undefined
    }
  } catch (error) {
    console.error('[Skills] Failed to get skill state:', error)
    return null
  }
}

/**
 * Set skill enabled state
 */
export function setSkillStateLogic(db: Database.Database, skillId: string, enabled: boolean): void {
  try {
    const now = Date.now()

    db.prepare(
      `
      INSERT INTO skills_state (skill_id, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(skill_id) DO UPDATE SET
        enabled = excluded.enabled,
        updated_at = excluded.updated_at
    `
    ).run(skillId, enabled ? 1 : 0, now, now)
  } catch (error) {
    console.error('[Skills] Failed to set skill state:', error)
    throw error
  }
}

/**
 * Update skill config
 */
export function updateSkillConfigLogic(db: Database.Database, skillId: string, config: Record<string, unknown>): void {
  try {
    const now = Date.now()
    const configJson = JSON.stringify(config)

    db.prepare(
      `
      INSERT INTO skills_state (skill_id, enabled, config, created_at, updated_at)
      VALUES (?, 1, ?, ?, ?)
      ON CONFLICT(skill_id) DO UPDATE SET
        config = excluded.config,
        updated_at = excluded.updated_at
    `
    ).run(skillId, configJson, now, now)
  } catch (error) {
    console.error('[Skills] Failed to update skill config:', error)
    throw error
  }
}

/**
 * Update skill last used timestamp
 */
export function updateSkillLastUsedLogic(db: Database.Database, skillId: string): void {
  try {
    const now = Date.now()

    db.prepare(
      `
      UPDATE skills_state
      SET last_used = ?, updated_at = ?
      WHERE skill_id = ?
    `
    ).run(now, now, skillId)
  } catch (error) {
    console.error('[Skills] Failed to update skill last used:', error)
  }
}

/**
 * Delete skill state
 */
export function deleteSkillStateLogic(db: Database.Database, skillId: string): void {
  try {
    db.prepare('DELETE FROM skills_state WHERE skill_id = ?').run(skillId)
  } catch (error) {
    console.error('[Skills] Failed to delete skill state:', error)
    throw error
  }
}

/**
 * Get enabled skill IDs
 */
export function getEnabledSkillIdsLogic(db: Database.Database): string[] {
  try {
    const rows = db
      .prepare(
        `
        SELECT skill_id
        FROM skills_state
        WHERE enabled = 1
      `
      )
      .all() as Array<{ skill_id: string }>

    return rows.map((row) => row.skill_id)
  } catch (error) {
    console.error('[Skills] Failed to get enabled skill IDs:', error)
    return []
  }
}
