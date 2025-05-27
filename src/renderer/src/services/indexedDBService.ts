interface StoreConfig {
  name: string
  keyPath: string
  indexes?: Array<{
    name: string
    keyPath: string
    options?: IDBIndexParameters
  }>
}

interface DBConfig {
  name: string
  version: number
  stores: StoreConfig[]
}

class IndexedDBService {
  private static instance: IndexedDBService
  private dbConnections: Map<string, IDBDatabase> = new Map()

  // private constructor() {}

  static getInstance(): IndexedDBService {
    if (!IndexedDBService.instance) {
      IndexedDBService.instance = new IndexedDBService()
    }
    return IndexedDBService.instance
  }

  async initDatabase(config: DBConfig): Promise<IDBDatabase> {
    // 如果已经有连接，直接返回
    const existingConnection = this.dbConnections.get(config.name)
    if (existingConnection) {
      return existingConnection
    }

    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open(config.name, config.version)

        request.onerror = (event) => {
          console.error('IndexedDB error:', event)
          reject('Failed to open IndexedDB')
        }

        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result
          this.dbConnections.set(config.name, db)
          console.log(`Database ${config.name} opened successfully`)
          resolve(db)
        }

        request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
          const db = (event.target as IDBOpenDBRequest).result

          // 处理所有store的创建
          config.stores.forEach((store) => {
            if (!db.objectStoreNames.contains(store.name)) {
              console.log(`Creating store: ${store.name}`)
              const objectStore = db.createObjectStore(store.name, { keyPath: store.keyPath })

              // 创建索引
              store.indexes?.forEach((index) => {
                objectStore.createIndex(index.name, index.keyPath, index.options)
              })
            }
          })
        }
      } catch (error) {
        console.error('Error initializing IndexedDB:', error)
        reject(error)
      }
    })
  }

  async getDatabase(dbName: string): Promise<IDBDatabase | null> {
    return this.dbConnections.get(dbName) || null
  }

  closeDatabase(dbName: string): void {
    const db = this.dbConnections.get(dbName)
    if (db) {
      db.close()
      this.dbConnections.delete(dbName)
    }
  }
}

// 导出单例实例
export const indexedDBService = IndexedDBService.getInstance()

// 导出通用的数据库配置
export const DB_CONFIG: DBConfig = {
  name: 'chatermDB',
  version: 2,
  stores: [
    {
      name: 'userConfig',
      keyPath: 'id'
    },
    {
      name: 'aliases',
      keyPath: 'alias',
      indexes: [
        {
          name: 'id',
          keyPath: 'id',
          options: { unique: true }
        },
        {
          name: 'createdAt',
          keyPath: 'createdAt',
          options: { unique: false }
        }
      ]
    }
  ]
}
