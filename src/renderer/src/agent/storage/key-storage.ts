const DB_NAME = 'ChatermStorage'
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

let db: IDBDatabase | null = null

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db)
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

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
        db = target.result
        resolve(db as IDBDatabase)
      }
    }

    request.onerror = (event: Event) => {
      const target = event.target as DBRequest | null
      console.error('IndexedDB error:', target?.error)
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
