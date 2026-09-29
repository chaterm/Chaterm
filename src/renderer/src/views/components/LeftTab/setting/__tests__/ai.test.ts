import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AiSettings from '../ai.vue'
import { DEFAULT_AUTO_APPROVAL_SETTINGS } from '@/agent/storage/shared'

const { mockGetGlobalState, mockUpdateGlobalState, mockNotification, mockOn, mockOff, mockEmit } = vi.hoisted(() => ({
  mockGetGlobalState: vi.fn(),
  mockUpdateGlobalState: vi.fn(),
  mockNotification: {
    error: vi.fn(),
    success: vi.fn()
  },
  mockOn: vi.fn(),
  mockOff: vi.fn(),
  mockEmit: vi.fn()
}))

vi.mock('ant-design-vue', () => ({
  notification: mockNotification
}))

vi.mock('@renderer/agent/storage/state', () => ({
  getGlobalState: mockGetGlobalState,
  updateGlobalState: mockUpdateGlobalState
}))

vi.mock('@/locales', () => ({
  default: {
    global: {
      t: (key: string) =>
        (
          ({
            'user.general': 'General',
            'user.enableExtendedThinking': 'Enable extended thinking',
            'user.enableExtendedThinkingDescribe': 'desc',
            'user.autoExecuteReadOnlyCommands': 'Auto-execute read-only commands',
            'user.autoExecuteReadOnlyCommandsDescribe': 'desc',
            'user.commandOutputFilteringEnabled': 'Command output filtering',
            'user.commandOutputFilteringEnabledDescribe': 'desc',
            'user.kbSearchEnabled': 'Knowledge Base Search',
            'user.kbSearchEnabledDescribe': 'desc',
            'user.experienceExtractionEnabled': 'Automatic Experience Capture',
            'user.experienceExtractionEnabledDescribe': 'desc',
            'user.autoApproval': 'Auto Approval',
            'user.autoApprovalDescribe': 'desc',
            'user.securityConfig': 'Security Config',
            'user.openSecurityConfig': 'Open',
            'user.securityConfigDescribe': 'desc',
            'user.features': 'Features',
            'user.openAIReasoningEffort': 'Reasoning',
            'user.openAIReasoningEffortLow': 'Low',
            'user.openAIReasoningEffortMedium': 'Medium',
            'user.openAIReasoningEffortHigh': 'High',
            'user.proxySettings': 'Proxy',
            'user.enableProxy': 'Enable Proxy',
            'user.proxyType': 'Proxy Type',
            'user.proxyHost': 'Proxy Host',
            'user.proxyPort': 'Proxy Port',
            'user.enableProxyIdentity': 'Proxy Auth',
            'user.proxyUsername': 'Proxy Username',
            'user.proxyPassword': 'Proxy Password',
            'user.terminal': 'Terminal',
            'user.shellIntegrationTimeout': 'Shell Timeout',
            'user.shellIntegrationTimeoutPh': 'placeholder',
            'user.shellIntegrationTimeoutDescribe': 'desc',
            'user.error': 'Error',
            'user.saveConfigFailedDescription': 'save failed',
            'user.loadConfigFailed': 'load failed',
            'user.loadConfigFailedDescription': 'load failed desc',
            'user.openSecurityConfigFailed': 'open failed'
          }) as Record<string, string>
        )[key] || key
    }
  }
}))

vi.mock('@/utils/eventBus', () => ({
  default: {
    on: mockOn,
    off: mockOff,
    emit: mockEmit
  }
}))

