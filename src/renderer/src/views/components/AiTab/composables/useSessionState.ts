import { ref, computed, watch } from 'vue'
import { createGlobalState } from '@vueuse/core'
import type { ChatMessage, Host } from '../types'
import type { ExtensionMessage } from '@shared/ExtensionMessage'

/**
 * Session state interface
 * Defines the session state structure for each Tab
 */
export interface SessionState {
  chatHistory: ChatMessage[] // Chat history list
  lastChatMessageId: string // ID of the last message
  responseLoading: boolean // Whether response is loading
  showRetryButton: boolean // Whether to show retry button
  showNewTaskButton: boolean // Whether to show new task button
  showSendButton: boolean // Whether to show send button
  buttonsDisabled: boolean // Whether buttons are disabled
  resumeDisabled: boolean // Whether resume button is disabled
  isExecutingCommand: boolean // Whether command is executing
  messageFeedbacks: Record<string, 'like' | 'dislike'> // Message feedback records
  lastStreamMessage: ExtensionMessage | null // Last stream message
  lastPartialMessage: ExtensionMessage | null // Last partial message
  shouldStickToBottom: boolean // Whether should stick to bottom
  isCancelled: boolean // Whether the current task has been cancelled/interrupted
}

/**
 * Tab information interface
 */
export interface ChatTab {
  id: string // Tab ID (UUID)
  title: string // Tab title
  hosts: Host[] // Associated host list
  chatType: string // Chat type (agent/cmd/chat)
  autoUpdateHost: boolean // Whether to auto-update host
  session: SessionState // Session state
  inputValue: string // Input value
  modelValue: string // Selected AI model for this tab
}

/**
 * Composable for session state management (core - global singleton)
 * Manages all Tabs and session states
 * Uses createGlobalState to ensure global unique instance
 */
export const useSessionState = createGlobalState(() => {
  const currentChatId = ref<string | undefined>(undefined)

  const chatTabs = ref<ChatTab[]>([])

  const createEmptySessionState = (): SessionState => ({
    chatHistory: [],
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
  })

  const currentTab = computed(() => {
    return chatTabs.value.find((tab) => tab.id === currentChatId.value)
  })

  const currentSession = computed(() => currentTab.value?.session)

  const currentChatTitle = computed({
    get: () => currentTab.value?.title ?? 'New chat',
    set: (value: string) => {
      if (currentTab.value) {
        currentTab.value.title = value
      }
    }
  })

  const chatTypeValue = computed({
    get: () => currentTab.value?.chatType ?? '',
    set: (value: string) => {
      if (currentTab.value) {
        currentTab.value.chatType = value
      }
    }
  })

  const hosts = computed({
    get: () => currentTab.value?.hosts ?? [],
    set: (value: Host[]) => {
      if (currentTab.value) {
        currentTab.value.hosts = value
      }
    }
  })

  const autoUpdateHost = computed({
    get: () => currentTab.value?.autoUpdateHost ?? true,
    set: (value: boolean) => {
      if (currentTab.value) {
        currentTab.value.autoUpdateHost = value
      }
    }
  })

  const chatInputValue = computed({
    get: () => currentTab.value?.inputValue ?? '',
    set: (value: string) => {
      if (currentTab.value) {
        currentTab.value.inputValue = value
      }
    }
  })

  const shouldStickToBottom = computed({
    get: () => currentSession.value?.shouldStickToBottom ?? true,
    set: (value: boolean) => {
      if (currentSession.value) {
        currentSession.value.shouldStickToBottom = value
      }
    }
  })

  const lastChatMessageId = computed(() => currentSession.value?.lastChatMessageId ?? '')
  const responseLoading = computed(() => currentSession.value?.responseLoading ?? false)
  const chatHistory = computed(() => currentSession.value?.chatHistory ?? [])
  const showSendButton = computed(() => currentSession.value?.showSendButton ?? true)
  const buttonsDisabled = computed(() => currentSession.value?.buttonsDisabled ?? false)
  const resumeDisabled = computed(() => currentSession.value?.resumeDisabled ?? false)
  const isExecutingCommand = computed(() => currentSession.value?.isExecutingCommand ?? false)
  const showRetryButton = computed(() => currentSession.value?.showRetryButton ?? false)
  const showNewTaskButton = computed(() => currentSession.value?.showNewTaskButton ?? false)

  /**
   * Filtered chat history
   * Hides sshInfo messages after Agent reply
   */
  const filteredChatHistory = computed(() => {
    const history = currentSession.value?.chatHistory ?? []
    const hasAgentReply = history.some(
      (msg) => msg.role === 'assistant' && msg.say !== 'sshInfo' && (msg.say === 'text' || msg.say === 'completion_result' || msg.ask === 'command')
    )
    return hasAgentReply ? history.filter((msg) => msg.say !== 'sshInfo') : history
  })

  const showResumeButton = computed(() => {
    if (!currentSession.value) return false

    const session = currentSession.value
    const lastMessage = session.chatHistory.at(-1)

    if (!lastMessage) {
      return false
    }
    return lastMessage.ask === 'resume_task'
  })

  const shouldShowSendButton = computed(() => {
    const trimmedValue = chatInputValue.value.trim()
    return trimmedValue.length >= 1 && !/^\s*$/.test(trimmedValue)
  })

  const chatAiModelValue = computed({
    get: () => currentTab.value?.modelValue ?? '',
    set: (value: string) => {
      if (currentTab.value) {
        currentTab.value.modelValue = value
      }
    }
  })

  watch(
    () => currentSession.value?.chatHistory.length,
    () => {
      const session = currentSession.value
      if (session) {
        session.buttonsDisabled = false
        session.resumeDisabled = false
      }
    }
  )

  /**
   * Sync send button state to session
   */
  watch(
    shouldShowSendButton,
    (newValue) => {
      const session = currentSession.value
      if (session) {
        session.showSendButton = newValue
      }
    },
    { immediate: true }
  )

  const attachTabContext = <T extends Record<string, any>>(payload: T): T & { tabId?: string; taskId?: string } => {
    const tabId = currentChatId.value
    if (!tabId) {
      return payload
    }

    return {
      ...payload,
      tabId: payload?.tabId ?? tabId,
      taskId: payload?.taskId ?? tabId
    }
  }

  return {
    currentChatId,
    chatTabs,
    currentTab,
    currentSession,
    createEmptySessionState,
    currentChatTitle,
    chatTypeValue,
    chatAiModelValue,
    hosts,
    autoUpdateHost,
    chatInputValue,
    shouldStickToBottom,
    lastChatMessageId,
    responseLoading,
    chatHistory,
    filteredChatHistory,
    showSendButton,
    buttonsDisabled,
    resumeDisabled,
    isExecutingCommand,
    showRetryButton,
    showNewTaskButton,
    showResumeButton,
    shouldShowSendButton,
    attachTabContext
  }
})
