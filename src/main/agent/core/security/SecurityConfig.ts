/**
 * Security configuration management
 */

import { SecurityConfig } from './types/SecurityTypes'
import * as fs from 'fs/promises'
import * as path from 'path'
import { getUserDataPath } from '../../../config/edition'

export class SecurityConfigManager {
  private config: SecurityConfig
  private configPath: string

  constructor(configPath?: string) {
    if (configPath) {
      this.configPath = configPath
    } else {
      // Use the global userData path configuration
      this.configPath = path.join(getUserDataPath(), 'chaterm-security.json')
    }
    this.config = this.getDefaultConfig()
  }

  /**
   * Get default security configuration
   */
  private getDefaultConfig(): SecurityConfig {
    return {
      enableCommandSecurity: true,
      enableStrictMode: false, // Strict mode disabled by default
      blacklistPatterns: [
        // System-level dangerous commands
        // 'format c:',
        // 'del /s /q c:\\ ',
        // 'shutdown',
        // 'reboot',
        // 'halt',
        // 'poweroff',
        // 'init 0',
        // 'init 6',
        // 'killall',
        // 'pkill -9',
        // 'fuser -k',
        // 'dd if=/dev/zero',
        // 'mkfs',
        // 'fdisk',
        // 'parted',
        // Network-related dangerous commands
        // 'iptables -F',
        // 'ufw --force reset',
        // 'firewall-cmd --reload',
        // Privilege escalation related - only block root directory deletion
        // 'sudo rm -rf /',
        // 'sudo rm -rf / ',
        // 'rm -rf /',
        // 'rm -rf / ',
        // 'sudo format',
        // 'sudo shutdown',
        // 'sudo reboot',
        // File system operations - prohibit use on root directory
        // 'chmod 777 /',
        // 'chmod 777 / ',
        // 'chown -R root:root /',
        // 'chown -R root:root / ',
        // 'mount -o remount,rw /',
        // 'mount -o remount,rw / ',
        // Process management
        // 'kill -9 -1',
        // 'killall -9',
        // 'pkill -f',
        // Network services
        // 'systemctl stop',
        // 'service stop',
        // 'systemctl disable',
        // Database related
        // 'DROP DATABASE'
        // 'TRUNCATE TABLE',
        // 'DELETE FROM',
        // Other dangerous operations
        // 'curl -X DELETE',
        // 'wget --delete-after',
        // 'nc -l -p',
        // 'netcat -l -p'
      ],
      whitelistPatterns: [
        // Safe viewing commands
        'ls',
        'pwd',
        'whoami',
        'date',
        'uptime',
        'df -h',
        'free -h',
        'ps aux',
        'top',
        'htop',
        'netstat',
        'ss',
        'ping',
        'curl -I',
        'wget --spider',
        'cat',
        'head',
        'tail',
        'grep',
        'find',
        'which',
        'whereis',
        'type',
        'echo',
        'printenv',
        'env',
        'history',
        'alias',
        'help',
        'man',
        'info',
        '--help',
        '--version'
      ],
      dangerousCommands: [
        'rm',
        // 'del',
        'format',
        'shutdown',
        'reboot',
        'halt',
        'poweroff',
        'init',
        'killall',
        'pkill',
        'fuser',
        'dd',
        'mkfs',
        'fdisk',
        'parted',
        'iptables',
        'ufw',
        'firewall-cmd',
        'chmod',
        'chown',
        'mount',
        'umount',
        // 'systemctl',
        // 'service',
        // 'sudo',
        // 'su',
        'DROP',
        'TRUNCATE',
        'DELETE'
      ],
      maxCommandLength: 10000,
      // Security policy configuration
      securityPolicy: {
        blockCritical: true, // Block critical dangerous commands directly
        askForMedium: true, // Ask user for medium danger commands
        askForHigh: true, // Ask user for high danger commands
        askForBlacklist: false // Block blacklist commands directly
      }
    }
  }

