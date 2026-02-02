import { watch } from 'vue'
import { useSessionState } from './useSessionState'

/**
 * Composable for state snapshot
 * Handles state snapshot creation, restoration and change notifications
 */
export function useStateSnapshot(emit: (event: 'state-changed', ...args: any[]) => void) {
  const { chatTabs, currentChatId, hosts, chatInputParts, chatAiModelValue } = useSessionState()

  let suppressStateChange = false

  const getCurrentState = () => {
    return {
      size: 0,
      currentChatId: currentChatId.value || null,
      chatTabs: chatTabs.value.map((tab: any) => ({
        id: tab.id,
        title: tab.title,
        hosts: tab.hosts ? [...tab.hosts] : [],
        chatType: tab.chatType,
        autoUpdateHost: tab.autoUpdateHost,
        chatInputParts: tab.chatInputParts ? [...tab.chatInputParts] : [],
        modelValue: tab.modelValue,
        welcomeTip: tab.welcomeTip,
        agentHosts: tab.agentHosts ? [...tab.agentHosts] : undefined,
        session: {
          chatHistory: [...tab.session.chatHistory],
          lastChatMessageId: tab.session.lastChatMessageId,
          responseLoading: tab.session.responseLoading,
          showSendButton: tab.session.showSendButton,
          buttonsDisabled: tab.session.buttonsDisabled,
          isExecutingCommand: tab.session.isExecutingCommand,
          showRetryButton: tab.session.showRetryButton,
          shouldStickToBottom: tab.session.shouldStickToBottom
        }
      }))
    }
  }

  const emitStateChange = () => {
    if (suppressStateChange) return
    const currentState = getCurrentState()
    emit('state-changed', currentState)
  }

  const restoreState = (savedState: any) => {
    if (!savedState) return

    suppressStateChange = true

    try {
      if (savedState.chatTabs && savedState.chatTabs.length > 0) {
        chatTabs.value = savedState.chatTabs.map((savedTab: any) => ({
          id: savedTab.id,
          title: savedTab.title,
          hosts: savedTab.hosts ? [...savedTab.hosts] : [],
          chatType: savedTab.chatType,
          autoUpdateHost: savedTab.autoUpdateHost,
          chatInputParts: savedTab.chatInputParts ? [...savedTab.chatInputParts] : [],
          modelValue: savedTab.modelValue || '',
          welcomeTip: savedTab.welcomeTip || '',
          agentHosts: savedTab.agentHosts ? [...savedTab.agentHosts] : undefined,
          session: {
            chatHistory: [...savedTab.session.chatHistory],
            lastChatMessageId: savedTab.session.lastChatMessageId,
            responseLoading: savedTab.session.responseLoading || false,
            showSendButton: savedTab.session.showSendButton ?? true,
            buttonsDisabled: savedTab.session.buttonsDisabled || false,
            isExecutingCommand: savedTab.session.isExecutingCommand || false,
            showRetryButton: savedTab.session.showRetryButton || false,
            lastStreamMessage: null,
            lastPartialMessage: null,
            shouldStickToBottom: savedTab.session.shouldStickToBottom ?? true
          }
        }))
      }

      if (savedState.currentChatId) {
        const tabExists = chatTabs.value.some((tab: any) => tab.id === savedState.currentChatId)
        if (tabExists) {
          currentChatId.value = savedState.currentChatId
        } else if (chatTabs.value.length > 0) {
          currentChatId.value = chatTabs.value[0].id
        }
      }
    } finally {
      suppressStateChange = false
    }
  }

  watch(
    () => hosts.value,
    () => {
      if (!suppressStateChange) {
        emitStateChange()
      }
    },
    { deep: true }
  )

  watch(
    () => chatInputParts.value,
    () => {
      if (!suppressStateChange) {
        emitStateChange()
      }
    },
    { deep: true }
  )

  watch(
    () => chatAiModelValue.value,
    () => {
      if (!suppressStateChange) {
        emitStateChange()
      }
    }
  )

  return {
    getCurrentState,
    restoreState,
    emitStateChange,
    setSuppressStateChange: (value: boolean) => {
      suppressStateChange = value
    }
  }
}
