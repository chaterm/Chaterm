import { getUserInfo } from '@/utils/permission'

const DB_BASE_NAME = 'ChatermStorage'
const DB_VERSION = 1
const STORE_NAME = 'KeyValueStore'

interface DBRequest extends EventTarget {
  result: any
  error: DOMException | null
  source: IDBObjectStore | IDBIndex | IDBCursor | null
  transaction: IDBTransaction | null
  readyState: 'pending' | 'done'
  onsuccess: ((this: DBRequest, ev: Event) => any) | null
  onerror: ((this: DBRequest, ev: Event) => any) | null
}

// 用户数据库实例缓存
const userDatabases = new Map<number, IDBDatabase>()
let currentUserId: number | null = null

// 获取当前用户ID
function getCurrentUserId(): number {
  const userInfo = getUserInfo()
  if (!userInfo || !userInfo.uid) {
    throw new Error('User not logged in. Please login first to use storage.')
  }
  return userInfo.uid
}

// 生成用户专属数据库名称
function getUserDatabaseName(userId: number): string {
  return `${DB_BASE_NAME}_user_${userId}`
}

// 设置当前用户ID（用于用户切换时清理连接）
export function setCurrentUser(userId: number): void {
  if (currentUserId !== userId) {
    if (currentUserId && userDatabases.has(currentUserId)) {
      const oldDb = userDatabases.get(currentUserId)
      if (oldDb) {
        oldDb.close()
        userDatabases.delete(currentUserId)
      }
    }
    currentUserId = userId
  }
}

async function migrateOldDatabase(userId: number): Promise<void> {
  return new Promise((resolve) => {
    const oldDbName = DB_BASE_NAME
    const request = indexedDB.open(oldDbName)

    let dbExists = true
    request.onupgradeneeded = () => {
      dbExists = false
      request.transaction?.abort()
      indexedDB.deleteDatabase(oldDbName) // Clean up empty DB
      resolve()
    }

    request.onsuccess = (event: Event) => {
      if (!dbExists) return

      console.log(`Old database "${oldDbName}" found. Attempting to migrate...`)
      const oldDb = (event.target as DBRequest).result
      if (!oldDb.objectStoreNames.contains(STORE_NAME)) {
        oldDb.close()
        indexedDB.deleteDatabase(oldDbName).onsuccess = () => resolve()
        return
      }

      const transaction = oldDb.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const getAllRequest = store.getAll()

      getAllRequest.onsuccess = () => {
        const data = getAllRequest.result
        oldDb.close()

        const newDbName = getUserDatabaseName(userId)
        const newDbRequest = indexedDB.open(newDbName, DB_VERSION)

        newDbRequest.onupgradeneeded = (e: IDBVersionChangeEvent) => {
          const newDb = (e.target as DBRequest).result
          if (!newDb.objectStoreNames.contains(STORE_NAME)) {
            newDb.createObjectStore(STORE_NAME, { keyPath: 'key' })
          }
        }

        newDbRequest.onsuccess = () => {
          const newDb = newDbRequest.result
          const writeTransaction = newDb.transaction(STORE_NAME, 'readwrite')
          const newStore = writeTransaction.objectStore(STORE_NAME)

          if (data?.length > 0) {
            data.forEach((item) => newStore.put(item))
          }

          writeTransaction.oncomplete = () => {
            newDb.close()
            indexedDB.deleteDatabase(oldDbName).onsuccess = () => {
              console.log('✅ Old database migrated and deleted successfully.')
              resolve()
            }
          }
          writeTransaction.onerror = () => {
            console.error('Error writing data to new database during migration.')
            newDb.close()
            resolve() // Resolve anyway to not block app startup
          }
        }
        newDbRequest.onerror = () => {
          console.error('Error opening new database during migration.')
          resolve()
        }
      }
      getAllRequest.onerror = () => {
        console.error('Error reading from old database during migration.')
        oldDb.close()
        resolve()
      }
    }
    request.onerror = () => {
      // This can happen for various reasons, including browser settings.
      // We assume no migration is possible or needed.
      resolve()
    }
  })
}

async function openDB(): Promise<IDBDatabase> {
  const userId = getCurrentUserId()

  // 检查是否已有该用户的数据库连接
  if (userDatabases.has(userId)) {
    const existingDb = userDatabases.get(userId)!
    return existingDb
  }

  await migrateOldDatabase(userId)

  return new Promise((resolve, reject) => {
    const dbName = getUserDatabaseName(userId)
    const request = indexedDB.open(dbName, DB_VERSION)

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const target = event.target as DBRequest | null
      if (target) {
        const database = target.result
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'key' })
        }
      }
    }

    request.onsuccess = (event: Event) => {
      const target = event.target as DBRequest | null
      if (target) {
        const database = target.result as IDBDatabase
        userDatabases.set(userId, database)
        setCurrentUser(userId)
        console.log(`✅ IndexedDB connection established for user ${userId}`)
        resolve(database)
      }
    }

    request.onerror = (event: Event) => {
      const target = event.target as DBRequest | null
      console.error(`❌ IndexedDB error for user ${userId}:`, target?.error)
      reject(target?.error)
    }
  })
}

export async function setItem<T>(key: string, value: T): Promise<void> {
  const currentDB = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = currentDB.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put({ key, value })

    request.onsuccess = () => {
      resolve()
    }

    request.onerror = (event: Event) => {
      const target = event.target as DBRequest | null
      console.error('Error setting item in IndexedDB:', target?.error)
      reject(target?.error)
    }
  })
}

export async function getItem<T>(key: string): Promise<T | undefined> {
  const currentDB = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = currentDB.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(key)

    request.onsuccess = () => {
      resolve(request.result ? request.result.value : undefined)
    }

    request.onerror = (event: Event) => {
      const target = event.target as DBRequest | null
      console.error('Error getting item from IndexedDB:', target?.error)
      reject(target?.error)
    }
  })
}

export async function deleteItem(key: string): Promise<void> {
  const currentDB = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = currentDB.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(key)

    request.onsuccess = () => {
      resolve()
    }

    request.onerror = (event: Event) => {
      const target = event.target as DBRequest | null
      console.error('Error deleting item from IndexedDB:', target?.error)
      reject(target?.error)
    }
  })
}

export async function getAllKeys(): Promise<string[]> {
  const currentDB = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = currentDB.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAllKeys()

    request.onsuccess = () => {
      resolve(request.result as string[])
    }

    request.onerror = (event: Event) => {
      const target = event.target as DBRequest | null
      console.error('Error getting all keys from IndexedDB:', target?.error)
      reject(target?.error)
    }
  })
}