  /**
   * Remove comments from JSON
   */
  private removeComments(jsonString: string): string {
    // Remove single-line comments //
    let cleaned = jsonString.replace(/\/\/.*$/gm, '')

    // Remove multi-line comments /* */
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '')

    // Remove empty lines
    cleaned = cleaned.replace(/^\s*[\r\n]/gm, '')

    return cleaned.trim()
  }

  /**
   * Load configuration file
   */
  async loadConfig(): Promise<void> {
    try {
      // Try to read configuration file
      const configData = await fs.readFile(this.configPath, 'utf-8')

      // Check if file is empty
      if (!configData.trim()) {
        console.log('Config file is empty, generating default config...')
        await this.generateDefaultConfigFile()
        return
      }

      // Parse JSON after removing comments
      const cleanedData = this.removeComments(configData)
      const externalConfig = JSON.parse(cleanedData)

      if (externalConfig.security) {
        // Safely merge configuration, ensuring integrity and security of default config
        this.config = this.mergeConfigSafely(this.config, externalConfig.security)
      } else {
        // If no security config section, generate default config
        console.log('No security config section in config file, generating default config...')
        await this.generateDefaultConfigFile()
      }
    } catch (error) {
      // File doesn't exist or other error, generate default config file
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log("Config file doesn't exist, generating default config...")
        await this.generateDefaultConfigFile()
      } else {
        console.warn('Failed to load security config file, using default config:', error)
      }
    }
  }

  /**
   * Safely merge configuration, ensuring integrity and security of default config
   */
  private mergeConfigSafely(defaultConfig: SecurityConfig, userConfig: any): SecurityConfig {
    const mergedConfig = { ...defaultConfig }

    // Safely merge basic fields
    if (typeof userConfig.enableCommandSecurity === 'boolean') {
      mergedConfig.enableCommandSecurity = userConfig.enableCommandSecurity
    }

    if (typeof userConfig.enableStrictMode === 'boolean') {
      mergedConfig.enableStrictMode = userConfig.enableStrictMode
    }

    if (typeof userConfig.maxCommandLength === 'number' && userConfig.maxCommandLength > 0 && userConfig.maxCommandLength <= 10000) {
      mergedConfig.maxCommandLength = userConfig.maxCommandLength
    }

    // Safely merge array fields (whitelist, blacklist, dangerous commands) - allow full user customization
    if (Array.isArray(userConfig.blacklistPatterns)) {
      // Users can fully customize blacklist
      mergedConfig.blacklistPatterns = userConfig.blacklistPatterns.filter((item: any) => typeof item === 'string')
    }

    if (Array.isArray(userConfig.whitelistPatterns)) {
      // Users can fully customize whitelist
      mergedConfig.whitelistPatterns = userConfig.whitelistPatterns.filter((item: any) => typeof item === 'string')
    }

    if (Array.isArray(userConfig.dangerousCommands)) {
      // Users can fully customize dangerous commands list
      mergedConfig.dangerousCommands = userConfig.dangerousCommands.filter((item: any) => typeof item === 'string')
    }

    // Safely merge security policy - allow full user customization
    if (userConfig.securityPolicy && typeof userConfig.securityPolicy === 'object') {
      const userPolicy = userConfig.securityPolicy

      if (typeof userPolicy.blockCritical === 'boolean') {
        // Allow users to customize blocking policy for critical commands
        mergedConfig.securityPolicy.blockCritical = userPolicy.blockCritical
      }

      if (typeof userPolicy.askForMedium === 'boolean') {
        mergedConfig.securityPolicy.askForMedium = userPolicy.askForMedium
      }

      if (typeof userPolicy.askForHigh === 'boolean') {
        mergedConfig.securityPolicy.askForHigh = userPolicy.askForHigh
      }

      if (typeof userPolicy.askForBlacklist === 'boolean') {
        mergedConfig.securityPolicy.askForBlacklist = userPolicy.askForBlacklist
      }
    }

    console.log('Config safely merged, maintaining integrity of default security settings')
    return mergedConfig
  }

  /**
   * Generate default configuration file
   */
  private async generateDefaultConfigFile(): Promise<void> {
    try {
      // Use default configuration
      this.config = this.getDefaultConfig()
      // Generate configuration file with comments
      await this.saveConfigWithComments()
      console.log('Default security config file generated')
    } catch (error) {
      console.error('Failed to generate default config file:', error)
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): SecurityConfig {
    return { ...this.config }
  }

  /**
   * Get configuration file path
   */
  getConfigPath(): string {
    return this.configPath
  }

  /**
   * Open configuration file directory
   */
  async openConfigDirectory(): Promise<void> {
    try {
      const { shell } = require('electron')
      const configDir = path.dirname(this.configPath)
      await shell.openPath(configDir)
    } catch (error) {
      console.error('Failed to open config directory:', error)
    }
  }

  /**
   * Open configuration file directly
   */
  async openConfigFile(): Promise<void> {
    try {
      const { shell } = require('electron')
      // Ensure configuration file exists
      await fs.access(this.configPath)
      // Open configuration file directly
      await shell.openPath(this.configPath)
    } catch (error) {
      console.error('Failed to open config file:', error)
      throw error
    }
  }

  /**
   * Generate configuration file content with comments
   */
  private generateConfigWithComments(): string {
    const config = this.config

    return `// Chaterm AI Security Configuration File
// This file is used to configure the security policy of the AI assistant to prevent execution of dangerous commands
// Changes to this file take effect after restarting the application, or modify in the settings interface

{
  "security": {
    // Whether to enable command security check
    "enableCommandSecurity": ${config.enableCommandSecurity},

    // Whether to enable strict mode
    "enableStrictMode": ${config.enableStrictMode},

    // Blacklist: Commands matching these patterns will be blocked
    "blacklistPatterns": [
${config.blacklistPatterns.map((pattern) => `      "${pattern.replace(/\\/g, '\\\\')}"`).join(',\n')}
    ],

    // Whitelist: These commands are considered safe and will not be blocked
    "whitelistPatterns": [
${config.whitelistPatterns.map((pattern) => `      "${pattern.replace(/\\/g, '\\\\')}"`).join(',\n')}
    ],

    // Dangerous command keywords: Commands containing these keywords require user confirmation
    "dangerousCommands": [
${config.dangerousCommands.map((cmd) => `      "${cmd.replace(/\\/g, '\\\\')}"`).join(',\n')}
    ],

    // Maximum command length limit
    "maxCommandLength": ${config.maxCommandLength},

    // Security policy configuration
    "securityPolicy": {
      // Whether to block critical dangerous commands
      "blockCritical": ${config.securityPolicy.blockCritical},

      // Whether to ask user for medium danger commands
      "askForMedium": ${config.securityPolicy.askForMedium},

      // Whether to ask user for high danger commands
      "askForHigh": ${config.securityPolicy.askForHigh},

      // Whether to ask user for blacklist commands
      "askForBlacklist": ${config.securityPolicy.askForBlacklist}
    }
  }
}

// Configuration instructions:
// - Add safe commands to whitelist: Add command patterns to the whitelistPatterns array
// - Add dangerous commands to blacklist: Add command patterns to the blacklistPatterns array
// - Modify dangerous commands list: Add or remove command keywords in the dangerousCommands array
// - Adjust security policy: Modify boolean values in the securityPolicy object`
  }

  /**
   * Save configuration with comments to file
   */
  private async saveConfigWithComments(): Promise<void> {
    try {
      // Ensure directory exists
      const configDir = path.dirname(this.configPath)
      await fs.mkdir(configDir, { recursive: true })

      // Generate configuration content with comments
      const configContent = this.generateConfigWithComments()

      await fs.writeFile(this.configPath, configContent, 'utf-8')
      console.log('Security config with comments saved to:', this.configPath)
    } catch (error) {
      console.error('Failed to save security config with comments:', error)
      throw error
    }
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...updates }
  }
}
