import { v4 as uuidv4 } from 'uuid'
import { nextTick, onMounted, onUnmounted } from 'vue'
import type { HistoryItem, Host, AssetInfo, ChatMessage } from '../types'
import type { ChatTab, SessionState } from './useSessionState'
import { useSessionState } from './useSessionState'
import { getGlobalState } from '@renderer/agent/storage/state'
import { ChatermMessage } from '@/types/ChatermMessage'

interface TabManagementOptions {
  getCurentTabAssetInfo: () => Promise<AssetInfo | null>
  emitStateChange?: () => void
  handleClose?: () => void
  isFocusInAiTab?: (event: KeyboardEvent) => boolean
}

export const focusChatInput = () => {
  nextTick(() => {
    const textarea = document.getElementsByClassName('chat-textarea')[0] as HTMLTextAreaElement | null
    if (textarea) {
      textarea.scrollTop = textarea.scrollHeight
      textarea.focus({ preventScroll: true })
    }
  })
}

/**
 * Tab 管理的 composable
 * 负责 Tab 的创建、删除、切换、历史记录恢复等操作
 */
export function useTabManagement(options: TabManagementOptions) {
  const { chatTabs, currentChatId, currentTab, createEmptySessionState, chatInputValue } = useSessionState()

  const { getCurentTabAssetInfo, emitStateChange, handleClose, isFocusInAiTab } = options

  const createNewEmptyTab = async (): Promise<string> => {
    console.log('createNewEmptyTab   begin')
    const newChatId = uuidv4()

    const [chatSetting, assetInfo] = await Promise.all([
      getGlobalState('chatSettings').catch(() => ({ mode: 'agent' })),
      getCurentTabAssetInfo().catch(() => null)
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

    const newTab: ChatTab = {
      id: newChatId,
      title: 'New chat',
      hosts,
      chatType,
      autoUpdateHost: true,
      session: createEmptySessionState(),
      inputValue: ''
    }

    chatTabs.value.push(newTab)
    currentChatId.value = newChatId

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
      try {
        const metadataResult = await window.api.getTaskMetadata(history.id)
        if (metadataResult.success && metadataResult.data && Array.isArray(metadataResult.data.hosts)) {
          loadedHosts = metadataResult.data.hosts.map((item: Host) => ({
            host: item.host,
            uuid: item.uuid || '',
            connection: item.connection
          }))
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
        showCancelButton: false,
        showRetryButton: false,
        showNewTaskButton: false,
        showSendButton: true,
        buttonsDisabled: false,
        resumeDisabled: false,
        isExecutingCommand: false,
        messageFeedbacks: {},
        lastStreamMessage: null,
        lastPartialMessage: null,
        shouldStickToBottom: true
      }

      const finalHosts = loadedHosts.length > 0 ? loadedHosts : (currentTab.value?.hosts ?? [])
      const historyTab: ChatTab = {
        id: history.id,
        title: history.chatTitle,
        hosts: finalHosts,
        chatType: history.chatType,
        autoUpdateHost: false,
        session: historySession,
        inputValue: ''
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

  const handleTabRemove = async (tabId: string) => {
    const tabIndex = chatTabs.value.findIndex((tab) => tab.id === tabId)
    if (tabIndex === -1) return

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
