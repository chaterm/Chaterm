import { ref, computed, watch } from 'vue'
import { createGlobalState } from '@vueuse/core'
import type { ChatMessage, Host } from '../types'
import type { ExtensionMessage } from '@shared/ExtensionMessage'

/**
 * 会话状态接口
 * 定义每个 Tab 的会话状态结构
 */
export interface SessionState {
  chatHistory: ChatMessage[] // 消息历史列表
  lastChatMessageId: string // 最后一条消息的ID
  responseLoading: boolean // 是否正在加载回复
  showCancelButton: boolean // 是否显示取消按钮
  showRetryButton: boolean // 是否显示重试按钮
  showNewTaskButton: boolean // 是否显示新任务按钮
  showSendButton: boolean // 是否显示发送按钮
  buttonsDisabled: boolean // 是否禁用按钮
  resumeDisabled: boolean // 是否禁用恢复按钮
  isExecutingCommand: boolean // 是否正在执行命令
  messageFeedbacks: Record<string, 'like' | 'dislike'> // 消息反馈记录
  lastStreamMessage: ExtensionMessage | null // 最后一条流式消息
  lastPartialMessage: ExtensionMessage | null // 最后一条部分消息
  shouldStickToBottom: boolean // 是否应该粘在底部
}

/**
 * Tab 信息接口
 */
export interface ChatTab {
  id: string // Tab ID（UUID）
  title: string // Tab 标题
  hosts: Host[] // 关联的主机列表
  chatType: string // 聊天类型（agent/cmd/chat）
  autoUpdateHost: boolean // 是否自动更新主机
  session: SessionState // 会话状态
  inputValue: string // 输入框内容
}

/**
 * 会话状态管理的 composable（核心 - 全局单例）
 * 负责管理所有 Tab 和会话状态
 * 使用 createGlobalState 确保全局唯一实例
 */
export const useSessionState = createGlobalState(() => {
  const currentChatId = ref<string | undefined>(undefined)

  const chatTabs = ref<ChatTab[]>([])

  const createEmptySessionState = (): SessionState => ({
    chatHistory: [],
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
  const showCancelButton = computed(() => currentSession.value?.showCancelButton ?? false)
  const chatHistory = computed(() => currentSession.value?.chatHistory ?? [])
  const showSendButton = computed(() => currentSession.value?.showSendButton ?? true)
  const buttonsDisabled = computed(() => currentSession.value?.buttonsDisabled ?? false)
  const resumeDisabled = computed(() => currentSession.value?.resumeDisabled ?? false)
  const isExecutingCommand = computed(() => currentSession.value?.isExecutingCommand ?? false)
  const showRetryButton = computed(() => currentSession.value?.showRetryButton ?? false)
  const showNewTaskButton = computed(() => currentSession.value?.showNewTaskButton ?? false)

  /**
   * 过滤后的聊天历史
   * 在 Agent 回复后隐藏 sshInfo 消息
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

    if (session.responseLoading || session.isExecutingCommand || session.showNewTaskButton) {
      return false
    }

    if (lastMessage?.role === 'assistant' && lastMessage?.say === 'completion_result') {
      return false
    }

    return session.chatHistory.length > 0 && !session.resumeDisabled
  })

  const shouldShowSendButton = computed(() => {
    const trimmedValue = chatInputValue.value.trim()
    return trimmedValue.length >= 1 && !/^\s*$/.test(trimmedValue)
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
   * 同步发送按钮状态到 session
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
    hosts,
    autoUpdateHost,
    chatInputValue,
    shouldStickToBottom,
    lastChatMessageId,
    responseLoading,
    showCancelButton,
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
