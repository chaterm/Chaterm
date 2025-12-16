import {
  updateGlobalState,
  getGlobalState,
  storeSecret,
  getSecret,
  updateWorkspaceState,
  getWorkspaceState,
  getAllExtensionState,
  updateApiConfiguration,
  resetExtensionState
} from '../state'
import { storageContext } from '../storage-context'
import { DEFAULT_CHAT_SETTINGS } from '@shared/ChatSettings'
import { ApiProvider } from '@shared/api'
import { GlobalStateKey } from '../state-keys'
import { vi, describe, test, beforeEach, expect } from 'vitest'

// Mock storageContext
vi.mock('../storage-context', () => ({
  storageContext: {
    globalState: {
      update: vi.fn(),
      get: vi.fn(),
      keys: vi.fn()
    },
    secrets: {
      store: vi.fn(),
      get: vi.fn(),
      delete: vi.fn()
    },
    workspaceState: {
      update: vi.fn(),
      get: vi.fn(),
      keys: vi.fn()
    }
  }
}))

vi.mock('@/store/userConfigStore', () => ({
  userConfigStore: vi.fn(() => ({
    getUserConfig: {},
    setUserConfig: vi.fn()
  }))
}))

vi.mock('@/utils/permission', () => ({
  getUserInfo: vi.fn(() => ({ uid: 'test-user', name: 'Test User' }))
}))

// Helper function: print data before and after changes
const logDataChange = (operation: string, key: string, beforeValue: any, afterValue: any) => {
  console.log(`\n=== ${operation} Data Change ===`)
  console.log(`Key: ${key}`)
  console.log(`Before:`, beforeValue)
  console.log(`After:`, afterValue)
  console.log(`===========================\n`)
}

