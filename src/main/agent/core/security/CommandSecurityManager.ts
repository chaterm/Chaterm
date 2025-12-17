/**
 * Command security manager
 * Responsible for validating command security and execution permissions
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
   * Initialize security manager
   */
  async initialize(): Promise<void> {
    await this.configManager.loadConfig()
    this.config = this.configManager.getConfig()
  }

  /**
   * Reload configuration (for immediate effect after config file update)
   */
  async reloadConfig(): Promise<void> {
    await this.configManager.loadConfig()
    this.config = this.configManager.getConfig()
    console.log('[SecurityConfig] Configuration reloaded successfully')
  }

  /**
   * Validate if command is safe
   */
  validateCommandSecurity(command: string): CommandSecurityResult {
    if (!this.config.enableCommandSecurity) {
      return { isAllowed: true }
    }

    const trimmedCommand = command.trim()

    // Check command length
    if (trimmedCommand.length > this.config.maxCommandLength) {
      return {
        isAllowed: false,
        reason: formatMessage(this.messages.securityErrorCommandTooLong, { limit: this.config.maxCommandLength }),
        category: 'permission',
        severity: 'medium'
      }
    }

    // Parse command structure
    const parsedCommand = this.commandParser.parse(trimmedCommand)

    // Check blacklist patterns (including compound commands)
    const blacklistResult = this.checkBlacklistWithCompounds(parsedCommand)
    if (blacklistResult) {
      return blacklistResult
    }

    // Check dangerous commands
    const dangerousResult = this.checkDangerousCommand(parsedCommand)
    if (dangerousResult) {
      return dangerousResult
    }

    // If strict mode enabled, check whitelist
    if (this.config.enableStrictMode) {
      const command = parsedCommand.executable + ' ' + parsedCommand.args.join(' ')
      const commandLower = command.toLowerCase()
      const hasWhitelistMatch = this.config.whitelistPatterns.some((pattern) => this.matchesPattern(commandLower, pattern.toLowerCase()))

      if (!hasWhitelistMatch) {
        // For whitelist check, default to no user confirmation needed, directly block
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

    // All checks passed, allow execution
    return { isAllowed: true }
  }

  /**
   * Check if command is dangerous
   */
  private checkDangerousCommand(parsedCommand: ParsedCommand): CommandSecurityResult | null {
    // If compound command, recursively check each sub-command
    if (parsedCommand.isCompound && parsedCommand.compounds) {
      for (const compound of parsedCommand.compounds) {
        const result = this.checkDangerousCommand(compound)
        if (result) {
          return result
        }
      }
      return null
    }

    // Check if executable is in dangerous commands list
    const executableLower = parsedCommand.executable.toLowerCase()
    for (const dangerousCmd of this.config.dangerousCommands) {
      // Only check command name, don't check strings in parameters and paths
      if (executableLower === dangerousCmd.toLowerCase()) {
        // Decide handling based on danger level
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
   * Check blacklist patterns (including compound commands)
   */
  private checkBlacklistWithCompounds(parsedCommand: ParsedCommand): any {
    // If compound command, recursively check each sub-command
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

    // Check single command's blacklist patterns
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
   * Check if command matches pattern
   */
  private matchesPattern(command: string, pattern: string): boolean {
    // Support wildcard matching
    if (pattern.includes('*')) {
      const regexPattern = pattern.replace(/\*/g, '.*')
      const regex = new RegExp(`^${regexPattern}$`, 'i')
      return regex.test(command)
    }

    // Convert pattern to safe regular expression
    const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    // For root directory dangerous operations, use exact matching
    if (this.isRootDirectoryPattern(pattern)) {
      return new RegExp(`^${escapedPattern}(\\s|$)`, 'i').test(command)
    }

    // In other cases, ensure only matching complete commands or parameters
    return new RegExp(`(^|\\s)${escapedPattern}(\\s|$)`, 'i').test(command)
  }

  /**
   * Check if it's root directory dangerous operation pattern
   */
  private isRootDirectoryPattern(pattern: string): boolean {
    // Check if it's root directory operation ending with / or /
    return pattern.endsWith(' /') || pattern.endsWith(' / ')
  }

  /**
   * Get dangerous command severity level
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
   * Decide whether to ask user based on severity level
   */
  private shouldAskForSeverity(severity: 'low' | 'medium' | 'high' | 'critical'): boolean {
    switch (severity) {
      case 'critical':
        // For critical commands in dangerousCommands, always ask user instead of directly blocking
        // blockCritical only affects blacklist patterns, doesn't affect dangerousCommands
        return true
      case 'high':
        return this.config.securityPolicy.askForHigh
      case 'medium':
        return this.config.securityPolicy.askForMedium
      case 'low':
        return true // Low danger commands default to asking
      default:
        return true
    }
  }

  /**
   * Get security configuration
   */
  getSecurityConfig(): SecurityConfig {
    return this.configManager.getConfig()
  }

  /**
   * Update security configuration
   */
  updateSecurityConfig(updates: Partial<SecurityConfig>): void {
    this.configManager.updateConfig(updates)
    this.config = this.configManager.getConfig()
  }
}
