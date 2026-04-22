import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { Modal } from 'ant-design-vue'
import { useTabManagement } from '../useTabManagement'
import { useSessionState } from '../useSessionState'
import type { AssetInfo, HistoryItem } from '../../types'
import type { ChatermMessage } from '@/types/ChatermMessage'
import type { ChatermMessagesPage } from '@shared/ExtensionMessage'

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
  getGlobalState: vi.fn()
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
    },
    remoteApplyGuard: { isApplying: false },
    SUPPORTED_USER_CONFIG_SCHEMA_VERSION: 1,
    getStoredUserConfigSnapshot: vi.fn(),
    resolveDataSyncPreference: vi.fn()
  }
})

// Mock dataSyncService to prevent transitive import failures
vi.mock('@/services/dataSyncService', () => ({
  dataSyncService: {
    initialize: vi.fn(),
    enableDataSync: vi.fn(),
    disableDataSync: vi.fn(),
    reset: vi.fn(),
    getInitializationStatus: vi.fn()
  }
}))

// In-memory storage for testing
const storage = new Map<string, string>()

// Mock window.api
const mockGetTaskMetadata = vi.fn()
const mockChatermGetChatermMessages = vi.fn()
const mockChatermGetChatermMessagesPage = vi.fn()
const mockSendToMain = vi.fn()
const mockCancelTask = vi.fn()
const mockSaveTaskTitle = vi.fn().mockResolvedValue(undefined)
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
    chatermGetChatermMessagesPage: mockChatermGetChatermMessagesPage,
    sendToMain: mockSendToMain,
    cancelTask: mockCancelTask,
    saveTaskTitle: mockSaveTaskTitle,
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
    lastStateChatermMessages: null,
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

  const createPageResult = (messages: ChatermMessage[], overrides: Partial<ChatermMessagesPage> = {}): ChatermMessagesPage => ({
    messages,
    nextCursor: null,
    hasMore: false,
    ...overrides
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
        },
        {
          ask: undefined,
          say: 'api_req_started',
          text: JSON.stringify({ request: 'req', tokensIn: 100, tokensOut: 20, contextWindow: 128000 }),
          type: 'say',
          ts: 101,
          partial: false
        },
        {
          ask: undefined,
          say: 'context_truncated',
          text: 'truncated',
          type: 'say',
          ts: 102,
          partial: false
        }
      ]
      mockChatermGetChatermMessagesPage.mockResolvedValue(createPageResult(mockMessages))

      const { restoreHistoryTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        toggleSidebar: mockToggleSidebar
      })

      const mockState = vi.mocked(useSessionState)()
      const history: HistoryItem = {
        id: 'history-1',
        chatTitle: 'Previous Chat',
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
      expect(restoredTab!.session.chatHistory.map((m) => m.say)).toEqual([undefined, 'api_req_started', 'context_truncated'])
    })

    it('should keep a paged text message as assistant when the chunk starts mid-conversation', async () => {
      mockGetTaskMetadata.mockResolvedValue({ success: true, data: {} })
      mockChatermGetChatermMessagesPage.mockResolvedValue(
        createPageResult(
          [
            {
              ask: undefined,
              say: 'text',
              text: 'Assistant reply',
              type: 'say',
              ts: 100,
              partial: false
            },
            {
              ask: undefined,
              say: 'completion_result',
              text: 'Done',
              type: 'say',
              ts: 101,
              partial: false
            }
          ],
          {
            nextCursor: 88,
            hasMore: true
          }
        )
      )

      const { restoreHistoryTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        toggleSidebar: mockToggleSidebar
      })

      const history: HistoryItem = {
        id: 'history-mid-page',
        chatTitle: 'Paged Chat',
        chatContent: [],
        isFavorite: false,
        isEditing: false,
        editingTitle: ''
      }

      await restoreHistoryTab(history)

      const mockState = vi.mocked(useSessionState)()
      const restoredTab = mockState.chatTabs.value.find((t) => t.id === 'history-mid-page')
      expect(restoredTab?.session.chatHistory[0].role).toBe('assistant')
    })

    it('should replace current new tab with history', async () => {
      mockChatermGetChatermMessagesPage.mockResolvedValue(createPageResult([]))
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
      mockChatermGetChatermMessagesPage.mockResolvedValue(createPageResult([]))
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

    it('should NOT send showTaskWithId message on history restore (deferred to askResponse)', async () => {
      mockChatermGetChatermMessagesPage.mockResolvedValue(createPageResult([]))
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
        chatContent: [],
        isFavorite: false,
        isEditing: false,
        editingTitle: ''
      }

      await restoreHistoryTab(history)

      expect(mockSendToMain).not.toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'showTaskWithId'
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
      mockChatermGetChatermMessagesPage.mockResolvedValue(createPageResult(mockMessages))
      mockGetTaskMetadata.mockResolvedValue({ success: true, data: {} })

      const { restoreHistoryTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        toggleSidebar: mockToggleSidebar
      })

      const history: HistoryItem = {
        id: 'history-4',
        chatTitle: 'Command Test',
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

    it('should request the newest history page first and store paging state', async () => {
      const mockMessages: ChatermMessage[] = Array.from({ length: 3 }, (_, index) => ({
        ask: undefined,
        say: 'text',
        text: `Message ${index + 1}`,
        type: 'say',
        ts: 100 + index,
        partial: false
      }))

      mockChatermGetChatermMessagesPage.mockResolvedValue(
        createPageResult(mockMessages, {
          nextCursor: 41,
          hasMore: true
        })
      )
      mockGetTaskMetadata.mockResolvedValue({ success: true, data: {} })

      const { restoreHistoryTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        toggleSidebar: mockToggleSidebar
      })

      const history: HistoryItem = {
        id: 'history-paged',
        chatTitle: 'Paged Chat',
        chatContent: [],
        isFavorite: false,
        isEditing: false,
        editingTitle: ''
      }

      await restoreHistoryTab(history)

      expect(mockChatermGetChatermMessagesPage).toHaveBeenCalledWith({
        taskId: 'history-paged',
        limit: 40,
        beforeCursor: null
      })

      const mockState = vi.mocked(useSessionState)()
      const restoredTab = mockState.chatTabs.value.find((t) => t.id === 'history-paged')
      expect(restoredTab).toBeDefined()
      expect(restoredTab!.session.chatHistory).toHaveLength(3)
      expect(restoredTab!.session.historyPagination).toEqual({
        beforeCursor: 41,
        hasMoreBefore: true,
        isLoadingBefore: false,
        pageSize: 40
      })
    })

    it('should prepend older history pages when requested', async () => {
      const firstPageMessages: ChatermMessage[] = [
        { ask: undefined, say: 'text', text: 'Message 3', type: 'say', ts: 103, partial: false },
        { ask: undefined, say: 'text', text: 'Message 4', type: 'say', ts: 104, partial: false }
      ]
      const olderPageMessages: ChatermMessage[] = [
        { ask: undefined, say: 'text', text: 'Message 1', type: 'say', ts: 101, partial: false },
        { ask: undefined, say: 'text', text: 'Message 2', type: 'say', ts: 102, partial: false }
      ]

      mockChatermGetChatermMessagesPage
        .mockResolvedValueOnce(
          createPageResult(firstPageMessages, {
            nextCursor: 21,
            hasMore: true
          })
        )
        .mockImplementationOnce(async () => {
          scrollHeight = 560
          return createPageResult(olderPageMessages, {
            nextCursor: null,
            hasMore: false
          })
        })
      mockGetTaskMetadata.mockResolvedValue({ success: true, data: {} })

      let scrollHeight = 400
      const scrollContainer = document.createElement('div')
      Object.defineProperties(scrollContainer, {
        scrollTop: { value: 80, writable: true, configurable: true },
        scrollHeight: {
          get: () => scrollHeight,
          configurable: true
        }
      })

      const { restoreHistoryTab, loadOlderHistoryForTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        toggleSidebar: mockToggleSidebar
      })

      const history: HistoryItem = {
        id: 'history-load-older',
        chatTitle: 'Paged Chat',
        chatContent: [],
        isFavorite: false,
        isEditing: false,
        editingTitle: ''
      }

      await restoreHistoryTab(history)
      await loadOlderHistoryForTab('history-load-older', { container: scrollContainer })

      expect(mockChatermGetChatermMessagesPage).toHaveBeenNthCalledWith(2, {
        taskId: 'history-load-older',
        limit: 40,
        beforeCursor: 21
      })

      const mockState = vi.mocked(useSessionState)()
      const restoredTab = mockState.chatTabs.value.find((t) => t.id === 'history-load-older')
      expect(restoredTab?.session.chatHistory.map((message) => message.content)).toEqual(['Message 1', 'Message 2', 'Message 3', 'Message 4'])
      expect(restoredTab?.session.historyPagination).toEqual({
        beforeCursor: null,
        hasMoreBefore: false,
        isLoadingBefore: false,
        pageSize: 40
      })
      expect(scrollContainer.scrollTop).toBe(240)
    })

    it('should keep loading older history until the container becomes scrollable', async () => {
      const latestPageMessages: ChatermMessage[] = [
        { ask: undefined, say: 'completion_result', text: 'Message 4', type: 'say', ts: 104, partial: false }
      ]
      const olderPageMessages: ChatermMessage[] = [{ ask: undefined, say: 'text', text: 'Message 3', type: 'say', ts: 103, partial: false }]
      const oldestPageMessages: ChatermMessage[] = [
        { ask: undefined, say: 'text', text: 'Message 1', type: 'say', ts: 101, partial: false },
        { ask: undefined, say: 'text', text: 'Message 2', type: 'say', ts: 102, partial: false }
      ]

      mockChatermGetChatermMessagesPage
        .mockResolvedValueOnce(
          createPageResult(latestPageMessages, {
            nextCursor: 33,
            hasMore: true
          })
        )
        .mockImplementationOnce(async () => {
          scrollHeight = 420
          return createPageResult(olderPageMessages, {
            nextCursor: 11,
            hasMore: true
          })
        })
        .mockImplementationOnce(async () => {
          scrollHeight = 640
          return createPageResult(oldestPageMessages, {
            nextCursor: null,
            hasMore: false
          })
        })
      mockGetTaskMetadata.mockResolvedValue({ success: true, data: {} })

      let scrollHeight = 320
      const scrollContainer = document.createElement('div')
      Object.defineProperties(scrollContainer, {
        scrollTop: { value: 0, writable: true, configurable: true },
        scrollHeight: {
          get: () => scrollHeight,
          configurable: true
        },
        clientHeight: { value: 500, writable: true, configurable: true }
      })

      const { restoreHistoryTab, loadOlderHistoryForTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        toggleSidebar: mockToggleSidebar
      })

      const history: HistoryItem = {
        id: 'history-fill-viewport',
        chatTitle: 'Paged Chat',
        chatContent: [],
        isFavorite: false,
        isEditing: false,
        editingTitle: ''
      }

      await restoreHistoryTab(history)
      await loadOlderHistoryForTab('history-fill-viewport', { container: scrollContainer })

      expect(mockChatermGetChatermMessagesPage).toHaveBeenCalledTimes(3)

      const mockState = vi.mocked(useSessionState)()
      const restoredTab = mockState.chatTabs.value.find((t) => t.id === 'history-fill-viewport')
      expect(restoredTab?.session.chatHistory.map((message) => message.content)).toEqual(['Message 1', 'Message 2', 'Message 3', 'Message 4'])
      expect(restoredTab?.session.historyPagination).toEqual({
        beforeCursor: null,
        hasMoreBefore: false,
        isLoadingBefore: false,
        pageSize: 40
      })
    })

    it('should treat the first text message from the oldest loaded page as a user message', async () => {
      const latestPageMessages: ChatermMessage[] = [{ ask: undefined, say: 'completion_result', text: 'Done', type: 'say', ts: 104, partial: false }]
      const oldestPageMessages: ChatermMessage[] = [
        { ask: undefined, say: 'text', text: 'Initial task', type: 'say', ts: 101, partial: false },
        { ask: undefined, say: 'text', text: 'Assistant reply', type: 'say', ts: 102, partial: false }
      ]

      mockChatermGetChatermMessagesPage
        .mockResolvedValueOnce(
          createPageResult(latestPageMessages, {
            nextCursor: 33,
            hasMore: true
          })
        )
        .mockResolvedValueOnce(
          createPageResult(oldestPageMessages, {
            nextCursor: null,
            hasMore: false
          })
        )
      mockGetTaskMetadata.mockResolvedValue({ success: true, data: {} })

      const scrollContainer = document.createElement('div')
      Object.defineProperties(scrollContainer, {
        scrollTop: { value: 0, writable: true, configurable: true },
        scrollHeight: { value: 600, writable: true, configurable: true }
      })

      const { restoreHistoryTab, loadOlderHistoryForTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        toggleSidebar: mockToggleSidebar
      })

      const history: HistoryItem = {
        id: 'history-oldest-page',
        chatTitle: 'Paged Chat',
        chatContent: [],
        isFavorite: false,
        isEditing: false,
        editingTitle: ''
      }

      await restoreHistoryTab(history)
      await loadOlderHistoryForTab('history-oldest-page', { container: scrollContainer })

      const mockState = vi.mocked(useSessionState)()
      const restoredTab = mockState.chatTabs.value.find((t) => t.id === 'history-oldest-page')

      expect(restoredTab?.session.chatHistory.map((message) => message.role)).toEqual(['user', 'assistant', 'assistant'])
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
    it('should update tab title and persist via saveTaskTitle', async () => {
      const { renameTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        emitStateChange: mockEmitStateChange,
        toggleSidebar: mockToggleSidebar
      })

      const mockState = vi.mocked(useSessionState)()
      mockState.chatTabs.value.push(createMockTab('tab-2'))
      mockState.currentChatId.value = 'tab-1'

      await renameTab('tab-1', 'Renamed Tab')

      expect(mockState.chatTabs.value[0].title).toBe('Renamed Tab')
      expect(mockState.currentChatId.value).toBe('tab-1')
      expect(mockSaveTaskTitle).toHaveBeenCalledWith('tab-1', 'Renamed Tab')
      expect(mockEmitStateChange).toHaveBeenCalled()
    })

    it('should call saveTaskTitle even for new tabs', async () => {
      const { renameTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        emitStateChange: mockEmitStateChange,
        toggleSidebar: mockToggleSidebar
      })

      const mockState = vi.mocked(useSessionState)()
      mockState.currentChatId.value = 'tab-1'

      await renameTab('tab-1', 'Renamed Tab')

      expect(mockState.chatTabs.value[0].title).toBe('Renamed Tab')
      expect(mockSaveTaskTitle).toHaveBeenCalledWith('tab-1', 'Renamed Tab')
      expect(mockEmitStateChange).toHaveBeenCalled()
    })

    it('should persist via saveTaskTitle even if tab not currently open', async () => {
      const { renameTab } = useTabManagement({
        getCurentTabAssetInfo: mockGetCurentTabAssetInfo,
        emitStateChange: mockEmitStateChange,
        toggleSidebar: mockToggleSidebar
      })

      const mockState = vi.mocked(useSessionState)()
      // Only tab-1 is open, but we're renaming a history item (tab-history) that's not open
      mockState.currentChatId.value = 'tab-1'

      await renameTab('tab-history', 'New History Title')

      // Tab not in open tabs, so no tab title update
      expect(mockState.chatTabs.value.find((t) => t.id === 'tab-history')).toBeUndefined()
      // But saveTaskTitle should still be called
      expect(mockSaveTaskTitle).toHaveBeenCalledWith('tab-history', 'New History Title')
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
