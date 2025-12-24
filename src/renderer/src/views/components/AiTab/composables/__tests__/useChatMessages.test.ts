import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { useChatMessages } from '../useChatMessages'
import { useSessionState } from '../useSessionState'
import type { ChatMessage, Host } from '../../types'
import type { ExtensionMessage } from '@shared/ExtensionMessage'
import type { Todo } from '@/types/todo'

// Mock dependencies
vi.mock('../useSessionState')
vi.mock('@/utils/eventBus', () => ({
  default: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  }
}))
vi.mock('@/store/currentCwdStore', () => ({
  useCurrentCwdStore: vi.fn(() => ({
    keyValueMap: {}
  }))
}))
vi.mock('@renderer/agent/storage/state', () => ({
  getGlobalState: vi.fn(),
  updateGlobalState: vi.fn()
}))
vi.mock('@/locales', () => ({
  default: {
    global: {
      t: (key: string) => key
    }
  }
}))

// Mock window.api
const mockSendToMain = vi.fn()
const mockOnMainMessage = vi.fn()
const mockGetLocalWorkingDirectory = vi.fn()
global.window = {
  api: {
    sendToMain: mockSendToMain,
    onMainMessage: mockOnMainMessage,
    getLocalWorkingDirectory: mockGetLocalWorkingDirectory
  }
} as any

// Mock ant-design-vue notification
vi.mock('ant-design-vue', () => ({
  notification: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn()
  }
}))

