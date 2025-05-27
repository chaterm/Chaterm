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
import { DEFAULT_CHAT_SETTINGS } from '../../shared/ChatSettings'
import { ApiProvider } from '../../shared/api'
import { GlobalStateKey } from '../state-keys'

// Mock storageContext
jest.mock('../storage-context', () => ({
  storageContext: {
    globalState: {
      update: jest.fn(),
      get: jest.fn(),
      keys: jest.fn()
    },
    secrets: {
      store: jest.fn(),
      get: jest.fn(),
      delete: jest.fn()
    },
    workspaceState: {
      update: jest.fn(),
      get: jest.fn(),
      keys: jest.fn()
    }
  }
}))

// 辅助函数：打印变更前后的数据
const logDataChange = (operation: string, key: string, beforeValue: any, afterValue: any) => {
  console.log(`\n=== ${operation} 操作数据变更 ===`)
  console.log(`键: ${key}`)
  console.log(`变更前:`, beforeValue)
  console.log(`变更后:`, afterValue)
  console.log(`===========================\n`)
}

describe('State Management', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks()
  })

  describe('Global State', () => {
    test('updateGlobalState should call storageContext.globalState.update', async () => {
      // 获取变更前的数据
      const beforeValue = 'oldProvideValue'
      ;(storageContext.globalState.get as jest.Mock).mockResolvedValueOnce(beforeValue)
      const actualBeforeValue = await getGlobalState('apiProvider')

      // 执行变更操作
      const newValue = 'testProviderValue'
      await updateGlobalState('apiProvider', newValue)

      // 模拟变更后的数据
      ;(storageContext.globalState.get as jest.Mock).mockResolvedValueOnce(newValue)
      const actualAfterValue = await getGlobalState('apiProvider')

      // 打印前后数据
      logDataChange('updateGlobalState', 'apiProvider', actualBeforeValue, actualAfterValue)

      expect(storageContext.globalState.update).toHaveBeenCalledWith(
        'apiProvider',
        'testProviderValue'
      )
    })

    test('getGlobalState should call storageContext.globalState.get', async () => {
      ;(storageContext.globalState.get as jest.Mock).mockResolvedValueOnce('testValue')
      const value = await getGlobalState('apiProvider')
      expect(storageContext.globalState.get).toHaveBeenCalledWith('apiProvider')
      expect(value).toBe('testValue')
    })
  })

  describe('Secrets', () => {
    test('storeSecret should call storageContext.secrets.store when value is provided', async () => {
      // 获取变更前的数据
      const beforeValue = 'oldApiKey'
      ;(storageContext.secrets.get as jest.Mock).mockResolvedValueOnce(beforeValue)
      const actualBeforeValue = await getSecret('apiKey')

      // 执行变更操作
      const newValue = 'testKey'
      await storeSecret('apiKey', newValue)

      // 模拟变更后的数据
      ;(storageContext.secrets.get as jest.Mock).mockResolvedValueOnce(newValue)
      const actualAfterValue = await getSecret('apiKey')

      // 打印前后数据
      logDataChange('storeSecret', 'apiKey', actualBeforeValue, actualAfterValue)

      expect(storageContext.secrets.store).toHaveBeenCalledWith('apiKey', 'testKey')
    })

    test('storeSecret should call storageContext.secrets.delete when value is not provided', async () => {
      // 获取变更前的数据
      const beforeValue = 'existingApiKey'
      ;(storageContext.secrets.get as jest.Mock).mockResolvedValueOnce(beforeValue)
      const actualBeforeValue = await getSecret('apiKey')

      // 执行删除操作
      await storeSecret('apiKey', undefined)

      // 模拟删除后的数据
      ;(storageContext.secrets.get as jest.Mock).mockResolvedValueOnce(undefined)
      const actualAfterValue = await getSecret('apiKey')

      // 打印前后数据
      logDataChange('storeSecret (删除)', 'apiKey', actualBeforeValue, actualAfterValue)

      expect(storageContext.secrets.delete).toHaveBeenCalledWith('apiKey')
    })

    test('getSecret should call storageContext.secrets.get', async () => {
      ;(storageContext.secrets.get as jest.Mock).mockResolvedValueOnce('secretValue')
      const value = await getSecret('apiKey')
      expect(storageContext.secrets.get).toHaveBeenCalledWith('apiKey')
      expect(value).toBe('secretValue')
    })
  })

  describe('Workspace State', () => {
    test('updateWorkspaceState should call storageContext.workspaceState.update', async () => {
      // 获取变更前的数据
      const beforeValue = 'oldValue'
      ;(storageContext.workspaceState.get as jest.Mock).mockResolvedValueOnce(beforeValue)
      const actualBeforeValue = await getWorkspaceState('testKey')

      // 执行变更操作
      const newValue = 'testValue'
      await updateWorkspaceState('testKey', newValue)

      // 模拟变更后的数据
      ;(storageContext.workspaceState.get as jest.Mock).mockResolvedValueOnce(newValue)
      const actualAfterValue = await getWorkspaceState('testKey')

      // 打印前后数据
      logDataChange('updateWorkspaceState', 'testKey', actualBeforeValue, actualAfterValue)

      expect(storageContext.workspaceState.update).toHaveBeenCalledWith('testKey', 'testValue')
    })

    test('getWorkspaceState should call storageContext.workspaceState.get', async () => {
      ;(storageContext.workspaceState.get as jest.Mock).mockResolvedValueOnce('wsValue')
      const value = await getWorkspaceState('testKey')
      expect(storageContext.workspaceState.get).toHaveBeenCalledWith('testKey')
      expect(value).toBe('wsValue')
    })
  })

  describe('getAllExtensionState', () => {
    test('should retrieve all relevant states and derive apiProvider correctly', async () => {
      // Mock the return values for getGlobalState and getSecret
      ;(storageContext.globalState.get as jest.Mock).mockImplementation(async (key) => {
        if (key === 'apiProvider') return undefined // Simulate new user or legacy user
        if (key === 'apiModelId') return 'claude-2'
        if (key === 'chatSettings') return DEFAULT_CHAT_SETTINGS
        // ... mock other necessary global states
        return undefined
      })
      ;(storageContext.secrets.get as jest.Mock).mockImplementation(async (key) => {
        if (key === 'apiKey') return 'some-api-key' // Simulate apiKey exists
        // ... mock other necessary secrets
        return undefined
      })
      ;(storageContext.workspaceState.get as jest.Mock).mockResolvedValue(undefined)

      const state = await getAllExtensionState()

      expect(storageContext.globalState.get).toHaveBeenCalledWith('apiProvider')
      expect(storageContext.secrets.get).toHaveBeenCalledWith('apiKey')
      expect(state.apiConfiguration.apiProvider).toBe('anthropic') // Derived correctly
      expect(state.apiConfiguration.apiModelId).toBe('claude-2')
      expect(state.chatSettings).toEqual(DEFAULT_CHAT_SETTINGS)
      // ... add more assertions for other parts of the state
    })

    test('should default to openrouter if apiProvider and apiKey are not present', async () => {
      ;(storageContext.globalState.get as jest.Mock).mockResolvedValue(undefined) // No stored apiProvider
      ;(storageContext.secrets.get as jest.Mock).mockResolvedValue(undefined) // No stored apiKey
      ;(storageContext.workspaceState.get as jest.Mock).mockResolvedValue(undefined)

      const state = await getAllExtensionState()
      expect(state.apiConfiguration.apiProvider).toBe('openrouter')
    })
  })

  describe('updateApiConfiguration', () => {
    test('should update relevant global states and secrets', async () => {
      // 获取变更前的完整状态
      console.log('\n=== updateApiConfiguration 操作开始 ===')
      const beforeState = await getAllExtensionState()
      console.log('配置变更前的状态:', JSON.stringify(beforeState.apiConfiguration, null, 2))

      const newConfig: any = {
        apiProvider: 'anthropic' as ApiProvider,
        apiModelId: 'claude-3',
        apiKey: 'new-anthropic-key',
        baseUrl: 'https://api.anthropic.com'
        // ... other config fields
      }

      // 执行变更操作
      await updateApiConfiguration(newConfig)

      // 模拟变更后的状态
      ;(storageContext.globalState.get as jest.Mock).mockImplementation(async (key) => {
        if (key === 'apiProvider') return 'anthropic'
        if (key === 'apiModelId') return 'claude-3'
        return undefined
      })
      ;(storageContext.secrets.get as jest.Mock).mockImplementation(async (key) => {
        if (key === 'apiKey') return 'new-anthropic-key'
        return undefined
      })

      const afterState = await getAllExtensionState()
      console.log('配置变更后的状态:', JSON.stringify(afterState.apiConfiguration, null, 2))
      console.log('===================================\n')

      expect(storageContext.globalState.update).toHaveBeenCalledWith('apiProvider', 'anthropic')
      expect(storageContext.globalState.update).toHaveBeenCalledWith('apiModelId', 'claude-3')
      expect(storageContext.secrets.store).toHaveBeenCalledWith('apiKey', 'new-anthropic-key')

      // Example for OpenAI specific fields being cleared/set if provider changes
      console.log('\n=== 切换到 OpenAI 配置 ===')
      const openAIConfig = {
        ...newConfig,
        apiProvider: 'openai',
        openAiApiKey: 'new-openai-key',
        openAiBaseUrl: 'new-url'
      }
      await updateApiConfiguration(openAIConfig)
      console.log('切换到 OpenAI 配置:', JSON.stringify(openAIConfig, null, 2))
      console.log('=========================\n')

      expect(storageContext.secrets.store).toHaveBeenCalledWith('openAiApiKey', 'new-openai-key')
      expect(storageContext.globalState.update).toHaveBeenCalledWith('openAiBaseUrl', 'new-url')
    })
  })

  describe('resetExtensionState', () => {
    test('should call keys and update with undefined for globalState, delete for secrets, and keys for workspaceState', async () => {
      // 获取重置前的状态
      console.log('\n=== resetExtensionState 操作开始 ===')

      // Mock keys to return a list of keys that would be reset
      const globalKeys = ['apiProvider', 'apiModelId', 'someOtherGlobalKey']
      const workspaceKeys = ['localClineRulesToggles', 'someWorkspaceKey']

      ;(storageContext.globalState.keys as jest.Mock).mockResolvedValue(globalKeys)
      ;(storageContext.workspaceState.keys as jest.Mock).mockResolvedValue(workspaceKeys)

      // 模拟重置前的数据
      ;(storageContext.globalState.get as jest.Mock).mockImplementation(async (key) => {
        const mockData: any = {
          apiProvider: 'anthropic',
          apiModelId: 'claude-3',
          someOtherGlobalKey: 'someValue'
        }
        return mockData[key]
      })
      ;(storageContext.workspaceState.get as jest.Mock).mockImplementation(async (key) => {
        const mockData: any = {
          localClineRulesToggles: { rule1: true, rule2: false },
          someWorkspaceKey: 'workspaceValue'
        }
        return mockData[key]
      })

      // 记录重置前的所有数据
      const beforeGlobalData: any = {}
      const beforeWorkspaceData: any = {}

      for (const key of globalKeys) {
        beforeGlobalData[key] = await getGlobalState(key as GlobalStateKey)
      }
      for (const key of workspaceKeys) {
        beforeWorkspaceData[key] = await getWorkspaceState(key)
      }

      console.log('重置前 Global State:', JSON.stringify(beforeGlobalData, null, 2))
      console.log('重置前 Workspace State:', JSON.stringify(beforeWorkspaceData, null, 2))

      // 执行重置操作
      await resetExtensionState()

      // 模拟重置后的数据（全部为undefined）
      ;(storageContext.globalState.get as jest.Mock).mockResolvedValue(undefined)
      ;(storageContext.workspaceState.get as jest.Mock).mockResolvedValue(undefined)

      const afterGlobalData: any = {}
      const afterWorkspaceData: any = {}

      for (const key of globalKeys) {
        afterGlobalData[key] = await getGlobalState(key as GlobalStateKey)
      }
      for (const key of workspaceKeys) {
        afterWorkspaceData[key] = await getWorkspaceState(key)
      }

      console.log('重置后 Global State:', JSON.stringify(afterGlobalData, null, 2))
      console.log('重置后 Workspace State:', JSON.stringify(afterWorkspaceData, null, 2))
      console.log('所有 Secrets 已删除')
      console.log('==================================\n')

      // Check that keys was called for globalState
      expect(storageContext.globalState.keys).toHaveBeenCalled()

      // Check that update was called with undefined for each global key
      expect(storageContext.globalState.update).toHaveBeenCalledWith('apiProvider', undefined)
      expect(storageContext.globalState.update).toHaveBeenCalledWith('apiModelId', undefined)
      expect(storageContext.globalState.update).toHaveBeenCalledWith(
        'someOtherGlobalKey',
        undefined
      )

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
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('clineApiKey')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('liteLlmApiKey')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('fireworksApiKey')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('asksageApiKey')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('xaiApiKey')
      expect(storageContext.secrets.delete).toHaveBeenCalledWith('sambanovaApiKey')

      // Check that keys was called for workspaceState
      expect(storageContext.workspaceState.keys).toHaveBeenCalled()

      // Check that update was called with undefined for each workspace key
      expect(storageContext.workspaceState.update).toHaveBeenCalledWith(
        'localClineRulesToggles',
        undefined
      )
      expect(storageContext.workspaceState.update).toHaveBeenCalledWith(
        'someWorkspaceKey',
        undefined
      )
    })
  })
})
