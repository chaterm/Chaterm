import eventBus from '@/utils/eventBus'
import type { OnboardingModuleId } from '@/store/onboardingStore'
import { useSessionState } from '@/views/components/AiTab/composables/useSessionState'
import type { Host } from '@/views/components/AiTab/types'
import type { ContentPart } from '@shared/WebviewMessage'

const AI_CHAT_ONBOARDING_PROMPT = '查看主机状态'
const LOCALHOST_CONTEXT: Host = {
  host: '127.0.0.1',
  uuid: 'localhost',
  connection: 'localhost'
}

const emitLater = (eventName: string, payload?: unknown) => {
  window.setTimeout(() => {
    eventBus.emit(eventName, payload)
  }, 120)
}

const openSettingsTab = (settingsTab: 'general' | 'terminal' | 'model' | 'aiPreferences' = 'general') => {
  eventBus.emit('open-user-tab', 'userConfig')

  const switchEvent =
    settingsTab === 'terminal'
      ? 'switchToTerminalTab'
      : settingsTab === 'model'
        ? 'switchToModelSettingsTab'
        : settingsTab === 'aiPreferences'
          ? 'switchToAiPreferencesTab'
          : 'switchToGeneralSettingsTab'

  emitLater(switchEvent)
}

const prepareAiChatStateLater = (stepId: string) => {
  const applyAiChatState = () => {
    const { currentChatId, chatTypeValue, hosts, chatInputParts, autoUpdateHost } = useSessionState()
    if (!currentChatId.value) return

    if (['ai-model-open', 'ai-model-option', 'ai-context-open', 'ai-context-hosts', 'ai-localhost-option', 'ai-send'].includes(stepId)) {
      chatTypeValue.value = 'agent'
    }

    if (stepId === 'ai-send') {
      hosts.value = [LOCALHOST_CONTEXT]
      autoUpdateHost.value = false
      chatInputParts.value = [{ type: 'text', text: AI_CHAT_ONBOARDING_PROMPT }] as ContentPart[]
    }
  }

  applyAiChatState()
  ;[160, 420, 760].forEach((delay) => {
    window.setTimeout(() => {
      applyAiChatState()
    }, delay)
  })
}

const prepareAiChatInteractiveLayer = (stepId: string) => {
  if (stepId === 'ai-mode-agent') {
    eventBus.emit('onboarding:openAiModeSelect')
    return
  }

  if (stepId === 'ai-model-open' || stepId === 'ai-context-open') {
    eventBus.emit('onboarding:closeAiContextPopup')
    return
  }

  if (stepId === 'ai-model-option') {
    eventBus.emit('onboarding:openAiModelSelect')
    return
  }

  if (stepId === 'ai-context-hosts') {
    emitLater('onboarding:openAiContextPopup')
    return
  }

  if (stepId === 'ai-localhost-option') {
    emitLater('onboarding:openAiContextHosts')
    return
  }

  if (stepId === 'ai-send') {
    eventBus.emit('onboarding:closeAiContextPopup')
  }
}

export const openOnboardingGuideTab = () => {
  eventBus.emit('open-user-tab', 'onboardingGuide')
}

export const prepareOnboardingModule = (moduleId: OnboardingModuleId) => {
  eventBus.emit('switch-mode', 'terminal')

  switch (moduleId) {
    case 'interfaceGuide':
      eventBus.emit('onboarding:showLeftMenu', 'workspace')
      break
    case 'systemSettings':
      break
    case 'addAndConnectHost':
      eventBus.emit('onboarding:showLeftMenu', 'assets')
      eventBus.emit('open-user-tab', 'assetConfig')
      break
    case 'aiChat':
      eventBus.emit('openAiRight')
      break
  }
}

export const prepareOnboardingStep = (moduleId: OnboardingModuleId, stepId: string) => {
  eventBus.emit('switch-mode', 'terminal')

  if (moduleId === 'interfaceGuide') {
    eventBus.emit('onboarding:showLeftMenu', 'workspace')

    if (stepId === 'ai-sidebar') {
      eventBus.emit('openAiRight')
    }
    return
  }

  if (moduleId === 'systemSettings') {
    if (stepId === 'setting-entry') {
      return
    }

    if (stepId === 'terminal-tab' || stepId === 'terminal-options') {
      openSettingsTab('terminal')
      return
    }

    if (stepId === 'ai-preferences-tab') {
      eventBus.emit('open-user-tab', 'userConfig')
      return
    }

    if (stepId === 'ai-preferences-content' || stepId === 'ai-auto-approval') {
      openSettingsTab('aiPreferences')
      return
    }

    openSettingsTab('general')
    return
  }

  if (moduleId === 'addAndConnectHost') {
    eventBus.emit('onboarding:showLeftMenu', 'assets')
    eventBus.emit('open-user-tab', 'assetConfig')

    if (['new-host', 'form-fields', 'form-submit'].includes(stepId)) {
      emitLater('onboarding:openAssetCreate')
    }
    return
  }

  if (moduleId === 'aiChat') {
    eventBus.emit('openAiRight')
    prepareAiChatStateLater(stepId)
    prepareAiChatInteractiveLayer(stepId)
  }
}

export const startOnboardingTour = (moduleId: OnboardingModuleId) => {
  prepareOnboardingModule(moduleId)
  eventBus.emit('onboarding:startTour', moduleId)
}
