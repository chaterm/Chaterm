import { setItem, getItem, deleteItem, getAllKeys } from '../key-storage'

// Mock an object for window.indexedDB and its methods.
// This is a simplified mock for demonstration purposes.
const mockDB = {
  name: '',
  version: 0,
  objectStoreNames: {
    contains: jest.fn(),
    length: 0,
    item: jest.fn()
  },
  createObjectStore: jest.fn(),
  deleteObjectStore: jest.fn(),
  transaction: jest.fn(),
  close: jest.fn(),
  onabort: null,
  onclose: null,
  onerror: null,
  onversionchange: null
}

const mockTransaction = {
  objectStore: jest.fn(),
  commit: jest.fn(),
  abort: jest.fn(),
  error: null,
  db: mockDB,
  mode: 'readonly' as IDBTransactionMode,
  objectStoreNames: {
    contains: jest.fn(),
    length: 0,
    item: jest.fn()
  },
  onabort: null,
  oncomplete: null,
  onerror: null
}

const mockObjectStore = {
  put: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
  getAllKeys: jest.fn(),
  index: jest.fn(),
  createIndex: jest.fn(),
  deleteIndex: jest.fn(),
  name: '',
  keyPath: '',
  indexNames: {
    contains: jest.fn(),
    length: 0,
    item: jest.fn()
  },
  transaction: mockTransaction,
  autoIncrement: false,
  add: jest.fn(),
  clear: jest.fn(),
  count: jest.fn(),
  getKey: jest.fn(),
  getAll: jest.fn(),
  openCursor: jest.fn(),
  openKeyCursor: jest.fn()
}

global.indexedDB = {
  open: jest.fn().mockImplementation(() => {
    const request: any = {
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
      result: mockDB,
      error: null,
      source: null,
      transaction: null,
      readyState: 'done'
    }
    // Simulate async behavior
    setTimeout(() => {
      if (request.onupgradeneeded) {
        const event = new Event('upgradeneeded') as any
        event.target = { result: mockDB }
        request.onupgradeneeded(event)
      }
      if (request.onsuccess) {
        const event = new Event('success') as any
        event.target = { result: mockDB }
        request.onsuccess(event)
      }
    }, 0)
    return request
  }),
  deleteDatabase: jest.fn(),
  cmp: jest.fn(),
  databases: jest.fn().mockResolvedValue([])
}

