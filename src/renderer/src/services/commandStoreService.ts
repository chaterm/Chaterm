export class CommandStoreService {
  private dbName = 'chatermDB'
  private storeName = 'aliases'
  private db: IDBDatabase | null = null

  constructor() {
    this.initDB()
  }

  initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open(this.dbName, 1) // 增加版本号，触发 onupgradeneeded

        request.onerror = (event) => {
          console.error('IndexedDB error:', event)
          reject('Failed to open IndexedDB')
        }

        request.onsuccess = (event) => {
          this.db = (event.target as IDBOpenDBRequest).result
          resolve()
        }

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result

          // 如果存在旧版的 store，则删除
          if (db.objectStoreNames.contains(this.storeName)) {
            db.deleteObjectStore(this.storeName)
          }

          // 创建新的 store，使用 alias 作为 keyPath
          const store = db.createObjectStore(this.storeName, { keyPath: 'alias' })

          // 为 id 字段创建索引，方便通过 id 查询
          store.createIndex('id', 'id', { unique: true })

          // 为创建时间创建索引，用于排序
          store.createIndex('createdAt', 'createdAt', { unique: false })
        }
      } catch (error) {
        console.error('Error initializing IndexedDB:', error)
        reject(error)
      }
    })
  }

  // 安全地克隆对象以避免结构化克隆错误
  private sanitizeForStorage(item: any): any {
    return {
      id: item.id || Date.now().toString(36) + Math.random().toString(36).substring(2),
      alias: item.alias || item.key, // 使用 alias 作为主键
      command: item.command,
      createdAt: item.createdAt || Date.now() // 添加创建时间戳
      // 只保留必要的字段，避免不可克隆的属性
    }
  }

  async getAll(): Promise<any[]> {
    await this.ensureDBReady()

    return new Promise((resolve) => {
      if (!this.db) {
        resolve([]) // 返回空数组而不是拒绝 Promise
        return
      }

      try {
        const transaction = this.db.transaction(this.storeName, 'readonly')
        const store = transaction.objectStore(this.storeName)
        const request = store.getAll()

        request.onsuccess = () => {
          const results = request.result || []
          // 按创建时间降序排序（最新的在前面）
          results.sort((a, b) => {
            // 如果没有 createdAt，使用 id 作为回退
            const timeA = a.createdAt || 0
            const timeB = b.createdAt || 0
            return timeB - timeA // 降序排列
          })
          resolve(results)
        }

        request.onerror = (event) => {
          console.error('Error getting items:', event)
          resolve([]) // 返回空数组而不是拒绝 Promise
        }
      } catch (error) {
        console.error('Error in getAll transaction:', error)
        resolve([]) // 处理任何事务错误
      }
    })
  }

  async get(id: string): Promise<any> {
    await this.ensureDBReady()

    return new Promise((resolve) => {
      if (!this.db) {
        resolve(null)
        return
      }

      try {
        const transaction = this.db.transaction(this.storeName, 'readonly')
        const store = transaction.objectStore(this.storeName)
        const index = store.index('id')
        const request = index.get(id)

        request.onsuccess = () => {
          resolve(request.result)
        }

        request.onerror = (event) => {
          console.error('Error getting item by id:', event)
          resolve(null)
        }
      } catch (error) {
        console.error('Error in get transaction:', error)
        resolve(null)
      }
    })
  }

  async getByAlias(aliasName: string): Promise<any> {
    await this.ensureDBReady()

    return new Promise((resolve) => {
      if (!this.db) {
        resolve(null)
        return
      }

      try {
        const transaction = this.db.transaction(this.storeName, 'readonly')
        const store = transaction.objectStore(this.storeName)
        const request = store.get(aliasName)

        request.onsuccess = () => {
          resolve(request.result)
        }

        request.onerror = (event) => {
          console.error('Error getting item by alias:', event)
          resolve(null)
        }
      } catch (error) {
        console.error('Error in getByAlias transaction:', error)
        resolve(null)
      }
    })
  }

  async add(item: any): Promise<string> {
    await this.ensureDBReady()

    // 确保 item 有 ID
    if (!item.id) {
      item.id = Date.now().toString(36) + Math.random().toString(36).substring(2)
    }

    // 确保有创建时间
    if (!item.createdAt) {
      item.createdAt = Date.now()
    }

    // 安全克隆
    const sanitizedItem = this.sanitizeForStorage(item)

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Database not initialized')
        return
      }

      try {
        const transaction = this.db.transaction(this.storeName, 'readwrite')
        const store = transaction.objectStore(this.storeName)
        const request = store.add(sanitizedItem)

        request.onsuccess = () => {
          resolve(sanitizedItem.alias)
        }

        request.onerror = (event) => {
          console.error('Error adding item:', event)
          reject('Failed to add item. Alias may already exist.')
        }
      } catch (error) {
        console.error('Error in add transaction:', error)
        reject(error)
      }
    })
  }

  async update(item: any): Promise<void> {
    await this.ensureDBReady()

    // 获取现有记录以保留创建时间
    let existingItem = { createdAt: Date.now() }
    try {
      existingItem = await this.getByAlias(item.alias)
    } catch (error) {
      console.error('Error getting existing item:', error)
    }

    // 合并现有记录和新记录
    const updatedItem = {
      ...this.sanitizeForStorage(item),
      createdAt: existingItem?.createdAt || item.createdAt || Date.now()
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Database not initialized')
        return
      }

      try {
        const transaction = this.db.transaction(this.storeName, 'readwrite')
        const store = transaction.objectStore(this.storeName)
        const request = store.put(updatedItem)

        request.onsuccess = () => {
          resolve()
        }

        request.onerror = (event) => {
          console.error('Error updating item:', event)
          reject('Failed to update item')
        }
      } catch (error) {
        console.error('Error in update transaction:', error)
        reject(error)
      }
    })
  }

  async deleteById(id: string): Promise<void> {
    await this.ensureDBReady()

    // 首先需要通过 id 查找对应的 alias
    const item = await this.get(id)
    if (!item) {
      throw new Error(`Item with id ${id} not found`)
    }

    return this.delete(item.alias)
  }

  async delete(alias: string): Promise<void> {
    await this.ensureDBReady()

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Database not initialized')
        return
      }

      try {
        const transaction = this.db.transaction(this.storeName, 'readwrite')
        const store = transaction.objectStore(this.storeName)
        const request = store.delete(alias)

        request.onsuccess = () => {
          resolve()
        }

        request.onerror = (event) => {
          console.error('Error deleting item:', event)
          reject('Failed to delete item')
        }
      } catch (error) {
        console.error('Error in delete transaction:', error)
        reject(error)
      }
    })
  }

  async clear(): Promise<void> {
    await this.ensureDBReady()

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Database not initialized')
        return
      }

      try {
        const transaction = this.db.transaction(this.storeName, 'readwrite')
        const store = transaction.objectStore(this.storeName)
        const request = store.clear()

        request.onsuccess = () => {
          resolve()
        }

        request.onerror = (event) => {
          console.error('Error clearing store:', event)
          reject('Failed to clear store')
        }
      } catch (error) {
        console.error('Error in clear transaction:', error)
        reject(error)
      }
    })
  }

  // 根据别名名称查询,模糊查询
  async search(searchText: string): Promise<any[]> {
    try {
      const allItems = await this.getAll()
      // 注意: getAll 方法已经将结果排序为倒序

      if (!searchText) return allItems

      const searchLower = searchText.toLowerCase()
      return allItems.filter((item) => {
        const alias = (item.alias || '').toLowerCase()
        const command = (item.command || '').toLowerCase()
        return alias.includes(searchLower) || command.includes(searchLower)
      })
    } catch (error) {
      console.error('Error in search:', error)
      return []
    }
  }

  // 如果是重命名别名,需要使用此方法
  async renameAlias(oldAlias: string, newAlias: string): Promise<boolean> {
    try {
      const item = await this.getByAlias(oldAlias)
      if (!item) {
        return false
      }

      const updatedItem = { ...item, alias: newAlias }

      // 添加新别名
      await this.add(updatedItem)

      // 删除旧别名
      await this.delete(oldAlias)

      return true
    } catch (error) {
      console.error('Error in rename alias:', error)
      return false
    }
  }

  private async ensureDBReady(): Promise<void> {
    if (!this.db) {
      try {
        await this.initDB()
      } catch (error) {
        console.error('Failed to initialize database:', error)
      }
    }
  }
}

export const commandStore = new CommandStoreService()
