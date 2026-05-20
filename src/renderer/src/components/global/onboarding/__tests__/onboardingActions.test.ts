import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import eventBus from '@/utils/eventBus'
import { prepareOnboardingModule, prepareOnboardingStep } from '../onboardingActions'
import { useSessionState } from '@/views/components/AiTab/composables/useSessionState'

vi.mock('@/utils/eventBus', () => ({
  default: {
    emit: vi.fn()
  }
}))

describe('onboarding actions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    const sessionState = useSessionState()
    sessionState.chatTabs.value = []
    sessionState.currentChatId.value = undefined
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not open settings when the system settings tour starts', () => {
    prepareOnboardingModule('systemSettings')

    expect(eventBus.emit).toHaveBeenCalledWith('switch-mode', 'terminal')
    expect(eventBus.emit).not.toHaveBeenCalledWith('open-user-tab', 'userConfig')
  })

  it('keeps the first system settings step on the gear entry', () => {
    prepareOnboardingStep('systemSettings', 'setting-entry')

    expect(eventBus.emit).toHaveBeenCalledWith('switch-mode', 'terminal')
    expect(eventBus.emit).not.toHaveBeenCalledWith('open-user-tab', 'userConfig')
  })

  it('opens the AI sidebar when the interface guide reaches the AI sidebar step', () => {
    prepareOnboardingStep('interfaceGuide', 'ai-sidebar')

    expect(eventBus.emit).toHaveBeenCalledWith('switch-mode', 'terminal')
    expect(eventBus.emit).toHaveBeenCalledWith('onboarding:showLeftMenu', 'workspace')
    expect(eventBus.emit).toHaveBeenCalledWith('openAiRight')
  })

  it('opens the general settings tab from the second system settings step', async () => {
    prepareOnboardingStep('systemSettings', 'settings-side-nav')

    expect(eventBus.emit).toHaveBeenCalledWith('open-user-tab', 'userConfig')

    await vi.runAllTimersAsync()

    expect(eventBus.emit).toHaveBeenCalledWith('switchToGeneralSettingsTab', undefined)
  })

  it('switches to terminal settings for terminal system settings steps', async () => {
    prepareOnboardingStep('systemSettings', 'terminal-options')

    expect(eventBus.emit).toHaveBeenCalledWith('open-user-tab', 'userConfig')

    await vi.runAllTimersAsync()

    expect(eventBus.emit).toHaveBeenCalledWith('switchToTerminalTab', undefined)
  })

  it('opens settings without switching tabs on the AI preferences tab step', async () => {
    prepareOnboardingStep('systemSettings', 'ai-preferences-tab')

    expect(eventBus.emit).toHaveBeenCalledWith('open-user-tab', 'userConfig')

    await vi.runAllTimersAsync()

    expect(eventBus.emit).not.toHaveBeenCalledWith('switchToAiPreferencesTab', undefined)
  })

  it('switches to AI preferences for AI preference system settings steps', async () => {
    prepareOnboardingStep('systemSettings', 'ai-auto-approval')

    expect(eventBus.emit).toHaveBeenCalledWith('open-user-tab', 'userConfig')

    await vi.runAllTimersAsync()

    expect(eventBus.emit).toHaveBeenCalledWith('switchToAiPreferencesTab', undefined)
  })

  it('opens the concrete AI chat controls for interactive selection steps', async () => {
    prepareOnboardingStep('aiChat', 'ai-mode-agent')
    expect(eventBus.emit).toHaveBeenCalledWith('onboarding:openAiModeSelect')

    vi.clearAllMocks()
    prepareOnboardingStep('aiChat', 'ai-model-open')
    expect(eventBus.emit).toHaveBeenCalledWith('onboarding:closeAiContextPopup')

    vi.clearAllMocks()
    prepareOnboardingStep('aiChat', 'ai-model-option')
    expect(eventBus.emit).toHaveBeenCalledWith('onboarding:openAiModelSelect')

    vi.clearAllMocks()
    prepareOnboardingStep('aiChat', 'ai-context-open')
    expect(eventBus.emit).toHaveBeenCalledWith('onboarding:closeAiContextPopup')

    vi.clearAllMocks()
    prepareOnboardingStep('aiChat', 'ai-localhost-option')
    await vi.runAllTimersAsync()
    expect(eventBus.emit).toHaveBeenCalledWith('onboarding:openAiContextHosts', undefined)
  })

  it('prepares Agent, localhost, and the built-in prompt for the AI chat send step', async () => {
    const sessionState = useSessionState()
    sessionState.chatTabs.value = [
      {
        id: 'chat-1',
        title: 'New chat',
        hosts: [],
        chatType: 'cmd',
        autoUpdateHost: true,
        session: sessionState.createEmptySessionState(),
        chatInputParts: [],
        modelValue: 'test-model',
        welcomeTip: ''
      }
    ]
    sessionState.currentChatId.value = 'chat-1'

    prepareOnboardingStep('aiChat', 'ai-send')

    expect(eventBus.emit).toHaveBeenCalledWith('openAiRight')

    await vi.runAllTimersAsync()

    expect(sessionState.chatTypeValue.value).toBe('agent')
    expect(sessionState.hosts.value).toEqual([
      {
        host: '127.0.0.1',
        uuid: 'localhost',
        connection: 'localhost'
      }
    ])
    expect(sessionState.autoUpdateHost.value).toBe(false)
    expect(sessionState.chatInputParts.value).toEqual([{ type: 'text', text: '查看主机状态' }])
  })
})