describe('key-storage', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks()

    // Mock transaction and objectStore
    ;(indexedDB.open as jest.Mock).mockImplementation(() => {
      const request: any = {
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        result: mockDB,
        error: null,
        source: null,
        transaction: null,
        readyState: 'done'
      }
      mockDB.transaction = jest.fn().mockReturnValue(mockTransaction)
      mockTransaction.objectStore = jest.fn().mockReturnValue(mockObjectStore)

      // Simulate async behavior for open
      setTimeout(() => {
        if (request.onsuccess) {
          const event = new Event('success') as any
          event.target = { result: mockDB }
          request.onsuccess(event)
        }
      }, 0)
      return request
    })

    // Mock implementations for object store methods
    ;(mockObjectStore.put as jest.Mock).mockImplementation(() => {
      const request: any = { onsuccess: null, onerror: null }
      setTimeout(() => request.onsuccess && request.onsuccess(), 0)
      return request
    })
    ;(mockObjectStore.get as jest.Mock).mockImplementation(() => {
      const request: any = { onsuccess: null, onerror: null, result: { value: 'testValue' } } // Simulate finding a value
      setTimeout(() => request.onsuccess && request.onsuccess(), 0)
      return request
    })
    ;(mockObjectStore.delete as jest.Mock).mockImplementation(() => {
      const request: any = { onsuccess: null, onerror: null }
      setTimeout(() => request.onsuccess && request.onsuccess(), 0)
      return request
    })
    ;(mockObjectStore.getAllKeys as jest.Mock).mockImplementation(() => {
      const request: any = { onsuccess: null, onerror: null, result: ['key1', 'key2'] } // Simulate some keys
      setTimeout(() => request.onsuccess && request.onsuccess(), 0)
      return request
    })
  })

  test('setItem should put a value in the store', async () => {
    await setItem('testKey', 'testValue')
    expect(mockDB.transaction).toHaveBeenCalledWith(['KeyValueStore'], 'readwrite')
    expect(mockTransaction.objectStore).toHaveBeenCalledWith('KeyValueStore')
    expect(mockObjectStore.put).toHaveBeenCalledWith({ key: 'testKey', value: 'testValue' })
  })

  test('getItem should retrieve a value from the store', async () => {
    const value = await getItem('testKey')
    expect(mockDB.transaction).toHaveBeenCalledWith(['KeyValueStore'], 'readonly')
    expect(mockTransaction.objectStore).toHaveBeenCalledWith('KeyValueStore')
    expect(mockObjectStore.get).toHaveBeenCalledWith('testKey')
    expect(value).toBe('testValue')
  })

  test('deleteItem should delete a value from the store', async () => {
    await deleteItem('testKey')
    expect(mockDB.transaction).toHaveBeenCalledWith(['KeyValueStore'], 'readwrite')
    expect(mockTransaction.objectStore).toHaveBeenCalledWith('KeyValueStore')
    expect(mockObjectStore.delete).toHaveBeenCalledWith('testKey')
  })

  test('getAllKeys should retrieve all keys from the store', async () => {
    const keys = await getAllKeys()
    expect(mockDB.transaction).toHaveBeenCalledWith(['KeyValueStore'], 'readonly')
    expect(mockTransaction.objectStore).toHaveBeenCalledWith('KeyValueStore')
    expect(mockObjectStore.getAllKeys).toHaveBeenCalled()
    expect(keys).toEqual(['key1', 'key2'])
  })

  test('getItem should return undefined if key does not exist', async () => {
    ;(mockObjectStore.get as jest.Mock).mockImplementationOnce(() => {
      const request: any = { onsuccess: null, onerror: null, result: undefined } // Simulate key not found
      setTimeout(() => request.onsuccess && request.onsuccess(), 0)
      return request
    })
    const value = await getItem('nonExistentKey')
    expect(value).toBeUndefined()
  })

  // Test error handling
  test('setItem should reject on error', async () => {
    const testError = new Error('Put error')
    ;(mockObjectStore.put as jest.Mock).mockImplementationOnce(() => {
      const request: any = { onsuccess: null, onerror: null }
      setTimeout(() => request.onerror && request.onerror({ target: { error: testError } }), 0)
      return request
    })
    await expect(setItem('errorKey', 'errorValue')).rejects.toBe(testError)
  })

  test('getItem should reject on error', async () => {
    const testError = new Error('Get error')
    ;(mockObjectStore.get as jest.Mock).mockImplementationOnce(() => {
      const request: any = { onsuccess: null, onerror: null }
      setTimeout(() => request.onerror && request.onerror({ target: { error: testError } }), 0)
      return request
    })
    await expect(getItem('errorKey')).rejects.toBe(testError)
  })

  test('deleteItem should reject on error', async () => {
    const testError = new Error('Delete error')
    ;(mockObjectStore.delete as jest.Mock).mockImplementationOnce(() => {
      const request: any = { onsuccess: null, onerror: null }
      setTimeout(() => request.onerror && request.onerror({ target: { error: testError } }), 0)
      return request
    })
    await expect(deleteItem('errorKey')).rejects.toBe(testError)
  })

  test('getAllKeys should reject on error', async () => {
    const testError = new Error('GetAllKeys error')
    ;(mockObjectStore.getAllKeys as jest.Mock).mockImplementationOnce(() => {
      const request: any = { onsuccess: null, onerror: null }
      setTimeout(() => request.onerror && request.onerror({ target: { error: testError } }), 0)
      return request
    })
    await expect(getAllKeys()).rejects.toBe(testError)
  })

  // Test onupgradeneeded path in openDB
  test('openDB should create object store if it does not exist during onupgradeneeded', async () => {
    ;(indexedDB.open as jest.Mock).mockImplementationOnce(() => {
      const request: any = {
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        result: mockDB
      }
      mockDB.objectStoreNames.contains = jest.fn().mockReturnValue(false) // Simulate store does not exist
      mockDB.createObjectStore = jest.fn() // Mock createObjectStore

      setTimeout(() => {
        if (request.onupgradeneeded) {
          const event = new Event('upgradeneeded') as any
          event.target = { result: mockDB }
          event.oldVersion = 0
          event.newVersion = 1
          request.onupgradeneeded(event)
        }
        if (request.onsuccess) {
          const event = new Event('success') as any
          event.target = { result: mockDB }
          request.onsuccess(event)
        }
      }, 0)
      return request
    })

    // Call a function that uses openDB to trigger the onupgradeneeded logic
    await getItem('testKey')
    expect(mockDB.objectStoreNames.contains).toHaveBeenCalledWith('KeyValueStore')
    expect(mockDB.createObjectStore).toHaveBeenCalledWith('KeyValueStore', { keyPath: 'key' })
  })

  test('openDB should reject on error', async () => {
    const testError = new Error('OpenDB error')
    ;(indexedDB.open as jest.Mock).mockImplementationOnce(() => {
      const request: any = {
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null
      }
      setTimeout(() => {
        if (request.onerror) {
          const event = new Event('error') as any
          event.target = { error: testError }
          request.onerror(event)
        }
      }, 0)
      return request
    })

    // Attempt to use a function that calls openDB
    await expect(getItem('anyKey')).rejects.toBe(testError)
  })
})
