import Database from 'better-sqlite3'
import { initDatabase, getCurrentUserId } from './connection'
import { EvictConfig } from './types'
import { isValidCommand } from './commandValidation'
const logger = createLogger('db')

interface HistoryRow {
  command: string
  count: number
  last_used_at: number
}

function decayScore(count: number, lastUsedAt: number): number {
  const now = Math.floor(Date.now() / 1000)
  const ageHours = (now - lastUsedAt) / 3600
  // Exponential decay: halve relevance every 24 hours
  return count * Math.pow(0.5, ageHours / 24)
}

function fuzzyScore(query: string, target: string): number {
  if (query.length === 0 || query.length > target.length) return 0
  let score = 0
  let qi = 0
  let prevMatchIdx = -2
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      qi++
      if (i === 0) score += 10
      if (i === prevMatchIdx + 1) score += 5
      if (i === 0 || t[i - 1] === ' ' || t[i - 1] === '/' || t[i - 1] === '-' || t[i - 1] === '_') score += 3
      score += 1
      prevMatchIdx = i
    }
  }
  return qi === q.length ? score : 0
}

export class autoCompleteDatabaseService {
  private static instances: Map<number, autoCompleteDatabaseService> = new Map()
  // Lock map to prevent race conditions during async initialization
  private static initializingPromises: Map<number, Promise<autoCompleteDatabaseService>> = new Map()
  private db: Database.Database
  private commandCount: number = 0
  private lastEvictTime: number = 0
  private userId: number

  private constructor(db: Database.Database, userId: number) {
    this.db = db
    this.userId = userId
    this.initEvictSystem()
  }

  private async initEvictSystem() {
    const timeConfig = this.db
      .prepare('SELECT evict_value, evict_current_value FROM linux_commands_evict WHERE evict_type = ?')
      .get('time') as EvictConfig

    const currentCount = this.db.prepare('SELECT COUNT(*) as count FROM linux_commands_history').get() as { count: number }
    this.commandCount = currentCount.count
    this.lastEvictTime = timeConfig.evict_current_value

    await this.checkAndEvict()
  }

  private async checkAndEvict() {
    const countConfig = this.db.prepare('SELECT evict_value FROM linux_commands_evict WHERE evict_type = ?').get('count') as EvictConfig
    const timeConfig = this.db.prepare('SELECT evict_value FROM linux_commands_evict WHERE evict_type = ?').get('time') as EvictConfig

    const now = Math.floor(Date.now() / 1000)
    if (this.commandCount >= countConfig.evict_value) {
      await this.evictCommands('count')
    } else if (now - this.lastEvictTime >= timeConfig.evict_value) {
      await this.evictCommands('time')
    }
  }

  /**
   * Deletion logic:
   * Records meeting any of the following conditions will be deleted:
   * Condition 1: Not among the top (threshold-10000) most frequently used records
   * Condition 2: Meets time-based eviction rules (low frequency and old OR very old)
   */
  private async evictCommands(evictType: 'count' | 'time') {
    logger.info(`Starting command eviction by ${evictType}`)
    this.db.transaction(() => {
      const secondMonthsAgo = Math.floor(Date.now() / 1000) - 60 * 24 * 60 * 60
      const oneYearAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60

      const deleteStmt = this.db.prepare(`
        DELETE FROM linux_commands_history
        WHERE id NOT IN (
            SELECT id FROM linux_commands_history
            ORDER BY count DESC, update_time DESC
            LIMIT (
                SELECT evict_value - 10000
                FROM linux_commands_evict
                WHERE evict_type = 'count'
            )
        )
        OR (
            (count < 2 AND CAST(strftime('%s', update_time) AS INTEGER) < ?)
            OR (CAST(strftime('%s', update_time) AS INTEGER) < ?)
        )`)

      const result = deleteStmt.run(secondMonthsAgo, oneYearAgo)
      const currentCount = this.db.prepare('SELECT COUNT(*) as count FROM linux_commands_history').get() as { count: number }
      this.commandCount = currentCount.count
      this.lastEvictTime = Math.floor(Date.now() / 1000)
      this.db.prepare('UPDATE linux_commands_evict SET evict_current_value = ? WHERE evict_type = ?').run(this.commandCount, 'count')
      this.db.prepare('UPDATE linux_commands_evict SET evict_current_value = ? WHERE evict_type = ?').run(this.lastEvictTime, 'time')
      logger.info(`Evicted ${result.changes} commands. Current count: ${this.commandCount}`)
    })()
  }

