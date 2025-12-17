import { ref, onMounted, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { notification } from 'ant-design-vue'
import eventBus from '@/utils/eventBus'
import type { ChatMessage } from '../types'
import type { Todo } from '@/types/todo'
import type { ChatTab } from './useSessionState'
import type { ExtensionMessage } from '@shared/ExtensionMessage'
import { createNewMessage, parseMessageContent, pickHostInfo } from '../utils'
import { useCurrentCwdStore } from '@/store/currentCwdStore'
import { useSessionState } from './useSessionState'
import { getGlobalState, updateGlobalState } from '@renderer/agent/storage/state'
import i18n from '@/locales'
const { t } = i18n.global
let globalIpcListenerInitialized = false

/**
 * Composable for chat message core logic
 * Handles message sending, receiving, display and other core functionalities
 */
export function useChatMessages(
  scrollToBottom: (force?: boolean) => void,
  clearTodoState: (messages: ChatMessage[]) => void,
  markLatestMessageWithTodoUpdate: (messages: ChatMessage[], todos: Todo[]) => void,
  currentTodos: any,
  checkModelConfig: () => Promise<boolean>
) {
  const { chatTabs, currentChatId, currentTab, currentSession, chatInputValue, hosts, chatTypeValue } = useSessionState()

  const currentCwdStore = useCurrentCwdStore()
  const currentCwd = computed(() => currentCwdStore.keyValueMap)
  const markdownRendererRefs = ref<Array<{ setThinkingLoading: (loading: boolean) => void }>>([])

  const isCurrentChatMessage = ref(true)

  const setMarkdownRendererRef = (el: any, index: number) => {
    if (el) {
      markdownRendererRefs.value[index] = el
    }
  }

  const formatParamValue = (value: unknown): string => {
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2)
      } catch {
        return String(value)
      }
    }
    return String(value)
  }

  /**
   * Clean up partial command messages
   * Removes messages with partial=true and ask='command'
   */
  const cleanupPartialCommandMessages = (chatHistory: ChatMessage[]) => {
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      const message = chatHistory[i]
      if (message.role === 'assistant' && message.partial === true && message.type === 'ask' && message.ask === 'command') {
        console.log('🗑️ Removing partial command message:', message.id, 'with timestamp:', message.ts)
        chatHistory.splice(i, 1)
        break
      }
    }
  }

  const isLocalHost = (ip: string): boolean => {
    return ip === '127.0.0.1' || ip === 'localhost' || ip === '::1'
  }

  const updateCwdForAllHosts = async () => {
    if (hosts.value.length > 0) {
      const updatePromises = hosts.value.map((host) => {
        if (isLocalHost(host.host)) {
          return (async () => {
            try {
              const result = await window.api.getLocalWorkingDirectory?.()
              if (result && result.success) {
                currentCwdStore.updateCwd(host.host, result.cwd)
              }
            } catch (error) {
              console.error('Failed to get local working directory:', error)
            }
          })()
        }

        return new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            eventBus.off('cwdUpdatedForHost', handleCwdUpdated)
            resolve()
          }, 1000)

          const handleCwdUpdated = (updatedHost: string) => {
            if (updatedHost === host.host) {
              clearTimeout(timeout)
              eventBus.off('cwdUpdatedForHost', handleCwdUpdated)
              resolve()
            }
          }

          eventBus.on('cwdUpdatedForHost', handleCwdUpdated)
          eventBus.emit('requestUpdateCwdForHost', host.host)
        })
      })

      await Promise.all(updatePromises)
    }
  }

  const sendMessageToMain = async (userContent: string, sendType: string, tabId?: string) => {
    try {
      const targetTab = tabId ? chatTabs.value.find((tab) => tab.id === tabId) : currentTab.value

      if (!targetTab || !targetTab.session) {
        return
      }

      const session = targetTab.session
      const targetHosts = targetTab.hosts

      await updateCwdForAllHosts()

      const filteredCwd = new Map()
      targetHosts.forEach((h) => {
        if (h.host && currentCwd.value[h.host]) {
          filteredCwd.set(h.host, currentCwd.value[h.host])
        }
      })
      const hostsArray = targetHosts.map((h) => ({
        host: h.host,
        uuid: h.uuid,
        connection: h.connection
      }))

      let message
      if (session.isExecutingCommand && session.chatHistory.length > 0) {
        message = {
          type: 'interactiveCommandInput',
          input: userContent
        }
        console.log('Sending interactive command input:', userContent)
      } else if (session.chatHistory.length === 0) {
        message = {
          type: 'newTask',
          askResponse: 'messageResponse',
          text: userContent,
          terminalOutput: '',
          hosts: hostsArray,
          cwd: filteredCwd,
          taskId: tabId || currentChatId.value
        }
      } else if (sendType === 'commandSend') {
        message = {
          type: 'askResponse',
          askResponse: 'yesButtonClicked',
          text: userContent,
          cwd: filteredCwd
        }
      } else {
        message = {
          type: 'askResponse',
          askResponse: 'messageResponse',
          text: userContent,
          cwd: filteredCwd
        }
      }

      const messageWithTabId = {
        ...message,
        tabId: tabId || currentChatId.value,
        taskId: tabId || currentChatId.value
      }
      console.log('Send message to main process:', messageWithTabId)
      const response = await window.api.sendToMain(messageWithTabId)
      console.log('Main process response:', response)
    } catch (error) {
      console.error('Failed to send message to main process:', error)
    }
  }

  const sendMessage = async (sendType: string) => {
    const checkModelConfigResult = await checkModelConfig()
    if (!checkModelConfigResult) {
      notification.error({
        message: t('user.checkModelConfigFailMessage'),
        description: t('user.checkModelConfigFailDescription'),
        duration: 3
      })
      return 'SEND_ERROR'
    }

    if (chatInputValue.value.trim() === '') {
      notification.error({
        message: t('ai.sendContentError'),
        description: t('ai.sendContentEmpty'),
        duration: 3
      })
      return 'SEND_ERROR'
    }

    const userContent = chatInputValue.value.trim()
    if (!userContent) return

    chatInputValue.value = ''

    if (hosts.value.length === 0 && chatTypeValue.value !== 'chat') {
      notification.error({
        message: t('ai.getAssetInfoFailed'),
        description: t('ai.pleaseConnectAsset'),
        duration: 3
      })
      return 'ASSET_ERROR'
    }

    if (sendType === 'send' && currentTodos.value.length > 0) {
      if (currentSession.value) {
        clearTodoState(currentSession.value.chatHistory)
      }
    }

    return await sendMessageWithContent(userContent, sendType)
  }

  const sendMessageWithContent = async (userContent: string, sendType: string, tabId?: string) => {
    const targetTab = tabId ? chatTabs.value.find((tab: ChatTab) => tab.id === tabId) : currentTab.value

    if (!targetTab || !targetTab.session) {
      return
    }

    const session = targetTab.session
    session.isCancelled = false

    await sendMessageToMain(userContent, sendType, tabId)

    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: userContent,
      type: 'message',
      ask: '',
      say: '',
      ts: 0
    }

    if (sendType === 'commandSend') {
      userMessage.role = 'assistant'
      userMessage.say = 'command_output'
    }

    session.chatHistory.push(userMessage)
    session.responseLoading = true
    session.showRetryButton = false
    session.showNewTaskButton = false

    if (!tabId || tabId === currentChatId.value) {
      scrollToBottom(true)
    }

    return
  }

  const handleModelApiReqFailed = (message: any, targetTab: ChatTab) => {
    const session = targetTab.session
    const newAssistantMessage = createNewMessage(
      'assistant',
      message.partialMessage.text,
      message.partialMessage.type,
      message.partialMessage.type === 'ask' ? message.partialMessage.ask : '',
      message.partialMessage.type === 'say' ? message.partialMessage.say : '',
      message.partialMessage.ts,
      false
    )

    cleanupPartialCommandMessages(session.chatHistory)
    session.chatHistory.push(newAssistantMessage)
    console.log('showRetryButton for tab', targetTab.id)
    session.showRetryButton = true
    session.responseLoading = false
  }

  const handleInteractiveCommandNotification = (message: any, targetTab: ChatTab) => {
    console.log('Processing interactive_command_notification:', message)

    const session = targetTab.session
    const notificationMessage = createNewMessage(
      'assistant',
      message.partialMessage.text,
      message.partialMessage.type,
      message.partialMessage.type === 'ask' ? message.partialMessage.ask : '',
      message.partialMessage.type === 'say' ? message.partialMessage.say : '',
      message.partialMessage.ts,
      false
    )

    cleanupPartialCommandMessages(session.chatHistory)
    session.chatHistory.push(notificationMessage)

    console.log('Interactive command notification processed and added to chat history')
  }

  const processMainMessage = async (message: ExtensionMessage) => {
    const targetTabId = message?.tabId ?? message?.taskId
    if (!targetTabId) {
      console.error('AiTab: Ignoring message for no target tab:', message.type)
      return
    }

    const targetTab = chatTabs.value.find((tab) => tab.id === targetTabId)
    if (!targetTab) {
      console.warn('AiTab: Ignoring message for deleted tab:', targetTabId)
      return
    }

    console.log('Received main process message:', message.type, message)

    const session = targetTab.session
    const isActiveTab = targetTabId === currentChatId.value
    const previousMainMessage = session.lastStreamMessage
    const previousPartialMessage = session.lastPartialMessage

    if (message?.type === 'partialMessage' && session.isCancelled) {
      console.log('AiTab: Ignoring partial message because task is cancelled')
      return
    }

    if (message?.type === 'partialMessage') {
      const partial = message.partialMessage
      if (!partial) {
        return
      }

      if (partial.type === 'ask' && partial.ask === 'completion_result') {
        session.showNewTaskButton = true
        session.responseLoading = false
        if (isActiveTab) {
          scrollToBottom()
        }
        return
      } else {
        session.showNewTaskButton = false
      }

      if (partial.say === 'interactive_command_notification') {
        handleInteractiveCommandNotification(message, targetTab)
        if (isActiveTab) {
          scrollToBottom()
        }
        return
      }

      if (partial.type === 'ask' && (partial.ask === 'api_req_failed' || partial.ask === 'ssh_con_failed')) {
        handleModelApiReqFailed(message, targetTab)
        if (isActiveTab) {
          scrollToBottom()
        }
        return
      }

      session.showRetryButton = false
      session.showSendButton = false
      const lastMessageInChat = session.chatHistory.at(-1)

      const openNewMessage =
        (previousMainMessage?.type === 'state' && !previousPartialMessage?.partialMessage?.partial) ||
        lastMessageInChat?.role === 'user' ||
        !previousMainMessage ||
        previousPartialMessage?.partialMessage?.ts !== partial.ts

      if (previousPartialMessage && JSON.stringify(previousPartialMessage) === JSON.stringify(message)) {
        return
      }

      if (isActiveTab) {
        isCurrentChatMessage.value = true
      }

      if (openNewMessage) {
        const hostInfo = pickHostInfo(partial as Partial<ChatMessage>)

        const newAssistantMessage = createNewMessage(
          'assistant',
          partial.text ?? '',
          partial.type ?? '',
          partial.type === 'ask' ? (partial.ask ?? '') : '',
          partial.type === 'say' ? (partial.say ?? '') : '',
          partial.ts ?? 0,
          partial.partial,
          hostInfo
        )

        if (!partial.partial && partial.type === 'ask' && partial.text) {
          newAssistantMessage.content = parseMessageContent(partial.text)
        }

        if (partial.mcpToolCall) {
          newAssistantMessage.mcpToolCall = partial.mcpToolCall
        }

        if (partial.type === 'say' && partial.say === 'command') {
          session.isExecutingCommand = true
        }

        session.lastChatMessageId = newAssistantMessage.id
        cleanupPartialCommandMessages(session.chatHistory)
        session.chatHistory.push(newAssistantMessage)
      } else if (lastMessageInChat && lastMessageInChat.role === 'assistant') {
        lastMessageInChat.content = partial.text ?? ''
        lastMessageInChat.type = partial.type ?? ''
        lastMessageInChat.ask = partial.type === 'ask' ? (partial.ask ?? '') : ''
        lastMessageInChat.say = partial.type === 'say' ? (partial.say ?? '') : ''
        lastMessageInChat.partial = partial.partial

        if (partial.mcpToolCall) {
          lastMessageInChat.mcpToolCall = partial.mcpToolCall
        }

        // Update host info for existing message
        const hostInfo = pickHostInfo(partial as Partial<ChatMessage>)
        if (hostInfo) {
          lastMessageInChat.hostId = hostInfo.hostId
          lastMessageInChat.hostName = hostInfo.hostName
          lastMessageInChat.colorTag = hostInfo.colorTag
        }

        if (!partial.partial && partial.type === 'ask' && partial.text) {
          lastMessageInChat.content = parseMessageContent(partial.text)
        }

        if (partial.type === 'say' && partial.say === 'command_output' && !partial.partial) {
          session.isExecutingCommand = false
        }
      }

      session.lastPartialMessage = message
      if (!partial.partial) {
        session.showSendButton = true
        if ((partial.type === 'ask' && partial.ask === 'command') || partial.say === 'command_blocked') {
          session.responseLoading = false
        }
      }
      if (isActiveTab) {
        scrollToBottom()
      }
    } else if (message?.type === 'state') {
      const chatermMessages = message.state?.chatermMessages ?? []
      const lastStateChatermMessages = chatermMessages.at(-1)
      if (
        chatermMessages.length > 0 &&
        lastStateChatermMessages?.partial != undefined &&
        !lastStateChatermMessages.partial &&
        session.responseLoading
      ) {
        session.responseLoading = false
      }
    } else if (message?.type === 'todoUpdated') {
      console.log('AiTab: Received todoUpdated message', message)

      if (Array.isArray(message.todos) && message.todos.length > 0) {
        markLatestMessageWithTodoUpdate(session.chatHistory, message.todos as Todo[])
      } else {
        clearTodoState(session.chatHistory)
      }
      if (isActiveTab) {
        scrollToBottom()
      }
    } else if (message?.type === 'chatTitleGenerated') {
      console.log('AiTab: Received chatTitleGenerated message', message)

      if (message.chatTitle && message.taskId) {
        targetTab.title = message.chatTitle
        console.log('Updated chat title to:', message.chatTitle)
      }
    }

    session.lastStreamMessage = message
  }

  const initializeListener = () => {
    // Only register IPC listener once globally to prevent duplicate event handling
    if (globalIpcListenerInitialized) {
      return
    }
    globalIpcListenerInitialized = true

    window.api.onMainMessage((message: any) => {
      processMainMessage(message).catch((error) => {
        console.error('Failed to process main process message:', error)
      })
    })
  }

  onMounted(() => {
    initializeListener()
  })

  const handleFeedback = async (message: ChatMessage, type: 'like' | 'dislike') => {
    const session = currentSession.value
    if (!session) return

    if (isMessageFeedbackSubmitted(message.id)) {
      return
    }

    session.messageFeedbacks[message.id] = type
    const feedbacks = ((await getGlobalState('messageFeedbacks')) || {}) as Record<string, 'like' | 'dislike'>
    feedbacks[message.id] = type
    await updateGlobalState('messageFeedbacks', feedbacks)
    let messageRsp = {
      type: 'taskFeedback',
      feedbackType: type === 'like' ? 'thumbs_up' : 'thumbs_down',
      taskId: currentChatId.value || undefined
    }
    await window.api.sendToMain(messageRsp)
  }

  const getMessageFeedback = (messageId: string): 'like' | 'dislike' | undefined => {
    return currentTab.value?.session.messageFeedbacks[messageId]
  }

  const isMessageFeedbackSubmitted = (messageId: string): boolean => {
    return !!currentTab.value?.session.messageFeedbacks[messageId]
  }

  return {
    markdownRendererRefs,
    isCurrentChatMessage,
    sendMessageToMain,
    sendMessage,
    sendMessageWithContent,
    processMainMessage,
    handleModelApiReqFailed,
    handleInteractiveCommandNotification,
    handleFeedback,
    getMessageFeedback,
    isMessageFeedbackSubmitted,
    setMarkdownRendererRef,
    formatParamValue,
    cleanupPartialCommandMessages,
    isLocalHost,
    updateCwdForAllHosts
  }
}
