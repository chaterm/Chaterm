import Database from 'better-sqlite3'
import { initDatabase, getCurrentUserId } from './connection'
import { CommandResult, EvictConfig } from './types'

export class autoCompleteDatabaseService {
  private static instances: Map<number, autoCompleteDatabaseService> = new Map()
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
    console.log(`Starting command eviction by ${evictType}`)
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

      console.log(`Evicted ${result.changes} commands. Current count: ${this.commandCount}`)
    })()
  }

  public static async getInstance(userId?: number): Promise<autoCompleteDatabaseService> {
    const targetUserId = userId || getCurrentUserId()
    if (!targetUserId) {
      throw new Error('User ID is required for autoCompleteDatabaseService')
    }

    if (!autoCompleteDatabaseService.instances.has(targetUserId)) {
      console.log(`Creating new autoCompleteDatabaseService instance for user ${targetUserId}`)
      const db = await initDatabase(targetUserId)
      const instance = new autoCompleteDatabaseService(db, targetUserId)
      autoCompleteDatabaseService.instances.set(targetUserId, instance)
    }
    return autoCompleteDatabaseService.instances.get(targetUserId)!
  }

  public getUserId(): number {
    return this.userId
  }

  private isValidCommand(command: string): boolean {
    // Remove leading/trailing spaces
    command = command.trim()

    // Empty command
    if (!command) return false

    // Command length limit (1-255 characters)
    if (command.length < 1 || command.length > 255) return false

    // Not allowed to start with these special characters, but ./ and ~/ are allowed
    const invalidStartChars = /^[!@#$%^&*()+=\-[\]{};:'"\\|,<>?`]/
    if (invalidStartChars.test(command)) return false

    // Special handling for commands starting with .: only ./ is allowed, other cases starting with . are not allowed
    if (command.startsWith('.') && !command.startsWith('./')) {
      return false
    }

    // Not allowed to have three or more consecutive identical characters at the beginning
    if (/^(.)\1{2,}/.test(command)) return false

    // Not allowed to contain these dangerous character combinations
    const dangerousPatterns = [
      /rm\s+-rf\s+\//, // Delete root directory
      />[>&]?\/dev\/sd[a-z]/, // Write to disk device
      /mkfs\./, // Format command
      /dd\s+if=.*of=\/dev\/sd[a-z]/, // DD write to disk
      /:\(\)\{\s*:\|:&\s*\};:/ // Fork bomb
    ]

    if (dangerousPatterns.some((pattern) => pattern.test(command))) return false

    // Allow common symbols like pipes, parallel execution, redirection | & > < ; + =
    // Support URL/scp-like forms by allowing ':' and '@'
    const validCommandFormat = /^(?:\.\/|~\/|[\p{L}_]|\p{N})[\p{L}\p{N}\s\-./:@|&><;+=_~`"'()[\]{}!#$%*?\\,^]*$/u

    if (!validCommandFormat.test(command)) return false

    return true
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
    if (!this.isValidCommand(command)) {
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