  public static async getInstance(userId?: number): Promise<autoCompleteDatabaseService> {
    const targetUserId = userId || getCurrentUserId()
    if (!targetUserId) {
      throw new Error('User ID is required for autoCompleteDatabaseService')
    }

    const existingInstance = autoCompleteDatabaseService.instances.get(targetUserId)
    if (existingInstance) {
      return existingInstance
    }

    const existingPromise = autoCompleteDatabaseService.initializingPromises.get(targetUserId)
    if (existingPromise) {
      logger.info(`Waiting for existing autoComplete initialization for user ${targetUserId}`)
      return existingPromise
    }

    logger.info(`Creating new autoCompleteDatabaseService instance for user ${targetUserId}`)
    const initPromise = (async () => {
      try {
        const db = await initDatabase(targetUserId)
        const instance = new autoCompleteDatabaseService(db, targetUserId)
        autoCompleteDatabaseService.instances.set(targetUserId, instance)
        return instance
      } finally {
        autoCompleteDatabaseService.initializingPromises.delete(targetUserId)
      }
    })()

    autoCompleteDatabaseService.initializingPromises.set(targetUserId, initPromise)
    return initPromise
  }

  public getUserId(): number {
    return this.userId
  }

  queryCommand(command: string, ip: string) {
    if (command.length < 2) {
      return []
    }

    type Suggestion = { command: string; source: 'history' }

    const likePattern = command + '%'
    const limit = 6
    const seen = new Set<string>()
    const candidates: { command: string; source: 'history'; score: number }[] = []

    // 1. History for current IP with decay scoring
    const historyCurr = this.db
      .prepare(
        'SELECT command, count, last_used_at FROM linux_commands_history WHERE command LIKE ? AND command != ? AND ip = ? ORDER BY last_used_at DESC LIMIT 50'
      )
      .all(likePattern, command, ip) as HistoryRow[]
    for (const row of historyCurr) {
      if (!seen.has(row.command)) {
        seen.add(row.command)
        candidates.push({ command: row.command, source: 'history', score: decayScore(row.count, row.last_used_at) * 10 })
      }
    }

    // 2. History for other IPs
    const historyOther = this.db
      .prepare(
        'SELECT command, count, last_used_at FROM linux_commands_history WHERE command LIKE ? AND command != ? AND ip != ? ORDER BY last_used_at DESC LIMIT 50'
      )
      .all(likePattern, command, ip) as HistoryRow[]
    for (const row of historyOther) {
      if (!seen.has(row.command)) {
        seen.add(row.command)
        candidates.push({ command: row.command, source: 'history', score: decayScore(row.count, row.last_used_at) })
      }
    }

    // Sort history candidates by decay score
    candidates.sort((a, b) => b.score - a.score)
    const suggestions: Suggestion[] = candidates.slice(0, limit).map((c) => ({ command: c.command, source: c.source }))

    // 3. Fuzzy fallback when prefix results are sparse
    if (suggestions.length < 3 && command.length >= 2) {
      const allHistory = this.db
        .prepare('SELECT command, count, last_used_at FROM linux_commands_history WHERE command != ? ORDER BY count DESC LIMIT 500')
        .all(command) as HistoryRow[]
      const fuzzyScored = allHistory
        .filter((row) => !seen.has(row.command))
        .map((row) => ({ command: row.command, fScore: fuzzyScore(command, row.command) * decayScore(row.count, row.last_used_at) }))
        .filter((r) => r.fScore > 0)
      fuzzyScored.sort((a, b) => b.fScore - a.fScore)
      const need = limit - suggestions.length
      for (const r of fuzzyScored) {
        if (suggestions.length >= limit) break
        if (seen.has(r.command)) continue
        seen.add(r.command)
        suggestions.push({ command: r.command, source: 'history' })
        if (suggestions.length - (limit - need) >= need) break
      }
    }

    return suggestions
  }

  insertCommand(command: string, ip: string) {
    if (!isValidCommand(command)) {
      return {}
    }

    const result = this.db.transaction(() => {
      const now = Math.floor(Date.now() / 1000)
      const selectStmt = this.db.prepare('SELECT id, count FROM linux_commands_history WHERE command = ? AND ip = ?')
      const existing = selectStmt.get(command, ip) as { id: number; count: number } | undefined

      let insertResult: ReturnType<Database.Statement['run']>
      if (existing) {
        insertResult = this.db
          .prepare('UPDATE linux_commands_history SET count = count + 1, update_time = CURRENT_TIMESTAMP, last_used_at = ? WHERE id = ?')
          .run(now, existing.id)
      } else {
        insertResult = this.db
          .prepare('INSERT INTO linux_commands_history (command, cmd_length, ip, last_used_at) VALUES (?, ?, ?, ?)')
          .run(command, command.length, ip, now)
        this.commandCount++
      }

      this.checkAndEvict()
      return insertResult
    })()
    return result
  }
}
