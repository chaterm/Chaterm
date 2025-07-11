import { indexedDBService, DB_CONFIG } from './indexedDBService'

interface UserConfig {
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
  watermark: 'open' | 'close' | undefined
  theme: 'dark' | 'light' | undefined
  feature?: number
  quickComand?: boolean
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
    return {
      id: 'userConfig',
      updatedAt: Date.now(),
      autoCompleteStatus: 2,
      vimStatus: false,
      quickVimStatus: 2,
      commonVimStatus: 2,
      aliasStatus: 2,
      highlightStatus: 2,
      fontSize: 14,
      scrollBack: 1000,
      language: 'zh-CN',
      cursorStyle: 'block' as 'block' | 'underline' | 'bar',
      watermark: 'open' as 'open' | 'close',
      theme: 'dark' as 'dark' | 'light',
      feature: 0.0,
      quickComand: false
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

      return new Promise((resolve, reject) => {
        if (!this.db) {
          reject(new Error('Database not initialized'))
          return
        }

        try {
          const sanitizedConfig: UserConfig = {
            ...this.getDefaultConfig(),
            ...config,
            id: 'userConfig',
            updatedAt: Date.now()
          }

          const transaction = this.db.transaction(this.storeName, 'readwrite')
          const store = transaction.objectStore(this.storeName)
          const request = store.put(sanitizedConfig)

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
