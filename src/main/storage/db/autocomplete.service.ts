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
    // 初始化淘汰配置
    const timeConfig = this.db
      .prepare('SELECT evict_value, evict_current_value FROM linux_commands_evict WHERE evict_type = ?')
      .get('time') as EvictConfig

    // 获取当前命令总数
    const currentCount = this.db.prepare('SELECT COUNT(*) as count FROM linux_commands_history').get() as { count: number }
    this.commandCount = currentCount.count
    this.lastEvictTime = timeConfig.evict_current_value

    // 检查是否需要执行淘汰
    await this.checkAndEvict()
  }

  private async checkAndEvict() {
    const countConfig = this.db.prepare('SELECT evict_value FROM linux_commands_evict WHERE evict_type = ?').get('count') as EvictConfig

    const timeConfig = this.db.prepare('SELECT evict_value FROM linux_commands_evict WHERE evict_type = ?').get('time') as EvictConfig

    // 检查时间阈值
    const now = Math.floor(Date.now() / 1000)
    // 检查数量阈值
    if (this.commandCount >= countConfig.evict_value) {
      await this.evictCommands('count')
    } else if (now - this.lastEvictTime >= timeConfig.evict_value) {
      await this.evictCommands('time')
    }
  }

  /**
    删除逻辑是：
    满足任一条件的记录都会被删除：
    条件1：不在使用频率最高的(阈值-10000)条记录中
    条件2：符合时间淘汰规则（低频且旧 或 非常旧）
    具体来说，一条记录会被删除，如果它：
    不是最常用的(阈值-10000)条记录之一
    或者 使用次数少于2次且超过两个月没使用
    或者 超过一年没有使用
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
      // 获取删除后的命令总数
      const currentCount = this.db.prepare('SELECT COUNT(*) as count FROM linux_commands_history').get() as { count: number }
      this.commandCount = currentCount.count
      this.lastEvictTime = Math.floor(Date.now() / 1000)
      // 更新淘汰配置表
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
    // 去除首尾空格
    command = command.trim()

    // 空命令
    if (!command) return false

    // 命令长度限制 (1-255字符)
    if (command.length < 1 || command.length > 255) return false

    // 不允许以这些特殊字符开头，但允许 ./ 和 ~/
    const invalidStartChars = /^[!@#$%^&*()+=\-[\]{};:'"\\|,<>?`]/
    if (invalidStartChars.test(command)) return false

    // 特殊处理以 . 开头的命令：只允许 ./ 开头，不允许其他以 . 开头的情况
    if (command.startsWith('.') && !command.startsWith('./')) {
      return false
    }

    // 不允许起始位置有连续三个及以上相同的字符
    if (/^(.)\1{2,}/.test(command)) return false

    // 不允许包含这些危险字符组合
    const dangerousPatterns = [
      /rm\s+-rf\s+\//, // 删除根目录
      />[>&]?\/dev\/sd[a-z]/, // 写入磁盘设备
      /mkfs\./, // 格式化命令
      /dd\s+if=.*of=\/dev\/sd[a-z]/, // DD写入磁盘
      /:\(\)\{\s*:\|:&\s*\};:/ // Fork炸弹
    ]

    if (dangerousPatterns.some((pattern) => pattern.test(command))) return false

    // 允许管道、并行、重定向等常见符号 | & > < ; + =
    // 支持以字母、下划线、数字、./ 或 ~ 开头的命令
    const validCommandFormat = /^(\.\/|~\/|[a-zA-Z_]|\d)[a-zA-Z0-9_\-\.\/\s|&><;+=]*$/
    if (!validCommandFormat.test(command)) return false

    return true
  }

  queryCommand(command: string, ip: string) {
    // 对于输入命令长度小于2的情况，直接返回空数组
    if (command.length < 2) {
      return []
    }

    // 修改返回类型: { command: string; source: 'history' | 'base' }
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

    // 1. 当前 IP 的历史记录
    const historyStmtCurr = this.db.prepare(
      'SELECT DISTINCT command FROM linux_commands_history WHERE command LIKE ? AND command != ? AND ip = ? ORDER BY count DESC LIMIT ?'
    )
    const historyCurr = historyStmtCurr.all(likePattern, command, ip, limit) as CommandResult[]
    historyCurr.forEach((row) => push(row.command, 'history'))

    // 2. 其他 IP 的历史记录
    if (suggestions.length < limit) {
      const remain = limit - suggestions.length
      const historyStmtOther = this.db.prepare(
        'SELECT DISTINCT command FROM linux_commands_history WHERE command LIKE ? AND command != ? AND ip != ? ORDER BY count DESC LIMIT ?'
      )
      const historyOther = historyStmtOther.all(likePattern, command, ip, remain) as CommandResult[]
      historyOther.forEach((row) => push(row.command, 'history'))
    }

    // 3. 通用基础命令 (base)
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

      // 检查是否需要执行淘汰
      this.checkAndEvict()
      return insertResult
    })()
    return result
  }
}