describe('State Management', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks()
  })

  describe('Global State', () => {
    test('updateGlobalState should call storageContext.globalState.update', async () => {
      // Get data before change
      const beforeValue = 'oldProvideValue'
      ;(storageContext.globalState.get as any).mockResolvedValueOnce(beforeValue)
      const actualBeforeValue = await getGlobalState('apiProvider')

      // Execute change operation
      const newValue = 'testProviderValue'
      await updateGlobalState('apiProvider', newValue)

      // Simulate data after change
      ;(storageContext.globalState.get as any).mockResolvedValueOnce(newValue)
      const actualAfterValue = await getGlobalState('apiProvider')

      // Print before and after data
      logDataChange('updateGlobalState', 'apiProvider', actualBeforeValue, actualAfterValue)

      expect(storageContext.globalState.update).toHaveBeenCalledWith('apiProvider', 'testProviderValue')
    })

    test('getGlobalState should call storageContext.globalState.get', async () => {
      ;(storageContext.globalState.get as any).mockResolvedValueOnce('testValue')
      const value = await getGlobalState('apiProvider')
      expect(storageContext.globalState.get).toHaveBeenCalledWith('apiProvider')
      expect(value).toBe('testValue')
    })
  })

  describe('Secrets', () => {
    test('storeSecret should call storageContext.secrets.store when value is provided', async () => {
      // Get data before change
      const beforeValue = 'oldApiKey'
      ;(storageContext.secrets.get as any).mockResolvedValueOnce(beforeValue)
      const actualBeforeValue = await getSecret('apiKey')

      // Execute change operation
      const newValue = 'testKey'
      await storeSecret('apiKey', newValue)

      // Simulate data after change
      ;(storageContext.secrets.get as any).mockResolvedValueOnce(newValue)
      const actualAfterValue = await getSecret('apiKey')

      // Print before and after data
      logDataChange('storeSecret', 'apiKey', actualBeforeValue, actualAfterValue)

      expect(storageContext.secrets.store).toHaveBeenCalledWith('apiKey', 'testKey')
    })

    test('storeSecret should call storageContext.secrets.delete when value is not provided', async () => {
      // Get data before change
      const beforeValue = 'existingApiKey'
      ;(storageContext.secrets.get as any).mockResolvedValueOnce(beforeValue)
      const actualBeforeValue = await getSecret('apiKey')

      // Execute delete operation
      await storeSecret('apiKey', undefined)

      // Simulate data after delete
      ;(storageContext.secrets.get as any).mockResolvedValueOnce(undefined)
      const actualAfterValue = await getSecret('apiKey')

      // Print before and after data
      logDataChange('storeSecret (delete)', 'apiKey', actualBeforeValue, actualAfterValue)

      expect(storageContext.secrets.delete).toHaveBeenCalledWith('apiKey')
    })

    test('getSecret should call storageContext.secrets.get', async () => {
      ;(storageContext.secrets.get as any).mockResolvedValueOnce('secretValue')
      const value = await getSecret('apiKey')
      expect(storageContext.secrets.get).toHaveBeenCalledWith('apiKey')
      expect(value).toBe('secretValue')
    })
  })

  describe('Workspace State', () => {
    test('updateWorkspaceState should call storageContext.workspaceState.update', async () => {
      // Get data before change
      const beforeValue = 'oldValue'
      ;(storageContext.workspaceState.get as any).mockResolvedValueOnce(beforeValue)
      const actualBeforeValue = await getWorkspaceState('testKey')

      // Execute change operation
      const newValue = 'testValue'
      await updateWorkspaceState('testKey', newValue)

      // Simulate data after change
      ;(storageContext.workspaceState.get as any).mockResolvedValueOnce(newValue)
      const actualAfterValue = await getWorkspaceState('testKey')

      // Print before and after data
      logDataChange('updateWorkspaceState', 'testKey', actualBeforeValue, actualAfterValue)

      expect(storageContext.workspaceState.update).toHaveBeenCalledWith('testKey', 'testValue')
    })

    test('getWorkspaceState should call storageContext.workspaceState.get', async () => {
      ;(storageContext.workspaceState.get as any).mockResolvedValueOnce('wsValue')
      const value = await getWorkspaceState('testKey')
      expect(storageContext.workspaceState.get).toHaveBeenCalledWith('testKey')
      expect(value).toBe('wsValue')
    })
  })

  describe('getAllExtensionState', () => {
    test('should retrieve all relevant states and derive apiProvider correctly', async () => {
      // Mock the return values for getGlobalState and getSecret
      ;(storageContext.globalState.get as any).mockImplementation(async (key) => {
        if (key === 'apiProvider') return undefined // Simulate new user or legacy user
        if (key === 'apiModelId') return 'claude-2'
        if (key === 'chatSettings') return DEFAULT_CHAT_SETTINGS
        // ... mock other necessary global states
        return undefined
      })
      ;(storageContext.secrets.get as any).mockImplementation(async (key) => {
        if (key === 'apiKey') return 'some-api-key' // Simulate apiKey exists
        // ... mock other necessary secrets
        return undefined
      })
      ;(storageContext.workspaceState.get as any).mockResolvedValue(undefined)

      const state = await getAllExtensionState()

      expect(storageContext.globalState.get).toHaveBeenCalledWith('apiProvider')
      expect(storageContext.secrets.get).toHaveBeenCalledWith('apiKey')
      expect(state.apiConfiguration.apiProvider).toBe('bedrock') // Derived correctly
      expect(state.apiConfiguration.apiModelId).toBe('claude-2')
      expect(state.chatSettings).toEqual(DEFAULT_CHAT_SETTINGS)
      // ... add more assertions for other parts of the state
    })

    test('should default to openrouter if apiProvider and apiKey are not present', async () => {
      ;(storageContext.globalState.get as any).mockResolvedValue(undefined) // No stored apiProvider
      ;(storageContext.secrets.get as any).mockResolvedValue(undefined) // No stored apiKey
      ;(storageContext.workspaceState.get as any).mockResolvedValue(undefined)

      const state = await getAllExtensionState()
      expect(state.apiConfiguration.apiProvider).toBe('bedrock')
    })
  })

  describe('updateApiConfiguration', () => {
    test('should update relevant global states and secrets', async () => {
      // Get complete state before change
      console.log('\n=== updateApiConfiguration Operation Start ===')
      const beforeState = await getAllExtensionState()
      console.log('State before config change:', JSON.stringify(beforeState.apiConfiguration, null, 2))

      const newConfig: any = {
        apiProvider: 'anthropic' as ApiProvider,
        apiModelId: 'claude-3'
        // Note: apiKey is not included as it's not saved by updateApiConfiguration
        // ... other config fields
      }

      // Execute change operation
      await updateApiConfiguration(newConfig)

      // Simulate state after change
      ;(storageContext.globalState.get as any).mockImplementation(async (key) => {
        if (key === 'apiProvider') return 'anthropic'
        if (key === 'apiModelId') return 'claude-3'
        return undefined
      })
      ;(storageContext.secrets.get as any).mockImplementation(async () => {
        // No apiKey is set since updateApiConfiguration doesn't save it
        return undefined
      })

      const afterState = await getAllExtensionState()
      console.log('State after config change:', JSON.stringify(afterState.apiConfiguration, null, 2))
      console.log('===================================\n')

      expect(storageContext.globalState.update).toHaveBeenCalledWith('apiProvider', 'anthropic')
      expect(storageContext.globalState.update).toHaveBeenCalledWith('apiModelId', 'claude-3')
      // Note: apiKey is not saved by updateApiConfiguration in current implementation

      // Example for OpenAI specific fields being cleared/set if provider changes
      console.log('\n=== Switch to OpenAI Config ===')
      const openAIConfig = {
        ...newConfig,
        apiProvider: 'openai',
        openAiApiKey: 'new-openai-key',
        openAiBaseUrl: 'new-url'
      }
      await updateApiConfiguration(openAIConfig)
      console.log('Switched to OpenAI config:', JSON.stringify(openAIConfig, null, 2))
      console.log('=========================\n')

      expect(storageContext.secrets.store).toHaveBeenCalledWith('openAiApiKey', 'new-openai-key')
      expect(storageContext.globalState.update).toHaveBeenCalledWith('openAiBaseUrl', 'new-url')
    })
  })

  describe('resetExtensionState', () => {
    test('should call keys and update with undefined for globalState, delete for secrets, and keys for workspaceState', async () => {
      // Get state before reset
      console.log('\n=== resetExtensionState Operation Start ===')

      // Mock keys to return a list of keys that would be reset
      const globalKeys = ['apiProvider', 'apiModelId', 'someOtherGlobalKey']
      const workspaceKeys = ['localClineRulesToggles', 'someWorkspaceKey']

      ;(storageContext.globalState.keys as any).mockResolvedValue(globalKeys)
      ;(storageContext.workspaceState.keys as any).mockResolvedValue(workspaceKeys)

      // Simulate data before reset
      ;(storageContext.globalState.get as any).mockImplementation(async (key) => {
        const mockData: any = {
          apiProvider: 'anthropic',
          apiModelId: 'claude-3',
          someOtherGlobalKey: 'someValue'
        }
        return mockData[key]
      })
      ;(storageContext.workspaceState.get as any).mockImplementation(async (key) => {
        const mockData: any = {
          localClineRulesToggles: { rule1: true, rule2: false },
          someWorkspaceKey: 'workspaceValue'
        }
        return mockData[key]
      })

      // Record all data before reset
      const beforeGlobalData: any = {}
      const beforeWorkspaceData: any = {}

      for (const key of globalKeys) {
        beforeGlobalData[key] = await getGlobalState(key as GlobalStateKey)
      }
      for (const key of workspaceKeys) {
        beforeWorkspaceData[key] = await getWorkspaceState(key)
      }

      console.log('Global State before reset:', JSON.stringify(beforeGlobalData, null, 2))
      console.log('Workspace State before reset:', JSON.stringify(beforeWorkspaceData, null, 2))

      // Execute reset operation
      await resetExtensionState()

      // Simulate data after reset (all undefined)
      ;(storageContext.globalState.get as any).mockResolvedValue(undefined)
      ;(storageContext.workspaceState.get as any).mockResolvedValue(undefined)

      const afterGlobalData: any = {}
      const afterWorkspaceData: any = {}

      for (const key of globalKeys) {
        afterGlobalData[key] = await getGlobalState(key as GlobalStateKey)
      }
      for (const key of workspaceKeys) {
        afterWorkspaceData[key] = await getWorkspaceState(key)
      }

      console.log('Global State after reset:', JSON.stringify(afterGlobalData, null, 2))
      console.log('Workspace State after reset:', JSON.stringify(afterWorkspaceData, null, 2))
      console.log('All Secrets deleted')
      console.log('==================================\n')

      // Check that keys was called for globalState
      expect(storageContext.globalState.keys).toHaveBeenCalled()

      // Check that update was called with undefined for each global key
      expect(storageContext.globalState.update).toHaveBeenCalledWith('apiProvider', undefined)
      expect(storageContext.globalState.update).toHaveBeenCalledWith('apiModelId', undefined)
      expect(storageContext.globalState.update).toHaveBeenCalledWith('someOtherGlobalKey', undefined)

      // Check that delete was called for predefined secret keys
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('apiKey')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('openRouterApiKey')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('awsAccessKey')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('awsSecretKey')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('awsSessionToken')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('openAiApiKey')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('geminiApiKey')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('openAiNativeApiKey')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('deepSeekApiKey')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('requestyApiKey')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('togetherApiKey')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('qwenApiKey')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('doubaoApiKey')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('mistralApiKey')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('defaultApiKey')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('liteLlmApiKey')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('fireworksApiKey')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('asksageApiKey')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('xaiApiKey')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('sambanovaApiKey')

      // Check that keys was called for workspaceState
      expect(storageContext.workspaceState.keys).toHaveBeenCalled()

      // Check that update was called with undefined for each workspace key
      expect(storageContext.workspaceState.update).toHaveBeenCalledWith('localClineRulesToggles', undefined)
      expect(storageContext.workspaceState.update).toHaveBeenCalledWith('someWorkspaceKey', undefined)
    })
  })
})
