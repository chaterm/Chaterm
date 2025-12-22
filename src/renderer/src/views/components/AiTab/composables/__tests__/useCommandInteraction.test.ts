import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed, type Ref } from 'vue'
import { useCommandInteraction } from '../useCommandInteraction'
import { useSessionState } from '../useSessionState'
import type { ChatMessage, AssetInfo } from '../../types'
import eventBus from '@/utils/eventBus'

// Mock dependencies
vi.mock('../useSessionState')
vi.mock('@/utils/eventBus', () => ({
  default: {
    emit: vi.fn()
  }
}))
vi.mock('@/locales', () => ({
  default: {
    global: {
      t: (key: string, params?: any) => {
        if (params) {
          let str = key
          Object.keys(params).forEach((k) => {
            str = str.replace(`{${k}}`, params[k])
          })
          return str
        }
        return key
      }
    }
  }
}))

// Mock ant-design-vue notification
vi.mock('ant-design-vue', () => ({
  notification: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn()
  }
}))

// Mock window.api
const mockSendToMain = vi.fn()
const mockSetMcpToolAutoApprove = vi.fn()
const mockCancelTask = vi.fn()
const mockGracefulCancelTask = vi.fn()
global.window = {
  api: {
    sendToMain: mockSendToMain,
    setMcpToolAutoApprove: mockSetMcpToolAutoApprove,
    cancelTask: mockCancelTask,
    gracefulCancelTask: mockGracefulCancelTask
  }
} as any

