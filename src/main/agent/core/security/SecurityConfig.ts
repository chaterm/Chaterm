/**
 * 安全配置管理
 */

import { SecurityConfig } from './types/SecurityTypes'
import * as fs from 'fs/promises'
import * as path from 'path'

export class SecurityConfigManager {
  private config: SecurityConfig
  private configPath: string

  constructor(configPath?: string) {
    if (configPath) {
      this.configPath = configPath
    } else {
      // 使用Electron的用户数据目录，与其他配置文件保持一致
      let userDataPath: string
      try {
        const { app } = require('electron')
        userDataPath = app.getPath('userData')
      } catch (error) {
        // 测试环境或非Electron环境的fallback
        userDataPath = path.join(process.cwd(), 'test_data')
      }
      this.configPath = path.join(userDataPath, 'chaterm-security.json')
    }
    this.config = this.getDefaultConfig()
  }

  /**
   * 获取默认安全配置
   */
  private getDefaultConfig(): SecurityConfig {
    return {
      enableCommandSecurity: true,
      enableStrictMode: false, // 默认关闭严格模式
      blacklistPatterns: [
        // 系统级危险命令
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
        // 网络相关危险命令
        // 'iptables -F',
        // 'ufw --force reset',
        // 'firewall-cmd --reload',
        // 权限提升相关 - 只阻止删除根目录
        // 'sudo rm -rf /',
        // 'sudo rm -rf / ',
        // 'rm -rf /',
        // 'rm -rf / ',
        // 'sudo format',
        // 'sudo shutdown',
        // 'sudo reboot',
        // 文件系统操作 - 禁止对根目录使用
        // 'chmod 777 /',
        // 'chmod 777 / ',
        // 'chown -R root:root /',
        // 'chown -R root:root / ',
        // 'mount -o remount,rw /',
        // 'mount -o remount,rw / ',
        // 进程管理
        // 'kill -9 -1',
        // 'killall -9',
        // 'pkill -f',
        // 网络服务
        // 'systemctl stop',
        // 'service stop',
        // 'systemctl disable',
        // 数据库相关
        // 'DROP DATABASE'
        // 'TRUNCATE TABLE',
        // 'DELETE FROM',
        // 其他危险操作
        // 'curl -X DELETE',
        // 'wget --delete-after',
        // 'nc -l -p',
        // 'netcat -l -p'
      ],
      whitelistPatterns: [
        // 安全的查看命令
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
      maxCommandLength: 1000,
      // 安全策略配置
      securityPolicy: {
        blockCritical: true, // 严重危险命令直接阻止
        askForMedium: true, // 中等危险命令询问用户
        askForHigh: true, // 高危险命令询问用户
        askForBlacklist: false // 黑名单命令直接阻止
      }
    }
  }

  /**
   * 移除JSON中的注释
   */
  private removeComments(jsonString: string): string {
    // 移除单行注释 //
    let cleaned = jsonString.replace(/\/\/.*$/gm, '')

    // 移除多行注释 /* */
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '')

    // 移除空行
    cleaned = cleaned.replace(/^\s*[\r\n]/gm, '')

    return cleaned.trim()
  }

