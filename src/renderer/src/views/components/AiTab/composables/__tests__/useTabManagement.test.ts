import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { Modal } from 'ant-design-vue'
import { useTabManagement } from '../useTabManagement'
import { useSessionState } from '../useSessionState'
import { getGlobalState, updateGlobalState } from '@renderer/agent/storage/state'
import type { AssetInfo, HistoryItem } from '../../types'
import type { ChatermMessage } from '@/types/ChatermMessage'

// Mock dependencies
vi.mock('../useSessionState')
vi.mock('../../components/format/markdownRenderer.vue', () => ({
  default: {
    name: 'MarkdownRenderer',
    render: () => null,
    setup: () => ({
      setThinkingLoading: vi.fn()
    })
  }
}))
vi.mock('ant-design-vue', () => ({
  Modal: {
    confirm: vi.fn()
  },
  notification: {
    config: vi.fn(),
    open: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn()
  }
}))
vi.mock('@renderer/agent/storage/state', () => ({
  getGlobalState: vi.fn(),
  updateGlobalState: vi.fn()
}))
vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>()
  return {
    ...actual,
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
  }
})

// Mock UserConfigStoreService to avoid database initialization in tests
vi.mock('@/services/userConfigStoreService', () => {
  return {
    UserConfigStoreService: vi.fn().mockImplementation(() => ({
      getConfig: vi.fn().mockResolvedValue({
        language: 'en-US',
        defaultLayout: 'terminal',
        background: {
          mode: 'none',
          image: '',
          opacity: 0.5,
          brightness: 0.45
        }
      }),
      saveConfig: vi.fn().mockResolvedValue(undefined),
      initDB: vi.fn().mockResolvedValue(undefined)
    })),
    userConfigStore: {
      getConfig: vi.fn().mockResolvedValue({
        language: 'en-US',
        defaultLayout: 'terminal',
        background: {
          mode: 'none',
          image: '',
          opacity: 0.5,
          brightness: 0.45
        }
      }),
      saveConfig: vi.fn().mockResolvedValue(undefined),
      initDB: vi.fn().mockResolvedValue(undefined)
    }
  }
})

// In-memory storage for testing
const storage = new Map<string, string>()

// Mock window.api
const mockGetTaskMetadata = vi.fn()
const mockChatermGetChatermMessages = vi.fn()
const mockSendToMain = vi.fn()
const mockCancelTask = vi.fn()
const mockKvGet = vi.fn(async (params: { key?: string }) => {
  if (params.key) {
    const value = storage.get(params.key)
    return Promise.resolve(value ? { value } : null)
  } else {
    return Promise.resolve(Array.from(storage.keys()))
  }
})
const mockKvMutate = vi.fn(async (params: { action: string; key: string; value?: string }) => {
  if (params.action === 'set') {
    storage.set(params.key, params.value || '')
  } else if (params.action === 'delete') {
    storage.delete(params.key)
  }
  return Promise.resolve(undefined)
})

global.window = {
  api: {
    getTaskMetadata: mockGetTaskMetadata,
    chatermGetChatermMessages: mockChatermGetChatermMessages,
    sendToMain: mockSendToMain,
    cancelTask: mockCancelTask,
    kvGet: mockKvGet,
    kvMutate: mockKvMutate
  }
} as any

