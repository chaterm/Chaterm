import { indexedDBService, DB_CONFIG } from './indexedDBService'
import { shortcutActions } from '@/config/shortcutActions'

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
  theme: 'dark' | 'light' | undefined
  feature?: number
  quickComand?: boolean
  shortcuts?: ShortcutConfig
  sshAgentsStatus: number
  sshAgentsMap?: string
}

export class UserConfigStoreService {
  private readonly dbName = DB_CONFIG.name
  private readonly storeName = 'userConfig'
  private db: IDBDatabase | null = null

  constructor() {
    this.initDB()
  }

  async initDB(): Promise<void> {
    try {
      this.db = await indexedDBService.initDatabase(DB_CONFIG)

      const transaction = this.db.transaction(this.storeName, 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const getRequest = store.get('userConfig')

      getRequest.onsuccess = () => {
        if (!getRequest.result) {
          store.add(this.getDefaultConfig())
        }
      }
    } catch (error) {
      console.error('Error initializing IndexedDB:', error)
      throw error
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
      theme: 'dark' as 'dark' | 'light',
      feature: 0.0,
      quickComand: false,
      shortcuts: defaultShortcuts,
      sshAgentsStatus: 2,
      sshAgentsMap: '[]'
    }
  }

  async getConfig(): Promise<UserConfig> {
    try {
      await this.ensureDBReady()

      return new Promise((resolve) => {
        if (!this.db) {
          console.log('No database connection, returning default config')
          resolve(this.getDefaultConfig())
          return
        }

        try {
          console.log('Getting config from database')
          const transaction = this.db.transaction(this.storeName, 'readonly')
          const store = transaction.objectStore(this.storeName)
          const request = store.get('userConfig')

          request.onsuccess = () => {
            const result = request.result || this.getDefaultConfig()
            console.log('Config retrieved:', result)
            resolve(result)
          }

          request.onerror = (event) => {
            console.error('Error getting config:', event)
            resolve(this.getDefaultConfig())
          }
        } catch (error) {
          console.error('Transaction error:', error)
          resolve(this.getDefaultConfig())
        }
      })
    } catch (error) {
      console.error('GetConfig error:', error)
      return this.getDefaultConfig()
    }
  }

  async saveConfig(config: Partial<UserConfig>): Promise<void> {
    try {
      await this.ensureDBReady()
      const defaultConfig = await this.getConfig()

      return new Promise((resolve, reject) => {
        if (!this.db) {
          reject(new Error('Database not initialized'))
          return
        }

        try {
          const sanitizedConfig: UserConfig = {
            ...defaultConfig,
            ...config,
            id: 'userConfig',
            updatedAt: Date.now()
          }

          const transaction = this.db.transaction(this.storeName, 'readwrite')
          const store = transaction.objectStore(this.storeName)
          const request = store.put(sanitizedConfig)
          localStorage.setItem('theme', sanitizedConfig.theme || 'dark')

          request.onsuccess = () => {
            console.log('Config saved successfully')
            resolve()
          }

          request.onerror = (event) => {
            console.error('Error saving config:', event)
            reject(new Error('Failed to save config'))
          }
        } catch (error) {
          console.error('Save transaction error:', error)
          reject(error)
        }
      })
    } catch (error) {
      console.error('SaveConfig error:', error)
      throw error
    }
  }

  async resetConfig(): Promise<void> {
    return this.saveConfig(this.getDefaultConfig())
  }

  private async ensureDBReady(): Promise<void> {
    if (!this.db) {
      try {
        await this.initDB()
      } catch (error) {
        console.error('Failed to initialize database:', error)
        throw error
      }
    }
  }

  async deleteDatabase(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.dbName)

      request.onsuccess = () => {
        console.log('Database deleted successfully')
        resolve()
      }

      request.onerror = () => {
        reject(new Error('Could not delete database'))
      }
    })
  }
}

export const userConfigStore = new UserConfigStoreService()