describe('useChatMessages', () => {
  let mockScrollToBottom: (force?: boolean) => void
  let mockClearTodoState: (messages: ChatMessage[]) => void
  let mockMarkLatestMessageWithTodoUpdate: (messages: ChatMessage[], todos: Todo[]) => void
  let mockCheckModelConfig: ReturnType<typeof vi.fn<() => Promise<{ success: boolean; message?: string; description?: string }>>>
  let mockCurrentTodos: ReturnType<typeof ref<any[]>>

  const createMockSession = () => ({
    chatHistory: [] as ChatMessage[],
    lastChatMessageId: '',
    responseLoading: false,
    showRetryButton: false,
    showNewTaskButton: false,
    showSendButton: true,
    buttonsDisabled: false,
    resumeDisabled: false,
    isExecutingCommand: false,
    messageFeedbacks: {} as Record<string, 'like' | 'dislike'>,
    lastStreamMessage: null,
    lastPartialMessage: null,
    shouldStickToBottom: true,
    isCancelled: false
  })

  const createMockTab = (id: string, session = createMockSession()) => ({
    id,
    title: 'Test Tab',
    hosts: [{ host: '127.0.0.1', uuid: 'localhost', connection: 'localhost' }] as Host[],
    chatType: 'agent' as const,
    autoUpdateHost: true,
    session,
    inputValue: '',
    modelValue: ''
  })

  beforeEach(() => {
    vi.clearAllMocks()

    mockScrollToBottom = vi.fn()
    mockClearTodoState = vi.fn()
    mockMarkLatestMessageWithTodoUpdate = vi.fn()
    mockCheckModelConfig = vi.fn().mockResolvedValue({ success: true })
    mockCurrentTodos = ref([])

    const mockTab = createMockTab('test-tab-1')
    const chatTabs = ref([mockTab])
    const currentChatId = ref('test-tab-1')
    const chatInputValue = ref('')
    const hosts = ref<Host[]>([{ host: '127.0.0.1', uuid: 'localhost', connection: 'localhost' }])
    const chatTypeValue = ref('agent')

    vi.mocked(useSessionState).mockReturnValue({
      chatTabs,
      currentChatId,
      currentTab: ref(mockTab),
      currentSession: ref(mockTab.session),
      chatInputValue,
      hosts,
      chatTypeValue
    } as any)

    mockSendToMain.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('formatParamValue', () => {
    it('should format null value', () => {
      const { formatParamValue } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      expect(formatParamValue(null)).toBe('null')
    })

    it('should format undefined value', () => {
      const { formatParamValue } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      expect(formatParamValue(undefined)).toBe('undefined')
    })

    it('should format string value', () => {
      const { formatParamValue } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      expect(formatParamValue('test')).toBe('test')
    })

    it('should format number value', () => {
      const { formatParamValue } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      expect(formatParamValue(123)).toBe('123')
    })

    it('should format boolean value', () => {
      const { formatParamValue } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      expect(formatParamValue(true)).toBe('true')
      expect(formatParamValue(false)).toBe('false')
    })

    it('should format object value as JSON', () => {
      const { formatParamValue } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      const obj = { key: 'value', nested: { prop: 123 } }
      const result = formatParamValue(obj)
      expect(result).toContain('"key"')
      expect(result).toContain('"value"')
      expect(result).toContain('"nested"')
    })
  })

  describe('cleanupPartialCommandMessages', () => {
    it('should remove partial command messages from chat history', () => {
      const { cleanupPartialCommandMessages } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      const chatHistory: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Hello',
          type: 'message',
          ask: '',
          say: '',
          ts: 100
        },
        {
          id: '2',
          role: 'assistant',
          content: 'ls -la',
          type: 'ask',
          ask: 'command',
          say: '',
          ts: 200,
          partial: true
        }
      ]

      cleanupPartialCommandMessages(chatHistory)

      expect(chatHistory).toHaveLength(1)
      expect(chatHistory[0].id).toBe('1')
    })

    it('should not remove non-partial messages', () => {
      const { cleanupPartialCommandMessages } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      const chatHistory: ChatMessage[] = [
        {
          id: '1',
          role: 'assistant',
          content: 'ls -la',
          type: 'ask',
          ask: 'command',
          say: '',
          ts: 100,
          partial: false
        }
      ]

      cleanupPartialCommandMessages(chatHistory)

      expect(chatHistory).toHaveLength(1)
    })
  })

  describe('isLocalHost', () => {
    it('should identify localhost IP addresses', () => {
      const { isLocalHost } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      expect(isLocalHost('127.0.0.1')).toBe(true)
      expect(isLocalHost('localhost')).toBe(true)
      expect(isLocalHost('::1')).toBe(true)
      expect(isLocalHost('192.168.1.1')).toBe(false)
    })
  })

  describe('sendMessage', () => {
    it('should return error when model config check fails', async () => {
      const { notification } = await import('ant-design-vue')
      const eventBus = (await import('@/utils/eventBus')).default

      mockCheckModelConfig.mockResolvedValue({ success: false })

      const { sendMessage } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      const mockState = vi.mocked(useSessionState)()
      mockState.chatInputValue.value = 'Test message'

      const result = await sendMessage('send')

      expect(result).toBe('SEND_ERROR')
      expect(mockSendToMain).not.toHaveBeenCalled()
      expect(notification.error).toHaveBeenCalledWith({
        message: 'user.checkModelConfigFailMessage',
        description: 'user.checkModelConfigFailDescription',
        duration: 5
      })

      // Wait for setTimeout to execute
      await new Promise((resolve) => setTimeout(resolve, 600))
      expect(eventBus.emit).toHaveBeenCalledWith('openUserTab', 'userConfig')
      expect(eventBus.emit).toHaveBeenCalledWith('switchToModelSettingsTab')
    })

    it('should use custom message and description when provided', async () => {
      const { notification } = await import('ant-design-vue')

      mockCheckModelConfig.mockResolvedValue({
        success: false,
        message: 'user.noAvailableModelMessage',
        description: 'user.noAvailableModelDescription'
      })

      const { sendMessage } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      const mockState = vi.mocked(useSessionState)()
      mockState.chatInputValue.value = 'Test message'

      const result = await sendMessage('send')

      expect(result).toBe('SEND_ERROR')
      expect(notification.error).toHaveBeenCalledWith({
        message: 'user.noAvailableModelMessage',
        description: 'user.noAvailableModelDescription',
        duration: 5
      })
    })

    it('should return error when input is empty', async () => {
      const { notification } = await import('ant-design-vue')

      const { sendMessage } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      const mockState = vi.mocked(useSessionState)()
      mockState.chatInputValue.value = '   '

      const result = await sendMessage('send')

      expect(result).toBe('SEND_ERROR')
      expect(notification.error).toHaveBeenCalled()
    })

    it('should return error when hosts are empty for non-chat type', async () => {
      const { notification } = await import('ant-design-vue')

      const { sendMessage } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      const mockState = vi.mocked(useSessionState)()
      mockState.chatInputValue.value = 'Test message'
      mockState.hosts.value = []
      mockState.chatTypeValue.value = 'cmd'

      const result = await sendMessage('send')

      expect(result).toBe('ASSET_ERROR')
      expect(notification.error).toHaveBeenCalled()
    })

    it('should send message successfully', async () => {
      const { sendMessage } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      const mockState = vi.mocked(useSessionState)()
      mockState.chatInputValue.value = 'Test message'

      await sendMessage('send')

      expect(mockSendToMain).toHaveBeenCalled()
      expect(mockState.chatInputValue.value).toBe('')
    })

    it('should clear todo state when sending new message', async () => {
      mockCurrentTodos.value = [{ id: '1', content: 'Test', status: 'pending' }] as any

      const { sendMessage } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      const mockState = vi.mocked(useSessionState)()
      mockState.chatInputValue.value = 'Test message'

      await sendMessage('send')

      expect(mockClearTodoState).toHaveBeenCalled()
    })
  })

  describe('sendMessageWithContent', () => {
    it('should add user message to chat history', async () => {
      const { sendMessageWithContent } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!

      await sendMessageWithContent('Test message', 'send')

      expect(session.chatHistory).toHaveLength(1)
      expect(session.chatHistory[0].role).toBe('user')
      expect(session.chatHistory[0].content).toBe('Test message')
      expect(session.responseLoading).toBe(true)
    })

    it('should mark message as assistant for commandSend type', async () => {
      const { sendMessageWithContent } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!

      await sendMessageWithContent('ls -la', 'commandSend')

      expect(session.chatHistory[0].role).toBe('assistant')
      expect(session.chatHistory[0].say).toBe('command_output')
    })

    it('should scroll to bottom after sending', async () => {
      const { sendMessageWithContent } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      await sendMessageWithContent('Test message', 'send')

      expect(mockScrollToBottom).toHaveBeenCalledWith(true)
    })
  })

  describe('handleFeedback', () => {
    it('should record like feedback', async () => {
      const { getGlobalState, updateGlobalState } = await import('@renderer/agent/storage/state')
      vi.mocked(getGlobalState).mockResolvedValue({})

      const { handleFeedback, getMessageFeedback } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'Test',
        type: 'message',
        ask: '',
        say: '',
        ts: 100
      }

      await handleFeedback(message, 'like')

      expect(getMessageFeedback('msg-1')).toBe('like')
      expect(updateGlobalState).toHaveBeenCalledWith(
        'messageFeedbacks',
        expect.objectContaining({
          'msg-1': 'like'
        })
      )
      expect(mockSendToMain).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'taskFeedback',
          feedbackType: 'thumbs_up'
        })
      )
    })

    it('should record dislike feedback', async () => {
      const { getGlobalState, updateGlobalState } = await import('@renderer/agent/storage/state')
      vi.mocked(getGlobalState).mockResolvedValue({})

      const { handleFeedback, getMessageFeedback } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      const message: ChatMessage = {
        id: 'msg-2',
        role: 'assistant',
        content: 'Test',
        type: 'message',
        ask: '',
        say: '',
        ts: 100
      }

      await handleFeedback(message, 'dislike')

      expect(getMessageFeedback('msg-2')).toBe('dislike')
      expect(updateGlobalState).toHaveBeenCalledWith(
        'messageFeedbacks',
        expect.objectContaining({
          'msg-2': 'dislike'
        })
      )
      expect(mockSendToMain).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'taskFeedback',
          feedbackType: 'thumbs_down'
        })
      )
    })

    it('should not submit feedback twice for same message', async () => {
      const { getGlobalState } = await import('@renderer/agent/storage/state')
      vi.mocked(getGlobalState).mockResolvedValue({})

      const { handleFeedback, isMessageFeedbackSubmitted } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!

      const message: ChatMessage = {
        id: 'msg-3',
        role: 'assistant',
        content: 'Test',
        type: 'message',
        ask: '',
        say: '',
        ts: 100
      }

      await handleFeedback(message, 'like')
      expect(isMessageFeedbackSubmitted('msg-3')).toBe(true)

      mockSendToMain.mockClear()
      await handleFeedback(message, 'dislike')

      // Second feedback should not be sent
      expect(mockSendToMain).not.toHaveBeenCalled()
      expect(session.messageFeedbacks['msg-3']).toBe('like') // Should still be 'like'
    })
  })

  describe('processMainMessage', () => {
    it('should ignore messages without tabId or taskId', async () => {
      const { processMainMessage } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const message: any = { type: 'partialMessage' }
      await processMainMessage(message)

      expect(consoleSpy).toHaveBeenCalledWith('AiTab: Ignoring message for no target tab:', 'partialMessage')
      consoleSpy.mockRestore()
    })

    it('should ignore messages for deleted tabs', async () => {
      const { processMainMessage } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const message: any = {
        type: 'partialMessage',
        tabId: 'non-existent-tab',
        partialMessage: { text: 'test' }
      }
      await processMainMessage(message)

      expect(consoleSpy).toHaveBeenCalledWith('AiTab: Ignoring message for deleted tab:', 'non-existent-tab')
      consoleSpy.mockRestore()
    })

    it('should add partial message to chat history', async () => {
      const { processMainMessage } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!

      const message: ExtensionMessage = {
        type: 'partialMessage',
        tabId: 'test-tab-1',
        partialMessage: {
          text: 'Assistant response',
          type: 'say',
          say: 'text',
          partial: true,
          ts: 100
        }
      }

      await processMainMessage(message)

      expect(session.chatHistory).toHaveLength(1)
      expect(session.chatHistory[0].content).toBe('Assistant response')
      expect(session.chatHistory[0].role).toBe('assistant')
      expect(session.chatHistory[0].partial).toBe(true)
    })

    it('should handle completion_result message', async () => {
      const { processMainMessage } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!

      const message: ExtensionMessage = {
        type: 'partialMessage',
        tabId: 'test-tab-1',
        partialMessage: {
          text: 'Task completed',
          type: 'ask',
          ask: 'completion_result',
          partial: false,
          ts: 100
        }
      }

      await processMainMessage(message)

      expect(session.showNewTaskButton).toBe(true)
      expect(session.responseLoading).toBe(false)
    })

    it('should handle api_req_failed message', async () => {
      const { processMainMessage } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!

      const message: ExtensionMessage = {
        type: 'partialMessage',
        tabId: 'test-tab-1',
        partialMessage: {
          text: 'API request failed',
          type: 'ask',
          ask: 'api_req_failed',
          partial: false,
          ts: 100
        }
      }

      await processMainMessage(message)

      expect(session.showRetryButton).toBe(true)
      expect(session.responseLoading).toBe(false)
    })

    it('should handle todoUpdated message', async () => {
      const { processMainMessage } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!

      const todos: Todo[] = [{ id: '1', content: 'Test todo', status: 'pending', priority: 'medium', createdAt: new Date(), updatedAt: new Date() }]

      const message: any = {
        type: 'todoUpdated',
        tabId: 'test-tab-1',
        todos
      }

      await processMainMessage(message)

      expect(mockMarkLatestMessageWithTodoUpdate).toHaveBeenCalledWith(session.chatHistory, todos)
    })

    it('should handle chatTitleGenerated message', async () => {
      const { processMainMessage } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      const mockState = vi.mocked(useSessionState)()

      const message: any = {
        type: 'chatTitleGenerated',
        tabId: 'test-tab-1',
        taskId: 'test-tab-1',
        chatTitle: 'New Chat Title'
      }

      await processMainMessage(message)

      expect(mockState.chatTabs.value[0].title).toBe('New Chat Title')
    })

    it('should ignore partial messages when task is cancelled', async () => {
      const { processMainMessage } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!
      session.isCancelled = true

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const message: ExtensionMessage = {
        type: 'partialMessage',
        tabId: 'test-tab-1',
        partialMessage: {
          text: 'Should be ignored',
          type: 'say',
          say: 'text',
          partial: true,
          ts: 100
        }
      }

      await processMainMessage(message)

      expect(session.chatHistory).toHaveLength(0)
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('cancelled'))
      consoleSpy.mockRestore()
    })
  })

  describe('setMarkdownRendererRef', () => {
    it('should store markdown renderer reference', () => {
      const { setMarkdownRendererRef, markdownRendererRefs } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      const mockRef = { setThinkingLoading: vi.fn() }
      setMarkdownRendererRef(mockRef, 0)

      expect(markdownRendererRefs.value[0]).toEqual(mockRef)
    })

    it('should not store null references', () => {
      const { setMarkdownRendererRef, markdownRendererRefs } = useChatMessages(
        mockScrollToBottom,
        mockClearTodoState,
        mockMarkLatestMessageWithTodoUpdate,
        mockCurrentTodos,
        mockCheckModelConfig
      )

      setMarkdownRendererRef(null, 0)

      expect(markdownRendererRefs.value[0]).toBeUndefined()
    })
  })
})
