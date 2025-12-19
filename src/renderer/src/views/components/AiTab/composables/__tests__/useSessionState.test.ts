import { describe, it, expect, beforeEach } from 'vitest'
import { useSessionState } from '../useSessionState'
import type { ChatMessage, Host } from '../../types'

describe('useSessionState', () => {
  beforeEach(() => {
    // Reset state between tests by creating new instance
    const { chatTabs, currentChatId } = useSessionState()
    chatTabs.value = []
    currentChatId.value = undefined
  })

  describe('createEmptySessionState', () => {
    it('should create a new empty session state with default values', () => {
      const { createEmptySessionState } = useSessionState()
      const sessionState = createEmptySessionState()

      expect(sessionState).toEqual({
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

    it('should create independent session state instances', () => {
      const { createEmptySessionState } = useSessionState()
      const state1 = createEmptySessionState()
      const state2 = createEmptySessionState()

      state1.responseLoading = true

      expect(state2.responseLoading).toBe(false)
    })
  })

  describe('chatTabs management', () => {
    it('should initialize with empty chat tabs', () => {
      const { chatTabs } = useSessionState()

      expect(chatTabs.value).toEqual([])
    })

    it('should allow adding new tabs', () => {
      const { chatTabs, createEmptySessionState } = useSessionState()
      const newTab = {
        id: 'tab-1',
        title: 'New Chat',
        hosts: [],
        chatType: 'agent',
        autoUpdateHost: true,
        session: createEmptySessionState(),
        inputValue: '',
        modelValue: 'claude-3-5-sonnet'
      }

      chatTabs.value.push(newTab)

      expect(chatTabs.value).toHaveLength(1)
      expect(chatTabs.value[0]).toEqual(newTab)
    })

    it('should allow removing tabs', () => {
      const { chatTabs, createEmptySessionState } = useSessionState()
      chatTabs.value = [
        {
          id: 'tab-1',
          title: 'Tab 1',
          hosts: [],
          chatType: 'agent',
          autoUpdateHost: true,
          session: createEmptySessionState(),
          inputValue: '',
          modelValue: ''
        },
        {
          id: 'tab-2',
          title: 'Tab 2',
          hosts: [],
          chatType: 'chat',
          autoUpdateHost: true,
          session: createEmptySessionState(),
          inputValue: '',
          modelValue: ''
        }
      ]

      chatTabs.value = chatTabs.value.filter((tab) => tab.id !== 'tab-1')

      expect(chatTabs.value).toHaveLength(1)
      expect(chatTabs.value[0].id).toBe('tab-2')
    })
  })

  describe('currentTab', () => {
    it('should return undefined when no tab is selected', () => {
      const { currentTab } = useSessionState()

      expect(currentTab.value).toBeUndefined()
    })

    it('should return the current tab when currentChatId is set', () => {
      const { chatTabs, currentChatId, currentTab, createEmptySessionState } = useSessionState()
      const tab = {
        id: 'tab-1',
        title: 'Test Tab',
        hosts: [],
        chatType: 'agent',
        autoUpdateHost: true,
        session: createEmptySessionState(),
        inputValue: '',
        modelValue: ''
      }
      chatTabs.value = [tab]
      currentChatId.value = 'tab-1'

      expect(currentTab.value).toEqual(tab)
    })

    it('should return undefined when currentChatId does not match any tab', () => {
      const { chatTabs, currentChatId, currentTab, createEmptySessionState } = useSessionState()
      chatTabs.value = [
        {
          id: 'tab-1',
          title: 'Test Tab',
          hosts: [],
          chatType: 'agent',
          autoUpdateHost: true,
          session: createEmptySessionState(),
          inputValue: '',
          modelValue: ''
        }
      ]
      currentChatId.value = 'non-existent'

      expect(currentTab.value).toBeUndefined()
    })
  })

  describe('currentSession', () => {
    it('should return undefined when no tab is selected', () => {
      const { currentSession } = useSessionState()

      expect(currentSession.value).toBeUndefined()
    })

    it('should return the session of the current tab', () => {
      const { chatTabs, currentChatId, currentSession, createEmptySessionState } = useSessionState()
      const session = createEmptySessionState()
      chatTabs.value = [
        {
          id: 'tab-1',
          title: 'Test Tab',
          hosts: [],
          chatType: 'agent',
          autoUpdateHost: true,
          session,
          inputValue: '',
          modelValue: ''
        }
      ]
      currentChatId.value = 'tab-1'

      expect(currentSession.value).toEqual(session)
    })
  })

  describe('computed properties', () => {
    describe('currentChatTitle', () => {
      it('should return "New chat" when no tab is selected', () => {
        const { currentChatTitle } = useSessionState()

        expect(currentChatTitle.value).toBe('New chat')
      })

      it('should return the title of the current tab', () => {
        const { chatTabs, currentChatId, currentChatTitle, createEmptySessionState } = useSessionState()
        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'My Chat',
            hosts: [],
            chatType: 'agent',
            autoUpdateHost: true,
            session: createEmptySessionState(),
            inputValue: '',
            modelValue: ''
          }
        ]
        currentChatId.value = 'tab-1'

        expect(currentChatTitle.value).toBe('My Chat')
      })

      it('should allow updating the title', () => {
        const { chatTabs, currentChatId, currentChatTitle, createEmptySessionState } = useSessionState()
        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'Old Title',
            hosts: [],
            chatType: 'agent',
            autoUpdateHost: true,
            session: createEmptySessionState(),
            inputValue: '',
            modelValue: ''
          }
        ]
        currentChatId.value = 'tab-1'

        currentChatTitle.value = 'New Title'

        expect(chatTabs.value[0].title).toBe('New Title')
      })
    })

    describe('chatTypeValue', () => {
      it('should return empty string when no tab is selected', () => {
        const { chatTypeValue } = useSessionState()

        expect(chatTypeValue.value).toBe('')
      })

      it('should return the chatType of the current tab', () => {
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
            modelValue: ''
          }
        ]
        currentChatId.value = 'tab-1'

        expect(chatTypeValue.value).toBe('cmd')
      })

      it('should allow updating the chatType', () => {
        const { chatTabs, currentChatId, chatTypeValue, createEmptySessionState } = useSessionState()
        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'Test',
            hosts: [],
            chatType: 'agent',
            autoUpdateHost: true,
            session: createEmptySessionState(),
            inputValue: '',
            modelValue: ''
          }
        ]
        currentChatId.value = 'tab-1'

        chatTypeValue.value = 'chat'

        expect(chatTabs.value[0].chatType).toBe('chat')
      })
    })

    describe('hosts', () => {
      it('should return empty array when no tab is selected', () => {
        const { hosts } = useSessionState()

        expect(hosts.value).toEqual([])
      })

      it('should return the hosts of the current tab', () => {
        const { chatTabs, currentChatId, hosts, createEmptySessionState } = useSessionState()
        const testHosts: Host[] = [{ host: 'server1', uuid: 'uuid-1', connection: 'ssh' }]
        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'Test',
            hosts: testHosts,
            chatType: 'agent',
            autoUpdateHost: true,
            session: createEmptySessionState(),
            inputValue: '',
            modelValue: ''
          }
        ]
        currentChatId.value = 'tab-1'

        expect(hosts.value).toEqual(testHosts)
      })

      it('should allow updating hosts', () => {
        const { chatTabs, currentChatId, hosts, createEmptySessionState } = useSessionState()
        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'Test',
            hosts: [],
            chatType: 'agent',
            autoUpdateHost: true,
            session: createEmptySessionState(),
            inputValue: '',
            modelValue: ''
          }
        ]
        currentChatId.value = 'tab-1'

        const newHosts: Host[] = [{ host: 'server2', uuid: 'uuid-2', connection: 'ssh' }]
        hosts.value = newHosts

        expect(chatTabs.value[0].hosts).toEqual(newHosts)
      })
    })

    describe('chatInputValue', () => {
      it('should return empty string when no tab is selected', () => {
        const { chatInputValue } = useSessionState()

        expect(chatInputValue.value).toBe('')
      })

      it('should return the input value of the current tab', () => {
        const { chatTabs, currentChatId, chatInputValue, createEmptySessionState } = useSessionState()
        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'Test',
            hosts: [],
            chatType: 'agent',
            autoUpdateHost: true,
            session: createEmptySessionState(),
            inputValue: 'Hello AI',
            modelValue: ''
          }
        ]
        currentChatId.value = 'tab-1'

        expect(chatInputValue.value).toBe('Hello AI')
      })

      it('should allow updating input value', () => {
        const { chatTabs, currentChatId, chatInputValue, createEmptySessionState } = useSessionState()
        chatTabs.value = [
          {
            id: 'tab-1',
            title: 'Test',
            hosts: [],
            chatType: 'agent',
            autoUpdateHost: true,
            session: createEmptySessionState(),
            inputValue: '',
            modelValue: ''
          }
        ]
        currentChatId.value = 'tab-1'

        chatInputValue.value = 'New input'

        expect(chatTabs.value[0].inputValue).toBe('New input')
      })
    })
  })

  describe('filteredChatHistory', () => {
    it('should return empty array when no session exists', () => {
      const { filteredChatHistory } = useSessionState()

      expect(filteredChatHistory.value).toEqual([])
    })

    it('should return all messages when no agent reply exists', () => {
      const { chatTabs, currentChatId, filteredChatHistory, createEmptySessionState } = useSessionState()
      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'Hello' },
        { id: '2', role: 'assistant', content: 'Hi', say: 'sshInfo' }
      ]
      const session = createEmptySessionState()
      session.chatHistory = messages
      chatTabs.value = [
        {
          id: 'tab-1',
          title: 'Test',
          hosts: [],
          chatType: 'agent',
          autoUpdateHost: true,
          session,
          inputValue: '',
          modelValue: ''
        }
      ]
      currentChatId.value = 'tab-1'

      expect(filteredChatHistory.value).toEqual(messages)
    })

    it('should filter out sshInfo messages when agent has replied', () => {
      const { chatTabs, currentChatId, filteredChatHistory, createEmptySessionState } = useSessionState()
      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'Hello' },
        { id: '2', role: 'assistant', content: 'SSH info', say: 'sshInfo' },
        { id: '3', role: 'assistant', content: 'Response', say: 'text' }
      ]
      const session = createEmptySessionState()
      session.chatHistory = messages
      chatTabs.value = [
        {
          id: 'tab-1',
          title: 'Test',
          hosts: [],
          chatType: 'agent',
          autoUpdateHost: true,
          session,
          inputValue: '',
          modelValue: ''
        }
      ]
      currentChatId.value = 'tab-1'

      expect(filteredChatHistory.value).toHaveLength(2)
      expect(filteredChatHistory.value.find((msg) => msg.say === 'sshInfo')).toBeUndefined()
    })
  })

  describe('showResumeButton', () => {
    it('should return false when no session exists', () => {
      const { showResumeButton } = useSessionState()

      expect(showResumeButton.value).toBe(false)
    })

    it('should return false when chat history is empty', () => {
      const { chatTabs, currentChatId, showResumeButton, createEmptySessionState } = useSessionState()
      chatTabs.value = [
        {
          id: 'tab-1',
          title: 'Test',
          hosts: [],
          chatType: 'agent',
          autoUpdateHost: true,
          session: createEmptySessionState(),
          inputValue: '',
          modelValue: ''
        }
      ]
      currentChatId.value = 'tab-1'

      expect(showResumeButton.value).toBe(false)
    })

    it('should return true when last message has ask === "resume_task"', () => {
      const { chatTabs, currentChatId, showResumeButton, createEmptySessionState } = useSessionState()
      const session = createEmptySessionState()
      session.chatHistory = [
        { id: '1', role: 'user', content: 'Hello' },
        { id: '2', role: 'assistant', content: 'Resume?', ask: 'resume_task' }
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
          modelValue: ''
        }
      ]
      currentChatId.value = 'tab-1'

      expect(showResumeButton.value).toBe(true)
    })

    it('should return false when last message does not have resume_task', () => {
      const { chatTabs, currentChatId, showResumeButton, createEmptySessionState } = useSessionState()
      const session = createEmptySessionState()
      session.chatHistory = [
        { id: '1', role: 'user', content: 'Hello' },
        { id: '2', role: 'assistant', content: 'Response' }
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
          modelValue: ''
        }
      ]
      currentChatId.value = 'tab-1'

      expect(showResumeButton.value).toBe(false)
    })
  })

  describe('attachTabContext', () => {
    it('should return original payload when no tab is selected', () => {
      const { attachTabContext } = useSessionState()
      const payload = { type: 'message', content: 'test' }

      const result = attachTabContext(payload)

      expect(result).toEqual(payload)
    })

    it('should attach tabId and taskId to payload', () => {
      const { currentChatId, attachTabContext } = useSessionState()
      currentChatId.value = 'tab-123'
      const payload = { type: 'message', content: 'test' }

      const result = attachTabContext(payload)

      expect(result).toEqual({
        type: 'message',
        content: 'test',
        tabId: 'tab-123',
        taskId: 'tab-123'
      })
    })

    it('should not override existing tabId in payload', () => {
      const { currentChatId, attachTabContext } = useSessionState()
      currentChatId.value = 'tab-123'
      const payload = { type: 'message', content: 'test', tabId: 'existing-tab' }

      const result = attachTabContext(payload)

      expect(result.tabId).toBe('existing-tab')
    })

    it('should not override existing taskId in payload', () => {
      const { currentChatId, attachTabContext } = useSessionState()
      currentChatId.value = 'tab-123'
      const payload = { type: 'message', content: 'test', taskId: 'existing-task' }

      const result = attachTabContext(payload)

      expect(result.taskId).toBe('existing-task')
    })
  })
})
