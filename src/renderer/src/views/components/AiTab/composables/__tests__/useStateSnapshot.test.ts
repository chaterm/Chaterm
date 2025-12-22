import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useStateSnapshot } from '../useStateSnapshot'
import { useSessionState } from '../useSessionState'

// Mock dependencies
vi.mock('../useSessionState')

describe('useStateSnapshot', () => {
  let mockEmit: ReturnType<typeof vi.fn<(event: 'state-changed', ...args: any[]) => void>>

  const createMockSession = () => ({
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

  const createMockTab = (id: string) => ({
    id,
    title: 'Test Tab',
    hosts: [{ host: '127.0.0.1', uuid: 'localhost', connection: 'localhost' }],
    chatType: 'agent' as const,
    autoUpdateHost: true,
    session: createMockSession(),
    inputValue: '',
    modelValue: 'claude-sonnet-4-5'
  })

  beforeEach(() => {
    vi.clearAllMocks()

    mockEmit = vi.fn()

    const chatTabs = ref([createMockTab('tab-1')])
    const currentChatId = ref('tab-1')
    const hosts = ref([{ host: '127.0.0.1', uuid: 'localhost', connection: 'localhost' }])
    const chatInputValue = ref('')
    const chatAiModelValue = ref('claude-sonnet-4-5')

    vi.mocked(useSessionState).mockReturnValue({
      chatTabs,
      currentChatId,
      hosts,
      chatInputValue,
      chatAiModelValue
    } as any)
  })

  describe('getCurrentState', () => {
    it('should return current state snapshot', () => {
      const { getCurrentState } = useStateSnapshot(mockEmit)

      const state = getCurrentState()

      expect(state.currentChatId).toBe('tab-1')
      expect(state.chatTabs).toHaveLength(1)
      expect(state.chatTabs[0].id).toBe('tab-1')
      expect(state.chatTabs[0].title).toBe('Test Tab')
      expect(state.chatTabs[0].modelValue).toBe('claude-sonnet-4-5')
    })

    it('should deep clone tab data', () => {
      const { getCurrentState } = useStateSnapshot(mockEmit)

      const state = getCurrentState()
      const mockState = vi.mocked(useSessionState)()

      // Modify original
      mockState.chatTabs.value[0].title = 'Modified'

      // Snapshot should not change
      expect(state.chatTabs[0].title).toBe('Test Tab')
    })

    it('should include session state', () => {
      const mockState = vi.mocked(useSessionState)()
      mockState.chatTabs.value[0].session.responseLoading = true
      mockState.chatTabs.value[0].session.showSendButton = false

      const { getCurrentState } = useStateSnapshot(mockEmit)
      const state = getCurrentState()

      expect(state.chatTabs[0].session.responseLoading).toBe(true)
      expect(state.chatTabs[0].session.showSendButton).toBe(false)
    })

    it('should clone arrays and objects', () => {
      const mockState = vi.mocked(useSessionState)()
      mockState.chatTabs.value[0].session.messageFeedbacks = { 'msg-1': 'like' }

      const { getCurrentState } = useStateSnapshot(mockEmit)
      const state = getCurrentState()

      // Should be independent copy
      state.chatTabs[0].session.messageFeedbacks['msg-2'] = 'dislike'
      expect(mockState.chatTabs.value[0].session.messageFeedbacks['msg-2']).toBeUndefined()
    })
  })

  describe('emitStateChange', () => {
    it('should emit state-changed event', () => {
      const { emitStateChange } = useStateSnapshot(mockEmit)

      emitStateChange()

      expect(mockEmit).toHaveBeenCalledWith(
        'state-changed',
        expect.objectContaining({
          currentChatId: 'tab-1',
          chatTabs: expect.any(Array)
        })
      )
    })

    it('should not emit when suppressed', () => {
      const { emitStateChange, setSuppressStateChange } = useStateSnapshot(mockEmit)

      setSuppressStateChange(true)
      emitStateChange()

      expect(mockEmit).not.toHaveBeenCalled()

      setSuppressStateChange(false)
      emitStateChange()

      expect(mockEmit).toHaveBeenCalledTimes(1)
    })
  })

  describe('restoreState', () => {
    it('should restore saved state', () => {
      const mockState = vi.mocked(useSessionState)()
      const savedState = {
        currentChatId: 'tab-2',
        chatTabs: [
          {
            id: 'tab-2',
            title: 'Restored Tab',
            hosts: [{ host: '192.168.1.1', uuid: 'server-1', connection: 'personal' }],
            chatType: 'cmd',
            autoUpdateHost: false,
            inputValue: 'test input',
            modelValue: 'gpt-4',
            session: {
              chatHistory: [{ id: 'msg-1', role: 'user', content: 'test', type: 'message', ask: '', say: '', ts: 100 }],
              lastChatMessageId: 'msg-1',
              responseLoading: true,
              showSendButton: false,
              buttonsDisabled: true,
              resumeDisabled: false,
              isExecutingCommand: false,
              showRetryButton: false,
              showNewTaskButton: false,
              messageFeedbacks: { 'msg-1': 'like' },
              shouldStickToBottom: false
            }
          }
        ]
      }

      const { restoreState } = useStateSnapshot(mockEmit)

      restoreState(savedState)

      expect(mockState.chatTabs.value).toHaveLength(1)
      expect(mockState.chatTabs.value[0].id).toBe('tab-2')
      expect(mockState.chatTabs.value[0].title).toBe('Restored Tab')
      expect(mockState.chatTabs.value[0].modelValue).toBe('gpt-4')
      expect(mockState.currentChatId.value).toBe('tab-2')
    })

    it('should handle null state', () => {
      const mockState = vi.mocked(useSessionState)()
      const originalTabs = [...mockState.chatTabs.value]

      const { restoreState } = useStateSnapshot(mockEmit)

      restoreState(null)

      expect(mockState.chatTabs.value).toEqual(originalTabs)
    })

    it('should restore with default values for missing properties', () => {
      const mockState = vi.mocked(useSessionState)()
      const savedState = {
        currentChatId: 'tab-3',
        chatTabs: [
          {
            id: 'tab-3',
            title: 'Minimal Tab',
            hosts: [],
            chatType: 'agent',
            autoUpdateHost: true,
            inputValue: '',
            session: {
              chatHistory: []
            }
          }
        ]
      }

      const { restoreState } = useStateSnapshot(mockEmit)

      restoreState(savedState)

      const tab = mockState.chatTabs.value[0]
      expect(tab.modelValue).toBe('')
      expect(tab.session.responseLoading).toBe(false)
      expect(tab.session.showSendButton).toBe(true)
      expect(tab.session.buttonsDisabled).toBe(false)
      expect(tab.session.shouldStickToBottom).toBe(true)
    })

    it('should fallback to first tab when current tab does not exist', () => {
      const mockState = vi.mocked(useSessionState)()
      const savedState = {
        currentChatId: 'non-existent-tab',
        chatTabs: [
          {
            id: 'tab-4',
            title: 'Available Tab',
            hosts: [],
            chatType: 'agent',
            autoUpdateHost: true,
            inputValue: '',
            modelValue: '',
            session: { chatHistory: [] }
          }
        ]
      }

      const { restoreState } = useStateSnapshot(mockEmit)

      restoreState(savedState)

      expect(mockState.currentChatId.value).toBe('tab-4')
    })

    it('should suppress state change during restoration', () => {
      const savedState = {
        currentChatId: 'tab-5',
        chatTabs: [
          {
            id: 'tab-5',
            title: 'Test',
            hosts: [],
            chatType: 'agent',
            autoUpdateHost: true,
            inputValue: '',
            modelValue: '',
            session: { chatHistory: [] }
          }
        ]
      }

      const { restoreState } = useStateSnapshot(mockEmit)

      restoreState(savedState)

      // Should not emit during restoration
      expect(mockEmit).not.toHaveBeenCalled()
    })
  })

  describe('watchers', () => {
    it('should emit state change when hosts change', async () => {
      const mockState = vi.mocked(useSessionState)()
      useStateSnapshot(mockEmit)

      // Trigger hosts change
      mockState.hosts.value = [{ host: '192.168.1.100', uuid: 'server-2', connection: 'personal' }]

      await nextTick()

      expect(mockEmit).toHaveBeenCalledWith('state-changed', expect.any(Object))
    })

    it('should emit state change when chatInputValue changes', async () => {
      const mockState = vi.mocked(useSessionState)()
      useStateSnapshot(mockEmit)

      mockState.chatInputValue.value = 'new input value'

      await nextTick()

      expect(mockEmit).toHaveBeenCalledWith('state-changed', expect.any(Object))
    })

    it('should emit state change when chatAiModelValue changes', async () => {
      const mockState = vi.mocked(useSessionState)()
      useStateSnapshot(mockEmit)

      mockState.chatAiModelValue.value = 'gpt-4'

      await nextTick()

      expect(mockEmit).toHaveBeenCalledWith('state-changed', expect.any(Object))
    })

    it('should not emit when suppressed', async () => {
      const mockState = vi.mocked(useSessionState)()
      const { setSuppressStateChange } = useStateSnapshot(mockEmit)

      setSuppressStateChange(true)
      mockState.chatInputValue.value = 'test'

      await nextTick()

      expect(mockEmit).not.toHaveBeenCalled()
    })
  })
})
