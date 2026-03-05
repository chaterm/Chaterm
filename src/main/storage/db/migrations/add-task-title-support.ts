import Database from 'better-sqlite3'
const logger = createLogger('db')

type MigrationStats = {
  title_total: number
  title_inserted: number
  title_updated: number
  favorite_total: number
  favorite_updated: number
  favorite_missing_row: number
  skipped: number
  parse_failed: number
}

function parseLegacyArray<T>(rawValue: string, keyName: string, stats: MigrationStats): T[] {
  try {
    const parsed = JSON.parse(rawValue) as unknown

    if (Array.isArray(parsed)) {
      return parsed as T[]
    }

    // Current key_value_store values are superjson envelopes: { json: [...], meta?: ... }.
    if (parsed && typeof parsed === 'object' && 'json' in parsed && Array.isArray((parsed as { json?: unknown }).json)) {
      return (parsed as { json: T[] }).json
    }

    stats.parse_failed++
    logger.warn(`Unexpected ${keyName} format, skipping migration`, { keyName })
    return []
  } catch {
    stats.parse_failed++
    logger.warn(`Failed to parse ${keyName}, skipping migration`, { keyName })
    return []
  }
}

function cleanupLegacyKeys(db: Database.Database): void {
  try {
    const deleteStmt = db.prepare('DELETE FROM key_value_store WHERE key = ?')
    deleteStmt.run('global_taskHistory')
    deleteStmt.run('global_favoriteTaskList')
  } catch (error) {
    logger.warn('Failed to cleanup legacy task history keys', { error })
  }
}

/**
 * Background migration: copy chatTitle from global_taskHistory and
 * favorite status from global_favoriteTaskList into agent_task_metadata_v1.
 *
 * NOTE: Legacy values may be either plain JSON arrays or superjson envelopes
 * ({ json: [...] }). We intentionally support both formats here.
 */
async function migrateHistoricalDataInBackground(db: Database.Database): Promise<void> {
  const stats: MigrationStats = {
    title_total: 0,
    title_inserted: 0,
    title_updated: 0,
    favorite_total: 0,
    favorite_updated: 0,
    favorite_missing_row: 0,
    skipped: 0,
    parse_failed: 0
  }

  // --- Title migration from global_taskHistory ---
  try {
    const kvRow = db.prepare("SELECT value FROM key_value_store WHERE key = 'global_taskHistory'").get() as { value: string } | undefined

    if (kvRow?.value) {
      const taskHistory = parseLegacyArray<{ id: string; chatTitle?: string; task?: string; ts?: number }>(kvRow.value, 'global_taskHistory', stats)

      const normalizeTaskHistoryTs = (rawTs?: number): number => {
        // taskHistory.ts is usually milliseconds (Date.now), but older data may already be seconds.
        // DB contract is seconds.
        if (typeof rawTs !== 'number' || !Number.isFinite(rawTs) || rawTs <= 0) {
          // No migration-time fallback: keep ordering stable when historical ts is missing.
          return 0
        }
        return rawTs > 1e12 ? Math.floor(rawTs / 1000) : Math.floor(rawTs)
      }

      const itemsWithTitle = taskHistory.map((item) => ({
        ...item,
        normalizedTitle: (item.chatTitle ?? item.task ?? '').trim()
      }))
      stats.title_total = taskHistory.length

      if (itemsWithTitle.length > 0) {
        const updateStmt = db.prepare(`
          UPDATE agent_task_metadata_v1
          SET
            title = CASE
              WHEN title IS NULL OR title = ''
              THEN ?
              ELSE title
            END,
            updated_at = CASE
              WHEN ? > updated_at
              THEN ?
              ELSE updated_at
            END
          WHERE task_id = ?
        `)

        db.transaction(() => {
          for (const item of itemsWithTitle) {
            if (!item.id || item.id.trim() === '') {
              stats.skipped++
              continue
            }

            if (!item.normalizedTitle) {
              stats.skipped++
              continue
            }

            const historicalUpdatedAt = normalizeTaskHistoryTs(item.ts)
            const result = updateStmt.run(item.normalizedTitle, historicalUpdatedAt, historicalUpdatedAt, item.id)
            if (result.changes > 0) {
              stats.title_updated++
            } else {
              stats.skipped++
            }
          }
        })()
      }
    }
  } catch (error) {
    logger.warn('Title migration failed (non-fatal)', { error })
  }

  // --- Favorite migration from global_favoriteTaskList ---
  try {
    const kvRow = db.prepare("SELECT value FROM key_value_store WHERE key = 'global_favoriteTaskList'").get() as { value: string } | undefined

    if (kvRow?.value) {
      const favoriteIds = parseLegacyArray<string>(kvRow.value, 'global_favoriteTaskList', stats)

      if (Array.isArray(favoriteIds) && favoriteIds.length > 0) {
        stats.favorite_total = favoriteIds.length

        const updateStmt = db.prepare(`
          UPDATE agent_task_metadata_v1
          SET favorite = 1
          WHERE task_id = ?
        `)

        db.transaction(() => {
          for (const taskId of favoriteIds) {
            if (!taskId || typeof taskId !== 'string') {
              stats.favorite_missing_row++
              continue
            }

            const result = updateStmt.run(taskId)
            if (result.changes > 0) {
              stats.favorite_updated++
            } else {
              stats.favorite_missing_row++
            }
          }
        })()
      }
    }
  } catch (error) {
    logger.warn('Favorite migration failed (non-fatal)', { error })
  }

  logger.info('Background data migration completed', { stats })
}

export async function upgradeTaskTitleSupport(db: Database.Database): Promise<void> {
  try {
    const tableInfo = db.prepare('PRAGMA table_info(agent_task_metadata_v1)').all()
    const titleExists = tableInfo.some((col: any) => col.name === 'title')
    const favoriteExists = tableInfo.some((col: any) => col.name === 'favorite')

    if (titleExists && favoriteExists) {
      logger.info('title and favorite columns already exist, skip migration')
      return
    }

    if (!titleExists) {
      logger.info('Adding title column to agent_task_metadata_v1...')
      db.exec('ALTER TABLE agent_task_metadata_v1 ADD COLUMN title TEXT')
      logger.info('title column added')
    }

    if (!favoriteExists) {
      logger.info('Adding favorite column to agent_task_metadata_v1...')
      db.exec('ALTER TABLE agent_task_metadata_v1 ADD COLUMN favorite INTEGER DEFAULT 0')
      logger.info('favorite column added')
    }

    // Run one-time backfill within the same live DB connection.
    // Do not defer with setTimeout, because migration caller may close this connection after return.
    await migrateHistoricalDataInBackground(db)
    cleanupLegacyKeys(db)
  } catch (error) {
    logger.error('Failed to upgrade task title support', { error })
    throw error
  }
}
