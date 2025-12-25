import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useTabManagement } from '../useTabManagement'
import { useSessionState } from '../useSessionState'
import type { AssetInfo, HistoryItem } from '../../types'
import type { ChatermMessage } from '@/types/ChatermMessage'

// Mock dependencies
vi.mock('../useSessionState')
vi.mock('@renderer/agent/storage/state', () => ({
  getGlobalState: vi.fn()
}))
vi.mock('vue-i18n', () => ({
  useI18n: vi.fn(() => ({
    t: vi.fn((key: string) => key),
    locale: { value: 'en-US' },
    messages: {
      value: {
        'en-US': {
          ai: {
            welcomeTips: ['Welcome tip 1', 'Welcome tip 2'],
            welcome: 'Welcome'
          },
          common: {
            closeTabConfirm: 'Close tab?',
            closeTabWithTaskRunning: 'Task is running',
            forceClose: 'Force close',
            cancel: 'Cancel'
          }
        }
      }
    }
  }))
}))

// Mock window.api
const mockGetTaskMetadata = vi.fn()
const mockChatermGetChatermMessages = vi.fn()
const mockSendToMain = vi.fn()
const mockCancelTask = vi.fn()
global.window = {
  api: {
    getTaskMetadata: mockGetTaskMetadata,
    chatermGetChatermMessages: mockChatermGetChatermMessages,
    sendToMain: mockSendToMain,
    cancelTask: mockCancelTask
  }
} as any

