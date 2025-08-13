import { StorageContext } from '../storage-context'
import * as keyStorage from '../key-storage'

jest.mock('../key-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  deleteItem: jest.fn(),
  getAllKeys: jest.fn()
}))

describe('StorageContext', () => {
  let storageCtx: StorageContext

  beforeEach(() => {
    // Create a new instance before each test to ensure isolation
    storageCtx = new StorageContext()
    // Clear all mocks before each test
    jest.clearAllMocks()
  })

  describe('GlobalState', () => {
    test('get should call keyStorage.getItem with global_ prefix and return string', async () => {
      ;(keyStorage.getItem as jest.Mock).mockResolvedValueOnce('testValue')
      const result = await storageCtx.globalState.get('testKey')
      console.log('GlobalState get result (string):', result)
      expect(keyStorage.getItem).toHaveBeenCalledWith('global_testKey')
      expect(result).toBe('testValue')
    })

    test('get should call keyStorage.getItem with global_ prefix and return JSON object', async () => {
      const testObject = { foo: 'bar', baz: 123 }
      ;(keyStorage.getItem as jest.Mock).mockResolvedValueOnce(testObject)
      const result = await storageCtx.globalState.get('testObjectKey')
      console.log('GlobalState get result (JSON):', result)
      expect(keyStorage.getItem).toHaveBeenCalledWith('global_testObjectKey')
      expect(result).toEqual(testObject)
    })

    test('update should call keyStorage.setItem with global_ prefix for string value', async () => {
      await storageCtx.globalState.update('testKey', 'testValue')
      expect(keyStorage.setItem).toHaveBeenCalledWith('global_testKey', 'testValue')
    })

    test('update should call keyStorage.setItem with global_ prefix for JSON object value', async () => {
      const testObject = { foo: 'bar', nested: { num: 1 } }
      await storageCtx.globalState.update('testObjectKey', testObject)
      expect(keyStorage.setItem).toHaveBeenCalledWith('global_testObjectKey', testObject)
    })

    test('keys should call keyStorage.getAllKeys and filter/map correctly', async () => {
      ;(keyStorage.getAllKeys as jest.Mock).mockResolvedValueOnce(['global_key1', 'global_key2', 'workspace_key3', 'secret_key4'])
      const keys = await storageCtx.globalState.keys!()
      expect(keyStorage.getAllKeys).toHaveBeenCalled()
      expect(keys).toEqual(['key1', 'key2'])
    })
  })

  describe('WorkspaceState', () => {
    test('get should call keyStorage.getItem with workspace_ prefix and return string', async () => {
      ;(keyStorage.getItem as jest.Mock).mockResolvedValueOnce('wsValue')
      const result = await storageCtx.workspaceState.get('testWsKey')
      console.log('WorkspaceState get result (string):', result)
      expect(keyStorage.getItem).toHaveBeenCalledWith('workspace_testWsKey')
      expect(result).toBe('wsValue')
    })

    test('get should call keyStorage.getItem with workspace_ prefix and return JSON object', async () => {
      const testObject = { id: 'ws1', data: { value: 'data' } }
      ;(keyStorage.getItem as jest.Mock).mockResolvedValueOnce(testObject)
      const result = await storageCtx.workspaceState.get('testWsObjectKey')
      console.log('WorkspaceState get result (JSON):', result)
      expect(keyStorage.getItem).toHaveBeenCalledWith('workspace_testWsObjectKey')
      expect(result).toEqual(testObject)
    })

    test('update should call keyStorage.setItem with workspace_ prefix for string value', async () => {
      await storageCtx.workspaceState.update('testWsKey', 'wsValue')
      expect(keyStorage.setItem).toHaveBeenCalledWith('workspace_testWsKey', 'wsValue')
    })

    test('update should call keyStorage.setItem with workspace_ prefix for JSON object value', async () => {
      const testObject = { user: 'test', settings: { theme: 'dark' } }
      await storageCtx.workspaceState.update('testWsObjectKey', testObject)
      expect(keyStorage.setItem).toHaveBeenCalledWith('workspace_testWsObjectKey', testObject)
    })

    test('keys should call keyStorage.getAllKeys and filter/map correctly', async () => {
      ;(keyStorage.getAllKeys as jest.Mock).mockResolvedValueOnce(['global_key1', 'workspace_key2', 'workspace_key3', 'secret_key4'])
      const keys = await storageCtx.workspaceState.keys!()
      expect(keyStorage.getAllKeys).toHaveBeenCalled()
      expect(keys).toEqual(['key2', 'key3'])
    })
  })

  describe('Secrets', () => {
    test('get should call keyStorage.getItem with secret_ prefix and return string', async () => {
      ;(keyStorage.getItem as jest.Mock).mockResolvedValueOnce('secretValue')
      const result = await storageCtx.secrets.get('testSecretKey')
      console.log('Secrets get result (string):', result)
      expect(keyStorage.getItem).toHaveBeenCalledWith('secret_testSecretKey')
      expect(result).toBe('secretValue')
    })

    test('store should call keyStorage.setItem with secret_ prefix for string value', async () => {
      await storageCtx.secrets.store('testSecretKey', 'secretValue')
      expect(keyStorage.setItem).toHaveBeenCalledWith('secret_testSecretKey', 'secretValue')
    })

    test('delete should call keyStorage.deleteItem with secret_ prefix', async () => {
      await storageCtx.secrets.delete('testSecretKey')
      expect(keyStorage.deleteItem).toHaveBeenCalledWith('secret_testSecretKey')
    })
  })
})
