import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AiSettings from '../ai.vue'

const { mockGetGlobalState, mockUpdateGlobalState, mockOn, mockOff } = vi.hoisted(() => ({
  mockGetGlobalState: vi.fn(),
  mockUpdateGlobalState: vi.fn(),
  mockOn: vi.fn(),
  mockOff: vi.fn()
}))

vi.mock('ant-design-vue', () => ({
  notification: {
    error: vi.fn(),
    success: vi.fn()
  }
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
    emit: vi.fn()
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
      if (key === 'kbSearchEnabled') return true
      if (key === 'thinkingBudgetTokens') return 2048
      if (key === 'reasoningEffort') return 'low'
      if (key === 'shellIntegrationTimeout') return 4
      if (key === 'needProxy') return false
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
                'user.experienceExtractionEnabledDescribe': 'desc'
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
})
