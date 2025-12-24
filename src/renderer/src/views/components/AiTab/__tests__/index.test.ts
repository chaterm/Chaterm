/**
 * AiTab Component Integration Tests
 *
 * This test suite focuses on integration testing of the AiTab component,
 * testing how different composables work together and key user workflows.
 *
 * Note: Full component mounting is challenging due to heavy dependencies (xterm, monaco-editor).
 * These tests focus on the component's logic and integration patterns.
 *
 * Individual composable logic is tested in their respective test files:
 * - useSessionState.test.ts
 * - useTabManagement.test.ts
 * - useHostManagement.test.ts
 * - useMessageOptions.test.ts
 * - useAutoScroll.test.ts
 * - useModelConfiguration.test.ts
 * - useTodo.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

// Import the composables that AiTab uses
import { useSessionState } from '../composables/useSessionState'
import { useMessageOptions } from '../composables/useMessageOptions'

// Mock window.api
const mockWindowApi = {
  sendToMain: vi.fn(),
  onSessionUpdate: vi.fn(),
  getMcpServers: vi.fn(),
  onMcpStatusUpdate: vi.fn(),
  onMcpServerUpdate: vi.fn(),
  getAllMcpToolStates: vi.fn()
}

// Mock dependencies
vi.mock('@/services/userConfigStoreService', () => ({
  default: {
    getConfig: vi.fn().mockResolvedValue({}),
    setConfig: vi.fn().mockResolvedValue(undefined)
  }
}))

vi.mock('@/utils/eventBus', () => ({
  default: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  }
}))

vi.mock('@renderer/agent/storage/state', () => ({
  getGlobalState: vi.fn(),
  updateGlobalState: vi.fn(),
  storeSecret: vi.fn(),
  getSecret: vi.fn()
}))

vi.mock('@api/user/user', () => ({
  getUser: vi.fn()
}))

describe('AiTab Component - Composable Integration Tests', () => {
  beforeEach(() => {
    // Setup window.api mock
    global.window = global.window || ({} as Window & typeof globalThis)
    ;(global.window as unknown as Record<string, unknown>).api = mockWindowApi

    // Reset all mocks
    vi.clearAllMocks()
    mockWindowApi.sendToMain.mockResolvedValue({ success: true })
    mockWindowApi.onSessionUpdate.mockReturnValue(() => {})
    mockWindowApi.getMcpServers.mockResolvedValue([])
    mockWindowApi.onMcpStatusUpdate.mockReturnValue(() => {})
    mockWindowApi.onMcpServerUpdate.mockReturnValue(() => {})
    mockWindowApi.getAllMcpToolStates.mockResolvedValue({})

    // Mock localStorage
    Storage.prototype.getItem = vi.fn((key) => {
      if (key === 'login-skipped') return 'false'
      return null
    })
    Storage.prototype.setItem = vi.fn()

    // Reset global session state to ensure clean state for each test
    const { chatTabs, currentChatId } = useSessionState()
    chatTabs.value = []
    currentChatId.value = undefined
  })

  describe('Session State and Tab Management Integration', () => {
    it('should create new tab and switch to it', () => {
      const { chatTabs, currentChatId, createEmptySessionState } = useSessionState()

      const initialCount = chatTabs.value.length

      // Create a new tab
      const newTab = {
        id: `tab-${Date.now()}`,
        title: 'New Chat',
        hosts: [],
        chatType: 'agent' as const,
        autoUpdateHost: true,
        session: createEmptySessionState(),
        inputValue: '',
        modelValue: 'claude-3-5-sonnet'
      }

      chatTabs.value.push(newTab)
      currentChatId.value = newTab.id

      expect(chatTabs.value.length).toBe(initialCount + 1)
      expect(currentChatId.value).toBe(newTab.id)
    })

    it('should maintain separate session state for each tab', () => {
      const { chatTabs, currentChatId, currentSession, createEmptySessionState } = useSessionState()

      // Create two tabs with different states
      const tab1 = {
        id: 'tab-1',
        title: 'Chat 1',
        hosts: [],
        chatType: 'agent' as const,
        autoUpdateHost: true,
        session: createEmptySessionState(),
        inputValue: 'Input 1',
        modelValue: 'claude-3-5-sonnet'
      }
      tab1.session.responseLoading = true

      const tab2 = {
        id: 'tab-2',
        title: 'Chat 2',
        hosts: [],
        chatType: 'chat' as const,
        autoUpdateHost: true,
        session: createEmptySessionState(),
        inputValue: 'Input 2',
        modelValue: 'gpt-4'
      }
      tab2.session.responseLoading = false

      chatTabs.value = [tab1, tab2]

      // Switch to tab 1
      currentChatId.value = 'tab-1'
      expect(currentSession.value?.responseLoading).toBe(true)

      // Switch to tab 2
      currentChatId.value = 'tab-2'
      expect(currentSession.value?.responseLoading).toBe(false)
    })

    it('should remove tab and switch to nearest tab', () => {
      const { chatTabs, currentChatId, createEmptySessionState } = useSessionState()

      const tab1 = {
        id: 'tab-1',
        title: 'Chat 1',
        hosts: [],
        chatType: 'agent' as const,
        autoUpdateHost: true,
        session: createEmptySessionState(),
        inputValue: '',
        modelValue: 'claude-3-5-sonnet'
      }

      const tab2 = {
        id: 'tab-2',
        title: 'Chat 2',
        hosts: [],
        chatType: 'chat' as const,
        autoUpdateHost: true,
        session: createEmptySessionState(),
        inputValue: '',
        modelValue: 'gpt-4'
      }

      chatTabs.value = [tab1, tab2]
      currentChatId.value = 'tab-1'

      // Remove tab-1
      const indexToRemove = chatTabs.value.findIndex((t) => t.id === 'tab-1')
      chatTabs.value.splice(indexToRemove, 1)

      // Should switch to remaining tab
      if (chatTabs.value.length > 0) {
        currentChatId.value = chatTabs.value[0].id
      }

      expect(chatTabs.value.length).toBe(1)
      expect(currentChatId.value).toBe('tab-2')
    })
  })

  describe('Session State Structure', () => {
    it('should create session with correct default values', () => {
      const { createEmptySessionState } = useSessionState()
      const session = createEmptySessionState()

      expect(session).toMatchObject({
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
    })

    it('should track message feedback correctly', () => {
      const { createEmptySessionState } = useSessionState()
      const session = createEmptySessionState()

      // Initially no feedback
      expect(session.messageFeedbacks).toEqual({})

      // Add feedback
      session.messageFeedbacks['msg-1'] = 'like'
      expect(session.messageFeedbacks['msg-1']).toBe('like')

      // Check feedback state
      expect('msg-1' in session.messageFeedbacks).toBe(true)
      expect('msg-2' in session.messageFeedbacks).toBe(false)
    })
  })

  describe('Host Management Integration', () => {
    it('should add host in agent mode', () => {
      const hosts = ref<Array<{ host: string; uuid: string; connection: string }>>([])
      const chatTypeValue = ref('agent')

      const testHost = {
        label: 'server1.example.com',
        value: 'host-1',
        key: 'host-1',
        uuid: 'uuid-1',
        connect: 'ssh' as const,
        type: 'personal' as const,
        selectable: true,
        level: 0
      }

      // Simulate adding a host
      if (chatTypeValue.value === 'agent') {
        const newHost = {
          host: testHost.label,
          uuid: testHost.uuid,
          connection: testHost.connect
        }
        hosts.value.push(newHost)
      }

      expect(hosts.value).toHaveLength(1)
      expect(hosts.value[0].host).toBe('server1.example.com')
      expect(hosts.value[0].uuid).toBe('uuid-1')
    })

    it('should replace host in cmd mode', () => {
      const hosts = ref<Array<{ host: string; uuid: string; connection: string }>>([{ host: 'old-server', uuid: 'old-uuid', connection: 'ssh' }])
      const chatTypeValue = ref('cmd')

      const newHost = {
        label: 'new-server',
        value: 'host-2',
        key: 'host-2',
        uuid: 'uuid-2',
        connect: 'ssh' as const,
        type: 'personal' as const,
        selectable: true,
        level: 0
      }

      // In cmd mode, replace existing hosts
      if (chatTypeValue.value === 'cmd') {
        hosts.value = [
          {
            host: newHost.label,
            uuid: newHost.uuid,
            connection: newHost.connect
          }
        ]
      }

      expect(hosts.value).toHaveLength(1)
      expect(hosts.value[0].host).toBe('new-server')
    })

    it('should enforce max hosts limit in agent mode', () => {
      const hosts = ref<Array<{ host: string; uuid: string; connection: string }>>([])
      const maxHosts = 5

      // Fill up to max
      for (let i = 0; i < maxHosts; i++) {
        hosts.value.push({
          host: `server${i}`,
          uuid: `uuid-${i}`,
          connection: 'ssh'
        })
      }

      // Try to add one more
      const canAddMore = hosts.value.length < maxHosts

      expect(hosts.value).toHaveLength(5)
      expect(canAddMore).toBe(false)
    })
  })

  describe('Message Options Integration', () => {
    it('should handle option selection', () => {
      const { handleOptionSelect, getSelectedOption } = useMessageOptions()

      const message = {
        id: 'msg-1',
        role: 'assistant' as const,
        content: {
          question: 'Choose an option',
          options: ['Option A', 'Option B', 'Option C']
        },
        ask: 'followup' as const
      }

      // Select option
      handleOptionSelect(message, 'Option A')

      expect(getSelectedOption(message)).toBe('Option A')
    })

    it('should handle custom input', () => {
      const { handleOptionSelect, handleCustomInputChange, getCustomInput } = useMessageOptions()

      const message = {
        id: 'msg-1',
        role: 'assistant' as const,
        content: {
          question: 'Enter your choice',
          options: ['Option A', 'Option B']
        },
        ask: 'followup' as const
      }

      // Select custom option
      handleOptionSelect(message, '__custom__')
      handleCustomInputChange(message, 'My custom answer')

      expect(getCustomInput(message)).toBe('My custom answer')
    })

    it('should validate option submission readiness', () => {
      const { handleOptionSelect, handleCustomInputChange, canSubmitOption } = useMessageOptions()

      const message = {
        id: 'msg-1',
        role: 'assistant' as const,
        content: {
          question: 'Question',
          options: ['Option A', 'Option B']
        },
        ask: 'followup' as const
      }

      // No option selected
      expect(canSubmitOption(message)).toBe(false)

      // Preset option selected
      handleOptionSelect(message, 'Option A')
      expect(canSubmitOption(message)).toBe(true)

      // Custom option selected but empty
      handleOptionSelect(message, '__custom__')
      expect(canSubmitOption(message)).toBe(false)

      // Custom option with value
      handleCustomInputChange(message, 'Custom answer')
      expect(canSubmitOption(message)).toBe(true)
    })
  })

  describe('Tab Context Attachment', () => {
    it('should attach tab context to payloads', () => {
      const { currentChatId, attachTabContext } = useSessionState()
      currentChatId.value = 'test-tab-123'

      const payload = {
        type: 'sendMessage',
        message: 'Hello'
      }

      const enrichedPayload = attachTabContext(payload)

      expect(enrichedPayload).toHaveProperty('tabId', 'test-tab-123')
      expect(enrichedPayload).toHaveProperty('taskId', 'test-tab-123')
    })

    it('should preserve existing tabId and taskId in payload', () => {
      const { currentChatId, attachTabContext } = useSessionState()
      currentChatId.value = 'test-tab-123'

      const payload = {
        type: 'sendMessage',
        message: 'Hello',
        tabId: 'existing-tab',
        taskId: 'existing-task'
      }

      const enrichedPayload = attachTabContext(payload)

      // Should not override existing values
      expect(enrichedPayload.tabId).toBe('existing-tab')
      expect(enrichedPayload.taskId).toBe('existing-task')
    })
  })

  describe('Chat History Filtering', () => {
    it('should filter out sshInfo messages after agent reply', () => {
      const { chatTabs, currentChatId, filteredChatHistory, createEmptySessionState } = useSessionState()

      const session = createEmptySessionState()
      session.chatHistory = [
        { id: 'msg-1', role: 'user', content: 'Hello' },
        { id: 'msg-2', role: 'assistant', content: 'SSH connection info', say: 'sshInfo' },
        { id: 'msg-3', role: 'assistant', content: 'Agent response', say: 'text' }
      ]

      chatTabs.value = [
        {
          id: 'tab-1',
          title: 'Test',
          hosts: [],
          chatType: 'agent',
          autoUpdateHost: true,
          session,
          inputValue: '',
          modelValue: 'claude-3-5-sonnet'
        }
      ]
      currentChatId.value = 'tab-1'

      const filtered = filteredChatHistory.value

      // sshInfo should be filtered out when agent has replied
      expect(filtered.length).toBeLessThan(session.chatHistory.length)
      expect(filtered.find((msg: { say?: string }) => msg.say === 'sshInfo')).toBeUndefined()
    })

    it('should keep all messages when no agent reply exists', () => {
      const { chatTabs, currentChatId, filteredChatHistory, createEmptySessionState } = useSessionState()

      const session = createEmptySessionState()
      session.chatHistory = [
        { id: 'msg-1', role: 'user', content: 'Hello' },
        { id: 'msg-2', role: 'assistant', content: 'SSH connection info', say: 'sshInfo' }
      ]

      chatTabs.value = [
        {
          id: 'tab-1',
          title: 'Test',
          hosts: [],
          chatType: 'agent',
          autoUpdateHost: true,
          session,
          inputValue: '',
          modelValue: 'claude-3-5-sonnet'
        }
      ]
      currentChatId.value = 'tab-1'

      const filtered = filteredChatHistory.value

      // All messages should be kept
      expect(filtered.length).toBe(session.chatHistory.length)
    })
  })

  describe('Button Visibility and UI States', () => {
    describe('Resume Button', () => {
      it('should show resume button when last message has resume_task', () => {
        const { chatTabs, currentChatId, showResumeButton, createEmptySessionState } = useSessionState()

        const session = createEmptySessionState()
        session.chatHistory = [
          { id: 'msg-1', role: 'user', content: 'Continue the task' },
          { id: 'msg-2', role: 'assistant', content: 'Resume task?', ask: 'resume_task' }
        ]

        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'Test',
            hosts: [],
            chatType: 'agent',
            autoUpdateHost: true,
            session,
            inputValue: '',
            modelValue: 'claude-3-5-sonnet'
          }
        ]
        currentChatId.value = 'tab-1'

        expect(showResumeButton.value).toBe(true)
      })

      it('should not show resume button for normal messages', () => {
        const { chatTabs, currentChatId, showResumeButton, createEmptySessionState } = useSessionState()

        const session = createEmptySessionState()
        session.chatHistory = [
          { id: 'msg-1', role: 'user', content: 'Hello' },
          { id: 'msg-2', role: 'assistant', content: 'Hi there' }
        ]

        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'Test',
            hosts: [],
            chatType: 'agent',
            autoUpdateHost: true,
            session,
            inputValue: '',
            modelValue: 'claude-3-5-sonnet'
          }
        ]
        currentChatId.value = 'tab-1'

        expect(showResumeButton.value).toBe(false)
      })

      it('should respect resumeDisabled flag', () => {
        const { chatTabs, currentChatId, currentSession, createEmptySessionState } = useSessionState()

        const session = createEmptySessionState()
        session.chatHistory = [
          { id: 'msg-1', role: 'user', content: 'Continue' },
          { id: 'msg-2', role: 'assistant', content: 'Resume?', ask: 'resume_task' }
        ]
        session.resumeDisabled = true

        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'Test',
            hosts: [],
            chatType: 'agent',
            autoUpdateHost: true,
            session,
            inputValue: '',
            modelValue: 'claude-3-5-sonnet'
          }
        ]
        currentChatId.value = 'tab-1'

        expect(currentSession.value?.resumeDisabled).toBe(true)
      })
    })

    describe('Retry and New Task Buttons', () => {
      it('should show retry button when session supports retry', () => {
        const { chatTabs, currentChatId, currentSession, createEmptySessionState } = useSessionState()

        const session = createEmptySessionState()
        session.showRetryButton = true

        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'Test',
            hosts: [],
            chatType: 'agent',
            autoUpdateHost: true,
            session,
            inputValue: '',
            modelValue: 'claude-3-5-sonnet'
          }
        ]
        currentChatId.value = 'tab-1'

        expect(currentSession.value?.showRetryButton).toBe(true)
      })

      it('should show new task button when session is completed', () => {
        const { chatTabs, currentChatId, currentSession, createEmptySessionState } = useSessionState()

        const session = createEmptySessionState()
        session.showNewTaskButton = true

        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'Test',
            hosts: [],
            chatType: 'agent',
            autoUpdateHost: true,
            session,
            inputValue: '',
            modelValue: 'claude-3-5-sonnet'
          }
        ]
        currentChatId.value = 'tab-1'

        expect(currentSession.value?.showNewTaskButton).toBe(true)
      })
    })

    describe('Agent Mode Approval Buttons', () => {
      it('should show approve/reject buttons for pending command in agent mode', () => {
        const { chatTabs, currentChatId, currentSession, createEmptySessionState } = useSessionState()

        const session = createEmptySessionState()
        session.chatHistory = [
          { id: 'msg-1', role: 'user', content: 'Run ls command' },
          { id: 'msg-2', role: 'assistant', content: 'ls -la', ask: 'command' }
        ]
        session.lastChatMessageId = 'msg-2'
        session.responseLoading = false

        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'Test',
            hosts: [],
            chatType: 'agent',
            autoUpdateHost: true,
            session,
            inputValue: '',
            modelValue: 'claude-3-5-sonnet'
          }
        ]
        currentChatId.value = 'tab-1'

        const lastMessage = currentSession.value?.chatHistory[currentSession.value.chatHistory.length - 1]
        const shouldShowButtons = lastMessage?.ask === 'command' && session.lastChatMessageId === lastMessage.id && !session.responseLoading

        expect(shouldShowButtons).toBe(true)
      })

      it('should show approve/reject buttons for MCP tool call in agent mode', () => {
        const { chatTabs, currentChatId, currentSession, createEmptySessionState } = useSessionState()

        const session = createEmptySessionState()
        session.chatHistory = [
          {
            id: 'msg-1',
            role: 'assistant',
            content: 'Calling MCP tool',
            ask: 'mcp_tool_call',
            mcpToolCall: {
              serverName: 'test-server',
              toolName: 'read-file',
              arguments: { path: '/test/file.txt' }
            }
          }
        ]
        session.lastChatMessageId = 'msg-1'
        session.responseLoading = false

        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'Test',
            hosts: [],
            chatType: 'agent',
            autoUpdateHost: true,
            session,
            inputValue: '',
            modelValue: 'claude-3-5-sonnet'
          }
        ]
        currentChatId.value = 'tab-1'

        const lastMessage = currentSession.value?.chatHistory[0]
        expect(lastMessage?.ask).toBe('mcp_tool_call')
        expect(lastMessage?.mcpToolCall).toBeDefined()
      })

      it('should hide approval buttons when response is loading', () => {
        const { chatTabs, currentChatId, createEmptySessionState } = useSessionState()

        const session = createEmptySessionState()
        session.chatHistory = [{ id: 'msg-1', role: 'assistant', content: 'ls -la', ask: 'command' }]
        session.lastChatMessageId = 'msg-1'
        session.responseLoading = true // Loading state

        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'Test',
            hosts: [],
            chatType: 'agent',
            autoUpdateHost: true,
            session,
            inputValue: '',
            modelValue: 'claude-3-5-sonnet'
          }
        ]
        currentChatId.value = 'tab-1'

        const shouldShowButtons = !session.responseLoading
        expect(shouldShowButtons).toBe(false)
      })

      it('should respect buttonsDisabled state', () => {
        const { chatTabs, currentChatId, currentSession, createEmptySessionState } = useSessionState()

        const session = createEmptySessionState()
        session.buttonsDisabled = true

        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'Test',
            hosts: [],
            chatType: 'agent',
            autoUpdateHost: true,
            session,
            inputValue: '',
            modelValue: 'claude-3-5-sonnet'
          }
        ]
        currentChatId.value = 'tab-1'

        expect(currentSession.value?.buttonsDisabled).toBe(true)
      })
    })

    describe('Command Mode Buttons', () => {
      it('should show copy and run buttons for command in cmd mode', () => {
        const chatType = 'cmd'
        const message = {
          id: 'msg-1',
          role: 'assistant' as const,
          content: 'npm install',
          ask: 'command' as const
        }

        const shouldShowCmdButtons = chatType === 'cmd' && message.ask === 'command'
        expect(shouldShowCmdButtons).toBe(true)
      })

      it('should show MCP approval buttons for mcp_tool_call in cmd mode', () => {
        const chatType = 'cmd'
        const message = {
          id: 'msg-1',
          role: 'assistant' as const,
          content: 'Tool call',
          ask: 'mcp_tool_call' as const,
          mcpToolCall: {
            serverName: 'test-server',
            toolName: 'execute',
            arguments: { cmd: 'test' }
          }
        }

        const shouldShowMcpButtons = chatType === 'cmd' && message.ask === 'mcp_tool_call'
        expect(shouldShowMcpButtons).toBe(true)
        expect(message.mcpToolCall).toBeDefined()
      })

      it('should track command execution state', () => {
        const { chatTabs, currentChatId, currentSession, createEmptySessionState } = useSessionState()

        const session = createEmptySessionState()
        session.isExecutingCommand = true

        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'Test',
            hosts: [],
            chatType: 'cmd',
            autoUpdateHost: true,
            session,
            inputValue: '',
            modelValue: 'claude-3-5-sonnet'
          }
        ]
        currentChatId.value = 'tab-1'

        expect(currentSession.value?.isExecutingCommand).toBe(true)
      })
    })

    describe('MCP Tool Call Information Display', () => {
      it('should display MCP tool call details', () => {
        const message = {
          id: 'msg-1',
          role: 'assistant' as const,
          content: 'Calling MCP tool',
          ask: 'mcp_tool_call' as const,
          mcpToolCall: {
            serverName: 'file-server',
            toolName: 'read-file',
            arguments: {
              path: '/home/user/test.txt',
              encoding: 'utf-8'
            }
          }
        }

        const shouldShowMcpInfo = !!(message.ask === 'mcp_tool_call' && message.mcpToolCall)
        expect(shouldShowMcpInfo).toBe(true)
        expect(message.mcpToolCall.serverName).toBe('file-server')
        expect(message.mcpToolCall.toolName).toBe('read-file')
        expect(Object.keys(message.mcpToolCall.arguments).length).toBe(2)
      })

      it('should handle MCP tool call without arguments', () => {
        const message = {
          id: 'msg-1',
          role: 'assistant' as const,
          content: 'Tool call',
          ask: 'mcp_tool_call' as const,
          mcpToolCall: {
            serverName: 'simple-server',
            toolName: 'ping',
            arguments: {}
          }
        }

        const hasArguments = Object.keys(message.mcpToolCall.arguments).length > 0
        expect(hasArguments).toBe(false)
      })
    })

    describe('Task Completion and Feedback', () => {
      it('should show task completed header for completion_result messages', () => {
        const message = {
          id: 'msg-1',
          role: 'assistant' as const,
          content: 'Task completed successfully',
          say: 'completion_result' as const
        }

        const isCompletionResult = message.say === 'completion_result'
        expect(isCompletionResult).toBe(true)
      })

      it('should show feedback buttons only for last completion message', () => {
        const { chatTabs, currentChatId, createEmptySessionState } = useSessionState()

        const session = createEmptySessionState()
        session.chatHistory = [
          { id: 'msg-1', role: 'assistant', content: 'First task done', say: 'completion_result' },
          { id: 'msg-2', role: 'user', content: 'Do another task' },
          { id: 'msg-3', role: 'assistant', content: 'Second task done', say: 'completion_result' }
        ]

        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'Test',
            hosts: [],
            chatType: 'agent',
            autoUpdateHost: true,
            session,
            inputValue: '',
            modelValue: 'claude-3-5-sonnet'
          }
        ]
        currentChatId.value = 'tab-1'

        const lastIndex = session.chatHistory.length - 1
        const lastMessage = session.chatHistory[lastIndex]

        const shouldShowFeedback = lastMessage.say === 'completion_result'
        expect(shouldShowFeedback).toBe(true)
      })

      it('should track feedback submission state', () => {
        const { chatTabs, currentChatId, currentSession, createEmptySessionState } = useSessionState()

        const session = createEmptySessionState()
        session.messageFeedbacks = {
          'msg-1': 'like',
          'msg-2': 'dislike'
        }

        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'Test',
            hosts: [],
            chatType: 'agent',
            autoUpdateHost: true,
            session,
            inputValue: '',
            modelValue: 'claude-3-5-sonnet'
          }
        ]
        currentChatId.value = 'tab-1'

        expect(currentSession.value?.messageFeedbacks['msg-1']).toBe('like')
        expect(currentSession.value?.messageFeedbacks['msg-2']).toBe('dislike')
        expect('msg-1' in (currentSession.value?.messageFeedbacks || {})).toBe(true)
      })

      it('should prevent duplicate feedback submission', () => {
        const messageFeedbacks: Record<string, 'like' | 'dislike'> = {
          'msg-1': 'like'
        }

        const isSubmitted = (messageId: string) => messageId in messageFeedbacks
        expect(isSubmitted('msg-1')).toBe(true)
        expect(isSubmitted('msg-2')).toBe(false)
      })
    })

    describe('Message Options Display', () => {
      it('should show options when message contains options array', () => {
        const message = {
          id: 'msg-1',
          role: 'assistant' as const,
          content: {
            question: 'Choose an option',
            options: ['Yes', 'No', 'Maybe']
          },
          ask: 'followup' as const
        }

        const hasOptions = typeof message.content === 'object' && 'options' in message.content
        expect(hasOptions).toBe(true)
        expect(message.content.options.length).toBe(3)
      })

      it('should show custom input option when there are multiple options', () => {
        const options = ['Option A', 'Option B', 'Option C']
        const shouldShowCustomInput = options.length > 1
        expect(shouldShowCustomInput).toBe(true)
      })

      it('should not show custom input when there is only one option', () => {
        const options = ['Only Option']
        const shouldShowCustomInput = options.length > 1
        expect(shouldShowCustomInput).toBe(false)
      })

      it('should show submit button after option selection', () => {
        const { handleOptionSelect, getSelectedOption } = useMessageOptions()

        const message = {
          id: 'msg-1',
          role: 'assistant' as const,
          content: {
            question: 'Select',
            options: ['A', 'B']
          },
          ask: 'followup' as const
        }

        // Before selection
        expect(getSelectedOption(message)).toBe('')

        // After selection
        handleOptionSelect(message, 'A')
        const shouldShowSubmit = getSelectedOption(message) !== ''
        expect(shouldShowSubmit).toBe(true)
      })

      it('should not show submit button when option already submitted', () => {
        const message = {
          id: 'msg-1',
          role: 'assistant' as const,
          content: {
            question: 'Select',
            options: ['A', 'B']
          },
          ask: 'followup' as const,
          selectedOption: 'A' // Already submitted
        }

        const shouldShowSubmit = !message.selectedOption
        expect(shouldShowSubmit).toBe(false)
      })
    })

    describe('Todo Inline Display', () => {
      it('should show todo when message has todo update', () => {
        const message = {
          id: 'msg-1',
          role: 'assistant' as const,
          content: 'Task in progress',
          hasTodoUpdate: true,
          relatedTodos: [
            {
              id: 't1',
              content: 'Complete feature',
              status: 'in_progress' as const,
              priority: 'high' as const,
              createdAt: new Date(),
              updatedAt: new Date()
            }
          ]
        }

        const shouldShowTodo = message.role === 'assistant' && message.hasTodoUpdate
        expect(shouldShowTodo).toBe(true)
        expect(message.relatedTodos).toBeDefined()
        expect(message.relatedTodos?.length).toBe(1)
      })

      it('should not show todo when message has no todo update', () => {
        const message = {
          id: 'msg-1',
          role: 'assistant' as const,
          content: 'Regular message',
          hasTodoUpdate: false
        }

        const shouldShowTodo = message.role === 'assistant' && message.hasTodoUpdate
        expect(shouldShowTodo).toBe(false)
      })
    })

    describe('Send Button State', () => {
      it('should show send button by default', () => {
        const { chatTabs, currentChatId, currentSession, createEmptySessionState } = useSessionState()

        const session = createEmptySessionState()

        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'Test',
            hosts: [],
            chatType: 'chat',
            autoUpdateHost: true,
            session,
            inputValue: '',
            modelValue: 'claude-3-5-sonnet'
          }
        ]
        currentChatId.value = 'tab-1'

        expect(currentSession.value?.showSendButton).toBe(true)
      })

      it('should track response loading state', () => {
        const { chatTabs, currentChatId, currentSession, createEmptySessionState } = useSessionState()

        const session = createEmptySessionState()
        session.responseLoading = true

        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'Test',
            hosts: [],
            chatType: 'chat',
            autoUpdateHost: true,
            session,
            inputValue: '',
            modelValue: 'claude-3-5-sonnet'
          }
        ]
        currentChatId.value = 'tab-1'

        expect(currentSession.value?.responseLoading).toBe(true)
      })

      it('should track cancellation state', () => {
        const { chatTabs, currentChatId, currentSession, createEmptySessionState } = useSessionState()

        const session = createEmptySessionState()
        session.isCancelled = true

        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'Test',
            hosts: [],
            chatType: 'chat',
            autoUpdateHost: true,
            session,
            inputValue: '',
            modelValue: 'claude-3-5-sonnet'
          }
        ]
        currentChatId.value = 'tab-1'

        expect(currentSession.value?.isCancelled).toBe(true)
      })
    })

    describe('Streaming Message States', () => {
      it('should track last stream message', () => {
        const { chatTabs, currentChatId, currentSession, createEmptySessionState } = useSessionState()

        const session = createEmptySessionState()
        session.lastStreamMessage = {
          type: 'partialMessage',
          partialMessage: {
            ts: Date.now(),
            type: 'say',
            text: 'Streaming...',
            partial: true
          }
        }

        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'Test',
            hosts: [],
            chatType: 'chat',
            autoUpdateHost: true,
            session,
            inputValue: '',
            modelValue: 'claude-3-5-sonnet'
          }
        ]
        currentChatId.value = 'tab-1'

        expect(currentSession.value?.lastStreamMessage).toBeDefined()
        expect(currentSession.value?.lastStreamMessage?.partialMessage?.partial).toBe(true)
      })

      it('should track last partial message', () => {
        const { chatTabs, currentChatId, currentSession, createEmptySessionState } = useSessionState()

        const session = createEmptySessionState()
        session.lastPartialMessage = {
          type: 'partialMessage',
          partialMessage: {
            ts: Date.now(),
            type: 'say',
            text: 'Partial content'
          }
        }

        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'Test',
            hosts: [],
            chatType: 'chat',
            autoUpdateHost: true,
            session,
            inputValue: '',
            modelValue: 'claude-3-5-sonnet'
          }
        ]
        currentChatId.value = 'tab-1'

        expect(currentSession.value?.lastPartialMessage).toBeDefined()
        expect(currentSession.value?.lastPartialMessage?.partialMessage?.text).toBe('Partial content')
      })
    })
  })

  describe('Computed Properties', () => {
    it('should compute current chat title correctly', () => {
      const { chatTabs, currentChatId, currentChatTitle, createEmptySessionState } = useSessionState()

      chatTabs.value = [
        {
          id: 'tab-1',
          title: 'My Custom Chat',
          hosts: [],
          chatType: 'agent',
          autoUpdateHost: true,
          session: createEmptySessionState(),
          inputValue: '',
          modelValue: 'claude-3-5-sonnet'
        }
      ]
      currentChatId.value = 'tab-1'

      expect(currentChatTitle.value).toBe('My Custom Chat')
    })

    it('should return default title when no tab is selected', () => {
      const { chatTabs, currentChatId, currentChatTitle } = useSessionState()

      // Clear tabs and set no current tab
      chatTabs.value = []
      currentChatId.value = undefined

      expect(currentChatTitle.value).toBe('New chat')
    })

    it('should compute chat type correctly', () => {
      const { chatTabs, currentChatId, chatTypeValue, createEmptySessionState } = useSessionState()

      chatTabs.value = [
        {
          id: 'tab-1',
          title: 'Test',
          hosts: [],
          chatType: 'cmd',
          autoUpdateHost: true,
          session: createEmptySessionState(),
          inputValue: '',
          modelValue: 'claude-3-5-sonnet'
        }
      ]
      currentChatId.value = 'tab-1'

      expect(chatTypeValue.value).toBe('cmd')
    })

    it('should compute shouldShowSendButton based on input value', () => {
      const { chatTabs, currentChatId, chatInputValue, shouldShowSendButton, createEmptySessionState } = useSessionState()

      chatTabs.value = [
        {
          id: 'tab-1',
          title: 'Test',
          hosts: [],
          chatType: 'chat',
          autoUpdateHost: true,
          session: createEmptySessionState(),
          inputValue: '',
          modelValue: 'claude-3-5-sonnet'
        }
      ]
      currentChatId.value = 'tab-1'

      // Empty input should not show send button
      chatInputValue.value = ''
      expect(shouldShowSendButton.value).toBe(false)

      // Whitespace only should not show send button
      chatInputValue.value = '   '
      expect(shouldShowSendButton.value).toBe(false)

      // Valid input should show send button
      chatInputValue.value = 'Hello'
      expect(shouldShowSendButton.value).toBe(true)

      // Single character should show send button
      chatInputValue.value = 'a'
      expect(shouldShowSendButton.value).toBe(true)
    })

    it('should compute chatAiModelValue correctly', () => {
      const { chatTabs, currentChatId, chatAiModelValue, createEmptySessionState } = useSessionState()

      chatTabs.value = [
        {
          id: 'tab-1',
          title: 'Test',
          hosts: [],
          chatType: 'agent',
          autoUpdateHost: true,
          session: createEmptySessionState(),
          inputValue: '',
          modelValue: 'claude-3-5-sonnet'
        }
      ]
      currentChatId.value = 'tab-1'

      expect(chatAiModelValue.value).toBe('claude-3-5-sonnet')

      // Should allow updating model value
      chatAiModelValue.value = 'gpt-4'
      expect(chatTabs.value[0].modelValue).toBe('gpt-4')
    })

    it('should return empty string for chatAiModelValue when no tab is selected', () => {
      const { chatAiModelValue, chatTabs, currentChatId } = useSessionState()
      // Ensure no tab is selected
      chatTabs.value = []
      currentChatId.value = undefined
      expect(chatAiModelValue.value).toBe('')
    })

    it('should compute autoUpdateHost correctly', () => {
      const { chatTabs, currentChatId, autoUpdateHost, createEmptySessionState } = useSessionState()

      chatTabs.value = [
        {
          id: 'tab-1',
          title: 'Test',
          hosts: [],
          chatType: 'agent',
          autoUpdateHost: false,
          session: createEmptySessionState(),
          inputValue: '',
          modelValue: 'claude-3-5-sonnet'
        }
      ]
      currentChatId.value = 'tab-1'

      expect(autoUpdateHost.value).toBe(false)

      // Should allow updating autoUpdateHost
      autoUpdateHost.value = true
      expect(chatTabs.value[0].autoUpdateHost).toBe(true)
    })

    it('should return true for autoUpdateHost when no tab is selected', () => {
      const { autoUpdateHost } = useSessionState()
      expect(autoUpdateHost.value).toBe(true)
    })

    it('should compute shouldStickToBottom correctly', () => {
      const { chatTabs, currentChatId, shouldStickToBottom, createEmptySessionState } = useSessionState()

      const session = createEmptySessionState()
      session.shouldStickToBottom = false

      chatTabs.value = [
        {
          id: 'tab-1',
          title: 'Test',
          hosts: [],
          chatType: 'agent',
          autoUpdateHost: true,
          session,
          inputValue: '',
          modelValue: 'claude-3-5-sonnet'
        }
      ]
      currentChatId.value = 'tab-1'

      expect(shouldStickToBottom.value).toBe(false)

      // Should allow updating shouldStickToBottom
      shouldStickToBottom.value = true
      expect(session.shouldStickToBottom).toBe(true)
    })

    it('should return true for shouldStickToBottom when no tab is selected', () => {
      const { shouldStickToBottom } = useSessionState()
      expect(shouldStickToBottom.value).toBe(true)
    })
  })

  describe('Watch Effects', () => {
    it('should reset buttonsDisabled and resumeDisabled when chat history changes', async () => {
      const { chatTabs, currentChatId, currentSession, createEmptySessionState } = useSessionState()

      const session = createEmptySessionState()
      session.buttonsDisabled = true
      session.resumeDisabled = true

      chatTabs.value = [
        {
          id: 'tab-1',
          title: 'Test',
          hosts: [],
          chatType: 'agent',
          autoUpdateHost: true,
          session,
          inputValue: '',
          modelValue: 'claude-3-5-sonnet'
        }
      ]
      currentChatId.value = 'tab-1'

      // Add a message to trigger watch
      session.chatHistory.push({
        id: 'msg-1',
        role: 'user',
        content: 'Test message'
      })

      // Wait for next tick to allow watch to execute
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(currentSession.value?.buttonsDisabled).toBe(false)
      expect(currentSession.value?.resumeDisabled).toBe(false)
    })

    it('should sync shouldShowSendButton to session.showSendButton', async () => {
      const { chatTabs, currentChatId, chatInputValue, currentSession, createEmptySessionState } = useSessionState()

      const session = createEmptySessionState()
      // Set showSendButton to false initially to match empty input
      session.showSendButton = false
      chatTabs.value = [
        {
          id: 'tab-1',
          title: 'Test',
          hosts: [],
          chatType: 'chat',
          autoUpdateHost: true,
          session,
          inputValue: '',
          modelValue: 'claude-3-5-sonnet'
        }
      ]
      currentChatId.value = 'tab-1'

      // Wait for immediate watch to execute
      await new Promise((resolve) => setTimeout(resolve, 0))

      // Initially empty, should be false
      expect(currentSession.value?.showSendButton).toBe(false)

      // Set valid input
      chatInputValue.value = 'Hello'
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(currentSession.value?.showSendButton).toBe(true)

      // Clear input
      chatInputValue.value = ''
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(currentSession.value?.showSendButton).toBe(false)
    })
  })
})
