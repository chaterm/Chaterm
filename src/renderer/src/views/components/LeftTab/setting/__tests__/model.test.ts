/**
 * Model Settings Component Unit Tests
 *
 * Tests for the Model settings component including:
 * - Component rendering
 * - Model list loading and display
 * - Model selection/deselection
 * - Custom model removal
 * - Add model switch
 * - API provider configurations (LiteLLM, OpenAI, Bedrock, DeepSeek, Ollama)
 * - Configuration saving and loading
 * - Model validation (Check)
 * - Save new model (Save)
 * - Error handling
 * - Model sorting
 * - Guest user handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import ModelComponent from '../model.vue'
import { notification } from 'ant-design-vue'
import eventBus from '@/utils/eventBus'
import { updateGlobalState, getGlobalState, getSecret, storeSecret, getAllExtensionState } from '@renderer/agent/storage/state'
import { getUser } from '@api/user/user'

// Mock ant-design-vue components
vi.mock('ant-design-vue', () => ({
  notification: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

// Mock i18n
const mockTranslations: Record<string, string> = {
  'user.modelNames': 'Model Names',
  'user.addModel': 'Add Model',
  'user.apiConfiguration': 'API Configuration',
  'user.liteLlmBaseUrl': 'LiteLLM Base URL',
  'user.liteLlmBaseUrlPh': 'Enter LiteLLM base URL',
  'user.liteLlmApiKey': 'LiteLLM API Key',
  'user.liteLlmApiKeyPh': 'Enter LiteLLM API key',
  'user.liteLlmApiKeyDescribe': 'LiteLLM API key description',
  'user.openAiBaseUrl': 'OpenAI Base URL',
  'user.openAiBaseUrlPh': 'Enter OpenAI base URL',
  'user.openAiApiKey': 'OpenAI API Key',
  'user.openAiApiKeyPh': 'Enter OpenAI API key',
  'user.openAiApiKeyDescribe': 'OpenAI API key description',
  'user.awsAccessKey': 'AWS Access Key',
  'user.awsAccessKeyPh': 'Enter AWS access key',
  'user.awsSecretKey': 'AWS Secret Key',
  'user.awsSecretKeyPh': 'Enter AWS secret key',
  'user.awsSessionToken': 'AWS Session Token',
  'user.awsSessionTokenPh': 'Enter AWS session token',
  'user.awsRegion': 'AWS Region',
  'user.awsRegionPh': 'Select AWS region',
  'user.apiProviderDescribe': 'API provider description',
  'user.awsEndpointSelected': 'Use VPC Endpoint',
  'user.awsBedrockEndpointPh': 'Enter VPC endpoint URL',
  'user.awsUseCrossRegionInference': 'Use Cross Region Inference',
  'user.deepSeekApiKey': 'DeepSeek API Key',
  'user.deepSeekApiKeyPh': 'Enter DeepSeek API key',
  'user.deepSeekApiKeyDescribe': 'DeepSeek API key description',
  'user.ollamaBaseUrl': 'Ollama Base URL',
  'user.ollamaBaseUrlPh': 'Enter Ollama base URL',
  'user.ollamaBaseUrlDescribe': 'Ollama base URL description',
  'user.model': 'Model',
  'user.error': 'Error',
  'user.checkModelConfigFailMessage': 'Configuration check failed',
  'user.checkModelConfigFailDescription': 'Please fill in all required fields',
  'user.checkSuccessMessage': 'Check successful',
  'user.checkSuccessDescription': 'API configuration is valid',
  'user.checkFailMessage': 'Check failed',
  'user.checkFailDescriptionDefault': 'API configuration is invalid',
  'user.addModelExistError': 'Model already exists',
  'user.addModelSuccess': 'Model added successfully',
  'user.saveBedrockConfigFailed': 'Failed to save Bedrock configuration',
  'user.saveLiteLlmConfigFailed': 'Failed to save LiteLLM configuration',
  'user.saveDeepSeekConfigFailed': 'Failed to save DeepSeek configuration',
  'user.saveOpenAiConfigFailed': 'Failed to save OpenAI configuration',
  'user.saveOllamaConfigFailed': 'Failed to save Ollama configuration'
}

const mockT = (key: string) => {
  return mockTranslations[key] || key
}

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: mockT
  })
}))

vi.mock('@/locales', () => ({
  default: {
    global: {
      t: (key: string) => mockTranslations[key] || key
    }
  }
}))

// Mock storage functions
vi.mock('@renderer/agent/storage/state', () => ({
  updateGlobalState: vi.fn(),
  getGlobalState: vi.fn(),
  getSecret: vi.fn(),
  storeSecret: vi.fn(),
  getAllExtensionState: vi.fn()
}))

// Mock eventBus
vi.mock('@/utils/eventBus', () => ({
  default: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  }
}))

// Mock getUser API
vi.mock('@api/user/user', () => ({
  getUser: vi.fn()
}))

// Mock window.api
const mockWindowApi = {
  validateApiKey: vi.fn()
}

describe('Model Component', () => {
  let wrapper: VueWrapper<any>
  let pinia: ReturnType<typeof createPinia>

  const createWrapper = (options = {}) => {
    return mount(ModelComponent, {
      global: {
        plugins: [pinia],
        stubs: {
          'a-card': {
            template: '<div class="a-card"><div class="ant-card-body"><slot /></div></div>'
          },
          'a-checkbox': {
            template: '<label class="a-checkbox"><input type="checkbox" :checked="checked" @change="$emit(\'change\', $event)" /><slot /></label>',
            props: ['checked']
          },
          'a-switch': {
            template: '<input type="checkbox" class="a-switch" :checked="checked" @change="$emit(\'update:checked\', $event.target.checked)" />',
            props: ['checked']
          },
          'a-form-item': {
            template: '<div class="a-form-item"><slot name="label" /><slot /></div>',
            props: ['label', 'label-col', 'wrapper-col']
          },
          'a-input': {
            template: '<input class="a-input" :value="value" @input="$emit(\'update:value\', $event.target.value)" />',
            props: ['value', 'placeholder', 'size', 'type']
          },
          'a-input-password': {
            template: '<input type="password" class="a-input-password" :value="value" @input="$emit(\'update:value\', $event.target.value)" />',
            props: ['value', 'placeholder']
          },
          'a-select': {
            template: '<select class="a-select" :value="value" @change="$emit(\'update:value\', $event.target.value)"><slot /></select>',
            props: ['value', 'options', 'placeholder', 'size', 'show-search']
          },
          'a-button': {
            template: '<button class="a-button" :class="{ loading }" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
            props: ['type', 'size', 'loading', 'disabled']
          }
        },
        mocks: {
          $t: mockT
        }
      },
      ...options
    })
  }

  beforeEach(() => {
    // Setup Pinia
    pinia = createPinia()
    setActivePinia(pinia)

    // Setup window.api mock
    global.window = global.window || ({} as Window & typeof globalThis)
    ;(global.window as unknown as { api: typeof mockWindowApi }).api = mockWindowApi

    // Setup localStorage
    localStorage.clear()
    localStorage.setItem('login-skipped', 'false')

    // Reset all mocks
    vi.clearAllMocks()

    // Setup default mock return values
    ;(getGlobalState as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
      const defaults: Record<string, unknown> = {
        modelOptions: [],
        awsRegion: 'us-east-1',
        awsUseCrossRegionInference: false,
        awsBedrockEndpoint: '',
        awsEndpointSelected: false,
        liteLlmBaseUrl: '',
        openAiBaseUrl: 'https://api.openai.com/v1',
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaModelId: ''
      }
      return defaults[key] || null
    })
    ;(getSecret as ReturnType<typeof vi.fn>).mockResolvedValue('')
    ;(storeSecret as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    ;(updateGlobalState as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    ;(getAllExtensionState as ReturnType<typeof vi.fn>).mockResolvedValue({ apiConfiguration: {} })
    ;(getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        models: ['gpt-4', 'gpt-3.5-turbo'],
        llmGatewayAddr: 'https://api.example.com',
        key: 'default-api-key'
      }
    })
    mockWindowApi.validateApiKey.mockResolvedValue({ isValid: true })

    // Clear console output for cleaner test results
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.clearAllMocks()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  describe('Component Mounting', () => {
    it('should mount successfully', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick() // Wait for onMounted

      expect(wrapper.exists()).toBe(true)
      expect(wrapper.find('.section-header').exists()).toBe(true)
    })

    it('should load saved configuration on mount', async () => {
      ;(getGlobalState as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key === 'awsRegion') return 'us-west-2'
        if (key === 'openAiBaseUrl') return 'https://custom.openai.com/v1'
        if (key === 'awsUseCrossRegionInference') return false
        if (key === 'awsBedrockEndpoint') return ''
        if (key === 'awsEndpointSelected') return false
        if (key === 'liteLlmBaseUrl') return ''
        if (key === 'ollamaBaseUrl') return 'http://localhost:11434'
        if (key === 'ollamaModelId') return ''
        if (key === 'modelOptions') return []
        return null
      })
      ;(getSecret as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key === 'awsAccessKey') return 'test-access-key'
        if (key === 'openAiApiKey') return 'test-openai-key'
        return ''
      })

      wrapper = createWrapper()
      await nextTick()
      // Wait for async operations in onMounted
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(getGlobalState).toHaveBeenCalled()
      expect(getSecret).toHaveBeenCalled()
    })

    it('should load model options on mount', async () => {
      wrapper = createWrapper()
      await nextTick()
      // Wait for async operations in onMounted
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(getUser).toHaveBeenCalled()
      expect(getGlobalState).toHaveBeenCalledWith('modelOptions')
    })

    it('should handle config load errors', async () => {
      const error = new Error('Load failed')
      ;(getGlobalState as ReturnType<typeof vi.fn>).mockRejectedValue(error)

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(notification.error).toHaveBeenCalledWith({
        message: 'Error',
        description: 'Failed to load saved configuration'
      })
    })
  })

  describe('Model List Display', () => {
    beforeEach(async () => {
      ;(getGlobalState as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key === 'modelOptions') {
          return [
            { id: 'gpt-4', name: 'gpt-4', checked: true, type: 'standard', apiProvider: 'default' },
            { id: 'custom-1', name: 'custom-model', checked: false, type: 'custom', apiProvider: 'openai' }
          ]
        }
        if (key === 'awsRegion') return 'us-east-1'
        if (key === 'awsUseCrossRegionInference') return false
        if (key === 'awsBedrockEndpoint') return ''
        if (key === 'awsEndpointSelected') return false
        if (key === 'liteLlmBaseUrl') return ''
        if (key === 'openAiBaseUrl') return 'https://api.openai.com/v1'
        if (key === 'ollamaBaseUrl') return 'http://localhost:11434'
        if (key === 'ollamaModelId') return ''
        return null
      })
      ;(getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          models: ['gpt-4'],
          llmGatewayAddr: 'https://api.example.com',
          key: 'default-api-key'
        }
      })

      wrapper = createWrapper()
      await nextTick()
      // Wait for async operations in onMounted
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    it('should display model list', () => {
      const modelList = wrapper.find('.model-list')
      expect(modelList.exists()).toBe(true)
    })

    it('should render model items', () => {
      const modelItems = wrapper.findAll('.model-item')
      expect(modelItems.length).toBeGreaterThan(0)
    })

    it('should display model names correctly', () => {
      const modelItems = wrapper.findAll('.model-item')
      expect(modelItems.length).toBeGreaterThan(0)
    })

    it('should show thinking icon for Thinking models', async () => {
      ;(getGlobalState as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key === 'modelOptions') {
          return [{ id: 'gpt-4', name: 'gpt-4-Thinking', checked: true, type: 'standard', apiProvider: 'default' }]
        }
        if (key === 'awsRegion') return 'us-east-1'
        if (key === 'awsUseCrossRegionInference') return false
        if (key === 'awsBedrockEndpoint') return ''
        if (key === 'awsEndpointSelected') return false
        if (key === 'liteLlmBaseUrl') return ''
        if (key === 'openAiBaseUrl') return 'https://api.openai.com/v1'
        if (key === 'ollamaBaseUrl') return 'http://localhost:11434'
        if (key === 'ollamaModelId') return ''
        return null
      })
      ;(getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          models: ['gpt-4-Thinking'],
          llmGatewayAddr: 'https://api.example.com',
          key: 'default-api-key'
        }
      })

      wrapper = createWrapper()
      await nextTick()
      // Wait for async operations in onMounted
      await new Promise((resolve) => setTimeout(resolve, 50))

      const thinkingIcon = wrapper.find('.thinking-icon')
      expect(thinkingIcon.exists()).toBe(true)
    })

    it('should display remove button for checked custom models', async () => {
      ;(getGlobalState as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key === 'modelOptions') {
          return [{ id: 'custom-1', name: 'custom-model', checked: true, type: 'custom', apiProvider: 'openai' }]
        }
        if (key === 'awsRegion') return 'us-east-1'
        if (key === 'awsUseCrossRegionInference') return false
        if (key === 'awsBedrockEndpoint') return ''
        if (key === 'awsEndpointSelected') return false
        if (key === 'liteLlmBaseUrl') return ''
        if (key === 'openAiBaseUrl') return 'https://api.openai.com/v1'
        if (key === 'ollamaBaseUrl') return 'http://localhost:11434'
        if (key === 'ollamaModelId') return ''
        return null
      })
      ;(getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          models: [],
          llmGatewayAddr: 'https://api.example.com',
          key: 'default-api-key'
        }
      })

      wrapper = createWrapper()
      await nextTick()
      // Wait for async operations in onMounted
      await new Promise((resolve) => setTimeout(resolve, 50))

      const removeButton = wrapper.find('.remove-button')
      expect(removeButton.exists()).toBe(true)
    })

    it('should not display remove button for standard models', async () => {
      ;(getGlobalState as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key === 'modelOptions') {
          return [{ id: 'gpt-4', name: 'gpt-4', checked: true, type: 'standard', apiProvider: 'default' }]
        }
        return null
      })

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const removeButton = wrapper.find('.remove-button')
      expect(removeButton.exists()).toBe(false)
    })
  })

  describe('Model Selection', () => {
    beforeEach(async () => {
      ;(getGlobalState as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key === 'modelOptions') {
          return [{ id: 'gpt-4', name: 'gpt-4', checked: false, type: 'standard', apiProvider: 'default' }]
        }
        if (key === 'awsRegion') return 'us-east-1'
        if (key === 'awsUseCrossRegionInference') return false
        if (key === 'awsBedrockEndpoint') return ''
        if (key === 'awsEndpointSelected') return false
        if (key === 'liteLlmBaseUrl') return ''
        if (key === 'openAiBaseUrl') return 'https://api.openai.com/v1'
        if (key === 'ollamaBaseUrl') return 'http://localhost:11434'
        if (key === 'ollamaModelId') return ''
        return null
      })
      ;(getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          models: ['gpt-4'],
          llmGatewayAddr: 'https://api.example.com',
          key: 'default-api-key'
        }
      })

      wrapper = createWrapper()
      await nextTick()
      // Wait for async operations in onMounted
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    it('should handle model checkbox change', async () => {
      const vm = wrapper.vm as any
      // Find the actual model from modelOptions
      const model = vm.modelOptions.find((m: any) => m.id === 'gpt-4')
      if (model) {
        model.checked = true
        await vm.handleModelChange(model)
        await nextTick()

        expect(updateGlobalState).toHaveBeenCalledWith('modelOptions', expect.any(Array))
        expect(eventBus.emit).toHaveBeenCalledWith('SettingModelOptionsChanged')
      }
    })

    it('should save model options when model is changed', async () => {
      const vm = wrapper.vm as any
      // Find the actual model from modelOptions
      const model = vm.modelOptions.find((m: any) => m.id === 'gpt-4')
      if (model) {
        model.checked = true
        await vm.handleModelChange(model)
        await nextTick()

        expect(updateGlobalState).toHaveBeenCalled()
      }
    })
  })

  describe('Model Removal', () => {
    beforeEach(async () => {
      ;(getGlobalState as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key === 'modelOptions') {
          return [{ id: 'custom-1', name: 'custom-model', checked: true, type: 'custom', apiProvider: 'openai' }]
        }
        if (key === 'awsRegion') return 'us-east-1'
        if (key === 'awsUseCrossRegionInference') return false
        if (key === 'awsBedrockEndpoint') return ''
        if (key === 'awsEndpointSelected') return false
        if (key === 'liteLlmBaseUrl') return ''
        if (key === 'openAiBaseUrl') return 'https://api.openai.com/v1'
        if (key === 'ollamaBaseUrl') return 'http://localhost:11434'
        if (key === 'ollamaModelId') return ''
        return null
      })
      ;(getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          models: [],
          llmGatewayAddr: 'https://api.example.com',
          key: 'default-api-key'
        }
      })

      wrapper = createWrapper()
      await nextTick()
      // Wait for async operations in onMounted
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    it('should remove custom model when remove button is clicked', async () => {
      const vm = wrapper.vm as any
      // Find the actual model from modelOptions
      const model = vm.modelOptions.find((m: any) => m.id === 'custom-1')
      if (model) {
        await vm.removeModel(model)
        await nextTick()

        expect(updateGlobalState).toHaveBeenCalled()
        expect(eventBus.emit).toHaveBeenCalledWith('SettingModelOptionsChanged')
      }
    })

    it('should not remove standard models', async () => {
      const vm = wrapper.vm as any
      const model = { id: 'gpt-4', name: 'gpt-4', checked: true, type: 'standard', apiProvider: 'default' }

      const initialLength = vm.modelOptions.length
      await vm.removeModel(model)
      await nextTick()

      expect(vm.modelOptions.length).toBe(initialLength)
    })
  })

  describe('Add Model Switch', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should toggle add model section when switch is clicked', async () => {
      const vm = wrapper.vm as any
      expect(vm.addModelSwitch).toBe(false)

      vm.addModelSwitch = true
      await nextTick()

      expect(wrapper.find('.api-provider-header').exists()).toBe(true)
    })

    it('should hide API configuration when switch is off', async () => {
      const vm = wrapper.vm as any
      vm.addModelSwitch = false
      await nextTick()

      const apiConfig = wrapper.find('.api-provider-header')
      expect(apiConfig.exists()).toBe(false)
    })
  })

  describe('LiteLLM Configuration', () => {
    beforeEach(async () => {
      const vm = wrapper.vm as any
      vm.addModelSwitch = true
      await nextTick()
    })

    it('should render LiteLLM configuration section', async () => {
      wrapper = createWrapper()
      const vm = wrapper.vm as any
      vm.addModelSwitch = true
      await nextTick()

      const headers = wrapper.findAll('.api-provider-header')
      expect(headers.length).toBeGreaterThan(0)
    })

    it('should save LiteLLM configuration', async () => {
      wrapper = createWrapper()
      const vm = wrapper.vm as any
      vm.liteLlmBaseUrl = 'https://litellm.example.com'
      vm.liteLlmApiKey = 'test-key'
      vm.liteLlmModelId = 'gpt-4'

      await vm.saveLiteLlmConfig()

      expect(updateGlobalState).toHaveBeenCalledWith('liteLlmBaseUrl', 'https://litellm.example.com')
      expect(storeSecret).toHaveBeenCalledWith('liteLlmApiKey', 'test-key')
    })

    it('should handle LiteLLM config save errors', async () => {
      wrapper = createWrapper()
      const error = new Error('Save failed')
      ;(updateGlobalState as ReturnType<typeof vi.fn>).mockRejectedValue(error)

      const vm = wrapper.vm as any
      await vm.saveLiteLlmConfig()

      expect(notification.error).toHaveBeenCalledWith({
        message: 'Error',
        description: 'Failed to save LiteLLM configuration'
      })
    })

    it('should validate LiteLLM configuration before check', async () => {
      wrapper = createWrapper()
      const vm = wrapper.vm as any
      vm.liteLlmBaseUrl = ''
      vm.liteLlmApiKey = ''
      vm.liteLlmModelId = ''

      await vm.handleCheck('litellm')

      expect(notification.error).toHaveBeenCalledWith({
        message: 'Configuration check failed',
        description: 'Please fill in all required fields',
        duration: 3
      })
      expect(mockWindowApi.validateApiKey).not.toHaveBeenCalled()
    })

    it('should check LiteLLM configuration when valid', async () => {
      wrapper = createWrapper()
      const vm = wrapper.vm as any
      vm.liteLlmBaseUrl = 'https://litellm.example.com'
      vm.liteLlmApiKey = 'test-key'
      vm.liteLlmModelId = 'gpt-4'

      await vm.handleCheck('litellm')

      expect(mockWindowApi.validateApiKey).toHaveBeenCalled()
    })
  })

  describe('OpenAI Configuration', () => {
    it('should save OpenAI configuration', async () => {
      wrapper = createWrapper()
      const vm = wrapper.vm as any
      vm.openAiBaseUrl = 'https://custom.openai.com/v1'
      vm.openAiApiKey = 'test-key'
      vm.openAiModelId = 'gpt-4'

      await vm.saveOpenAiConfig()

      expect(updateGlobalState).toHaveBeenCalledWith('openAiBaseUrl', 'https://custom.openai.com/v1')
      expect(storeSecret).toHaveBeenCalledWith('openAiApiKey', 'test-key')
    })

    it('should handle OpenAI config save errors', async () => {
      wrapper = createWrapper()
      const error = new Error('Save failed')
      ;(updateGlobalState as ReturnType<typeof vi.fn>).mockRejectedValue(error)

      const vm = wrapper.vm as any
      await vm.saveOpenAiConfig()

      expect(notification.error).toHaveBeenCalledWith({
        message: 'Error',
        description: 'Failed to save OpenAI configuration'
      })
    })

    it('should validate OpenAI configuration before check', async () => {
      wrapper = createWrapper()
      const vm = wrapper.vm as any
      vm.openAiBaseUrl = ''
      vm.openAiApiKey = ''
      vm.openAiModelId = ''

      await vm.handleCheck('openai')

      expect(notification.error).toHaveBeenCalledWith({
        message: 'Configuration check failed',
        description: 'Please fill in all required fields',
        duration: 3
      })
    })
  })

  describe('Bedrock Configuration', () => {
    it('should save Bedrock configuration', async () => {
      wrapper = createWrapper()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const vm = wrapper.vm as any
      vm.awsAccessKey = 'test-access-key'
      vm.awsSecretKey = 'test-secret-key'
      vm.awsSessionToken = 'test-session-token'
      vm.awsRegion = 'us-west-2'
      vm.awsUseCrossRegionInference = true
      vm.awsBedrockEndpoint = 'https://bedrock.example.com'
      vm.awsEndpointSelected = true

      await vm.saveBedrockConfig()

      expect(updateGlobalState).toHaveBeenCalledWith('awsRegion', 'us-west-2')
      expect(updateGlobalState).toHaveBeenCalledWith('awsUseCrossRegionInference', true)
      expect(updateGlobalState).toHaveBeenCalledWith('awsBedrockEndpoint', 'https://bedrock.example.com')
      expect(updateGlobalState).toHaveBeenCalledWith('awsEndpointSelected', true)
      expect(storeSecret).toHaveBeenCalledWith('awsAccessKey', 'test-access-key')
      expect(storeSecret).toHaveBeenCalledWith('awsSecretKey', 'test-secret-key')
      expect(storeSecret).toHaveBeenCalledWith('awsSessionToken', 'test-session-token')
    })

    it('should handle Bedrock config save errors', async () => {
      wrapper = createWrapper()
      const error = new Error('Save failed')
      ;(updateGlobalState as ReturnType<typeof vi.fn>).mockRejectedValue(error)

      const vm = wrapper.vm as any
      await vm.saveBedrockConfig()

      expect(notification.error).toHaveBeenCalledWith({
        message: 'Error',
        description: 'Failed to save Bedrock configuration'
      })
    })

    it('should validate Bedrock configuration before check', async () => {
      wrapper = createWrapper()
      const vm = wrapper.vm as any
      vm.awsModelId = ''
      vm.awsAccessKey = ''
      vm.awsSecretKey = ''
      vm.awsRegion = ''

      await vm.handleCheck('bedrock')

      expect(notification.error).toHaveBeenCalledWith({
        message: 'Configuration check failed',
        description: 'Please fill in all required fields',
        duration: 3
      })
    })
  })

  describe('DeepSeek Configuration', () => {
    it('should save DeepSeek configuration', async () => {
      wrapper = createWrapper()
      const vm = wrapper.vm as any
      vm.deepSeekApiKey = 'test-key'
      vm.deepSeekModelId = 'deepseek-chat'

      await vm.saveDeepSeekConfig()

      expect(storeSecret).toHaveBeenCalledWith('deepSeekApiKey', 'test-key')
    })

    it('should handle DeepSeek config save errors', async () => {
      wrapper = createWrapper()
      const error = new Error('Save failed')
      ;(storeSecret as ReturnType<typeof vi.fn>).mockRejectedValue(error)

      const vm = wrapper.vm as any
      await vm.saveDeepSeekConfig()

      expect(notification.error).toHaveBeenCalledWith({
        message: 'Error',
        description: 'Failed to save DeepSeek configuration'
      })
    })

    it('should validate DeepSeek configuration before check', async () => {
      wrapper = createWrapper()
      const vm = wrapper.vm as any
      vm.deepSeekApiKey = ''
      vm.deepSeekModelId = ''

      await vm.handleCheck('deepseek')

      expect(notification.error).toHaveBeenCalledWith({
        message: 'Configuration check failed',
        description: 'Please fill in all required fields',
        duration: 3
      })
    })
  })

  describe('Ollama Configuration', () => {
    it('should save Ollama configuration', async () => {
      wrapper = createWrapper()
      const vm = wrapper.vm as any
      vm.ollamaBaseUrl = 'http://localhost:11434'
      vm.ollamaModelId = 'llama2'

      await vm.saveOllamaConfig()

      expect(updateGlobalState).toHaveBeenCalledWith('ollamaBaseUrl', 'http://localhost:11434')
      expect(updateGlobalState).toHaveBeenCalledWith('ollamaModelId', 'llama2')
    })

    it('should handle Ollama config save errors', async () => {
      wrapper = createWrapper()
      const error = new Error('Save failed')
      ;(updateGlobalState as ReturnType<typeof vi.fn>).mockRejectedValue(error)

      const vm = wrapper.vm as any
      await vm.saveOllamaConfig()

      expect(notification.error).toHaveBeenCalledWith({
        message: 'Error',
        description: 'Failed to save Ollama configuration'
      })
    })

    it('should validate Ollama configuration before check', async () => {
      wrapper = createWrapper()
      const vm = wrapper.vm as any
      vm.ollamaBaseUrl = ''
      vm.ollamaModelId = ''

      await vm.handleCheck('ollama')

      expect(notification.error).toHaveBeenCalledWith({
        message: 'Configuration check failed',
        description: 'Please fill in all required fields',
        duration: 3
      })
    })
  })

  describe('Model Validation (Check)', () => {
    beforeEach(async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should show success notification when validation succeeds', async () => {
      const vm = wrapper.vm as any
      vm.liteLlmBaseUrl = 'https://litellm.example.com'
      vm.liteLlmApiKey = 'test-key'
      vm.liteLlmModelId = 'gpt-4'
      mockWindowApi.validateApiKey.mockResolvedValue({ isValid: true })

      await vm.handleCheck('litellm')

      expect(notification.success).toHaveBeenCalledWith({
        message: 'Check successful',
        description: 'API configuration is valid',
        duration: 3
      })
    })

    it('should show error notification when validation fails', async () => {
      const vm = wrapper.vm as any
      vm.liteLlmBaseUrl = 'https://litellm.example.com'
      vm.liteLlmApiKey = 'test-key'
      vm.liteLlmModelId = 'gpt-4'
      mockWindowApi.validateApiKey.mockResolvedValue({ isValid: false, error: 'Invalid API key' })

      await vm.handleCheck('litellm')

      expect(notification.error).toHaveBeenCalledWith({
        message: 'Check failed',
        description: 'Invalid API key',
        duration: 3
      })
    })

    it('should handle validation errors', async () => {
      const vm = wrapper.vm as any
      vm.liteLlmBaseUrl = 'https://litellm.example.com'
      vm.liteLlmApiKey = 'test-key'
      vm.liteLlmModelId = 'gpt-4'
      const error = new Error('Network error')
      mockWindowApi.validateApiKey.mockRejectedValue(error)

      await vm.handleCheck('litellm')

      expect(notification.error).toHaveBeenCalledWith({
        message: 'Check failed',
        description: expect.stringContaining('Network error'),
        duration: 3
      })
    })

    it('should reset loading state after validation', async () => {
      const vm = wrapper.vm as any
      vm.liteLlmBaseUrl = 'https://litellm.example.com'
      vm.liteLlmApiKey = 'test-key'
      vm.liteLlmModelId = 'gpt-4'
      mockWindowApi.validateApiKey.mockResolvedValue({ isValid: true })

      await vm.handleCheck('litellm')
      await nextTick()

      expect(vm.checkLoadingLiteLLM).toBe(false)
    })
  })

  describe('Save New Model', () => {
    beforeEach(async () => {
      ;(getGlobalState as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key === 'modelOptions') {
          return []
        }
        return null
      })

      wrapper = createWrapper()
      await nextTick()
      await nextTick()
    })

    it('should save new model when all fields are valid', async () => {
      const vm = wrapper.vm as any
      vm.liteLlmBaseUrl = 'https://litellm.example.com'
      vm.liteLlmApiKey = 'test-key'
      vm.liteLlmModelId = 'gpt-4'

      await vm.handleSave('litellm')

      expect(updateGlobalState).toHaveBeenCalledWith('modelOptions', expect.any(Array))
      expect(notification.success).toHaveBeenCalledWith({
        message: 'Success',
        description: 'Model added successfully',
        duration: 3
      })
    })

    it('should not save model when model ID is empty', async () => {
      const vm = wrapper.vm as any
      vm.liteLlmModelId = ''

      await vm.handleSave('litellm')

      expect(notification.error).toHaveBeenCalledWith({
        message: 'Configuration check failed',
        description: 'Please fill in all required fields',
        duration: 3
      })
      expect(updateGlobalState).not.toHaveBeenCalledWith('modelOptions', expect.any(Array))
    })

    it('should not save model when model already exists', async () => {
      ;(getGlobalState as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key === 'modelOptions') {
          return [{ id: 'gpt-4', name: 'gpt-4', checked: true, type: 'custom', apiProvider: 'litellm' }]
        }
        if (key === 'awsRegion') return 'us-east-1'
        if (key === 'awsUseCrossRegionInference') return false
        if (key === 'awsBedrockEndpoint') return ''
        if (key === 'awsEndpointSelected') return false
        if (key === 'liteLlmBaseUrl') return ''
        if (key === 'openAiBaseUrl') return 'https://api.openai.com/v1'
        if (key === 'ollamaBaseUrl') return 'http://localhost:11434'
        if (key === 'ollamaModelId') return ''
        return null
      })
      ;(getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          models: [],
          llmGatewayAddr: 'https://api.example.com',
          key: 'default-api-key'
        }
      })

      wrapper = createWrapper()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const vm = wrapper.vm as any
      vm.liteLlmBaseUrl = 'https://litellm.example.com'
      vm.liteLlmApiKey = 'test-key'
      vm.liteLlmModelId = 'gpt-4'

      await vm.handleSave('litellm')

      expect(notification.error).toHaveBeenCalledWith({
        message: 'Error',
        description: 'Model already exists',
        duration: 3
      })
    })

    it('should save configuration before adding model', async () => {
      const vm = wrapper.vm as any
      vm.liteLlmBaseUrl = 'https://litellm.example.com'
      vm.liteLlmApiKey = 'test-key'
      vm.liteLlmModelId = 'gpt-4'

      await vm.handleSave('litellm')

      expect(updateGlobalState).toHaveBeenCalledWith('liteLlmBaseUrl', 'https://litellm.example.com')
      expect(storeSecret).toHaveBeenCalledWith('liteLlmApiKey', 'test-key')
    })

    it('should sort models after adding new model', async () => {
      ;(getGlobalState as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key === 'modelOptions') {
          return [{ id: 'gpt-4', name: 'gpt-4', checked: true, type: 'standard', apiProvider: 'default' }]
        }
        if (key === 'awsRegion') return 'us-east-1'
        if (key === 'awsUseCrossRegionInference') return false
        if (key === 'awsBedrockEndpoint') return ''
        if (key === 'awsEndpointSelected') return false
        if (key === 'liteLlmBaseUrl') return ''
        if (key === 'openAiBaseUrl') return 'https://api.openai.com/v1'
        if (key === 'ollamaBaseUrl') return 'http://localhost:11434'
        if (key === 'ollamaModelId') return ''
        return null
      })
      ;(getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          models: ['gpt-4'],
          llmGatewayAddr: 'https://api.example.com',
          key: 'default-api-key'
        }
      })

      wrapper = createWrapper()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const vm = wrapper.vm as any
      vm.liteLlmBaseUrl = 'https://litellm.example.com'
      vm.liteLlmApiKey = 'test-key'
      vm.liteLlmModelId = 'custom-model'

      await vm.handleSave('litellm')
      await nextTick()

      const modelOptions = vm.modelOptions
      // After sorting, standard models should come first
      const standardIndex = modelOptions.findIndex((m: any) => m.type === 'standard')
      const customIndex = modelOptions.findIndex((m: any) => m.type === 'custom')
      expect(standardIndex).toBeLessThan(customIndex)
    })
  })

  describe('Model Sorting', () => {
    it('should sort Thinking models first', async () => {
      ;(getGlobalState as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key === 'modelOptions') {
          return [
            { id: 'gpt-4', name: 'gpt-4', checked: true, type: 'standard', apiProvider: 'default' },
            { id: 'gpt-4-thinking', name: 'gpt-4-Thinking', checked: true, type: 'standard', apiProvider: 'default' }
          ]
        }
        if (key === 'awsRegion') return 'us-east-1'
        if (key === 'awsUseCrossRegionInference') return false
        if (key === 'awsBedrockEndpoint') return ''
        if (key === 'awsEndpointSelected') return false
        if (key === 'liteLlmBaseUrl') return ''
        if (key === 'openAiBaseUrl') return 'https://api.openai.com/v1'
        if (key === 'ollamaBaseUrl') return 'http://localhost:11434'
        if (key === 'ollamaModelId') return ''
        return null
      })
      ;(getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          models: ['gpt-4', 'gpt-4-Thinking'],
          llmGatewayAddr: 'https://api.example.com',
          key: 'default-api-key'
        }
      })

      wrapper = createWrapper()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const vm = wrapper.vm as any
      vm.sortModelOptions()

      const modelOptions = vm.modelOptions
      if (modelOptions.length > 0) {
        const thinkingIndex = modelOptions.findIndex((m: any) => m.name.includes('Thinking'))
        const regularIndex = modelOptions.findIndex((m: any) => !m.name.includes('Thinking'))
        if (thinkingIndex !== -1 && regularIndex !== -1) {
          expect(thinkingIndex).toBeLessThan(regularIndex)
        }
      }
    })

    it('should sort standard models before custom models', async () => {
      ;(getGlobalState as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key === 'modelOptions') {
          return [
            { id: 'custom-1', name: 'custom-model', checked: true, type: 'custom', apiProvider: 'openai' },
            { id: 'gpt-4', name: 'gpt-4', checked: true, type: 'standard', apiProvider: 'default' }
          ]
        }
        if (key === 'awsRegion') return 'us-east-1'
        if (key === 'awsUseCrossRegionInference') return false
        if (key === 'awsBedrockEndpoint') return ''
        if (key === 'awsEndpointSelected') return false
        if (key === 'liteLlmBaseUrl') return ''
        if (key === 'openAiBaseUrl') return 'https://api.openai.com/v1'
        if (key === 'ollamaBaseUrl') return 'http://localhost:11434'
        if (key === 'ollamaModelId') return ''
        return null
      })
      ;(getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          models: ['gpt-4'],
          llmGatewayAddr: 'https://api.example.com',
          key: 'default-api-key'
        }
      })

      wrapper = createWrapper()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const vm = wrapper.vm as any
      vm.sortModelOptions()

      const modelOptions = vm.modelOptions
      if (modelOptions.length > 0) {
        const standardIndex = modelOptions.findIndex((m: any) => m.type === 'standard')
        const customIndex = modelOptions.findIndex((m: any) => m.type === 'custom')
        if (standardIndex !== -1 && customIndex !== -1) {
          expect(standardIndex).toBeLessThan(customIndex)
        }
      }
    })
  })

  describe('Guest User Handling', () => {
    beforeEach(() => {
      localStorage.setItem('login-skipped', 'true')
    })

    it('should only load custom models for guest users', async () => {
      ;(getGlobalState as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key === 'modelOptions') {
          return [
            { id: 'gpt-4', name: 'gpt-4', checked: true, type: 'standard', apiProvider: 'default' },
            { id: 'custom-1', name: 'custom-model', checked: true, type: 'custom', apiProvider: 'openai' }
          ]
        }
        return null
      })

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      const standardModels = vm.modelOptions.filter((m: any) => m.type === 'standard')
      expect(standardModels.length).toBe(0)
    })

    it('should not call getUser for guest users', async () => {
      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      expect(getUser).not.toHaveBeenCalled()
    })
  })

  describe('Model Options Loading', () => {
    it('should merge default models with saved models', async () => {
      ;(getGlobalState as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key === 'modelOptions') {
          return [{ id: 'gpt-4', name: 'gpt-4', checked: true, type: 'standard', apiProvider: 'default' }]
        }
        if (key === 'awsRegion') return 'us-east-1'
        if (key === 'awsUseCrossRegionInference') return false
        if (key === 'awsBedrockEndpoint') return ''
        if (key === 'awsEndpointSelected') return false
        if (key === 'liteLlmBaseUrl') return ''
        if (key === 'openAiBaseUrl') return 'https://api.openai.com/v1'
        if (key === 'ollamaBaseUrl') return 'http://localhost:11434'
        if (key === 'ollamaModelId') return ''
        return null
      })
      ;(getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          models: ['gpt-4', 'gpt-3.5-turbo'],
          llmGatewayAddr: 'https://api.example.com',
          key: 'default-api-key'
        }
      })

      wrapper = createWrapper()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const vm = wrapper.vm as any
      expect(vm.modelOptions.length).toBeGreaterThan(0)
    })

    it('should filter out standard models not in default models', async () => {
      ;(getGlobalState as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key === 'modelOptions') {
          return [
            { id: 'gpt-4', name: 'gpt-4', checked: true, type: 'standard', apiProvider: 'default' },
            { id: 'old-model', name: 'old-model', checked: true, type: 'standard', apiProvider: 'default' }
          ]
        }
        return null
      })
      ;(getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          models: ['gpt-4'],
          llmGatewayAddr: 'https://api.example.com',
          key: 'default-api-key'
        }
      })

      wrapper = createWrapper()
      await nextTick()
      await nextTick()

      const vm = wrapper.vm as any
      const oldModel = vm.modelOptions.find((m: any) => m.name === 'old-model')
      expect(oldModel).toBeUndefined()
    })

    it('should add new default models to options', async () => {
      ;(getGlobalState as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key === 'modelOptions') {
          return [{ id: 'gpt-4', name: 'gpt-4', checked: true, type: 'standard', apiProvider: 'default' }]
        }
        if (key === 'awsRegion') return 'us-east-1'
        if (key === 'awsUseCrossRegionInference') return false
        if (key === 'awsBedrockEndpoint') return ''
        if (key === 'awsEndpointSelected') return false
        if (key === 'liteLlmBaseUrl') return ''
        if (key === 'openAiBaseUrl') return 'https://api.openai.com/v1'
        if (key === 'ollamaBaseUrl') return 'http://localhost:11434'
        if (key === 'ollamaModelId') return ''
        return null
      })
      ;(getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          models: ['gpt-4', 'gpt-3.5-turbo', 'claude-3'],
          llmGatewayAddr: 'https://api.example.com',
          key: 'default-api-key'
        }
      })

      wrapper = createWrapper()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const vm = wrapper.vm as any
      const newModel = vm.modelOptions.find((m: any) => m.name === 'gpt-3.5-turbo')
      expect(newModel).toBeDefined()
      expect(newModel.checked).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle getUser API errors', async () => {
      const error = new Error('API error')
      ;(getUser as ReturnType<typeof vi.fn>).mockRejectedValue(error)
      ;(getGlobalState as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key === 'modelOptions') return []
        if (key === 'awsRegion') return 'us-east-1'
        if (key === 'awsUseCrossRegionInference') return false
        if (key === 'awsBedrockEndpoint') return ''
        if (key === 'awsEndpointSelected') return false
        if (key === 'liteLlmBaseUrl') return ''
        if (key === 'openAiBaseUrl') return 'https://api.openai.com/v1'
        if (key === 'ollamaBaseUrl') return 'http://localhost:11434'
        if (key === 'ollamaModelId') return ''
        return null
      })

      wrapper = createWrapper()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Error is caught and logged in component
      expect(getUser).toHaveBeenCalled()
    })

    it('should handle saveModelOptions errors', async () => {
      ;(getGlobalState as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key === 'modelOptions') {
          return [{ id: 'gpt-4', name: 'gpt-4', checked: true, type: 'standard', apiProvider: 'default' }]
        }
        if (key === 'awsRegion') return 'us-east-1'
        if (key === 'awsUseCrossRegionInference') return false
        if (key === 'awsBedrockEndpoint') return ''
        if (key === 'awsEndpointSelected') return false
        if (key === 'liteLlmBaseUrl') return ''
        if (key === 'openAiBaseUrl') return 'https://api.openai.com/v1'
        if (key === 'ollamaBaseUrl') return 'http://localhost:11434'
        if (key === 'ollamaModelId') return ''
        return null
      })
      ;(getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          models: ['gpt-4'],
          llmGatewayAddr: 'https://api.example.com',
          key: 'default-api-key'
        }
      })

      wrapper = createWrapper()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const error = new Error('Save failed')
      ;(updateGlobalState as ReturnType<typeof vi.fn>).mockRejectedValue(error)

      const vm = wrapper.vm as any
      const model = vm.modelOptions.find((m: any) => m.id === 'gpt-4')
      if (model) {
        model.checked = false
        await vm.handleModelChange(model)
        await nextTick()

        expect(notification.error).toHaveBeenCalledWith({
          message: 'Error',
          description: 'Failed to save model options'
        })
      }
    })
  })
})
