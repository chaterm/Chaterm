/**
 * 命令安全管理器
 * 负责验证命令的安全性和执行权限
 */

import { CommandSecurityResult, SecurityConfig } from './types/SecurityTypes'
import { SecurityConfigManager } from './SecurityConfig'
import { CommandParser, ParsedCommand } from './CommandParser'
import { Messages, getMessages, formatMessage } from '../task/messages'

export class CommandSecurityManager {
  private configManager: SecurityConfigManager
  private config: SecurityConfig
  private commandParser: CommandParser
  private messages: Messages

  constructor(configPath?: string, language: string = 'en') {
    this.configManager = new SecurityConfigManager(configPath)
    this.config = this.configManager.getConfig()
    this.commandParser = new CommandParser()
    this.messages = getMessages(language)
  }

  /**
   * 初始化安全管理器
   */
  async initialize(): Promise<void> {
    await this.configManager.loadConfig()
    this.config = this.configManager.getConfig()
  }

  /**
   * 重新加载配置（用于配置文件更新后立即生效）
   */
  async reloadConfig(): Promise<void> {
    await this.configManager.loadConfig()
    this.config = this.configManager.getConfig()
    console.log('[SecurityConfig] Configuration reloaded successfully')
  }

  /**
   * 验证命令是否安全
   */
  validateCommandSecurity(command: string): CommandSecurityResult {
    if (!this.config.enableCommandSecurity) {
      return { isAllowed: true }
    }

    const trimmedCommand = command.trim()

    // 检查命令长度
    if (trimmedCommand.length > this.config.maxCommandLength) {
      return {
        isAllowed: false,
        reason: formatMessage(this.messages.securityErrorCommandTooLong, { limit: this.config.maxCommandLength }),
        category: 'permission',
        severity: 'medium'
      }
    }

    // 解析命令结构
    const parsedCommand = this.commandParser.parse(trimmedCommand)

    // 检查黑名单模式（包括复合命令）
    const blacklistResult = this.checkBlacklistWithCompounds(parsedCommand)
    if (blacklistResult) {
      return blacklistResult
    }

    // 检查危险命令
    const dangerousResult = this.checkDangerousCommand(parsedCommand)
    if (dangerousResult) {
      return dangerousResult
    }

    // 如果启用严格模式，检查白名单
    if (this.config.enableStrictMode) {
      const command = parsedCommand.executable + ' ' + parsedCommand.args.join(' ')
      const commandLower = command.toLowerCase()
      const hasWhitelistMatch = this.config.whitelistPatterns.some((pattern) => this.matchesPattern(commandLower, pattern.toLowerCase()))

      if (!hasWhitelistMatch) {
        // 对于白名单检查，默认不需要用户确认，直接阻止
        return {
          isAllowed: false,
          reason: this.messages.securityErrorNotInWhitelist,
          category: 'whitelist',
          severity: 'medium',
          action: 'block',
          requiresApproval: false
        }
      }
    }

    // 所有检查通过，允许执行
    return { isAllowed: true }
  }

  /**
   * 检查命令是否为危险命令
   */
  private checkDangerousCommand(parsedCommand: ParsedCommand): CommandSecurityResult | null {
    // 如果是复合命令，递归检查每个子命令
    if (parsedCommand.isCompound && parsedCommand.compounds) {
      for (const compound of parsedCommand.compounds) {
        const result = this.checkDangerousCommand(compound)
        if (result) {
          return result
        }
      }
      return null
    }

    // 检查可执行文件是否在危险命令列表中
    const executableLower = parsedCommand.executable.toLowerCase()
    for (const dangerousCmd of this.config.dangerousCommands) {
      // 只检查命令名称，不检查参数和路径中的字符串
      if (executableLower === dangerousCmd.toLowerCase()) {
        // 根据危险程度决定处理方式
        const severity = this.getDangerousCommandSeverity(dangerousCmd)
        const shouldAsk = this.shouldAskForSeverity(severity)

        return {
          isAllowed: shouldAsk,
          reason: formatMessage(this.messages.securityErrorDangerousOperation, { command: dangerousCmd }),
          category: 'dangerous',
          severity: severity,
          action: shouldAsk ? 'ask' : 'block',
          requiresApproval: shouldAsk
        }
      }
    }

    return null
  }

