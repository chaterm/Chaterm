import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useChatHistory } from '../useChatHistory'
import { useSessionState } from '../useSessionState'

// Mock dependencies
vi.mock('../useSessionState')
vi.mock('@/locales', () => ({
  default: {
    global: {
      t: (key: string) => key
    }
  }
}))

// Mock window.api
const mockSendToMain = vi.fn()
const mockSaveTaskFavorite = vi.fn().mockResolvedValue(undefined)
const mockGetTaskList = vi.fn()
global.window = {
  api: {
    sendToMain: mockSendToMain,
    saveTaskFavorite: mockSaveTaskFavorite,
    getTaskList: mockGetTaskList
  }
} as any

// Helper to create task list API response
interface TaskListItem {
  id: string
  title: string | null
  favorite: boolean
  createdAt: number
  updatedAt: number
}
const mockTaskListResponse = (data: TaskListItem[]) => ({ success: true, data })

describe('useChatHistory', () => {
  let mockCreateNewEmptyTab: ReturnType<typeof vi.fn<() => Promise<string>>>

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
    inputValue: '',
    modelValue: ''
  })

  beforeEach(async () => {
    vi.clearAllMocks()

    mockCreateNewEmptyTab = vi.fn().mockResolvedValue('new-tab-id')

    const chatTabs = ref([createMockTab('tab-1')])
    const currentChatId = ref('tab-1')
    const mockAttachTabContext = vi.fn((payload: any) => ({
      ...payload,
      tabId: 'tab-1',
      taskId: 'tab-1'
    }))

    vi.mocked(useSessionState).mockReturnValue({
      chatTabs,
      currentChatId,
      attachTabContext: mockAttachTabContext
    } as any)

    mockGetTaskList.mockResolvedValue({ success: true, data: [] })
    mockSendToMain.mockResolvedValue({ success: true })
    mockSaveTaskFavorite.mockResolvedValue(undefined)
  })

  describe('loadHistoryList', () => {
    it('should load history from task list API', async () => {
      const mockData: TaskListItem[] = [
        { id: 'task-1', title: 'Test Chat', favorite: false, createdAt: 1000, updatedAt: 1000 },
        { id: 'task-2', title: 'Another Chat', favorite: false, createdAt: 2000, updatedAt: 2000 }
      ]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      const { loadHistoryList, historyList } = useChatHistory()

      await loadHistoryList()

      expect(mockGetTaskList).toHaveBeenCalledWith('server')
      expect(historyList.value).toHaveLength(2)
      expect(historyList.value[0].id).toBe('task-1')
      expect(historyList.value[0].chatTitle).toBe('Test Chat')
      expect(historyList.value[0].isFavorite).toBe(false)
    })

    it('should request database-scoped list when workspace=database', async () => {
      const mockData: TaskListItem[] = [{ id: 'task-db-1', title: 'DB Chat', favorite: false, createdAt: 1000, updatedAt: 1000 }]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      const { loadHistoryList } = useChatHistory({ workspace: 'database' })
      await loadHistoryList()

      expect(mockGetTaskList).toHaveBeenCalledWith('database')
    })

    it('should mark favorites correctly', async () => {
      const mockData: TaskListItem[] = [
        { id: 'task-1', title: 'Test', favorite: true, createdAt: 1000, updatedAt: 1000 },
        { id: 'task-2', title: 'Test2', favorite: false, createdAt: 2000, updatedAt: 2000 }
      ]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      const { loadHistoryList, historyList } = useChatHistory()

      await loadHistoryList()

      expect(historyList.value[0].isFavorite).toBe(true)
      expect(historyList.value[1].isFavorite).toBe(false)
    })

    it('should use default chatTitle when not provided', async () => {
      const mockData: TaskListItem[] = [{ id: 'task-1', title: null, favorite: false, createdAt: 1000, updatedAt: 1000 }]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      const { loadHistoryList, historyList } = useChatHistory()

      await loadHistoryList()

      expect(historyList.value[0].chatTitle).toBe('New Chat')
    })
  })

  describe('filteredHistoryList', () => {
    it('should filter by search value', async () => {
      const mockData: TaskListItem[] = [
        { id: 'task-1', title: 'Python Script', favorite: false, createdAt: 1000, updatedAt: 1000 },
        { id: 'task-2', title: 'JavaScript Code', favorite: false, createdAt: 2000, updatedAt: 2000 }
      ]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      const { loadHistoryList, historySearchValue, filteredHistoryList } = useChatHistory()

      await loadHistoryList()
      historySearchValue.value = 'python'

      expect(filteredHistoryList.value).toHaveLength(1)
      expect(filteredHistoryList.value[0].chatTitle).toBe('Python Script')
    })

    it('should filter by favorite status', async () => {
      const mockData: TaskListItem[] = [
        { id: 'task-1', title: 'Chat 1', favorite: true, createdAt: 1000, updatedAt: 1000 },
        { id: 'task-2', title: 'Chat 2', favorite: false, createdAt: 2000, updatedAt: 2000 }
      ]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      const { loadHistoryList, showOnlyFavorites, filteredHistoryList } = useChatHistory()

      await loadHistoryList()
      showOnlyFavorites.value = true

      expect(filteredHistoryList.value).toHaveLength(1)
      expect(filteredHistoryList.value[0].id).toBe('task-1')
    })

    it('should filter by both search and favorite', async () => {
      const mockData: TaskListItem[] = [
        { id: 'task-1', title: 'Python Code', favorite: true, createdAt: 1000, updatedAt: 1000 },
        { id: 'task-2', title: 'Python Tutorial', favorite: false, createdAt: 2000, updatedAt: 2000 },
        { id: 'task-3', title: 'JavaScript', favorite: true, createdAt: 3000, updatedAt: 3000 }
      ]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      const { loadHistoryList, historySearchValue, showOnlyFavorites, filteredHistoryList } = useChatHistory()

      await loadHistoryList()
      historySearchValue.value = 'python'
      showOnlyFavorites.value = true

      expect(filteredHistoryList.value).toHaveLength(1)
      expect(filteredHistoryList.value[0].id).toBe('task-1')
    })
  })

  describe('sortedHistoryList', () => {
    it('should sort by timestamp descending', async () => {
      const mockData: TaskListItem[] = [
        { id: 'task-1', title: 'Old', favorite: false, createdAt: 1000, updatedAt: 1000 },
        { id: 'task-2', title: 'New', favorite: false, createdAt: 3000, updatedAt: 3000 },
        { id: 'task-3', title: 'Middle', favorite: false, createdAt: 2000, updatedAt: 2000 }
      ]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      const { loadHistoryList, sortedHistoryList } = useChatHistory()

      await loadHistoryList()

      expect(sortedHistoryList.value[0].id).toBe('task-2')
      expect(sortedHistoryList.value[1].id).toBe('task-3')
      expect(sortedHistoryList.value[2].id).toBe('task-1')
    })
  })

  describe('pagination', () => {
    it('should paginate history list', async () => {
      const mockData: TaskListItem[] = Array.from({ length: 25 }, (_, i) => ({
        id: `task-${i}`,
        title: `Chat ${i}`,
        favorite: false,
        createdAt: i * 1000,
        updatedAt: i * 1000
      }))
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      const { loadHistoryList, paginatedHistoryList, currentPage } = useChatHistory()

      await loadHistoryList()

      // Default page size is 20
      expect(paginatedHistoryList.value).toHaveLength(20)
      expect(currentPage.value).toBe(1)
    })

    it('should load more history', async () => {
      const mockData: TaskListItem[] = Array.from({ length: 25 }, (_, i) => ({
        id: `task-${i}`,
        title: `Chat ${i}`,
        favorite: false,
        createdAt: i * 1000,
        updatedAt: i * 1000
      }))
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      const { loadHistoryList, loadMoreHistory, paginatedHistoryList, hasMoreHistory } = useChatHistory()

      await loadHistoryList()
      expect(hasMoreHistory.value).toBe(true)

      await loadMoreHistory()

      expect(paginatedHistoryList.value).toHaveLength(25)
      expect(hasMoreHistory.value).toBe(false)
    })

    it('should not load more when already at end', async () => {
      const mockData: TaskListItem[] = [{ id: 'task-1', title: 'Chat 1', favorite: false, createdAt: 1000, updatedAt: 1000 }]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      const { loadHistoryList, loadMoreHistory, currentPage, hasMoreHistory } = useChatHistory()

      await loadHistoryList()
      expect(hasMoreHistory.value).toBe(false)

      const initialPage = currentPage.value
      await loadMoreHistory()

      expect(currentPage.value).toBe(initialPage)
    })
  })

  describe('toggleFavorite', () => {
    it('should add to favorites', async () => {
      const mockData: TaskListItem[] = [{ id: 'task-1', title: 'Test', favorite: false, createdAt: 1000, updatedAt: 1000 }]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      const { loadHistoryList, toggleFavorite, historyList } = useChatHistory()

      await loadHistoryList()
      const history = historyList.value[0]

      await toggleFavorite(history)

      expect(history.isFavorite).toBe(true)
      expect(mockSaveTaskFavorite).toHaveBeenCalledWith('task-1', true)
    })

    it('should remove from favorites', async () => {
      const mockData: TaskListItem[] = [{ id: 'task-1', title: 'Test', favorite: true, createdAt: 1000, updatedAt: 1000 }]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      const { loadHistoryList, toggleFavorite, historyList } = useChatHistory()

      await loadHistoryList()
      const history = historyList.value[0]

      await toggleFavorite(history)

      expect(history.isFavorite).toBe(false)
      expect(mockSaveTaskFavorite).toHaveBeenCalledWith('task-1', false)
    })

    it('should handle toggle failure', async () => {
      const mockData: TaskListItem[] = [{ id: 'task-1', title: 'Test', favorite: false, createdAt: 1000, updatedAt: 1000 }]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))
      mockSaveTaskFavorite.mockRejectedValueOnce(new Error('Update failed'))

      const { loadHistoryList, toggleFavorite, historyList } = useChatHistory()

      await loadHistoryList()
      const history = historyList.value[0]
      const initialState = history.isFavorite

      await toggleFavorite(history)

      // Should rollback
      expect(history.isFavorite).toBe(initialState)
    })
  })

  describe('editHistory', () => {
    it('should enter edit mode', async () => {
      const mockData: TaskListItem[] = [{ id: 'task-1', title: 'Original Title', favorite: false, createdAt: 1000, updatedAt: 1000 }]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      const { loadHistoryList, editHistory, historyList, currentEditingId } = useChatHistory()

      await loadHistoryList()
      const history = historyList.value[0]

      await editHistory(history)

      expect(history.isEditing).toBe(true)
      expect(history.editingTitle).toBe('Original Title')
      expect(currentEditingId.value).toBe('task-1')
    })

    it('should cancel previous edit when editing new item', async () => {
      const mockData: TaskListItem[] = [
        { id: 'task-1', title: 'Title 1', favorite: false, createdAt: 1000, updatedAt: 1000 },
        { id: 'task-2', title: 'Title 2', favorite: false, createdAt: 2000, updatedAt: 2000 }
      ]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      const { loadHistoryList, editHistory, historyList } = useChatHistory()

      await loadHistoryList()
      const history1 = historyList.value[0]
      const history2 = historyList.value[1]

      await editHistory(history1)
      expect(history1.isEditing).toBe(true)

      await editHistory(history2)
      expect(history1.isEditing).toBe(false)
      expect(history2.isEditing).toBe(true)
    })
  })

  describe('saveHistoryTitle', () => {
    it('should save new title via renameTab', async () => {
      const mockData: TaskListItem[] = [{ id: 'task-1', title: 'Old Title', favorite: false, createdAt: 1000, updatedAt: 1000 }]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      const mockRenameTab = vi.fn()
      const { loadHistoryList, editHistory, saveHistoryTitle, historyList } = useChatHistory({
        renameTab: mockRenameTab
      })

      await loadHistoryList()
      const history = historyList.value[0]

      await editHistory(history)
      history.editingTitle = 'New Title'
      await saveHistoryTitle(history)

      expect(history.chatTitle).toBe('New Title')
      expect(history.isEditing).toBe(false)
      expect(mockRenameTab).toHaveBeenCalledWith('task-1', 'New Title')
    })

    it('should cancel edit when title is empty', async () => {
      const mockData: TaskListItem[] = [{ id: 'task-1', title: 'Original', favorite: false, createdAt: 1000, updatedAt: 1000 }]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      const { loadHistoryList, editHistory, saveHistoryTitle, historyList } = useChatHistory()

      await loadHistoryList()
      const history = historyList.value[0]

      await editHistory(history)
      history.editingTitle = '   '
      await saveHistoryTitle(history)

      expect(history.chatTitle).toBe('Original')
      expect(history.isEditing).toBe(false)
    })

    it('should work without renameTab provided', async () => {
      const mockData: TaskListItem[] = [{ id: 'tab-1', title: 'Old Title', favorite: false, createdAt: 1000, updatedAt: 1000 }]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      const { loadHistoryList, editHistory, saveHistoryTitle, historyList } = useChatHistory()

      await loadHistoryList()
      const history = historyList.value[0]

      await editHistory(history)
      history.editingTitle = 'Updated Title'
      await saveHistoryTitle(history)

      // Should still update local state even without renameTab
      expect(history.chatTitle).toBe('Updated Title')
      expect(history.isEditing).toBe(false)
    })
  })

  describe('deleteHistory', () => {
    it('should delete history item', async () => {
      const mockData: TaskListItem[] = [
        { id: 'task-1', title: 'To Delete', favorite: false, createdAt: 1000, updatedAt: 1000 },
        { id: 'task-2', title: 'Keep', favorite: false, createdAt: 2000, updatedAt: 2000 }
      ]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      const { loadHistoryList, deleteHistory, historyList } = useChatHistory()

      await loadHistoryList()
      const history = historyList.value[0]

      await deleteHistory(history)

      expect(historyList.value).toHaveLength(1)
      expect(historyList.value[0].id).toBe('task-2')
    })

    it('should close tab and send message to main', async () => {
      const mockData: TaskListItem[] = [{ id: 'tab-1', title: 'Test', favorite: false, createdAt: 1000, updatedAt: 1000 }]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      const mockState = vi.mocked(useSessionState)()

      const { loadHistoryList, deleteHistory, historyList } = useChatHistory()

      await loadHistoryList()
      const history = historyList.value[0]

      await deleteHistory(history)

      expect(mockState.chatTabs.value).toHaveLength(0)
      expect(mockSendToMain).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'deleteTaskWithId',
          text: 'tab-1',
          taskId: 'tab-1'
        })
      )
    })

    it('should create new tab when deleting last tab', async () => {
      const mockData: TaskListItem[] = [{ id: 'tab-1', title: 'Test', favorite: false, createdAt: 1000, updatedAt: 1000 }]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      const { loadHistoryList, deleteHistory, historyList } = useChatHistory({ createNewEmptyTab: mockCreateNewEmptyTab })

      await loadHistoryList()
      const history = historyList.value[0]

      await deleteHistory(history)

      expect(mockCreateNewEmptyTab).toHaveBeenCalled()
    })
  })

  describe('refreshHistoryList', () => {
    it('should reset pagination and reload', async () => {
      const mockData: TaskListItem[] = Array.from({ length: 25 }, (_, i) => ({
        id: `task-${i}`,
        title: `Chat ${i}`,
        favorite: false,
        createdAt: i * 1000,
        updatedAt: i * 1000
      }))
      mockGetTaskList.mockResolvedValue(mockTaskListResponse(mockData))

      const { loadHistoryList, loadMoreHistory, refreshHistoryList, currentPage } = useChatHistory()

      await loadHistoryList()
      await loadMoreHistory()
      expect(currentPage.value).toBe(2)

      await refreshHistoryList()

      expect(currentPage.value).toBe(1)
    })
  })

  describe('cancelEdit', () => {
    it('should restore original title', async () => {
      const mockData: TaskListItem[] = [{ id: 'task-1', title: 'Original', favorite: false, createdAt: 1000, updatedAt: 1000 }]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      const { loadHistoryList, editHistory, cancelEdit, historyList } = useChatHistory()

      await loadHistoryList()
      const history = historyList.value[0]

      await editHistory(history)
      history.editingTitle = 'Changed'
      await cancelEdit(history)

      expect(history.chatTitle).toBe('Original')
      expect(history.isEditing).toBe(false)
    })
  })

  describe('groupedPaginatedHistory', () => {
    it('should group by date labels', async () => {
      const now = Date.now()
      const mockData: TaskListItem[] = [
        { id: 'task-1', title: 'Today', favorite: false, createdAt: now, updatedAt: now },
        { id: 'task-2', title: 'Yesterday', favorite: false, createdAt: now - 86400000, updatedAt: now - 86400000 }
      ]
      mockGetTaskList.mockResolvedValueOnce(mockTaskListResponse(mockData))

      const { loadHistoryList, groupedPaginatedHistory } = useChatHistory()

      await loadHistoryList()

      expect(groupedPaginatedHistory.value.length).toBeGreaterThan(0)
      expect(groupedPaginatedHistory.value[0].items).toBeDefined()
    })
  })
})