describe('useCommandInteraction', () => {
  let mockGetCurentTabAssetInfo: ReturnType<typeof vi.fn<() => Promise<AssetInfo | null>>>
  let mockMarkdownRendererRefs: Ref<any[]>
  let mockCurrentTodos: Ref<any[]>
  let mockClearTodoState: ReturnType<typeof vi.fn<(chatHistory: any[]) => void>>
  let mockScrollToBottom: ReturnType<typeof vi.fn<(force?: boolean) => void>>

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

  beforeEach(() => {
    vi.clearAllMocks()

    mockGetCurentTabAssetInfo = vi.fn().mockResolvedValue({
      ip: '127.0.0.1',
      uuid: 'localhost',
      connection: 'localhost'
    } as AssetInfo)
    mockMarkdownRendererRefs = ref<any[]>([])
    mockCurrentTodos = ref<any[]>([])
    mockClearTodoState = vi.fn()
    mockScrollToBottom = vi.fn()

    const mockSession = createMockSession()
    const mockAttachTabContext = vi.fn((payload: any) => ({
      ...payload,
      tabId: 'test-tab-1',
      taskId: 'test-tab-1'
    }))

    const currentSessionRef = ref(mockSession)
    const filteredChatHistoryRef = computed(() => currentSessionRef.value?.chatHistory || [])

    vi.mocked(useSessionState).mockReturnValue({
      currentSession: currentSessionRef,
      attachTabContext: mockAttachTabContext,
      currentChatId: ref('test-tab-1'),
      chatTypeValue: ref('agent'),
      hosts: ref([{ host: '127.0.0.1', uuid: 'localhost', connection: 'localhost' }]),
      filteredChatHistory: filteredChatHistoryRef
    } as any)

    mockSendToMain.mockResolvedValue({ success: true })
  })

  describe('handleCopyContent', () => {
    it('should emit event to copy command', async () => {
      const { handleCopyContent } = useCommandInteraction({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        markdownRendererRefs: mockMarkdownRendererRefs,
        currentTodos: mockCurrentTodos,
        clearTodoState: mockClearTodoState,
        scrollToBottom: mockScrollToBottom
      })

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'ls -la',
        type: 'ask',
        ask: 'command',
        say: '',
        ts: 100
      }
      session.chatHistory.push(message)

      await handleCopyContent()

      expect(eventBus.emit).toHaveBeenCalledWith('executeTerminalCommand', {
        command: 'ls -la',
        tabId: 'test-tab-1'
      })
      expect(message.actioned).toBe(true)
    })

    it('should show error when no message exists', async () => {
      const { notification } = await import('ant-design-vue')

      const { handleCopyContent } = useCommandInteraction({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        markdownRendererRefs: mockMarkdownRendererRefs,
        currentTodos: mockCurrentTodos,
        clearTodoState: mockClearTodoState,
        scrollToBottom: mockScrollToBottom
      })

      await handleCopyContent()

      expect(notification.error).toHaveBeenCalled()
    })

    it('should handle content with question structure', async () => {
      const { handleCopyContent } = useCommandInteraction({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        markdownRendererRefs: mockMarkdownRendererRefs,
        currentTodos: mockCurrentTodos,
        clearTodoState: mockClearTodoState,
        scrollToBottom: mockScrollToBottom
      })

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: { question: 'pwd', options: [] },
        type: 'ask',
        ask: 'command',
        say: '',
        ts: 100
      }
      session.chatHistory.push(message)

      await handleCopyContent()

      expect(eventBus.emit).toHaveBeenCalledWith('executeTerminalCommand', {
        command: 'pwd',
        tabId: 'test-tab-1'
      })
    })
  })

  describe('handleApplyCommand', () => {
    it('should execute command and set loading state', async () => {
      const { handleApplyCommand } = useCommandInteraction({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        markdownRendererRefs: mockMarkdownRendererRefs,
        currentTodos: mockCurrentTodos,
        clearTodoState: mockClearTodoState,
        scrollToBottom: mockScrollToBottom
      })

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'echo "test"',
        type: 'ask',
        ask: 'command',
        say: '',
        ts: 100
      }
      session.chatHistory.push(message)

      await handleApplyCommand()

      expect(eventBus.emit).toHaveBeenCalledWith('executeTerminalCommand', {
        command: 'echo "test"\n',
        tabId: 'test-tab-1'
      })
      expect(session.responseLoading).toBe(true)
      expect(message.executedCommand).toBe('echo "test"')
    })

    it('should warn when applying to wrong server', async () => {
      const { notification } = await import('ant-design-vue')
      mockGetCurentTabAssetInfo.mockResolvedValue({
        ip: '192.168.1.100',
        uuid: 'server-1',
        connection: 'personal'
      } as AssetInfo)

      const { handleApplyCommand } = useCommandInteraction({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        markdownRendererRefs: mockMarkdownRendererRefs,
        currentTodos: mockCurrentTodos,
        clearTodoState: mockClearTodoState,
        scrollToBottom: mockScrollToBottom
      })

      const mockState = vi.mocked(useSessionState)()
      mockState.chatTypeValue.value = 'cmd'
      const session = mockState.currentSession.value!
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'ls',
        type: 'ask',
        ask: 'command',
        say: '',
        ts: 100
      }
      session.chatHistory.push(message)

      await handleApplyCommand()

      expect(notification.warning).toHaveBeenCalled()
      expect(eventBus.emit).not.toHaveBeenCalled()
    })
  })

  describe('handleRejectContent', () => {
    it('should reject followup message', async () => {
      const { handleRejectContent } = useCommandInteraction({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        markdownRendererRefs: mockMarkdownRendererRefs,
        currentTodos: mockCurrentTodos,
        clearTodoState: mockClearTodoState,
        scrollToBottom: mockScrollToBottom
      })

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: { question: 'Continue?', options: ['Yes', 'No'] },
        type: 'ask',
        ask: 'followup',
        say: '',
        ts: 100
      }
      session.chatHistory.push(message)

      await handleRejectContent()

      expect(mockSendToMain).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'askResponse',
          askResponse: 'messageResponse',
          text: 'No'
        })
      )
      expect(message.action).toBe('rejected')
      expect(session.buttonsDisabled).toBe(true)
      expect(session.responseLoading).toBe(true)
    })

    it('should reject api_req_failed message', async () => {
      const { handleRejectContent } = useCommandInteraction({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        markdownRendererRefs: mockMarkdownRendererRefs,
        currentTodos: mockCurrentTodos,
        clearTodoState: mockClearTodoState,
        scrollToBottom: mockScrollToBottom
      })

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'API request failed',
        type: 'ask',
        ask: 'api_req_failed',
        say: '',
        ts: 100
      }
      session.chatHistory.push(message)

      await handleRejectContent()

      expect(mockSendToMain).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'askResponse',
          askResponse: 'noButtonClicked'
        })
      )
    })

    it('should reject mcp_tool_call message', async () => {
      const { handleRejectContent } = useCommandInteraction({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        markdownRendererRefs: mockMarkdownRendererRefs,
        currentTodos: mockCurrentTodos,
        clearTodoState: mockClearTodoState,
        scrollToBottom: mockScrollToBottom
      })

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'MCP tool call',
        type: 'ask',
        ask: 'mcp_tool_call',
        say: '',
        ts: 100
      }
      session.chatHistory.push(message)

      await handleRejectContent()

      expect(mockSendToMain).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'askResponse',
          askResponse: 'noButtonClicked'
        })
      )
      expect(mockScrollToBottom).toHaveBeenCalledWith(true)
    })
  })

  describe('handleApproveCommand', () => {
    it('should approve command and set executing state', async () => {
      const { handleApproveCommand } = useCommandInteraction({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        markdownRendererRefs: mockMarkdownRendererRefs,
        currentTodos: mockCurrentTodos,
        clearTodoState: mockClearTodoState,
        scrollToBottom: mockScrollToBottom
      })

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'rm -rf /tmp/test',
        type: 'ask',
        ask: 'command',
        say: '',
        ts: 100
      }
      session.chatHistory.push(message)

      await handleApproveCommand()

      expect(mockSendToMain).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'askResponse',
          askResponse: 'yesButtonClicked'
        })
      )
      expect(message.action).toBe('approved')
      expect(session.isExecutingCommand).toBe(true)
      expect(session.buttonsDisabled).toBe(true)
      expect(session.responseLoading).toBe(true)
    })

    it('should approve followup with first option', async () => {
      const { handleApproveCommand } = useCommandInteraction({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        markdownRendererRefs: mockMarkdownRendererRefs,
        currentTodos: mockCurrentTodos,
        clearTodoState: mockClearTodoState,
        scrollToBottom: mockScrollToBottom
      })

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: { question: 'Continue?', options: ['Yes', 'No'] },
        type: 'ask',
        ask: 'followup',
        say: '',
        ts: 100
      }
      session.chatHistory.push(message)

      await handleApproveCommand()

      expect(mockSendToMain).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'askResponse',
          askResponse: 'messageResponse',
          text: 'Yes'
        })
      )
    })

    it('should approve completion_result', async () => {
      const { handleApproveCommand } = useCommandInteraction({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        markdownRendererRefs: mockMarkdownRendererRefs,
        currentTodos: mockCurrentTodos,
        clearTodoState: mockClearTodoState,
        scrollToBottom: mockScrollToBottom
      })

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'Task completed',
        type: 'ask',
        ask: 'completion_result',
        say: '',
        ts: 100
      }
      session.chatHistory.push(message)

      await handleApproveCommand()

      expect(mockSendToMain).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'askResponse',
          askResponse: 'messageResponse',
          text: 'Task completed successfully.'
        })
      )
    })
  })

  describe('handleApproveAndAutoApprove', () => {
    it('should approve and set auto-approval for MCP tool', async () => {
      const { handleApproveAndAutoApprove } = useCommandInteraction({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        markdownRendererRefs: mockMarkdownRendererRefs,
        currentTodos: mockCurrentTodos,
        clearTodoState: mockClearTodoState,
        scrollToBottom: mockScrollToBottom
      })

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'Call filesystem tool',
        type: 'ask',
        ask: 'mcp_tool_call',
        say: '',
        ts: 100,
        mcpToolCall: {
          serverName: 'filesystem',
          toolName: 'read_file',
          arguments: { path: '/tmp/test.txt' }
        }
      }
      session.chatHistory.push(message)

      await handleApproveAndAutoApprove()

      expect(mockSetMcpToolAutoApprove).toHaveBeenCalledWith('filesystem', 'read_file', true)
      expect(mockSendToMain).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'askResponse',
          askResponse: 'yesButtonClicked'
        })
      )
      expect(message.action).toBe('approved')
    })

    it('should not work for non-MCP messages', async () => {
      const { handleApproveAndAutoApprove } = useCommandInteraction({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        markdownRendererRefs: mockMarkdownRendererRefs,
        currentTodos: mockCurrentTodos,
        clearTodoState: mockClearTodoState,
        scrollToBottom: mockScrollToBottom
      })

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'ls',
        type: 'ask',
        ask: 'command',
        say: '',
        ts: 100
      }
      session.chatHistory.push(message)

      await handleApproveAndAutoApprove()

      expect(mockSetMcpToolAutoApprove).not.toHaveBeenCalled()
      expect(mockSendToMain).not.toHaveBeenCalled()
    })
  })

  describe('handleCancel', () => {
    it('should cancel task and update state', async () => {
      const { handleCancel } = useCommandInteraction({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        markdownRendererRefs: mockMarkdownRendererRefs,
        currentTodos: mockCurrentTodos,
        clearTodoState: mockClearTodoState,
        scrollToBottom: mockScrollToBottom
      })

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!
      session.responseLoading = true
      session.chatHistory = [
        {
          id: 'msg-1',
          role: 'assistant',
          content: 'Test',
          type: 'message',
          ask: '',
          say: '',
          ts: 100
        }
      ]

      await handleCancel()

      expect(session.responseLoading).toBe(false)
      expect(session.showSendButton).toBe(true)
      expect(session.isCancelled).toBe(true)
      expect(mockCancelTask).toHaveBeenCalledWith('test-tab-1')
    })

    it('should gracefully cancel when command is executing', async () => {
      const { handleCancel } = useCommandInteraction({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        markdownRendererRefs: mockMarkdownRendererRefs,
        currentTodos: mockCurrentTodos,
        clearTodoState: mockClearTodoState,
        scrollToBottom: mockScrollToBottom
      })

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!
      session.isExecutingCommand = true

      await handleCancel()

      expect(mockGracefulCancelTask).toHaveBeenCalledWith('test-tab-1')
      expect(session.isExecutingCommand).toBe(false)
    })

    it('should clear todos when cancelling', async () => {
      mockCurrentTodos.value = [{ id: '1', content: 'Test', status: 'pending' }] as any

      const { handleCancel } = useCommandInteraction({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        markdownRendererRefs: mockMarkdownRendererRefs,
        currentTodos: mockCurrentTodos,
        clearTodoState: mockClearTodoState,
        scrollToBottom: mockScrollToBottom
      })

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!

      await handleCancel()

      expect(mockClearTodoState).toHaveBeenCalledWith(session.chatHistory)
    })

    it('should stop thinking animation', async () => {
      const mockRenderer = { setThinkingLoading: vi.fn() }
      mockMarkdownRendererRefs.value = [mockRenderer]

      const { handleCancel } = useCommandInteraction({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        markdownRendererRefs: mockMarkdownRendererRefs,
        currentTodos: mockCurrentTodos,
        clearTodoState: mockClearTodoState,
        scrollToBottom: mockScrollToBottom
      })

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!
      session.chatHistory = [
        {
          id: 'msg-1',
          role: 'assistant',
          content: 'Thinking...',
          type: 'message',
          ask: '',
          say: '',
          ts: 100
        }
      ]

      await handleCancel()

      expect(mockRenderer.setThinkingLoading).toHaveBeenCalledWith(false)
    })
  })

  describe('handleResume', () => {
    it('should resume task', async () => {
      const { handleResume } = useCommandInteraction({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        markdownRendererRefs: mockMarkdownRendererRefs,
        currentTodos: mockCurrentTodos,
        clearTodoState: mockClearTodoState,
        scrollToBottom: mockScrollToBottom
      })

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!
      session.isCancelled = true
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'Resume?',
        type: 'ask',
        ask: 'resume_task',
        say: '',
        ts: 100
      }
      session.chatHistory.push(message)

      await handleResume()

      expect(session.isCancelled).toBe(false)
      expect(mockSendToMain).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'askResponse',
          askResponse: 'yesButtonClicked'
        })
      )
      expect(session.resumeDisabled).toBe(true)
      expect(session.responseLoading).toBe(true)
    })

    it('should not resume when no message', async () => {
      const { handleResume } = useCommandInteraction({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        markdownRendererRefs: mockMarkdownRendererRefs,
        currentTodos: mockCurrentTodos,
        clearTodoState: mockClearTodoState,
        scrollToBottom: mockScrollToBottom
      })

      await handleResume()

      expect(mockSendToMain).not.toHaveBeenCalled()
    })
  })

  describe('handleRetry', () => {
    it('should retry failed request', async () => {
      const { handleRetry } = useCommandInteraction({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        markdownRendererRefs: mockMarkdownRendererRefs,
        currentTodos: mockCurrentTodos,
        clearTodoState: mockClearTodoState,
        scrollToBottom: mockScrollToBottom
      })

      const mockState = vi.mocked(useSessionState)()
      const session = mockState.currentSession.value!
      session.showRetryButton = true
      session.isCancelled = true

      await handleRetry()

      expect(session.isCancelled).toBe(false)
      expect(mockSendToMain).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'askResponse',
          askResponse: 'yesButtonClicked'
        })
      )
      expect(session.showRetryButton).toBe(false)
    })

    it('should not retry when no session', async () => {
      vi.mocked(useSessionState).mockReturnValue({
        currentSession: ref(null)
      } as any)

      const { handleRetry } = useCommandInteraction({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        markdownRendererRefs: mockMarkdownRendererRefs,
        currentTodos: mockCurrentTodos,
        clearTodoState: mockClearTodoState,
        scrollToBottom: mockScrollToBottom
      })

      await handleRetry()

      expect(mockSendToMain).not.toHaveBeenCalled()
    })
  })
})
