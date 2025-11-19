import { shortcutActions } from '@/config/shortcutActions'
import { toRaw } from 'vue'

export interface ShortcutConfig {
  [key: string]: string
}

export interface UserConfig {
  id: string
  updatedAt: number
  autoCompleteStatus: number
  vimStatus: boolean
  quickVimStatus: number
  commonVimStatus: number
  aliasStatus: number
  highlightStatus: number
  fontSize: number
  scrollBack: number
  language: string
  cursorStyle: 'bar' | 'block' | 'underline' | undefined
  middleMouseEvent?: 'paste' | 'contextMenu' | 'none'
  rightMouseEvent?: 'paste' | 'contextMenu' | 'none'
  watermark: 'open' | 'close' | undefined
  secretRedaction: 'enabled' | 'disabled' | undefined
  dataSync: 'enabled' | 'disabled' | undefined
  theme: 'dark' | 'light' | 'auto' | undefined
  feature?: number
  quickComand?: boolean
  shortcuts?: ShortcutConfig
  sshAgentsStatus: number
  sshAgentsMap?: string
  sshProxyConfigs?: Array<{
    name: string
    type?: 'HTTP' | 'HTTPS' | 'SOCKS4' | 'SOCKS5'
    host?: string
    port?: number
    enableProxyIdentity?: boolean
    username?: string
    password?: string
  }>
  workspaceExpandedKeys?: string[]
}

export class UserConfigStoreService {
  constructor() {
    this.initDB()
  }

  async initDB(): Promise<void> {
    try {
      // 确保默认配置存在
      const config = await window.api.kvGet({ key: 'userConfig' })
      if (!config) {
        // 不存在则创建默认配置
        await window.api.kvMutate({
          action: 'set',
          key: 'userConfig',
          value: JSON.stringify(this.getDefaultConfig())
        })
      }
    } catch (error) {
      console.error('Error initializing userConfig in SQLite:', error)
    }
  }

  private getDefaultConfig(): UserConfig {
    // 检测是否是Mac系统
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

    // 从 shortcutActions 动态生成默认快捷键配置
    const defaultShortcuts: ShortcutConfig = {}
    shortcutActions.forEach((action) => {
      defaultShortcuts[action.id] = isMac ? action.defaultKey.mac : action.defaultKey.other
    })

    return {
      id: 'userConfig',
      updatedAt: Date.now(),
      autoCompleteStatus: 1,
      vimStatus: false,
      quickVimStatus: 1,
      commonVimStatus: 2,
      aliasStatus: 1,
      highlightStatus: 1,
      fontSize: 12,
      scrollBack: 1000,
      language: 'zh-CN',
      cursorStyle: 'block' as 'block' | 'underline' | 'bar',
      middleMouseEvent: 'paste' as 'paste' | 'contextMenu' | 'none',
      rightMouseEvent: 'contextMenu' as 'paste' | 'contextMenu' | 'none',
      watermark: 'open' as 'open' | 'close',
      secretRedaction: 'disabled' as 'enabled' | 'disabled',
      dataSync: 'disabled' as 'enabled' | 'disabled',
      theme: 'auto' as 'dark' | 'light' | 'auto',
      feature: 0.0,
      quickComand: false,
      shortcuts: defaultShortcuts,
      sshAgentsStatus: 2,
      sshAgentsMap: '[]',
      sshProxyConfigs: [],
      workspaceExpandedKeys: []
    }
  }

  async getConfig(): Promise<UserConfig> {
    try {
      const result = await window.api.kvGet({ key: 'userConfig' })
      if (result?.value) {
        return JSON.parse(result.value)
      }
      return this.getDefaultConfig()
    } catch (error) {
      console.error('Error getting config from SQLite:', error)
      return this.getDefaultConfig()
    }
  }

  async saveConfig(config: Partial<UserConfig>): Promise<void> {
    try {
      const defaultConfig = await this.getConfig()

      const sanitizedConfig: UserConfig = {
        ...defaultConfig,
        ...config,
        sshProxyConfigs: config.sshProxyConfigs ? toRaw(config.sshProxyConfigs) : defaultConfig.sshProxyConfigs,
        id: 'userConfig',
        updatedAt: Date.now()
      }

      localStorage.setItem('theme', sanitizedConfig.theme || 'auto')

      await window.api.kvMutate({
        action: 'set',
        key: 'userConfig',
        value: JSON.stringify(sanitizedConfig)
      })

      console.log('Config saved successfully to SQLite')
    } catch (error) {
      console.error('Error saving config to SQLite:', error)
      throw error
    }
  }

  async resetConfig(): Promise<void> {
    return this.saveConfig(this.getDefaultConfig())
  }

  async deleteDatabase(): Promise<void> {
    console.log('deleteDatabase is deprecated when using SQLite')
  }
}

export const userConfigStore = new UserConfigStoreService()
