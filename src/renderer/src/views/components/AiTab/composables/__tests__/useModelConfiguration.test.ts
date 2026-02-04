import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useModelConfiguration } from '../useModelConfiguration'
import * as stateModule from '@renderer/agent/storage/state'
import { getUser } from '@api/user/user'
import { ref } from 'vue'

// Create a shared mock ref that can be updated in tests
const mockChatAiModelValue = ref('')

// Mock dependencies
vi.mock('@renderer/agent/storage/state', () => ({
  getGlobalState: vi.fn(),
  updateGlobalState: vi.fn(),
  storeSecret: vi.fn(),
  getSecret: vi.fn()
}))

vi.mock('@api/user/user', () => ({
  getUser: vi.fn()
}))

vi.mock('../useTabManagement', () => ({
  focusChatInput: vi.fn()
}))

vi.mock('../useSessionState', () => ({
  useSessionState: () => ({
    chatAiModelValue: mockChatAiModelValue
  })
}))

describe('useModelConfiguration', () => {
  const mockModelOptions = [
    { id: '1', name: 'claude-3-5-sonnet', checked: true, type: 'chat', apiProvider: 'anthropic' },
    { id: '2', name: 'gpt-4', checked: true, type: 'chat', apiProvider: 'openai' },
    { id: '3', name: 'claude-3-opus', checked: false, type: 'chat', apiProvider: 'anthropic' },
    { id: '4', name: 'deepseek-chat', checked: true, type: 'chat', apiProvider: 'deepseek' }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockChatAiModelValue.value = ''
  })

  describe('initModel', () => {
    it('should initialize model options from global state', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        if (key === 'apiProvider') return 'anthropic'
        if (key === 'defaultModelId') return 'claude-3-5-sonnet'
        return null
      })

      const { initModel, AgentAiModelsOptions } = useModelConfiguration()
      await initModel()

      expect(AgentAiModelsOptions.value).toHaveLength(3) // Only checked models
      expect(AgentAiModelsOptions.value[0].label).toBe('claude-3-5-sonnet')
      expect(AgentAiModelsOptions.value[1].label).toBe('deepseek-chat')
      expect(AgentAiModelsOptions.value[2].label).toBe('gpt-4')
    })

    it('should filter out unchecked models', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        if (key === 'apiProvider') return 'anthropic'
        if (key === 'defaultModelId') return 'claude-3-5-sonnet'
        return null
      })

      const { initModel, AgentAiModelsOptions } = useModelConfiguration()
      await initModel()

      const hasUncheckedModel = AgentAiModelsOptions.value.some((option) => option.label === 'claude-3-opus')
      expect(hasUncheckedModel).toBe(false)
    })

    it('should use default model when current model is not set', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        if (key === 'apiProvider') return 'anthropic'
        if (key === 'defaultModelId') return 'claude-3-5-sonnet'
        return null
      })

      const { initModel } = useModelConfiguration()
      await initModel()

      expect(stateModule.getGlobalState).toHaveBeenCalledWith('defaultModelId')
    })

    it('should use provider-specific model key based on apiProvider', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        if (key === 'apiProvider') return 'openai'
        if (key === 'openAiModelId') return 'gpt-4'
        return null
      })

      const { initModel } = useModelConfiguration()
      await initModel()

      expect(stateModule.getGlobalState).toHaveBeenCalledWith('openAiModelId')
    })

    it('should handle bedrock provider model key', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        if (key === 'apiProvider') return 'bedrock'
        if (key === 'apiModelId') return 'claude-3-5-sonnet'
        return null
      })

      const { initModel } = useModelConfiguration()
      await initModel()

      expect(stateModule.getGlobalState).toHaveBeenCalledWith('apiModelId')
    })

    it('should sort thinking models first', async () => {
      const modelsWithThinking = [
        { id: '1', name: 'claude-3-5-sonnet', checked: true, type: 'chat', apiProvider: 'anthropic' },
        { id: '2', name: 'gpt-4-Thinking', checked: true, type: 'chat', apiProvider: 'openai' },
        { id: '3', name: 'claude-3-opus-Thinking', checked: true, type: 'chat', apiProvider: 'anthropic' }
      ]

      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return modelsWithThinking
        if (key === 'apiProvider') return 'anthropic'
        if (key === 'defaultModelId') return 'claude-3-5-sonnet'
        return null
      })

      const { initModel, AgentAiModelsOptions } = useModelConfiguration()
      await initModel()

      // Thinking models should come first
      expect(AgentAiModelsOptions.value[0].label).toBe('claude-3-opus-Thinking')
      expect(AgentAiModelsOptions.value[1].label).toBe('gpt-4-Thinking')
      expect(AgentAiModelsOptions.value[2].label).toBe('claude-3-5-sonnet')
    })
  })

  describe('initModelOptions', () => {
    it('should skip initialization when model options already exist', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        return null
      })

      const { initModelOptions } = useModelConfiguration()
      await initModelOptions()

      // Should return early and not call getUser since modelOptions already exists
      expect(stateModule.getGlobalState).toHaveBeenCalledWith('modelOptions')
    })

    it('should fetch and save model options when none exist', async () => {
      const mockGetUser = vi.fn().mockResolvedValue({
        data: {
          models: ['claude-3-5-sonnet', 'gpt-4'],
          llmGatewayAddr: 'https://api.example.com',
          key: 'test-key'
        }
      })

      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return []
        return null
      })

      // Mock getUser
      const userModule = await import('@api/user/user')
      vi.mocked(userModule.getUser).mockImplementation(mockGetUser)

      const { initModelOptions } = useModelConfiguration()
      await initModelOptions()

      // Should fetch models from API
      expect(mockGetUser).toHaveBeenCalled()
      // Should save fetched models
      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('modelOptions', expect.any(Array))
      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('defaultBaseUrl', 'https://api.example.com')
      expect(stateModule.storeSecret).toHaveBeenCalledWith('defaultApiKey', 'test-key')
    })
  })

  describe('handleChatAiModelChange', () => {
    it('should update apiProvider when model changes', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        return null
      })

      mockChatAiModelValue.value = 'gpt-4'
      const { handleChatAiModelChange } = useModelConfiguration()

      await handleChatAiModelChange()

      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('apiProvider', 'openai')
    })

    it('should update correct provider model key', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        return null
      })

      mockChatAiModelValue.value = 'gpt-4'
      const { handleChatAiModelChange } = useModelConfiguration()

      await handleChatAiModelChange()

      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('openAiModelId', 'gpt-4')
    })

    it('should handle deepseek provider model key', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        return null
      })

      mockChatAiModelValue.value = 'deepseek-chat'
      const { handleChatAiModelChange } = useModelConfiguration()

      await handleChatAiModelChange()

      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('apiModelId', 'deepseek-chat')
    })
  })

  describe('checkModelConfig', () => {
    it('should validate model configuration', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'apiProvider') return 'anthropic'
        if (key === 'defaultModelId') return 'claude-3-5-sonnet'
        if (key === 'modelOptions') return [{ id: '1', name: 'test', checked: true, type: 'standard', apiProvider: 'default' }]
        return null
      })

      const { checkModelConfig } = useModelConfiguration()
      const result = await checkModelConfig()

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
    })

    it('should show notification when model config is invalid', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return []
        return null
      })

      const { checkModelConfig } = useModelConfiguration()
      const result = await checkModelConfig()

      // Verify that the function handles invalid config gracefully
      expect(result).toBeDefined()
      expect(result.success).toBe(false)
    })
  })

  describe('refreshModelOptions', () => {
    it('merges server models into existing options and preserves custom + checked state', async () => {
      localStorage.removeItem('login-skipped')

      const existing = [
        { id: 's1', name: 'gpt-4', checked: false, type: 'standard', apiProvider: 'default' },
        { id: 'c1', name: 'custom-x', checked: true, type: 'custom', apiProvider: 'openai' },
        { id: 's2', name: 'old-standard', checked: true, type: 'standard', apiProvider: 'default' }
      ]

      // Expected order: retained standard, new standard, then custom
      const mergedOptions = [
        { id: 's1', name: 'gpt-4', checked: false, type: 'standard', apiProvider: 'default' },
        { id: 'claude-3', name: 'claude-3', checked: true, type: 'standard', apiProvider: 'default' },
        { id: 'c1', name: 'custom-x', checked: true, type: 'custom', apiProvider: 'openai' }
      ]

      let callCount = 0
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') {
          // First call returns existing, subsequent calls return merged
          callCount++
          return callCount === 1 ? existing : mergedOptions
        }
        if (key === 'apiProvider') return 'default'
        if (key === 'defaultModelId') return ''
        return null
      })

      vi.mocked(getUser).mockResolvedValue({
        data: {
          models: ['gpt-4', 'claude-3'],
          llmGatewayAddr: 'https://api.example.com',
          key: 'server-key'
        }
      } as any)

      const { refreshModelOptions, AgentAiModelsOptions } = useModelConfiguration()
      await refreshModelOptions()

      // Verify order: retained standard, new standard, then custom
      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('modelOptions', [
        { id: 's1', name: 'gpt-4', checked: false, type: 'standard', apiProvider: 'default' },
        { id: 'claude-3', name: 'claude-3', checked: true, type: 'standard', apiProvider: 'default' },
        { id: 'c1', name: 'custom-x', checked: true, type: 'custom', apiProvider: 'openai' }
      ])
      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('defaultBaseUrl', 'https://api.example.com')
      expect(stateModule.storeSecret).toHaveBeenCalledWith('defaultApiKey', 'server-key')
      // Verify UI options are updated (initModel was called)
      expect(AgentAiModelsOptions.value.map((o) => o.label)).toEqual(['claude-3', 'custom-x'])
    })

    it('does not update modelOptions when request fails', async () => {
      localStorage.removeItem('login-skipped')

      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return []
        return null
      })

      vi.mocked(getUser).mockRejectedValue(new Error('network'))

      const { refreshModelOptions } = useModelConfiguration()
      await refreshModelOptions()

      expect(stateModule.updateGlobalState).not.toHaveBeenCalledWith('modelOptions', expect.anything())
    })

    it('does not update modelOptions when server returns empty list', async () => {
      localStorage.removeItem('login-skipped')

      const existing = [{ id: 's1', name: 'gpt-4', checked: true, type: 'standard', apiProvider: 'default' }]

      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return existing
        return null
      })

      vi.mocked(getUser).mockResolvedValue({
        data: {
          models: [],
          llmGatewayAddr: 'https://api.example.com',
          key: 'server-key'
        }
      } as any)

      const { refreshModelOptions } = useModelConfiguration()
      await refreshModelOptions()

      // Should not update modelOptions when server returns empty list
      expect(stateModule.updateGlobalState).not.toHaveBeenCalledWith('modelOptions', expect.anything())
      // But should still update base URL and API key
      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('defaultBaseUrl', 'https://api.example.com')
      expect(stateModule.storeSecret).toHaveBeenCalledWith('defaultApiKey', 'server-key')
    })
  })
})
