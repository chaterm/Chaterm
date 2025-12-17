import { shortcutActions } from '@/config/shortcutActions'
import { toRaw } from 'vue'

export interface ShortcutConfig {
  [key: string]: string
}

export interface BackgroundConfig {
  mode: 'none' | 'image'
  image: string
  opacity: number
  brightness: number
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
  pinchZoomStatus: number
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
  defaultLayout?: 'terminal' | 'agents'
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
  background: BackgroundConfig
}

export class UserConfigStoreService {
  constructor() {
    this.initDB()
  }

  async initDB(): Promise<void> {
    try {
      // Ensure default config exists
      const config = await window.api.kvGet({ key: 'userConfig' })
      if (!config) {
        // Create default config if it doesn't exist
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
    // Detect if it's a Mac system
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

    // Dynamically generate default shortcut config from shortcutActions
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
      pinchZoomStatus: 1,
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
      defaultLayout: 'terminal' as 'terminal' | 'agents',
      feature: 0.0,
      quickComand: false,
      shortcuts: defaultShortcuts,
      sshAgentsStatus: 2,
      sshAgentsMap: '[]',
      sshProxyConfigs: [],
      workspaceExpandedKeys: [],
      background: {
        mode: 'none',
        image: '',
        opacity: 0.15,
        brightness: 0.45
      }
    }
  }

  async getConfig(): Promise<UserConfig> {
    try {
      const result = await window.api.kvGet({ key: 'userConfig' })
      let savedConfig: any = {}
      if (result?.value) {
        savedConfig = JSON.parse(result.value)
      }

      const defaultConfig = this.getDefaultConfig()

      // Migration: If background object is missing but old fields exist, migrate them
      if (!savedConfig.background) {
        savedConfig.background = { ...defaultConfig.background }

        if (savedConfig.backgroundImage !== undefined) {
          savedConfig.background.image = savedConfig.backgroundImage
        }
        if (savedConfig.backgroundOpacity !== undefined) {
          savedConfig.background.opacity = savedConfig.backgroundOpacity
        }
        if (savedConfig.backgroundBrightness !== undefined) {
          savedConfig.background.brightness = savedConfig.backgroundBrightness
        }
        if (savedConfig.backgroundMode !== undefined) {
          savedConfig.background.mode = savedConfig.backgroundMode
        }
      }

      // Merge with default config to ensure all fields exist
      return {
        ...defaultConfig,
        ...savedConfig,
        background: {
          ...defaultConfig.background,
          ...(savedConfig.background || {})
        }
      }
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
