//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import Database from 'better-sqlite3'
import type { SkillState } from '../../../agent/shared/skills'

/**
 * Safely parse JSON config, returning undefined on parse errors
 */
const safeParseConfig = (config: string | null): Record<string, unknown> | undefined => {
  if (!config) return undefined
  try {
    return JSON.parse(config) as Record<string, unknown>
  } catch {
    return undefined
  }
}

/**
 * Get all skill states from database
 */
export function getSkillStatesLogic(db: Database.Database): SkillState[] {
  try {
    const rows = db
      .prepare(
        `
        SELECT skill_name, enabled, config, last_used
        FROM skills_state
        ORDER BY updated_at DESC
      `
      )
      .all() as Array<{
      skill_name: string
      enabled: number
      config: string | null
      last_used: number | null
    }>

    return rows.map((row) => ({
      skillId: row.skill_name,
      enabled: row.enabled === 1,
      config: safeParseConfig(row.config),
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
export function getSkillStateLogic(db: Database.Database, skillName: string): SkillState | null {
  try {
    const row = db
      .prepare(
        `
        SELECT skill_name, enabled, config, last_used
        FROM skills_state
        WHERE skill_name = ?
      `
      )
      .get(skillName) as
      | {
          skill_name: string
          enabled: number
          config: string | null
          last_used: number | null
        }
      | undefined

    if (!row) return null

    return {
      skillId: row.skill_name,
      enabled: row.enabled === 1,
      config: safeParseConfig(row.config),
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
export function setSkillStateLogic(db: Database.Database, skillName: string, enabled: boolean): void {
  try {
    const now = Date.now()

    db.prepare(
      `
      INSERT INTO skills_state (skill_name, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(skill_name) DO UPDATE SET
        enabled = excluded.enabled,
        updated_at = excluded.updated_at
    `
    ).run(skillName, enabled ? 1 : 0, now, now)
  } catch (error) {
    console.error('[Skills] Failed to set skill state:', error)
    throw error
  }
}

/**
 * Update skill config
 */
export function updateSkillConfigLogic(db: Database.Database, skillName: string, config: Record<string, unknown>): void {
  try {
    const now = Date.now()
    const configJson = JSON.stringify(config)

    db.prepare(
      `
      INSERT INTO skills_state (skill_name, enabled, config, created_at, updated_at)
      VALUES (?, 1, ?, ?, ?)
      ON CONFLICT(skill_name) DO UPDATE SET
        config = excluded.config,
        updated_at = excluded.updated_at
    `
    ).run(skillName, configJson, now, now)
  } catch (error) {
    console.error('[Skills] Failed to update skill config:', error)
    throw error
  }
}

/**
 * Update skill last used timestamp
 */
export function updateSkillLastUsedLogic(db: Database.Database, skillName: string): void {
  try {
    const now = Date.now()

    db.prepare(
      `
      UPDATE skills_state
      SET last_used = ?, updated_at = ?
      WHERE skill_name = ?
    `
    ).run(now, now, skillName)
  } catch (error) {
    console.error('[Skills] Failed to update skill last used:', error)
  }
}

/**
 * Delete skill state
 */
export function deleteSkillStateLogic(db: Database.Database, skillName: string): void {
  try {
    db.prepare('DELETE FROM skills_state WHERE skill_name = ?').run(skillName)
  } catch (error) {
    console.error('[Skills] Failed to delete skill state:', error)
    throw error
  }
}

/**
 * Get enabled skill names
 */
export function getEnabledSkillNamesLogic(db: Database.Database): string[] {
  try {
    const rows = db
      .prepare(
        `
        SELECT skill_name
        FROM skills_state
        WHERE enabled = 1
      `
      )
      .all() as Array<{ skill_name: string }>

    return rows.map((row) => row.skill_name)
  } catch (error) {
    console.error('[Skills] Failed to get enabled skill names:', error)
    return []
  }
}
