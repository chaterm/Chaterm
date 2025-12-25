import { v4 as uuidv4 } from 'uuid'
import { nextTick, onMounted, onUnmounted } from 'vue'
import { Modal } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { HistoryItem, Host, AssetInfo, ChatMessage } from '../types'
import type { ChatTab, SessionState } from './useSessionState'
import { useSessionState } from './useSessionState'
import { getGlobalState } from '@renderer/agent/storage/state'
import type { GlobalStateKey } from '@renderer/agent/storage/state-keys'
import { ChatermMessage } from '@/types/ChatermMessage'

interface TabManagementOptions {
  getCurentTabAssetInfo: () => Promise<AssetInfo | null>
  emitStateChange?: () => void
  handleClose?: () => void
  isFocusInAiTab?: (event: KeyboardEvent) => boolean
}

export const focusChatInput = () => {
  const { chatTextareaRef } = useSessionState()

  nextTick(() => {
    if (chatTextareaRef.value) {
      chatTextareaRef.value.scrollTop = chatTextareaRef.value.scrollHeight
      chatTextareaRef.value.focus({ preventScroll: true })
    }
  })
}

/**
 * Composable for Tab management
 * Handles Tab creation, deletion, switching, history restoration and other operations
 */
export function useTabManagement(options: TabManagementOptions) {
  const { chatTabs, currentChatId, currentTab, createEmptySessionState, chatInputValue } = useSessionState()

  const { getCurentTabAssetInfo, emitStateChange, handleClose, isFocusInAiTab } = options

  // Get i18n instance
  const { t, locale, messages } = useI18n()

  /**
   * Generate a random welcome tip from i18n messages
   */
  const generateRandomWelcomeTip = (): string => {
    const currentMessages = messages.value[locale.value] as any
    const tips = currentMessages?.ai?.welcomeTips

    if (Array.isArray(tips) && tips.length > 0) {
      const randomIndex = Math.floor(Math.random() * tips.length)
      return tips[randomIndex]
    }
    return (t('ai.welcome') as string) || ''
  }

  const createNewEmptyTab = async (): Promise<string> => {
    console.log('createNewEmptyTab   begin')
    const newChatId = uuidv4()

    const placeholderTab: ChatTab = {
      id: newChatId,
      title: 'New chat',
      hosts: [
        {
          host: '127.0.0.1',
          uuid: 'localhost',
          connection: 'localhost'
        }
      ],
      chatType: 'agent',
      autoUpdateHost: true,
      session: createEmptySessionState(),
      inputValue: '',
      modelValue: '',
      welcomeTip: generateRandomWelcomeTip()
    }

    chatTabs.value.push(placeholderTab)

    // Set currentChatId immediately so input box can display right away
    currentChatId.value = newChatId

    // Asynchronously get actual data
    const [chatSetting, assetInfo, apiProvider] = await Promise.all([
      getGlobalState('chatSettings').catch(() => ({ mode: 'agent' })),
      getCurentTabAssetInfo().catch(() => null),
      getGlobalState('apiProvider').catch(() => 'default')
    ])

    const chatType = (chatSetting as { mode?: string })?.mode || 'agent'
    const hosts: Host[] =
      assetInfo && assetInfo.ip
        ? [
            {
              host: assetInfo.ip,
              uuid: assetInfo.uuid,
              connection: assetInfo.connection || 'personal'
            }
          ]
        : [
            {
              host: '127.0.0.1',
              uuid: 'localhost',
              connection: 'localhost'
            }
          ]

    // Get currently selected model as default value for new Tab
    const PROVIDER_MODEL_KEY_MAP: Record<string, GlobalStateKey> = {
      bedrock: 'apiModelId',
      litellm: 'liteLlmModelId',
      deepseek: 'apiModelId',
      openai: 'openAiModelId',
      default: 'defaultModelId'
    }
    const key = PROVIDER_MODEL_KEY_MAP[(apiProvider as string) || 'default'] || 'defaultModelId'
    const currentModelValue = (await getGlobalState(key).catch(() => '')) as string

    // Update actual data of placeholder tab
    const tab = chatTabs.value.find((t) => t.id === newChatId)
    if (tab) {
      tab.chatType = chatType
      tab.hosts = hosts
      tab.modelValue = currentModelValue || ''
    }

    emitStateChange?.()

    if (chatInputValue) {
      chatInputValue.value = ''
    }

    focusChatInput()
    console.log('createNewEmptyTab   end')

    return newChatId
  }

  const isStringContent = (content: unknown): content is string => {
    return typeof content === 'string'
  }

  const restoreHistoryTab = async (history: HistoryItem) => {
    try {
      const existingTabIndex = chatTabs.value.findIndex((tab) => tab.id === history.id)
      if (existingTabIndex !== -1) {
        currentChatId.value = history.id
        return
      }

      let loadedHosts: Host[] = []
      let savedChatType = history.chatType
      let savedModelValue = ''
      try {
        const metadataResult = await window.api.getTaskMetadata(history.id)
        console.log('Metadata:', metadataResult)
        if (metadataResult.success && metadataResult.data) {
          if (metadataResult.data.hosts?.length > 0) {
            loadedHosts = metadataResult.data.hosts.map((item: Host) => ({
              host: item.host,
              uuid: item.uuid || '',
              connection: item.connection
            }))
          }

          if (metadataResult.data.model_usage?.length > 0) {
            const lastModelUsage = metadataResult.data.model_usage[metadataResult.data.model_usage.length - 1]
            savedChatType = lastModelUsage.mode || savedChatType
            savedModelValue = lastModelUsage.model_id || ''
          }
        }
      } catch (e) {
        console.error('Failed to get metadata:', e)
      }

      const result = await window.api.chatermGetChatermMessages({
        taskId: history.id
      })
      const conversationHistory = result as ChatermMessage[]

      const historyChatMessages: ChatMessage[] = []
      let lastItem: ChatermMessage | null = null
      conversationHistory.forEach((item, index) => {
        const isDuplicate =
          lastItem && item.text === lastItem.text && item.ask === lastItem.ask && item.say === lastItem.say && item.type === lastItem.type

        if (
          !isDuplicate &&
          (item.ask === 'followup' ||
            item.ask === 'command' ||
            item.ask === 'mcp_tool_call' ||
            item.say === 'command' ||
            item.say === 'command_output' ||
            item.say === 'completion_result' ||
            item.say === 'search_result' ||
            item.say === 'text' ||
            item.say === 'reasoning' ||
            item.ask === 'resume_task' ||
            item.say === 'user_feedback' ||
            item.say === 'sshInfo' ||
            item.say === 'interactive_command_notification')
        ) {
          let role: 'assistant' | 'user' = 'assistant'
          if (index === 0 || item.say === 'user_feedback') {
            role = 'user'
          }
          const userMessage: ChatMessage = {
            id: uuidv4(),
            role: role,
            content: item.text || '',
            type: item.type,
            ask: item.ask,
            say: item.say,
            ts: item.ts
          }

          if (item.mcpToolCall) {
            userMessage.mcpToolCall = item.mcpToolCall
          }

          if (userMessage.say === 'user_feedback' && isStringContent(userMessage.content) && userMessage.content.startsWith('Terminal output:')) {
            userMessage.say = 'command_output'
            userMessage.role = 'assistant'
          }

          if (!item.partial && item.type === 'ask' && item.text) {
            try {
              let contentJson = JSON.parse(item.text)
              if (item.ask === 'followup') {
                userMessage.content = contentJson
                userMessage.selectedOption = contentJson?.selected
              } else {
                userMessage.content = contentJson?.question
              }
            } catch (e) {
              userMessage.content = item.text
            }
          }
          historyChatMessages.push(userMessage)
          lastItem = item
        }
      })

      const historySession: SessionState = {
        chatHistory: historyChatMessages,
        lastChatMessageId: '',
        responseLoading: false,
        showRetryButton: false,
        showNewTaskButton: false,
        showSendButton: true,
        buttonsDisabled: false,
        resumeDisabled: false,
        isExecutingCommand: false,
        messageFeedbacks: {},
        lastStreamMessage: null,
        lastPartialMessage: null,
        shouldStickToBottom: true,
        isCancelled: false
      }

      const finalHosts = loadedHosts.length > 0 ? loadedHosts : (currentTab.value?.hosts ?? [])

      const historyTab: ChatTab = {
        id: history.id,
        title: history.chatTitle,
        hosts: finalHosts,
        chatType: savedChatType,
        autoUpdateHost: false,
        session: historySession,
        inputValue: '',
        modelValue: savedModelValue || currentTab.value?.modelValue || '',
        welcomeTip: ''
      }

      const isCurrentNewTab = currentTab.value && currentTab.value.title === 'New chat' && currentTab.value.session.chatHistory.length === 0
      if (isCurrentNewTab) {
        const currentTabIndex = chatTabs.value.findIndex((tab) => tab.id === currentTab.value!.id)
        if (currentTabIndex !== -1) {
          chatTabs.value[currentTabIndex] = historyTab
        }
      } else {
        chatTabs.value.push(historyTab)
      }
      currentChatId.value = history.id

      await window.api.sendToMain({
        type: 'showTaskWithId',
        text: history.id,
        hosts: finalHosts.map((h) => ({
          host: h.host,
          uuid: h.uuid,
          connection: h.connection
        }))
      })

      focusChatInput()
    } catch (err) {
      console.error('Failed to restore history tab:', err)
    }
  }

  const handleTabRemove = async (tabId: string, skipConfirm: boolean = false) => {
    const tabIndex = chatTabs.value.findIndex((tab) => tab.id === tabId)
    if (tabIndex === -1) return

    const targetTab = chatTabs.value[tabIndex]
    const isExecuting = targetTab.session.responseLoading

    if (isExecuting && !skipConfirm) {
      Modal.confirm({
        title: t('common.closeTabConfirm'),
        content: t('common.closeTabWithTaskRunning'),
        okText: t('common.forceClose'),
        okType: 'danger',
        cancelText: `${t('common.cancel')} (ESC)`,
        maskClosable: true,
        onOk: async () => {
          // After user confirms, recursively call with skipConfirm=true
          await handleTabRemove(tabId, true)
        }
      })
      return
    }

    console.log('handleTabRemove: cancel task for tab', tabId)
    await window.api.cancelTask(tabId)

    chatTabs.value.splice(tabIndex, 1)

    if (chatTabs.value.length === 0) {
      currentChatId.value = undefined
      emitStateChange?.()
      handleClose?.()
      return
    }

    const newActiveIndex = Math.min(tabIndex, chatTabs.value.length - 1)
    const newActiveTab = chatTabs.value[newActiveIndex]

    currentChatId.value = newActiveTab.id
  }

  const handleCloseTabKeyDown = (event: KeyboardEvent) => {
    const isWindows = navigator.platform.toLowerCase().includes('win')
    if (!isWindows && (event.metaKey || event.ctrlKey) && event.key === 'w') {
      if (isFocusInAiTab && !isFocusInAiTab(event)) {
        return
      }

      if (!chatTabs.value || chatTabs.value.length === 0) {
        return
      }
      if (!currentChatId.value) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      handleTabRemove(currentChatId.value)
    }
  }
  onMounted(() => {
    window.addEventListener('keydown', handleCloseTabKeyDown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleCloseTabKeyDown)
  })

  return {
    createNewEmptyTab,
    restoreHistoryTab,
    handleTabRemove,
    handleCloseTabKeyDown
  }
}
