/**
 * 命令安全管理器
 * 负责验证命令的安全性和执行权限
 */

import { CommandSecurityResult, SecurityConfig } from './types/SecurityTypes'
import { SecurityConfigManager } from './SecurityConfig'

export class CommandSecurityManager {
  private configManager: SecurityConfigManager
  private config: SecurityConfig

  constructor(configPath?: string) {
    this.configManager = new SecurityConfigManager(configPath)
    this.config = this.configManager.getConfig()
  }

  /**
   * 初始化安全管理器
   */
  async initialize(): Promise<void> {
    await this.configManager.loadConfig()
    this.config = this.configManager.getConfig()
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
        reason: `The command length exceeds the limit (${this.config.maxCommandLength} character)`,
        category: 'permission',
        severity: 'medium'
      }
    }

    const lowerCommand = trimmedCommand.toLowerCase()

    // 检查黑名单模式
    for (const pattern of this.config.blacklistPatterns) {
      if (this.matchesPattern(lowerCommand, pattern.toLowerCase())) {
        const shouldAsk = this.config.securityPolicy.askForBlacklist
        return {
          isAllowed: shouldAsk, // 如果询问则暂时允许，等待用户确认
          reason: `Command matching blacklist mode: ${pattern}`,
          category: 'blacklist',
          severity: 'high',
          action: shouldAsk ? 'ask' : 'block',
          requiresApproval: shouldAsk
        }
      }
    }
    // 检查危险命令
    for (const dangerousCmd of this.config.dangerousCommands) {
      if (lowerCommand.includes(dangerousCmd.toLowerCase())) {
        // 根据危险程度决定处理方式
        const severity = this.getDangerousCommandSeverity(dangerousCmd)
        const shouldAsk = this.shouldAskForSeverity(severity)

        return {
          isAllowed: shouldAsk,
          reason: `The command contains dangerous operations: ${dangerousCmd}`,
          category: 'dangerous',
          severity: severity,
          action: shouldAsk ? 'ask' : 'block',
          requiresApproval: shouldAsk
        }
      }
    }

    // 如果启用严格模式，检查白名单
    if (this.config.enableStrictMode) {
      const hasWhitelistMatch = this.config.whitelistPatterns.some((pattern) => this.matchesPattern(lowerCommand, pattern.toLowerCase()))

      if (!hasWhitelistMatch) {
        return {
          isAllowed: false,
          reason: 'The command is not in the whitelist (strict mode)',
          category: 'whitelist',
          severity: 'medium'
        }
      }
    }
    return { isAllowed: true }
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
    } else {
      // 精确匹配或包含匹配
      return command.includes(pattern) || command === pattern
    }
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
