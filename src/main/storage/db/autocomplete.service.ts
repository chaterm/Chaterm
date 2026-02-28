import Database from 'better-sqlite3'
import { initDatabase, getCurrentUserId } from './connection'
import { CommandResult, EvictConfig } from './types'
import { isValidCommand } from './commandValidation'
const logger = createLogger('db')

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
    // Initialize eviction configuration
    const timeConfig = this.db
      .prepare('SELECT evict_value, evict_current_value FROM linux_commands_evict WHERE evict_type = ?')
      .get('time') as EvictConfig

    // Get current total command count
    const currentCount = this.db.prepare('SELECT COUNT(*) as count FROM linux_commands_history').get() as { count: number }
    this.commandCount = currentCount.count
    this.lastEvictTime = timeConfig.evict_current_value

    // Check if eviction needs to be performed
    await this.checkAndEvict()
  }

  private async checkAndEvict() {
    const countConfig = this.db.prepare('SELECT evict_value FROM linux_commands_evict WHERE evict_type = ?').get('count') as EvictConfig

    const timeConfig = this.db.prepare('SELECT evict_value FROM linux_commands_evict WHERE evict_type = ?').get('time') as EvictConfig

    // Check time threshold
    const now = Math.floor(Date.now() / 1000)
    // Check quantity threshold
    if (this.commandCount >= countConfig.evict_value) {
      await this.evictCommands('count')
    } else if (now - this.lastEvictTime >= timeConfig.evict_value) {
      await this.evictCommands('time')
    }
  }

  /**
    Deletion logic:
    Records meeting any of the following conditions will be deleted:
    Condition 1: Not among the top (threshold-10000) most frequently used records
    Condition 2: Meets time-based eviction rules (low frequency and old OR very old)
    Specifically, a record will be deleted if it:
    Is not one of the (threshold-10000) most used records
    OR has been used less than 2 times and not used for more than two months
    OR has not been used for more than one year
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
      ) `)

      const result = deleteStmt.run(secondMonthsAgo, oneYearAgo)
      // Get total command count after deletion
      const currentCount = this.db.prepare('SELECT COUNT(*) as count FROM linux_commands_history').get() as { count: number }
      this.commandCount = currentCount.count
      this.lastEvictTime = Math.floor(Date.now() / 1000)
      // Update eviction configuration table
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

    // Return existing instance immediately if available
    const existingInstance = autoCompleteDatabaseService.instances.get(targetUserId)
    if (existingInstance) {
      return existingInstance
    }

    // Check if initialization is already in progress for this user
    const existingPromise = autoCompleteDatabaseService.initializingPromises.get(targetUserId)
    if (existingPromise) {
      logger.info(`Waiting for existing autoComplete initialization for user ${targetUserId}`)
      return existingPromise
    }

    // Start new initialization and store the promise
    logger.info(`Creating new autoCompleteDatabaseService instance for user ${targetUserId}`)
    const initPromise = (async () => {
      try {
        const db = await initDatabase(targetUserId)
        const instance = new autoCompleteDatabaseService(db, targetUserId)
        autoCompleteDatabaseService.instances.set(targetUserId, instance)
        return instance
      } finally {
        // Clean up the initializing promise after completion (success or failure)
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
    // For input commands with length less than 2, return empty array directly
    if (command.length < 2) {
      return []
    }

    // Modify return type: { command: string; source: 'history' | 'base' }
    type Suggestion = {
      command: string
      source: 'history' | 'base'
    }

    const likePattern = command + '%'
    const limit = 6
    const suggestions: Suggestion[] = []
    const exists = (cmd: string) => suggestions.some((s) => s.command === cmd)
    const push = (cmd: string, source: 'history' | 'base') => {
      if (!exists(cmd) && suggestions.length < limit) {
        suggestions.push({ command: cmd, source })
      }
    }

    // 1. History for current IP
    const historyStmtCurr = this.db.prepare(
      'SELECT DISTINCT command FROM linux_commands_history WHERE command LIKE ? AND command != ? AND ip = ? ORDER BY count DESC LIMIT ?'
    )
    const historyCurr = historyStmtCurr.all(likePattern, command, ip, limit) as CommandResult[]
    historyCurr.forEach((row) => push(row.command, 'history'))

    // 2. History for other IPs
    if (suggestions.length < limit) {
      const remain = limit - suggestions.length
      const historyStmtOther = this.db.prepare(
        'SELECT DISTINCT command FROM linux_commands_history WHERE command LIKE ? AND command != ? AND ip != ? ORDER BY count DESC LIMIT ?'
      )
      const historyOther = historyStmtOther.all(likePattern, command, ip, remain) as CommandResult[]
      historyOther.forEach((row) => push(row.command, 'history'))
    }

    // 3. Common base commands
    if (suggestions.length < limit) {
      const remain = limit - suggestions.length
      const commonStmt = this.db.prepare('SELECT command FROM linux_commands_common WHERE command LIKE ? AND command != ? LIMIT ?')
      const common = commonStmt.all(likePattern, command, remain) as CommandResult[]
      common.forEach((row) => push(row.command, 'base'))
    }

    return suggestions
  }

  insertCommand(command: string, ip: string) {
    if (!isValidCommand(command)) {
      return {}
    }

    const result = this.db.transaction(() => {
      const selectStmt = this.db.prepare('SELECT id, count FROM linux_commands_history WHERE command = ? AND ip = ?')
      const existing = selectStmt.get(command, ip)

      let insertResult: any
      if (existing) {
        const updateStmt = this.db.prepare('UPDATE linux_commands_history SET count = count + 1, update_time = CURRENT_TIMESTAMP WHERE id = ?')
        insertResult = updateStmt.run(existing.id)
      } else {
        const insertStmt = this.db.prepare('INSERT INTO linux_commands_history (command, cmd_length, ip) VALUES (?, ?, ?)')
        const cmdLength = command.length
        insertResult = insertStmt.run(command, cmdLength, ip)
        this.commandCount++
      }

      // Check if eviction needs to be performed
      this.checkAndEvict()
      return insertResult
    })()
    return result
  }
}
