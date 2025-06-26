import { indexedDBService, DB_CONFIG } from './indexedDBService'

interface AliasItem {
  id: string
  alias: string
  command: string
  createdAt: number
}

interface AliasItemInput extends Partial<AliasItem> {
  key?: string
}

export class CommandStoreService {
  private readonly storeName = 'aliases'
  private db: IDBDatabase | null = null

  constructor() {
    this.initDB()
  }

  async initDB(): Promise<void> {
    try {
      this.db = await indexedDBService.initDatabase(DB_CONFIG)
    } catch (error) {
      console.error('Error initializing IndexedDB:', error)
      throw error
    }
  }

  private sanitizeForStorage(item: AliasItemInput): AliasItem {
    return {
      id: item.id || `${Date.now().toString(36)}${Math.random().toString(36).substring(2)}`,
      alias: item.alias || item.key || '',
      command: item.command || '',
      createdAt: item.createdAt || Date.now()
    }
  }

  async getAll(): Promise<AliasItem[]> {
    await this.ensureDBReady()

    return new Promise((resolve) => {
      if (!this.db) {
        resolve([])
        return
      }

      try {
        const transaction = this.db.transaction(this.storeName, 'readonly')
        const store = transaction.objectStore(this.storeName)
        const request = store.getAll()

        request.onsuccess = () => {
          const results = request.result || []
          results.sort((a: AliasItem, b: AliasItem) => {
            const timeA = a.createdAt || 0
            const timeB = b.createdAt || 0
            return timeB - timeA
          })
          resolve(results)
        }

        request.onerror = (event) => {
          console.error('Error getting items:', event)
          resolve([])
        }
      } catch (error) {
        console.error('Error in getAll transaction:', error)
        resolve([])
      }
    })
  }

  async get(id: string): Promise<AliasItem | null> {
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

  async getByAlias(aliasName: string): Promise<AliasItem | null> {
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

  async add(item: AliasItemInput): Promise<string> {
    await this.ensureDBReady()

    const sanitizedItem = this.sanitizeForStorage(item)

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
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
          reject(new Error('Failed to add item. Alias may already exist.'))
        }
      } catch (error) {
        console.error('Error in add transaction:', error)
        reject(error)
      }
    })
  }

  async update(item: AliasItemInput): Promise<void> {
    await this.ensureDBReady()

    let existingItem: AliasItem | null = null
    try {
      existingItem = await this.getByAlias(item.alias as string)
    } catch (error) {
      console.error('Error getting existing item:', error)
    }

    const updatedItem = {
      ...this.sanitizeForStorage(item),
      createdAt: existingItem?.createdAt || item.createdAt || Date.now()
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
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
          reject(new Error('Failed to update item'))
        }
      } catch (error) {
        console.error('Error in update transaction:', error)
        reject(error)
      }
    })
  }

  async deleteById(id: string): Promise<void> {
    await this.ensureDBReady()

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
        reject(new Error('Database not initialized'))
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
          reject(new Error('Failed to delete item'))
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
        reject(new Error('Database not initialized'))
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
          reject(new Error('Failed to clear store'))
        }
      } catch (error) {
        console.error('Error in clear transaction:', error)
        reject(error)
      }
    })
  }

  async search(searchText: string): Promise<AliasItem[]> {
    try {
      const allItems = await this.getAll()
      if (!searchText) {
        return allItems
      }

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

  async renameAlias(oldAlias: string, newItem: AliasItemInput): Promise<boolean> {
    try {
      const item = await this.getByAlias(oldAlias)
      if (!item) {
        return false
      }

      const updatedItem = { ...item, alias: newItem.alias, id: '' }
      await this.add(updatedItem)
      await this.delete(oldAlias)
      await this.update(newItem)

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
        throw error
      }
    }
  }
}

export const commandStore = new CommandStoreService()
