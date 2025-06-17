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

async function openDB(): Promise<IDBDatabase> {
  const userId = getCurrentUserId()

  // 检查是否已有该用户的数据库连接
  if (userDatabases.has(userId)) {
    const existingDb = userDatabases.get(userId)!
    return existingDb
  }

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