describe('AI Settings Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as any).createRendererLogger = () => ({
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    })
    ;(globalThis as any).window = (globalThis as any).window || {}
    ;(globalThis as any).window.api = {
      kbSetSearchEnabled: vi.fn()
    }

    mockGetGlobalState.mockImplementation(async (key: string) => {
      if (key === 'experienceExtractionEnabled') return undefined
      if (key === 'commandOutputFilteringEnabled') return undefined
      if (key === 'kbSearchEnabled') return true
      if (key === 'thinkingBudgetTokens') return 2048
      if (key === 'reasoningEffort') return 'low'
      if (key === 'shellIntegrationTimeout') return 4
      if (key === 'needProxy') return false
      if (key === 'modelOptions') {
        return [{ id: 'chat-1', name: 'chat-model', checked: true, type: 'custom', apiProvider: 'default' }]
      }
      return undefined
    })
    mockUpdateGlobalState.mockResolvedValue(undefined)
  })

  const mountComponent = () =>
    mount(AiSettings, {
      global: {
        mocks: {
          $t: (key: string) =>
            (
              ({
                'user.experienceExtractionEnabled': 'Automatic Experience Capture',
                'user.experienceExtractionEnabledDescribe': 'desc',
                'user.commandOutputFilteringEnabled': 'Command output filtering',
                'user.commandOutputFilteringEnabledDescribe': 'desc',
                'user.autoApproval': 'Auto Approval',
                'user.autoApprovalDescribe': 'desc'
              }) as Record<string, string>
            )[key] || key
        },
        stubs: {
          'a-card': { template: '<div><slot /></div>' },
          'a-form-item': { template: '<div><slot /></div>' },
          'a-select': { template: '<div><slot /></div>' },
          'a-select-option': { template: '<div><slot /></div>' },
          'a-slider': { template: '<div />' },
          'a-input': { template: '<input />' },
          'a-input-number': { template: '<input />' },
          'a-input-password': { template: '<input />' },
          'a-button': { template: '<button><slot /></button>' },
          'a-checkbox': {
            template:
              '<label class="checkbox-stub"><input class="checkbox-input" type="checkbox" :checked="checked" @change="onChange" /><span><slot /></span></label>',
            props: ['checked'],
            emits: ['update:checked', 'change'],
            methods: {
              onChange(event: Event) {
                const checked = (event.target as HTMLInputElement).checked
                this.$emit('update:checked', checked)
                this.$emit('change', checked)
              }
            }
          }
        }
      }
    })

  it('defaults experienceExtractionEnabled to enabled when state is missing', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const checkboxRow = wrapper.findAll('.checkbox-stub').find((node) => node.text().includes('Automatic Experience Capture'))

    expect(checkboxRow).toBeTruthy()
    expect((checkboxRow!.find('input').element as HTMLInputElement).checked).toBe(true)
  })

  it('updates global state when experienceExtractionEnabled is toggled', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const checkboxRow = wrapper.findAll('.checkbox-stub').find((node) => node.text().includes('Automatic Experience Capture'))

    await checkboxRow!.find('input').setValue(false)
    await flushPromises()

    expect(mockUpdateGlobalState).toHaveBeenCalledWith('experienceExtractionEnabled', false)
  })

  it('defaults commandOutputFilteringEnabled to enabled when state is missing', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const checkboxRow = wrapper.findAll('.checkbox-stub').find((node) => node.text().includes('Command output filtering'))

    expect(checkboxRow).toBeTruthy()
    expect((checkboxRow!.find('input').element as HTMLInputElement).checked).toBe(true)
  })

  it('updates global state when commandOutputFilteringEnabled is toggled', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const checkboxRow = wrapper.findAll('.checkbox-stub').find((node) => node.text().includes('Command output filtering'))

    await checkboxRow!.find('input').setValue(false)
    await flushPromises()

    expect(mockUpdateGlobalState).toHaveBeenCalledWith('commandOutputFilteringEnabled', false)
  })

  it('exposes onboarding targets for AI preferences and auto approval', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.find('[data-onboarding-id="settings-ai-preferences-content"]').exists()).toBe(true)
    expect(wrapper.find('[data-onboarding-id="settings-ai-auto-approval"]').exists()).toBe(true)
  })

  it('emits onboarding completion when auto approval is enabled', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const autoApprovalTarget = wrapper.find('[data-onboarding-id="settings-ai-auto-approval"]')
    await autoApprovalTarget.find('input').setValue(true)
    await flushPromises()

    expect(mockUpdateGlobalState).toHaveBeenCalledWith(
      'autoApprovalSettings',
      expect.objectContaining({
        enabled: true,
        actions: expect.objectContaining({
          executeAllCommands: true
        })
      })
    )
    expect(mockEmit).toHaveBeenCalledWith('onboarding:autoApprovalEnabled')
  })

  it('keeps all-command approval enabled when the settings view is closed', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const autoApprovalTarget = wrapper.find('[data-onboarding-id="settings-ai-auto-approval"]')
    await autoApprovalTarget.find('input').setValue(true)
    await flushPromises()

    expect((wrapper.vm as any).autoApprovalSettings.actions.executeAllCommands).toBe(true)
    wrapper.unmount()
    await flushPromises()

    const autoApprovalWrites = mockUpdateGlobalState.mock.calls.filter(([key]) => key === 'autoApprovalSettings')
    const lastWrite = autoApprovalWrites.at(-1)?.[1]
    expect(lastWrite).toEqual(
      expect.objectContaining({
        enabled: true,
        actions: expect.objectContaining({
          executeAllCommands: true
        })
      })
    )
  })

  it.each([false, true])('does not rewrite loaded executeAllCommands=%s while initializing the view', async (executeAllCommands) => {
    const getDefaultState = mockGetGlobalState.getMockImplementation()!
    mockGetGlobalState.mockImplementation(async (key: string) => {
      if (key === 'autoApprovalSettings') {
        return {
          version: 3,
          enabled: true,
          actions: {
            ...DEFAULT_AUTO_APPROVAL_SETTINGS.actions,
            executeAllCommands,
            autoExecuteReadOnlyCommands: true
          },
          maxRequests: 20,
          enableNotifications: true,
          favorites: []
        }
      }
      return getDefaultState(key)
    })

    const wrapper = mountComponent()
    await flushPromises()

    expect(mockUpdateGlobalState).not.toHaveBeenCalledWith('autoApprovalSettings', expect.anything())
    wrapper.unmount()
    await flushPromises()
  })

  it('preserves all-command approval when the read-only preference changes and does not mutate defaults', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    const autoApproval = wrapper.find('[data-onboarding-id="settings-ai-auto-approval"] input')
    const readOnly = wrapper.findAll('.checkbox-stub').find((node) => node.text().includes('user.autoExecuteReadOnlyCommands'))!
    await autoApproval.setValue(true)
    await readOnly.find('input').setValue(true)
    await flushPromises()

    const writes = mockUpdateGlobalState.mock.calls.filter(([key]) => key === 'autoApprovalSettings')
    expect(writes.at(-1)?.[1]).toMatchObject({
      enabled: true,
      actions: { executeAllCommands: true, autoExecuteReadOnlyCommands: true }
    })
    expect(DEFAULT_AUTO_APPROVAL_SETTINGS.enabled).toBe(false)
    expect(DEFAULT_AUTO_APPROVAL_SETTINGS.actions.executeAllCommands).toBe(false)

    await autoApproval.setValue(false)
    await flushPromises()
    expect((wrapper.vm as any).autoApprovalSettings.actions.executeAllCommands).toBe(false)
    wrapper.unmount()
    await flushPromises()
  })

  it('restores legacy LLM rerank configuration as the single selected model', async () => {
    mockGetGlobalState.mockImplementation(async (key: string) => {
      if (key === 'kbSearchEnabled') return true
      if (key === 'kbRerankConfig') {
        return {
          version: 1,
          mode: 'auto',
          threshold: 0.45,
          dedicated: { baseUrl: 'https://rerank.example/v1', modelId: 'bge-reranker' },
          llm: { provider: 'default', modelId: 'chat-model' }
        }
      }
      if (key === 'modelOptions') {
        return [{ id: 'chat-1', name: 'chat-model', checked: true, type: 'custom', apiProvider: 'default' }]
      }
      return undefined
    })

    const wrapper = mountComponent()
    await flushPromises()
    const vm = wrapper.vm as any

    expect(vm.kbRerankSelection).toBe(JSON.stringify({ provider: 'default', modelId: 'chat-model' }))
  })

  it('selects Qwen-Plus by default in the Chinese edition', async () => {
    mockGetGlobalState.mockImplementation(async (key: string) => {
      if (key === 'modelOptions') {
        return [{ id: 'Qwen-Plus', name: 'Qwen-Plus', checked: true, type: 'standard', apiProvider: 'default' }]
      }
      if (key === 'kbSearchEnabled') return true
      return undefined
    })

    const wrapper = mountComponent()
    await flushPromises()

    expect((wrapper.vm as any).kbRerankSelection).toBe(JSON.stringify({ provider: 'default', modelId: 'Qwen-Plus' }))
  })

  it('saves a selected rerank model from the user model list', async () => {
    mockGetGlobalState.mockImplementation(async (key: string) => {
      if (key === 'kbSearchEnabled') return true
      if (key === 'modelOptions') {
        return [
          { id: 'chat-1', name: 'chat-model', checked: true, type: 'custom', apiProvider: 'default' },
          { id: 'rerank-1', name: 'bge-reranker', checked: true, type: 'rerank', apiProvider: 'default' }
        ]
      }
      return undefined
    })
    const wrapper = mountComponent()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.kbRerankSelection = JSON.stringify({ provider: 'default', modelId: 'bge-reranker' })

    await vm.saveKbRerankConfig()
    await flushPromises()

    expect(mockUpdateGlobalState).toHaveBeenCalledWith('kbRerankConfig', {
      version: 2,
      model: { provider: 'default', modelId: 'bge-reranker', modelType: 'rerank' }
    })
  })

  it('saves off when rerank model is disabled', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.kbRerankSelection = 'off'

    await vm.saveKbRerankConfig()
    await flushPromises()

    expect(mockUpdateGlobalState).toHaveBeenCalledWith('kbRerankConfig', {
      version: 2
    })
  })
})