describe('useTabManagement', () => {
  let mockGetCurentTabAssetInfo: ReturnType<typeof vi.fn<() => Promise<AssetInfo | null>>>
  let mockEmitStateChange: ReturnType<typeof vi.fn<() => void>>
  let mockHandleClose: ReturnType<typeof vi.fn<() => void>>
  let mockIsFocusInAiTab: ReturnType<typeof vi.fn<(event?: KeyboardEvent) => boolean>>

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
    modelValue: '',
    welcomeTip: ''
  })

  beforeEach(async () => {
    vi.clearAllMocks()

    mockGetCurentTabAssetInfo = vi.fn().mockResolvedValue({
      ip: '192.168.1.100',
      uuid: 'server-1',
      connection: 'personal'
    } as AssetInfo)
    mockEmitStateChange = vi.fn()
    mockHandleClose = vi.fn()
    mockIsFocusInAiTab = vi.fn().mockReturnValue(true)

    const mockTab = createMockTab('tab-1')
    const chatTabs = ref([mockTab])
    const currentChatId = ref('tab-1')
    const chatInputValue = ref('')
    const createEmptySessionState = vi.fn(() => createMockSession())

    vi.mocked(useSessionState).mockReturnValue({
      chatTabs,
      currentChatId,
      currentTab: ref(mockTab),
      createEmptySessionState,
      chatInputValue,
      chatTextareaRef: ref(null)
    } as any)

    const { getGlobalState } = await import('@renderer/agent/storage/state')
    vi.mocked(getGlobalState).mockImplementation((key: string) => {
      if (key === 'chatSettings') return Promise.resolve({ mode: 'agent' })
      if (key === 'apiProvider') return Promise.resolve('default')
      if (key === 'defaultModelId') return Promise.resolve('claude-sonnet-4-5')
      return Promise.resolve(null)
    })

    mockSendToMain.mockResolvedValue({ success: true })
  })

  describe('createNewEmptyTab', () => {
    it('should create new tab with default values', async () => {
      const { createNewEmptyTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        emitStateChange: mockEmitStateChange
      })

      const mockState = vi.mocked(useSessionState)()

      const newTabId = await createNewEmptyTab()

      expect(newTabId).toBeTruthy()
      expect(mockState.chatTabs.value.length).toBe(2)
      expect(mockState.currentChatId.value).toBe(newTabId)
      expect(mockEmitStateChange).toHaveBeenCalled()
    })

    it('should populate tab with current asset info', async () => {
      const { createNewEmptyTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo
      })

      const mockState = vi.mocked(useSessionState)()

      await createNewEmptyTab()
      await nextTick()

      const newTab = mockState.chatTabs.value[1]
      expect(newTab.hosts).toEqual([
        {
          host: '192.168.1.100',
          uuid: 'server-1',
          connection: 'personal'
        }
      ])
    })

    it('should use localhost when no asset info available', async () => {
      mockGetCurentTabAssetInfo.mockResolvedValue(null)

      const { createNewEmptyTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo
      })

      const mockState = vi.mocked(useSessionState)()

      await createNewEmptyTab()
      await nextTick()

      const newTab = mockState.chatTabs.value[1]
      expect(newTab.hosts[0].host).toBe('127.0.0.1')
    })

    it('should set model value from global state', async () => {
      const { createNewEmptyTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo
      })

      const mockState = vi.mocked(useSessionState)()

      await createNewEmptyTab()
      await nextTick()

      const newTab = mockState.chatTabs.value[1]
      expect(newTab.modelValue).toBe('claude-sonnet-4-5')
    })

    it('should clear chat input value', async () => {
      const { createNewEmptyTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo
      })

      const mockState = vi.mocked(useSessionState)()
      mockState.chatInputValue.value = 'test input'

      await createNewEmptyTab()

      expect(mockState.chatInputValue.value).toBe('')
    })
  })

  describe('restoreHistoryTab', () => {
    it('should switch to existing tab if already open', async () => {
      const { restoreHistoryTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo
      })

      const mockState = vi.mocked(useSessionState)()
      const history: HistoryItem = {
        id: 'tab-1',
        chatTitle: 'Existing Tab',
        chatType: 'agent',
        chatContent: [],
        isFavorite: false,
        isEditing: false,
        editingTitle: ''
      }

      await restoreHistoryTab(history)

      expect(mockState.currentChatId.value).toBe('tab-1')
      expect(mockState.chatTabs.value.length).toBe(1) // No new tab created
    })

    it('should restore chat history from metadata', async () => {
      mockGetTaskMetadata.mockResolvedValue({
        success: true,
        data: {
          hosts: [{ host: '192.168.1.50', uuid: 'server-2', connection: 'personal' }],
          model_usage: [{ mode: 'cmd', model_id: 'gpt-4' }]
        }
      })

      const mockMessages: ChatermMessage[] = [
        {
          ask: 'followup',
          say: undefined,
          text: JSON.stringify({ question: 'Continue?', options: ['Yes', 'No'] }),
          type: 'ask',
          ts: 100,
          partial: false
        }
      ]
      mockChatermGetChatermMessages.mockResolvedValue(mockMessages)

      const { restoreHistoryTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo
      })

      const mockState = vi.mocked(useSessionState)()
      const history: HistoryItem = {
        id: 'history-1',
        chatTitle: 'Previous Chat',
        chatType: 'agent',
        chatContent: [],
        isFavorite: false,
        isEditing: false,
        editingTitle: ''
      }

      await restoreHistoryTab(history)

      expect(mockState.currentChatId.value).toBe('history-1')
      const restoredTab = mockState.chatTabs.value.find((t) => t.id === 'history-1')
      expect(restoredTab).toBeDefined()
      expect(restoredTab!.title).toBe('Previous Chat')
      expect(restoredTab!.hosts[0].host).toBe('192.168.1.50')
      expect(restoredTab!.chatType).toBe('cmd')
      expect(restoredTab!.modelValue).toBe('gpt-4')
    })

    it('should replace current new tab with history', async () => {
      mockChatermGetChatermMessages.mockResolvedValue([])
      mockGetTaskMetadata.mockResolvedValue({ success: true, data: {} })

      const { restoreHistoryTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo
      })

      const mockState = vi.mocked(useSessionState)()
      // Set current tab to a new empty tab
      mockState.chatTabs.value[0].title = 'New chat'
      mockState.chatTabs.value[0].session.chatHistory = []

      const history: HistoryItem = {
        id: 'history-2',
        chatTitle: 'Restored Chat',
        chatType: 'agent',
        chatContent: [],
        isFavorite: false,
        isEditing: false,
        editingTitle: ''
      }

      await restoreHistoryTab(history)

      expect(mockState.chatTabs.value.length).toBe(1) // Replaced, not added
      expect(mockState.chatTabs.value[0].id).toBe('history-2')
    })

    it('should send showTaskWithId message to main', async () => {
      mockChatermGetChatermMessages.mockResolvedValue([])
      mockGetTaskMetadata.mockResolvedValue({
        success: true,
        data: {
          hosts: [{ host: '10.0.0.1', uuid: 'srv-1', connection: 'jumpserver' }]
        }
      })

      const { restoreHistoryTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo
      })

      const history: HistoryItem = {
        id: 'history-3',
        chatTitle: 'Test',
        chatType: 'agent',
        chatContent: [],
        isFavorite: false,
        isEditing: false,
        editingTitle: ''
      }

      await restoreHistoryTab(history)

      expect(mockSendToMain).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'showTaskWithId',
          text: 'history-3',
          hosts: [{ host: '10.0.0.1', uuid: 'srv-1', connection: 'jumpserver' }]
        })
      )
    })

    it('should handle command_output messages correctly', async () => {
      const mockMessages: ChatermMessage[] = [
        {
          ask: undefined,
          say: 'user_feedback',
          text: 'Terminal output: ls -la result',
          type: 'say',
          ts: 100,
          partial: false
        }
      ]
      mockChatermGetChatermMessages.mockResolvedValue(mockMessages)
      mockGetTaskMetadata.mockResolvedValue({ success: true, data: {} })

      const { restoreHistoryTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo
      })

      const history: HistoryItem = {
        id: 'history-4',
        chatTitle: 'Command Test',
        chatType: 'cmd',
        chatContent: [],
        isFavorite: false,
        isEditing: false,
        editingTitle: ''
      }

      await restoreHistoryTab(history)

      const mockState = vi.mocked(useSessionState)()
      const restoredTab = mockState.chatTabs.value.find((t) => t.id === 'history-4')
      const message = restoredTab!.session.chatHistory[0]
      expect(message.say).toBe('command_output')
      expect(message.role).toBe('assistant')
    })
  })

  describe('handleTabRemove', () => {
    it('should remove tab and cancel task', async () => {
      const { handleTabRemove } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo
      })

      const mockState = vi.mocked(useSessionState)()
      mockState.chatTabs.value.push(createMockTab('tab-2'))

      await handleTabRemove('tab-2')

      expect(mockCancelTask).toHaveBeenCalledWith('tab-2')
      expect(mockState.chatTabs.value.length).toBe(1)
      expect(mockState.chatTabs.value.find((t) => t.id === 'tab-2')).toBeUndefined()
    })

    it('should switch to adjacent tab after removing current', async () => {
      const { handleTabRemove } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo
      })

      const mockState = vi.mocked(useSessionState)()
      mockState.chatTabs.value.push(createMockTab('tab-2'))
      mockState.chatTabs.value.push(createMockTab('tab-3'))
      mockState.currentChatId.value = 'tab-2'

      await handleTabRemove('tab-2')

      expect(mockState.currentChatId.value).toBe('tab-3')
    })

    it('should close AiTab when removing last tab', async () => {
      const { handleTabRemove } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        handleClose: mockHandleClose,
        emitStateChange: mockEmitStateChange
      })

      const mockState = vi.mocked(useSessionState)()

      await handleTabRemove('tab-1')

      expect(mockState.currentChatId.value).toBeUndefined()
      expect(mockEmitStateChange).toHaveBeenCalled()
      expect(mockHandleClose).toHaveBeenCalled()
    })

    it('should not remove non-existent tab', async () => {
      const { handleTabRemove } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo
      })

      const mockState = vi.mocked(useSessionState)()
      const initialLength = mockState.chatTabs.value.length

      await handleTabRemove('non-existent-tab')

      expect(mockState.chatTabs.value.length).toBe(initialLength)
    })

    it('should select last tab when removing middle tab', async () => {
      const { handleTabRemove } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo
      })

      const mockState = vi.mocked(useSessionState)()
      mockState.chatTabs.value.push(createMockTab('tab-2'))
      mockState.chatTabs.value.push(createMockTab('tab-3'))

      await handleTabRemove('tab-2')

      expect(mockState.currentChatId.value).toBe('tab-3')
      expect(mockState.chatTabs.value.length).toBe(2)
    })
  })

  describe('handleCloseTabKeyDown', () => {
    it('should close tab with Cmd+W on macOS', async () => {
      const { handleCloseTabKeyDown } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        isFocusInAiTab: mockIsFocusInAiTab
      })

      const mockState = vi.mocked(useSessionState)()
      mockState.chatTabs.value.push(createMockTab('tab-2'))

      const event = new KeyboardEvent('keydown', {
        key: 'w',
        metaKey: true
      })
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() })
      Object.defineProperty(event, 'stopPropagation', { value: vi.fn() })

      handleCloseTabKeyDown(event)

      expect(event.preventDefault).toHaveBeenCalled()
      expect(mockCancelTask).toHaveBeenCalled()
    })

    it('should not close tab on Windows with Cmd+W', async () => {
      // Mock Windows platform
      Object.defineProperty(navigator, 'platform', {
        value: 'Win32',
        configurable: true
      })

      const { handleCloseTabKeyDown } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        isFocusInAiTab: mockIsFocusInAiTab
      })

      const event = new KeyboardEvent('keydown', {
        key: 'w',
        metaKey: true
      })

      handleCloseTabKeyDown(event)

      expect(mockCancelTask).not.toHaveBeenCalled()

      // Restore platform
      Object.defineProperty(navigator, 'platform', {
        value: 'MacIntel',
        configurable: true
      })
    })

    it('should not close when focus is not in AiTab', async () => {
      mockIsFocusInAiTab.mockReturnValue(false)

      const { handleCloseTabKeyDown } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        isFocusInAiTab: mockIsFocusInAiTab
      })

      const event = new KeyboardEvent('keydown', {
        key: 'w',
        metaKey: true
      })

      handleCloseTabKeyDown(event)

      expect(mockCancelTask).not.toHaveBeenCalled()
    })
  })
})