  /**
   * 加载配置文件
   */
  async loadConfig(): Promise<void> {
    try {
      // 尝试读取配置文件
      const configData = await fs.readFile(this.configPath, 'utf-8')

      // 检查文件是否为空
      if (!configData.trim()) {
        console.log('配置文件为空，生成默认配置...')
        await this.generateDefaultConfigFile()
        return
      }

      // 移除注释后解析JSON
      const cleanedData = this.removeComments(configData)
      const externalConfig = JSON.parse(cleanedData)

      if (externalConfig.security) {
        // 安全地合并配置，确保默认配置的完整性和安全性
        this.config = this.mergeConfigSafely(this.config, externalConfig.security)
      } else {
        // 如果没有 security 配置部分，生成默认配置
        console.log('配置文件中没有安全配置部分，生成默认配置...')
        await this.generateDefaultConfigFile()
      }
    } catch (error) {
      // 文件不存在或其他错误，生成默认配置文件
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log('配置文件不存在，生成默认配置...')
        await this.generateDefaultConfigFile()
      } else {
        console.warn('无法加载安全配置文件，使用默认配置:', error)
      }
    }
  }

  /**
   * 安全地合并配置，确保默认配置的完整性和安全性
   */
  private mergeConfigSafely(defaultConfig: SecurityConfig, userConfig: any): SecurityConfig {
    const mergedConfig = { ...defaultConfig }

    // 安全地合并基本字段
    if (typeof userConfig.enableCommandSecurity === 'boolean') {
      mergedConfig.enableCommandSecurity = userConfig.enableCommandSecurity
    }

    if (typeof userConfig.enableStrictMode === 'boolean') {
      mergedConfig.enableStrictMode = userConfig.enableStrictMode
    }

    if (typeof userConfig.maxCommandLength === 'number' && userConfig.maxCommandLength > 0 && userConfig.maxCommandLength <= 10000) {
      mergedConfig.maxCommandLength = userConfig.maxCommandLength
    }

    // 安全地合并数组字段（白名单、黑名单、危险命令）- 允许用户完全自定义
    if (Array.isArray(userConfig.blacklistPatterns)) {
      // 用户可以完全自定义黑名单
      mergedConfig.blacklistPatterns = userConfig.blacklistPatterns.filter((item: any) => typeof item === 'string')
    }

    if (Array.isArray(userConfig.whitelistPatterns)) {
      // 用户可以完全自定义白名单
      mergedConfig.whitelistPatterns = userConfig.whitelistPatterns.filter((item: any) => typeof item === 'string')
    }

    if (Array.isArray(userConfig.dangerousCommands)) {
      // 用户可以完全自定义危险命令列表
      mergedConfig.dangerousCommands = userConfig.dangerousCommands.filter((item: any) => typeof item === 'string')
    }

    // 安全地合并安全策略 - 允许用户完全自定义
    if (userConfig.securityPolicy && typeof userConfig.securityPolicy === 'object') {
      const userPolicy = userConfig.securityPolicy

      if (typeof userPolicy.blockCritical === 'boolean') {
        // 允许用户自定义关键命令的阻止策略
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

    console.log('配置已安全合并，保持默认安全设置的完整性')
    return mergedConfig
  }

  /**
   * 生成默认配置文件
   */
  private async generateDefaultConfigFile(): Promise<void> {
    try {
      // 使用默认配置
      this.config = this.getDefaultConfig()
      // 生成带注释的配置文件
      await this.saveConfigWithComments()
      console.log('默认安全配置文件已生成')
    } catch (error) {
      console.error('生成默认配置文件失败:', error)
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): SecurityConfig {
    return { ...this.config }
  }

  /**
   * 获取配置文件路径
   */
  getConfigPath(): string {
    return this.configPath
  }

  /**
   * 打开配置文件所在目录
   */
  async openConfigDirectory(): Promise<void> {
    try {
      const { shell } = require('electron')
      const configDir = path.dirname(this.configPath)
      await shell.openPath(configDir)
    } catch (error) {
      console.error('无法打开配置目录:', error)
    }
  }

  /**
   * 直接打开配置文件
   */
  async openConfigFile(): Promise<void> {
    try {
      const { shell } = require('electron')
      // 确保配置文件存在
      await fs.access(this.configPath)
      // 直接打开配置文件
      await shell.openPath(this.configPath)
    } catch (error) {
      console.error('无法打开配置文件:', error)
      throw error
    }
  }

  /**
   * 生成带注释的配置文件内容
   */
  private generateConfigWithComments(): string {
    const config = this.config

    return `// Chaterm AI 安全配置文件
// 此文件用于配置 AI 助手的安全策略，防止执行危险命令
// 修改此文件后重启应用即可生效，或在设置界面中修改

{
  "security": {
    // 是否启用命令安全检查
    "enableCommandSecurity": ${config.enableCommandSecurity},

    // 是否启用严格模式
    "enableStrictMode": ${config.enableStrictMode},

    // 黑名单：匹配这些模式的命令将被阻止
    "blacklistPatterns": [
${config.blacklistPatterns.map((pattern) => `      "${pattern.replace(/\\/g, '\\\\')}"`).join(',\n')}
    ],

    // 白名单：这些命令被认为是安全的，不会被阻止
    "whitelistPatterns": [
${config.whitelistPatterns.map((pattern) => `      "${pattern.replace(/\\/g, '\\\\')}"`).join(',\n')}
    ],

    // 危险命令关键词：包含这些关键词的命令需要用户确认
    "dangerousCommands": [
${config.dangerousCommands.map((cmd) => `      "${cmd.replace(/\\/g, '\\\\')}"`).join(',\n')}
    ],

    // 命令最大长度限制
    "maxCommandLength": ${config.maxCommandLength},

    // 安全策略配置
    "securityPolicy": {
      // 是否阻止严重危险命令
      "blockCritical": ${config.securityPolicy.blockCritical},

      // 中等危险命令是否询问用户
      "askForMedium": ${config.securityPolicy.askForMedium},

      // 高危险命令是否询问用户
      "askForHigh": ${config.securityPolicy.askForHigh},

      // 黑名单命令是否询问用户
      "askForBlacklist": ${config.securityPolicy.askForBlacklist}
    }
  }
}

// 配置说明：
// - 添加安全命令到白名单：在 whitelistPatterns 数组中添加命令模式
// - 添加危险命令到黑名单：在 blacklistPatterns 数组中添加命令模式
// - 修改危险命令列表：在 dangerousCommands 数组中添加或删除命令关键词
// - 调整安全策略：修改 securityPolicy 对象中的布尔值`
  }

  /**
   * 保存带注释的配置到文件
   */
  private async saveConfigWithComments(): Promise<void> {
    try {
      // 确保目录存在
      const configDir = path.dirname(this.configPath)
      await fs.mkdir(configDir, { recursive: true })

      // 生成带注释的配置内容
      const configContent = this.generateConfigWithComments()

      await fs.writeFile(this.configPath, configContent, 'utf-8')
      console.log('带注释的安全配置已保存到:', this.configPath)
    } catch (error) {
      console.error('保存带注释的安全配置失败:', error)
      throw error
    }
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...updates }
  }
}