describe('useTabManagement', () => {
  let mockGetCurentTabAssetInfo: ReturnType<typeof vi.fn<() => Promise<AssetInfo | null>>>
  let mockEmitStateChange: ReturnType<typeof vi.fn<() => void>>
  let mockIsFocusInAiTab: ReturnType<typeof vi.fn<(event?: KeyboardEvent) => boolean>>
  let mockToggleSidebar: ReturnType<typeof vi.fn<() => void>>

  const createMockSession = () => ({
    chatHistory: [],
    lastChatMessageId: '',
    responseLoading: false,
    showRetryButton: false,
    showSendButton: true,
    buttonsDisabled: false,
    isExecutingCommand: false,
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
    chatInputParts: [],
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
    mockIsFocusInAiTab = vi.fn().mockReturnValue(true)
    mockToggleSidebar = vi.fn()

    const mockTab = createMockTab('tab-1')
    const chatTabs = ref([mockTab])
    const currentChatId = ref('tab-1')
    const chatInputParts = ref([])
    const createEmptySessionState = vi.fn(() => createMockSession())
    const cleanupTabPairsCache = vi.fn()
    const messageFeedbacks = ref<Record<string, 'like' | 'dislike'>>({})

    vi.mocked(useSessionState).mockReturnValue({
      chatTabs,
      currentChatId,
      currentTab: ref(mockTab),
      createEmptySessionState,
      chatInputParts,
      chatTextareaRef: ref(null),
      cleanupTabPairsCache,
      messageFeedbacks
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
        emitStateChange: mockEmitStateChange,
        toggleSidebar: mockToggleSidebar
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
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        toggleSidebar: mockToggleSidebar
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

    it('should have empty hosts when no asset info available', async () => {
      mockGetCurentTabAssetInfo.mockResolvedValue(null)

      const { createNewEmptyTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        toggleSidebar: mockToggleSidebar
      })

      const mockState = vi.mocked(useSessionState)()

      await createNewEmptyTab()
      await nextTick()

      const newTab = mockState.chatTabs.value[1]
      expect(newTab.hosts).toEqual([])
    })

    it('should set model value from global state', async () => {
      const { createNewEmptyTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        toggleSidebar: mockToggleSidebar
      })

      const mockState = vi.mocked(useSessionState)()

      await createNewEmptyTab()
      await nextTick()

      const newTab = mockState.chatTabs.value[1]
      expect(newTab.modelValue).toBe('claude-sonnet-4-5')
    })

    it('should keep chat input parts', async () => {
      const { createNewEmptyTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        toggleSidebar: mockToggleSidebar
      })

      const mockState = vi.mocked(useSessionState)()
      mockState.chatInputParts.value = [{ type: 'text', text: 'test input' }]

      await createNewEmptyTab()

      expect(mockState.chatInputParts.value).toEqual([{ type: 'text', text: 'test input' }])
    })
  })

  describe('restoreHistoryTab', () => {
    it('should switch to existing tab if already open', async () => {
      const { restoreHistoryTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        toggleSidebar: mockToggleSidebar
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
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        toggleSidebar: mockToggleSidebar
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
      expect(restoredTab!.hosts?.[0]?.host).toBe('192.168.1.50')
      expect(restoredTab!.chatType).toBe('cmd')
      expect(restoredTab!.modelValue).toBe('gpt-4')
    })

    it('should replace current new tab with history', async () => {
      mockChatermGetChatermMessages.mockResolvedValue([])
      mockGetTaskMetadata.mockResolvedValue({ success: true, data: {} })

      const { restoreHistoryTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        toggleSidebar: mockToggleSidebar
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

    it('should keep current new tab when forceNewTab is true', async () => {
      mockChatermGetChatermMessages.mockResolvedValue([])
      mockGetTaskMetadata.mockResolvedValue({ success: true, data: {} })

      const { restoreHistoryTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        toggleSidebar: mockToggleSidebar
      })

      const mockState = vi.mocked(useSessionState)()
      mockState.chatTabs.value[0].title = 'New chat'
      mockState.chatTabs.value[0].session.chatHistory = []

      const history: HistoryItem = {
        id: 'history-3',
        chatTitle: 'Forced New Tab',
        chatType: 'agent',
        chatContent: [],
        isFavorite: false,
        isEditing: false,
        editingTitle: ''
      }

      await restoreHistoryTab(history, { forceNewTab: true })

      expect(mockState.chatTabs.value.length).toBe(2)
      expect(mockState.chatTabs.value.some((tab) => tab.id === 'history-3')).toBe(true)
      expect(mockState.chatTabs.value[0].id).not.toBe('history-3')
    })

    it('should send showTaskWithId message to main', async () => {
      mockChatermGetChatermMessages.mockResolvedValue([])
      mockGetTaskMetadata.mockResolvedValue({
        success: true,
        data: {
          hosts: [{ host: '10.0.0.1', uuid: 'srv-1', connection: 'jumpserver', assetType: 'person-switch-cisco' }]
        }
      })

      const { restoreHistoryTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        toggleSidebar: mockToggleSidebar
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
          hosts: [{ host: '10.0.0.1', uuid: 'srv-1', connection: 'jumpserver', assetType: 'person-switch-cisco' }]
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
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        toggleSidebar: mockToggleSidebar
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
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        toggleSidebar: mockToggleSidebar
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
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        toggleSidebar: mockToggleSidebar
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
        emitStateChange: mockEmitStateChange,
        toggleSidebar: mockToggleSidebar
      })

      const mockState = vi.mocked(useSessionState)()

      await handleTabRemove('tab-1')

      expect(mockState.currentChatId.value).toBeUndefined()
      expect(mockEmitStateChange).toHaveBeenCalled()
      expect(mockToggleSidebar).toHaveBeenCalled()
    })

    it('should not remove non-existent tab', async () => {
      const { handleTabRemove } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        toggleSidebar: mockToggleSidebar
      })

      const mockState = vi.mocked(useSessionState)()
      const initialLength = mockState.chatTabs.value.length

      await handleTabRemove('non-existent-tab')

      expect(mockState.chatTabs.value.length).toBe(initialLength)
    })

    it('should select last tab when removing middle tab', async () => {
      const { handleTabRemove } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        toggleSidebar: mockToggleSidebar
      })

      const mockState = vi.mocked(useSessionState)()
      mockState.chatTabs.value.push(createMockTab('tab-2'))
      mockState.chatTabs.value.push(createMockTab('tab-3'))

      await handleTabRemove('tab-2')

      expect(mockState.currentChatId.value).toBe('tab-3')
      expect(mockState.chatTabs.value.length).toBe(2)
    })
  })

  describe('renameTab', () => {
    it('should update tab title and persist to taskHistory', async () => {
      const { renameTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        emitStateChange: mockEmitStateChange,
        toggleSidebar: mockToggleSidebar
      })

      const mockState = vi.mocked(useSessionState)()
      mockState.chatTabs.value.push(createMockTab('tab-2'))
      mockState.currentChatId.value = 'tab-1'

      const mockTaskHistory = [
        { id: 'tab-1', chatTitle: 'Old Title', ts: 1000 },
        { id: 'tab-2', chatTitle: 'Tab 2', ts: 2000 }
      ]
      vi.mocked(getGlobalState).mockResolvedValue(mockTaskHistory)

      await renameTab('tab-1', 'Renamed Tab')

      expect(mockState.chatTabs.value[0].title).toBe('Renamed Tab')
      expect(mockState.currentChatId.value).toBe('tab-1')
      expect(updateGlobalState).toHaveBeenCalledWith('taskHistory', [
        { id: 'tab-1', chatTitle: 'Renamed Tab', ts: 1000 },
        { id: 'tab-2', chatTitle: 'Tab 2', ts: 2000 }
      ])
      expect(mockEmitStateChange).toHaveBeenCalled()
    })

    it('should update tab title even if not in taskHistory', async () => {
      const { renameTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        emitStateChange: mockEmitStateChange,
        toggleSidebar: mockToggleSidebar
      })

      const mockState = vi.mocked(useSessionState)()
      mockState.currentChatId.value = 'tab-1'

      // Tab not in taskHistory (new tab not yet saved)
      vi.mocked(getGlobalState).mockResolvedValue([])

      await renameTab('tab-1', 'Renamed Tab')

      expect(mockState.chatTabs.value[0].title).toBe('Renamed Tab')
      expect(updateGlobalState).not.toHaveBeenCalled()
      expect(mockEmitStateChange).toHaveBeenCalled()
    })

    it('should persist to taskHistory even if tab not currently open', async () => {
      const { renameTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        emitStateChange: mockEmitStateChange,
        toggleSidebar: mockToggleSidebar
      })

      const mockState = vi.mocked(useSessionState)()
      // Only tab-1 is open, but we're renaming a history item (tab-history) that's not open
      mockState.currentChatId.value = 'tab-1'

      const mockTaskHistory = [
        { id: 'tab-1', chatTitle: 'Tab 1', ts: 1000 },
        { id: 'tab-history', chatTitle: 'Old History Title', ts: 2000 }
      ]
      vi.mocked(getGlobalState).mockResolvedValue(mockTaskHistory)

      await renameTab('tab-history', 'New History Title')

      // Tab not in open tabs, so no tab title update
      expect(mockState.chatTabs.value.find((t) => t.id === 'tab-history')).toBeUndefined()
      // But taskHistory should be updated
      expect(updateGlobalState).toHaveBeenCalledWith('taskHistory', [
        { id: 'tab-1', chatTitle: 'Tab 1', ts: 1000 },
        { id: 'tab-history', chatTitle: 'New History Title', ts: 2000 }
      ])
      expect(mockEmitStateChange).toHaveBeenCalled()
    })
  })

  describe('bulk close', () => {
    beforeEach(() => {
      vi.mocked(Modal.confirm).mockReset()
    })

    it('should close other tabs with one confirm when any task running', async () => {
      const { closeOtherTabs } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        emitStateChange: mockEmitStateChange,
        toggleSidebar: mockToggleSidebar
      })

      const mockState = vi.mocked(useSessionState)()
      const runningTab = createMockTab('tab-2')
      runningTab.session.responseLoading = true
      mockState.chatTabs.value.push(runningTab, createMockTab('tab-3'))

      let onOkPromise: Promise<void> | undefined
      vi.mocked(Modal.confirm).mockImplementation(({ onOk }) => {
        onOkPromise = onOk?.() as Promise<void> | undefined
        return {} as any
      })

      await closeOtherTabs('tab-3')
      if (onOkPromise) await onOkPromise

      expect(Modal.confirm).toHaveBeenCalledTimes(1)
      expect(mockState.chatTabs.value.length).toBe(1)
      expect(mockState.chatTabs.value[0].id).toBe('tab-3')
      expect(mockCancelTask).toHaveBeenCalledWith('tab-1')
      expect(mockCancelTask).toHaveBeenCalledWith('tab-2')
    })

    it('should close all tabs with one confirm when any task running', async () => {
      const { closeAllTabs } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        emitStateChange: mockEmitStateChange,
        toggleSidebar: mockToggleSidebar
      })

      const mockState = vi.mocked(useSessionState)()
      const runningTab = createMockTab('tab-2')
      runningTab.session.responseLoading = true
      mockState.chatTabs.value.push(runningTab, createMockTab('tab-3'))

      let onOkPromise: Promise<void> | undefined
      vi.mocked(Modal.confirm).mockImplementation(({ onOk }) => {
        onOkPromise = onOk?.() as Promise<void> | undefined
        return {} as any
      })

      await closeAllTabs()
      if (onOkPromise) await onOkPromise

      expect(Modal.confirm).toHaveBeenCalledTimes(1)
      expect(mockState.chatTabs.value.length).toBe(0)
      expect(mockState.currentChatId.value).toBeUndefined()
      expect(mockCancelTask).toHaveBeenCalledWith('tab-1')
      expect(mockCancelTask).toHaveBeenCalledWith('tab-2')
      expect(mockCancelTask).toHaveBeenCalledWith('tab-3')
    })
  })

  describe('handleCloseTabKeyDown', () => {
    it('should close tab with Cmd+W on macOS', async () => {
      const { handleCloseTabKeyDown } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        isFocusInAiTab: mockIsFocusInAiTab,
        toggleSidebar: mockToggleSidebar
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
        isFocusInAiTab: mockIsFocusInAiTab,
        toggleSidebar: mockToggleSidebar
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
        isFocusInAiTab: mockIsFocusInAiTab,
        toggleSidebar: mockToggleSidebar
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
