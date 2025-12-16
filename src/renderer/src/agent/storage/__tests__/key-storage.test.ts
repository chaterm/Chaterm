import { vi, describe, test, beforeEach, expect } from 'vitest'
import { setItem, getItem, deleteItem, getAllKeys } from '../key-storage'

// Mock the window.api object
const mockApi = {
  kvMutate: vi.fn(),
  kvGet: vi.fn()
}

// Mock window object
global.window = {
  api: mockApi
} as any

// Mock getUserInfo utility
vi.mock('@/utils/permission', () => ({
  getUserInfo: vi.fn(() => ({ uid: 123 }))
}))

describe('key-storage', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks()
  })

  test('setItem should call kvMutate with correct parameters', async () => {
    mockApi.kvMutate.mockResolvedValue(undefined)

    await setItem('testKey', 'testValue')

    expect(mockApi.kvMutate).toHaveBeenCalledWith({
      action: 'set',
      key: 'testKey',
      value: JSON.stringify('testValue')
    })
  })

  test('getItem should call kvGet and parse the result', async () => {
    const mockValue = { value: JSON.stringify('testValue') }
    mockApi.kvGet.mockResolvedValue(mockValue)

    const result = await getItem('testKey')

    expect(mockApi.kvGet).toHaveBeenCalledWith({ key: 'testKey' })
    expect(result).toBe('testValue')
  })

  test('getItem should return undefined if no value found', async () => {
    mockApi.kvGet.mockResolvedValue(null)

    const result = await getItem('testKey')

    expect(mockApi.kvGet).toHaveBeenCalledWith({ key: 'testKey' })
    expect(result).toBeUndefined()
  })

  test('getItem should return undefined if value is empty', async () => {
    mockApi.kvGet.mockResolvedValue({ value: '' })

    const result = await getItem('testKey')

    expect(mockApi.kvGet).toHaveBeenCalledWith({ key: 'testKey' })
    expect(result).toBeUndefined()
  })

  test('deleteItem should call kvMutate with delete action', async () => {
    mockApi.kvMutate.mockResolvedValue(undefined)

    await deleteItem('testKey')

    expect(mockApi.kvMutate).toHaveBeenCalledWith({
      action: 'delete',
      key: 'testKey'
    })
  })

  test('getAllKeys should call kvGet and return keys', async () => {
    const mockKeys = ['key1', 'key2', 'key3']
    mockApi.kvGet.mockResolvedValue(mockKeys)

    const result = await getAllKeys()

    expect(mockApi.kvGet).toHaveBeenCalledWith({})
    expect(result).toEqual(mockKeys)
  })

  test('getAllKeys should return empty array if no keys found', async () => {
    mockApi.kvGet.mockResolvedValue(null)

    const result = await getAllKeys()

    expect(mockApi.kvGet).toHaveBeenCalledWith({})
    expect(result).toEqual([])
  })

  test('setItem should handle objects correctly', async () => {
    mockApi.kvMutate.mockResolvedValue(undefined)
    const testObject = { name: 'test', value: 123 }

    await setItem('testKey', testObject)

    expect(mockApi.kvMutate).toHaveBeenCalledWith({
      action: 'set',
      key: 'testKey',
      value: JSON.stringify(testObject)
    })
  })

  test('getItem should handle objects correctly', async () => {
    const testObject = { name: 'test', value: 123 }
    mockApi.kvGet.mockResolvedValue({ value: JSON.stringify(testObject) })

    const result = await getItem('testKey')

    expect(result).toEqual(testObject)
  })

  // Error handling tests
  test('setItem should throw error when kvMutate fails', async () => {
    const testError = new Error('Set error')
    mockApi.kvMutate.mockRejectedValue(testError)

    await expect(setItem('testKey', 'testValue')).rejects.toBe(testError)
  })

  test('getItem should throw error when kvGet fails', async () => {
    const testError = new Error('Get error')
    mockApi.kvGet.mockRejectedValue(testError)

    await expect(getItem('testKey')).rejects.toBe(testError)
  })

  test('deleteItem should throw error when kvMutate fails', async () => {
    const testError = new Error('Delete error')
    mockApi.kvMutate.mockRejectedValue(testError)

    await expect(deleteItem('testKey')).rejects.toBe(testError)
  })

  test('getAllKeys should throw error when kvGet fails', async () => {
    const testError = new Error('GetAllKeys error')
    mockApi.kvGet.mockRejectedValue(testError)

    await expect(getAllKeys()).rejects.toBe(testError)
  })
})
