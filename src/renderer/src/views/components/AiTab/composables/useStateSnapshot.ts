import { watch, Ref } from 'vue'
import { updateGlobalState } from '@renderer/agent/storage/state'
import { useSessionState } from './useSessionState'

/**
 * 状态快照的 composable
 * 负责状态快照的创建、恢复和变更通知
 */
export function useStateSnapshot(chatAiModelValue: Ref<string>, emit: (event: 'state-changed', ...args: any[]) => void) {
  const { chatTabs, currentChatId, chatTypeValue, hosts, chatInputValue } = useSessionState()

  let suppressStateChange = false

  const getCurrentState = () => {
    return {
      size: 0,
      currentChatId: currentChatId.value || null,
      chatTabs: chatTabs.value.map((tab: any) => ({
        id: tab.id,
        title: tab.title,
        hosts: [...tab.hosts],
        chatType: tab.chatType,
        autoUpdateHost: tab.autoUpdateHost,
        inputValue: tab.inputValue,
        session: {
          chatHistory: [...tab.session.chatHistory],
          lastChatMessageId: tab.session.lastChatMessageId,
          responseLoading: tab.session.responseLoading,
          showCancelButton: tab.session.showCancelButton,
          showSendButton: tab.session.showSendButton,
          buttonsDisabled: tab.session.buttonsDisabled,
          resumeDisabled: tab.session.resumeDisabled,
          isExecutingCommand: tab.session.isExecutingCommand,
          showRetryButton: tab.session.showRetryButton,
          showNewTaskButton: tab.session.showNewTaskButton,
          messageFeedbacks: { ...tab.session.messageFeedbacks },
          shouldStickToBottom: tab.session.shouldStickToBottom
        }
      })),
      chatAiModelValue: chatAiModelValue.value
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
          hosts: [...savedTab.hosts],
          chatType: savedTab.chatType,
          autoUpdateHost: savedTab.autoUpdateHost,
          inputValue: savedTab.inputValue,
          session: {
            chatHistory: [...savedTab.session.chatHistory],
            lastChatMessageId: savedTab.session.lastChatMessageId,
            responseLoading: savedTab.session.responseLoading || false,
            showCancelButton: savedTab.session.showCancelButton || false,
            showSendButton: savedTab.session.showSendButton ?? true,
            buttonsDisabled: savedTab.session.buttonsDisabled || false,
            resumeDisabled: savedTab.session.resumeDisabled || false,
            isExecutingCommand: savedTab.session.isExecutingCommand || false,
            showRetryButton: savedTab.session.showRetryButton || false,
            showNewTaskButton: savedTab.session.showNewTaskButton || false,
            messageFeedbacks: savedTab.session.messageFeedbacks || {},
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

      if (savedState.chatAiModelValue) {
        chatAiModelValue.value = savedState.chatAiModelValue
      }
    } finally {
      suppressStateChange = false
    }
  }

  watch(() => currentChatId.value, emitStateChange)

  watch(
    () => chatTypeValue.value,
    async (newValue) => {
      if (!newValue || newValue.trim() === '') {
        return
      }
      try {
        await updateGlobalState('chatSettings', {
          mode: newValue
        })
        console.log('Updated chatSettings:', newValue)

        if (!suppressStateChange) {
          emitStateChange()
        }
      } catch (error) {
        console.error('Failed to update chatSettings:', error)
      }
    }
  )

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
    () => chatInputValue.value,
    () => {
      if (!suppressStateChange) {
        emitStateChange()
      }
    }
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
