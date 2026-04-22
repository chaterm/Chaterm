import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { reconcileEnterprisePluginStateAfterMetadataChange, syncEnterpriseStateFromUserData, useModelConfiguration } from '../useModelConfiguration'
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
    { id: '1', name: 'claude-4-5-sonnet', checked: true, type: 'chat', apiProvider: 'anthropic' },
    { id: '2', name: 'gpt-5', checked: true, type: 'chat', apiProvider: 'openai' },
    { id: '3', name: 'claude-4-opus', checked: false, type: 'chat', apiProvider: 'anthropic' },
    { id: '4', name: 'deepseek-chat', checked: true, type: 'chat', apiProvider: 'deepseek' }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockChatAiModelValue.value = ''
    vi.stubEnv('RENDERER_DEPLOY_STATUS', '1')
    global.window = global.window || ({} as Window & typeof globalThis)
    ;(global.window as unknown as { api?: { reloadPlugins?: ReturnType<typeof vi.fn> } }).api = {
      reloadPlugins: vi.fn().mockResolvedValue(undefined)
    }
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('initModel', () => {
    it('should initialize model options from global state', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        if (key === 'apiProvider') return 'anthropic'
        if (key === 'defaultModelId') return 'claude-4-5-sonnet'
        return null
      })

      const { initModel, AgentAiModelsOptions } = useModelConfiguration()
      await initModel()

      expect(AgentAiModelsOptions.value).toHaveLength(3) // Only checked models
      expect(AgentAiModelsOptions.value[0].label).toBe('claude-4-5-sonnet')
      expect(AgentAiModelsOptions.value[1].label).toBe('deepseek-chat')
      expect(AgentAiModelsOptions.value[2].label).toBe('gpt-5')
    })

    it('should filter out unchecked models', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        if (key === 'apiProvider') return 'anthropic'
        if (key === 'defaultModelId') return 'claude-4-5-sonnet'
        return null
      })

      const { initModel, AgentAiModelsOptions } = useModelConfiguration()
      await initModel()

      const hasUncheckedModel = AgentAiModelsOptions.value.some((option) => option.label === 'claude-4-opus')
      expect(hasUncheckedModel).toBe(false)
    })

    it('should use provider-specific model when current model is not set', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        if (key === 'apiProvider') return 'anthropic'
        if (key === 'anthropicModelId') return 'claude-4-5-sonnet'
        return null
      })

      const { initModel } = useModelConfiguration()
      await initModel()

      expect(stateModule.getGlobalState).toHaveBeenCalledWith('anthropicModelId')
    })

    it('should use provider-specific model key based on apiProvider', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        if (key === 'apiProvider') return 'openai'
        if (key === 'openAiModelId') return 'gpt-5'
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
        if (key === 'apiModelId') return 'claude-4-5-sonnet'
        return null
      })

      const { initModel } = useModelConfiguration()
      await initModel()

      expect(stateModule.getGlobalState).toHaveBeenCalledWith('apiModelId')
    })

    it('should sort thinking models first', async () => {
      const modelsWithThinking = [
        { id: '1', name: 'claude-4-5-sonnet', checked: true, type: 'chat', apiProvider: 'anthropic' },
        { id: '2', name: 'gpt-5-Thinking', checked: true, type: 'chat', apiProvider: 'openai' },
        { id: '3', name: 'claude-4-opus-Thinking', checked: true, type: 'chat', apiProvider: 'anthropic' }
      ]

      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return modelsWithThinking
        if (key === 'apiProvider') return 'anthropic'
        if (key === 'defaultModelId') return 'claude-4-5-sonnet'
        return null
      })

      const { initModel, AgentAiModelsOptions } = useModelConfiguration()
      await initModel()

      // Thinking models should come first
      expect(AgentAiModelsOptions.value[0].label).toBe('claude-4-opus-Thinking')
      expect(AgentAiModelsOptions.value[1].label).toBe('gpt-5-Thinking')
      expect(AgentAiModelsOptions.value[2].label).toBe('claude-4-5-sonnet')
    })

    it('should prefer current tab model when it is still available', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        return null
      })

      mockChatAiModelValue.value = 'gpt-5'

      const { initModel } = useModelConfiguration()
      await initModel()

      expect(mockChatAiModelValue.value).toBe('gpt-5')
      expect(stateModule.getGlobalState).not.toHaveBeenCalledWith('apiProvider')
      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('apiProvider', 'openai')
      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('openAiModelId', 'gpt-5')
    })

    it('should fallback to first available model when stored default model is not available', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        if (key === 'apiProvider') return 'default'
        if (key === 'defaultModelId') return 'invalid-model'
        return null
      })

      const { initModel } = useModelConfiguration()
      await initModel()

      expect(mockChatAiModelValue.value).toBe('claude-4-5-sonnet')
      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('apiProvider', 'anthropic')
      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('anthropicModelId', 'claude-4-5-sonnet')
    })

    it('should not change model when there are no available models', async () => {
      const noAvailableModels = [{ id: '1', name: 'claude-4-5-sonnet', checked: false, type: 'chat', apiProvider: 'anthropic' }]

      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return noAvailableModels
        return null
      })

      const { initModel } = useModelConfiguration()
      await initModel()

      expect(mockChatAiModelValue.value).toBe('')
      expect(stateModule.updateGlobalState).not.toHaveBeenCalled()
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
          models: ['claude-4-5-sonnet', 'gpt-5'],
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

    it('should not block model options update on gateway model info fetch', async () => {
      const originalFetch = global.fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [{ model_name: 'gpt-5', model_info: { max_input_tokens: 128000, max_output_tokens: 8192 } }]
        })
      } as any)

      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return []
        return null
      })
      vi.mocked(getUser).mockResolvedValue({
        data: {
          models: ['gpt-5'],
          llmGatewayAddr: 'https://api.example.com',
          key: 'server-key'
        }
      } as any)

      const { initModelOptions } = useModelConfiguration()
      await initModelOptions()
      await new Promise((resolve) => setTimeout(resolve, 0))

      const calls = vi.mocked(stateModule.updateGlobalState).mock.calls
      const modelOptionsIdx = calls.findIndex((call) => call[0] === 'modelOptions')
      const modelInfoIdx = calls.findIndex((call) => call[0] === 'defaultModelInfoMap')
      expect(modelOptionsIdx).toBeGreaterThan(-1)
      expect(modelInfoIdx).toBeGreaterThan(-1)
      expect(modelOptionsIdx).toBeLessThan(modelInfoIdx)

      global.fetch = originalFetch
    })
  })

  describe('handleChatAiModelChange', () => {
    it('should update apiProvider when model changes', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        return null
      })

      mockChatAiModelValue.value = 'gpt-5'
      const { handleChatAiModelChange } = useModelConfiguration()

      await handleChatAiModelChange()

      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('apiProvider', 'openai')
    })

    it('should update correct provider model key', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return mockModelOptions
        return null
      })

      mockChatAiModelValue.value = 'gpt-5'
      const { handleChatAiModelChange } = useModelConfiguration()

      await handleChatAiModelChange()

      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('openAiModelId', 'gpt-5')
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
        if (key === 'anthropicModelId') return 'claude-4-5-sonnet'
        if (key === 'modelOptions') return [{ id: '1', name: 'test', checked: true, type: 'standard', apiProvider: 'default' }]
        return null
      })

      vi.mocked(stateModule.getSecret).mockImplementation(async (key) => {
        if (key === 'anthropicApiKey') return 'test-key'
        return undefined
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
    it('clears defaultModelInfoMap when gateway credentials are unavailable', async () => {
      localStorage.removeItem('login-skipped')

      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return []
        return null
      })

      vi.mocked(getUser).mockResolvedValue({
        data: {
          models: [],
          subscriptionModels: [],
          llmGatewayAddr: '',
          key: ''
        }
      } as any)

      const { refreshModelOptions } = useModelConfiguration()
      await refreshModelOptions()

      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('defaultModelInfoMap', {})
    })

    it('merges server models into existing options and preserves custom + checked state', async () => {
      localStorage.removeItem('login-skipped')

      const existing = [
        { id: 's1', name: 'gpt-5', checked: false, type: 'standard', apiProvider: 'default' },
        { id: 'c1', name: 'custom-x', checked: true, type: 'custom', apiProvider: 'openai' },
        { id: 's2', name: 'old-standard', checked: true, type: 'standard', apiProvider: 'default' }
      ]

      // Expected order: retained standard, new standard, then custom
      const mergedOptions = [
        { id: 's1', name: 'gpt-5', checked: false, type: 'standard', apiProvider: 'default' },
        { id: 'claude-4', name: 'claude-4', checked: true, type: 'standard', apiProvider: 'default' },
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
          models: ['gpt-5', 'claude-4'],
          llmGatewayAddr: 'https://api.example.com',
          key: 'server-key'
        }
      } as any)

      const { refreshModelOptions, AgentAiModelsOptions } = useModelConfiguration()
      await refreshModelOptions()

      // Verify order: retained standard, new standard, then custom
      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('modelOptions', [
        { id: 's1', name: 'gpt-5', checked: false, type: 'standard', apiProvider: 'default' },
        { id: 'claude-4', name: 'claude-4', checked: true, type: 'standard', apiProvider: 'default' },
        { id: 'c1', name: 'custom-x', checked: true, type: 'custom', apiProvider: 'openai' }
      ])
      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('defaultBaseUrl', 'https://api.example.com')
      expect(stateModule.storeSecret).toHaveBeenCalledWith('defaultApiKey', 'server-key')
      // Verify UI options are updated (initModel was called)
      expect(AgentAiModelsOptions.value.map((o) => o.label)).toEqual(['claude-4', 'custom-x'])
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

      const existing = [{ id: 's1', name: 'gpt-5', checked: true, type: 'standard', apiProvider: 'default' }]

      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return existing
        return null
      })

      vi.mocked(getUser).mockResolvedValue({
        data: {
          models: [],
          subscriptionModels: [],
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

    it('populates allLockedNames and lockedModels when server returns subscriptionModels', async () => {
      localStorage.removeItem('login-skipped')

      const existing = [
        { id: 's1', name: 'gpt-5', checked: true, type: 'standard', apiProvider: 'default' },
        { id: 's2', name: 'locked-one', checked: true, type: 'standard', apiProvider: 'default' }
      ]

      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return existing
        if (key === 'apiProvider') return 'default'
        if (key === 'defaultModelId') return 'gpt-5'
        return null
      })

      vi.mocked(getUser).mockResolvedValue({
        data: {
          models: ['gpt-5'],
          subscriptionModels: ['gpt-5', 'locked-one'],
          budgetResetAt: '2025-04-01',
          subscription: 'pro',
          llmGatewayAddr: 'https://api.example.com',
          key: 'server-key'
        }
      } as any)

      const { refreshModelOptions, lockedModels, AgentAiModelsOptions } = useModelConfiguration()
      await refreshModelOptions()

      expect(lockedModels.value).toContain('locked-one')
      expect(lockedModels.value).not.toContain('gpt-5')
      expect(stateModule.updateGlobalState).toHaveBeenCalledWith(
        'modelOptions',
        expect.arrayContaining([
          expect.objectContaining({ name: 'gpt-5', type: 'standard' }),
          expect.objectContaining({ name: 'locked-one', type: 'standard' })
        ])
      )
      expect(AgentAiModelsOptions.value.map((o) => o.value)).not.toContain('locked-one')
      expect(AgentAiModelsOptions.value.map((o) => o.value)).toContain('gpt-5')
    })
  })

  describe('enterprise deploy gate', () => {
    it('clears enterprise state and skips plugin reload when deploy status is disabled', async () => {
      vi.stubEnv('RENDERER_DEPLOY_STATUS', '0')

      const state: Record<string, unknown> = {
        modelOptions: [
          { id: 'enterprise:openai:gpt-5', name: 'gpt-5', checked: true, type: 'standard', apiProvider: 'openai' },
          { id: 'custom-1', name: 'custom-model', checked: true, type: 'custom', apiProvider: 'openai' }
        ],
        enterpriseModelPluginActive: true,
        openAiBaseUrl: 'https://api.openai.com/v1',
        openAiModelId: 'gpt-5',
        liteLlmBaseUrl: 'https://litellm.example.com',
        awsRegion: 'us-east-1'
      }

      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => state[key] ?? null)
      vi.mocked(stateModule.updateGlobalState).mockImplementation(async (key, value) => {
        state[key] = value
      })

      const enterpriseConfigs = await syncEnterpriseStateFromUserData(
        {
          enterpriseModelConfigs: [{ modelName: 'gpt-5', provider: 'openai' }],
          enterpriseModelConfigVersion: 'v1'
        },
        { reloadPlugins: true }
      )

      expect(enterpriseConfigs).toEqual([])
      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('enterpriseModelConfigs', [])
      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('enterpriseModelConfigVersion', '')
      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('enterpriseModelPluginActive', false)
      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('modelOptions', [
        { id: 'custom-1', name: 'custom-model', checked: true, type: 'custom', apiProvider: 'openai' }
      ])
      expect(state.openAiBaseUrl).toBe('https://api.openai.com/v1')
      expect(state.openAiModelId).toBe('gpt-5')
      expect(state.liteLlmBaseUrl).toBe('https://litellm.example.com')
      expect(state.awsRegion).toBe('us-east-1')
      expect(stateModule.updateGlobalState).not.toHaveBeenCalledWith('openAiBaseUrl', undefined)
      expect(stateModule.updateGlobalState).not.toHaveBeenCalledWith('openAiModelId', undefined)
      expect(stateModule.updateGlobalState).not.toHaveBeenCalledWith('liteLlmBaseUrl', undefined)
      expect(stateModule.updateGlobalState).not.toHaveBeenCalledWith('awsRegion', undefined)
      expect(stateModule.storeSecret).not.toHaveBeenCalledWith('openAiApiKey', undefined)
      expect((global.window as unknown as { api: { reloadPlugins: ReturnType<typeof vi.fn> } }).api.reloadPlugins).not.toHaveBeenCalled()
    })

    it('does not reload plugins repeatedly when the same enterprise signature was already resolved', async () => {
      const state: Record<string, unknown> = {
        modelOptions: [],
        enterpriseModelPluginActive: false,
        enterpriseModelPluginResolvedSignature: 'v1'
      }

      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => state[key] ?? null)
      vi.mocked(stateModule.updateGlobalState).mockImplementation(async (key, value) => {
        state[key] = value
      })

      const enterpriseConfigs = await syncEnterpriseStateFromUserData(
        {
          enterpriseModelConfigs: [{ modelName: 'gpt-5', provider: 'openai' }],
          enterpriseModelConfigVersion: 'v1'
        },
        { reloadPlugins: true }
      )

      expect(enterpriseConfigs).toEqual([{ modelName: 'gpt-5', provider: 'openai' }])
      expect((global.window as unknown as { api: { reloadPlugins: ReturnType<typeof vi.fn> } }).api.reloadPlugins).not.toHaveBeenCalled()
    })

    it('cleans enterprise model options after plugin metadata change when plugin is no longer active', async () => {
      const state: Record<string, unknown> = {
        enterpriseModelConfigs: [{ modelName: 'gpt-5', provider: 'openai' }],
        enterpriseModelConfigVersion: 'v1',
        modelOptions: [
          { id: 'enterprise:openai:gpt-5', name: 'gpt-5', checked: true, type: 'standard', apiProvider: 'openai' },
          { id: 'custom-1', name: 'custom-model', checked: true, type: 'custom', apiProvider: 'openai' }
        ],
        enterpriseModelPluginActive: false
      }

      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => state[key] ?? null)
      vi.mocked(stateModule.updateGlobalState).mockImplementation(async (key, value) => {
        state[key] = value
      })

      await reconcileEnterprisePluginStateAfterMetadataChange()

      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('enterpriseModelPluginActive', false)
      expect(stateModule.updateGlobalState).toHaveBeenCalledWith('modelOptions', [
        { id: 'custom-1', name: 'custom-model', checked: true, type: 'custom', apiProvider: 'openai' }
      ])
      expect(stateModule.storeSecret).toHaveBeenCalledWith('openAiApiKey', undefined)
    })
  })

  describe('locked models (subscription overage)', () => {
    it('initModel excludes locked models from AgentAiModelsOptions and only shows checked locked in lockedModels', async () => {
      vi.mocked(getUser).mockResolvedValue({
        data: {
          models: ['gpt-5'],
          subscriptionModels: ['gpt-5', 'locked-a', 'locked-b']
        }
      } as any)

      const modelOptionsWithLocked = [
        { id: '1', name: 'gpt-5', checked: true, type: 'standard', apiProvider: 'default' },
        { id: '2', name: 'locked-a', checked: true, type: 'standard', apiProvider: 'default' },
        { id: '3', name: 'locked-b', checked: false, type: 'standard', apiProvider: 'default' }
      ]

      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return modelOptionsWithLocked
        if (key === 'apiProvider') return 'default'
        if (key === 'defaultModelId') return 'gpt-5'
        return null
      })

      const { initModel, refreshModelOptions, AgentAiModelsOptions, lockedModels } = useModelConfiguration()
      // Populate allLockedNames via refreshModelOptions so initModel uses correct locked set (avoids shared global state from prior tests)
      await refreshModelOptions()
      await initModel()

      expect(AgentAiModelsOptions.value.map((o) => o.value)).toEqual(['gpt-5'])
      expect(AgentAiModelsOptions.value.map((o) => o.value)).not.toContain('locked-a')
      expect(lockedModels.value).toContain('locked-a')
      expect(lockedModels.value).not.toContain('locked-b')
    })

    it('showLockedModelUpgradeTag is true when subscription is free or lite', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async () => null)
      vi.mocked(getUser).mockResolvedValue({
        data: { models: [], subscriptionModels: [], subscription: 'free' }
      } as any)

      const { refreshModelOptions, showLockedModelUpgradeTag } = useModelConfiguration()
      await refreshModelOptions()

      expect(showLockedModelUpgradeTag.value).toBe(true)
    })

    it('showLockedModelUpgradeTag is false when subscription is pro', async () => {
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return []
        return null
      })
      vi.mocked(getUser).mockResolvedValue({
        data: { models: ['gpt-5'], subscriptionModels: ['gpt-5'], subscription: 'pro' }
      } as any)

      const { refreshModelOptions, showLockedModelUpgradeTag } = useModelConfiguration()
      await refreshModelOptions()

      expect(showLockedModelUpgradeTag.value).toBe(false)
    })

    it('hasAvailableModels is false when only locked models are checked', async () => {
      vi.mocked(getUser).mockResolvedValue({
        data: { models: [], subscriptionModels: ['locked-only'] }
      } as any)
      const modelOptionsOnlyLocked = [{ id: '1', name: 'locked-only', checked: true, type: 'standard', apiProvider: 'default' }]
      vi.mocked(stateModule.getGlobalState).mockImplementation(async (key) => {
        if (key === 'modelOptions') return modelOptionsOnlyLocked
        return null
      })

      const { initModel, hasAvailableModels, AgentAiModelsOptions } = useModelConfiguration()
      await initModel()

      expect(AgentAiModelsOptions.value).toHaveLength(0)
      expect(hasAvailableModels.value).toBe(false)
    })
  })
})