  /**
   * 检查黑名单模式（包括复合命令）
   */
  private checkBlacklistWithCompounds(parsedCommand: ParsedCommand): any {
    // 如果是复合命令，递归检查每个子命令
    if (parsedCommand.isCompound && parsedCommand.compounds) {
      for (const compound of parsedCommand.compounds) {
        const result = this.checkBlacklistWithCompounds(compound)
        if (result) {
          return result
        }
      }
      return null
    }

    const command = parsedCommand.executable + ' ' + parsedCommand.args.join(' ')
    const commandLower = command.toLowerCase()

    // 检查单个命令的黑名单模式
    for (const pattern of this.config.blacklistPatterns) {
      if (this.matchesPattern(commandLower, pattern.toLowerCase())) {
        const shouldAsk = this.config.securityPolicy.askForBlacklist
        return {
          isAllowed: shouldAsk,
          reason: formatMessage(this.messages.securityErrorBlacklistPattern, { pattern }),
          category: 'blacklist',
          severity: 'high',
          action: shouldAsk ? 'ask' : 'block',
          requiresApproval: shouldAsk
        }
      }
    }

    return null
  }

  /**
   * 检查命令是否匹配模式
   */
  private matchesPattern(command: string, pattern: string): boolean {
    // 支持通配符匹配
    if (pattern.includes('*')) {
      const regexPattern = pattern.replace(/\*/g, '.*')
      const regex = new RegExp(`^${regexPattern}$`, 'i')
      return regex.test(command)
    }

    // 将模式转换为安全的正则表达式
    const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    // 对于根目录危险操作，使用精确匹配
    if (this.isRootDirectoryPattern(pattern)) {
      return new RegExp(`^${escapedPattern}(\\s|$)`, 'i').test(command)
    }

    // 其他情况下，确保只匹配完整的命令或参数
    return new RegExp(`(^|\\s)${escapedPattern}(\\s|$)`, 'i').test(command)
  }

  /**
   * 检查是否为根目录危险操作模式
   */
  private isRootDirectoryPattern(pattern: string): boolean {
    // 检查是否以 / 或 /  结尾的根目录操作
    return pattern.endsWith(' /') || pattern.endsWith(' / ')
  }

  /**
   * 获取危险命令的严重程度
   */
  private getDangerousCommandSeverity(command: string): 'low' | 'medium' | 'high' | 'critical' {
    const criticalCommands = ['rm', 'del', 'format', 'shutdown', 'reboot', 'halt', 'poweroff', 'dd', 'mkfs', 'fdisk']
    const highCommands = ['killall', 'pkill', 'systemctl', 'service', 'chmod', 'chown', 'mount', 'umount']
    const mediumCommands = ['iptables', 'ufw', 'firewall-cmd', 'sudo', 'su']

    if (criticalCommands.includes(command.toLowerCase())) {
      return 'critical'
    } else if (highCommands.includes(command.toLowerCase())) {
      return 'high'
    } else if (mediumCommands.includes(command.toLowerCase())) {
      return 'medium'
    } else {
      return 'low'
    }
  }

  /**
   * 根据严重程度决定是否询问用户
   */
  private shouldAskForSeverity(severity: 'low' | 'medium' | 'high' | 'critical'): boolean {
    switch (severity) {
      case 'critical':
        // 对于dangerousCommands中的critical命令，始终询问用户而不是直接阻止
        // blockCritical只影响黑名单模式，不影响dangerousCommands
        return true
      case 'high':
        return this.config.securityPolicy.askForHigh
      case 'medium':
        return this.config.securityPolicy.askForMedium
      case 'low':
        return true // 低危险命令默认询问
      default:
        return true
    }
  }

  /**
   * 获取安全配置
   */
  getSecurityConfig(): SecurityConfig {
    return this.configManager.getConfig()
  }

  /**
   * 更新安全配置
   */
  updateSecurityConfig(updates: Partial<SecurityConfig>): void {
    this.configManager.updateConfig(updates)
    this.config = this.configManager.getConfig()
  }
}
