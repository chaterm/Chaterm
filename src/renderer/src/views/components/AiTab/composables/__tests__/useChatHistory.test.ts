import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useChatHistory } from '../useChatHistory'
import { useSessionState } from '../useSessionState'
import type { TaskHistoryItem } from '../../types'

// Mock dependencies
vi.mock('../useSessionState')
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
global.window = {
  api: {
    sendToMain: mockSendToMain
  }
} as any

describe('useChatHistory', () => {
  let mockCreateNewEmptyTab: ReturnType<typeof vi.fn<() => Promise<string>>>

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

    const { getGlobalState, updateGlobalState } = await import('@renderer/agent/storage/state')
    vi.mocked(getGlobalState).mockResolvedValue([])
    vi.mocked(updateGlobalState).mockResolvedValue(undefined)
    mockSendToMain.mockResolvedValue({ success: true })
  })

  describe('loadHistoryList', () => {
    it('should load history from global state', async () => {
      const { getGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = [
        { id: 'task-1', task: 'Test task', chatTitle: 'Test Chat', ts: 1000 },
        { id: 'task-2', task: 'Another task', chatTitle: 'Another Chat', ts: 2000 }
      ]
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve([])
        return Promise.resolve([])
      })

      const { loadHistoryList, historyList } = useChatHistory()

      await loadHistoryList()

      expect(historyList.value).toHaveLength(2)
      expect(historyList.value[0].id).toBe('task-1')
      expect(historyList.value[0].chatTitle).toBe('Test Chat')
      expect(historyList.value[0].isFavorite).toBe(false)
    })

    it('should mark favorites correctly', async () => {
      const { getGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = [
        { id: 'task-1', task: 'Test', chatTitle: 'Test', ts: 1000 },
        { id: 'task-2', task: 'Test2', chatTitle: 'Test2', ts: 2000 }
      ]
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve(['task-1'])
        return Promise.resolve([])
      })

      const { loadHistoryList, historyList } = useChatHistory()

      await loadHistoryList()

      expect(historyList.value[0].isFavorite).toBe(true)
      expect(historyList.value[1].isFavorite).toBe(false)
    })

    it('should use default chatTitle when not provided', async () => {
      const { getGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = [{ id: 'task-1', task: 'Test task', ts: 1000 }]
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve([])
        return Promise.resolve([])
      })

      const { loadHistoryList, historyList } = useChatHistory()

      await loadHistoryList()

      expect(historyList.value[0].chatTitle).toBe('Test task')
    })
  })

  describe('filteredHistoryList', () => {
    it('should filter by search value', async () => {
      const { getGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = [
        { id: 'task-1', chatTitle: 'Python Script', ts: 1000 },
        { id: 'task-2', chatTitle: 'JavaScript Code', ts: 2000 }
      ]
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve([])
        return Promise.resolve([])
      })

      const { loadHistoryList, historySearchValue, filteredHistoryList } = useChatHistory()

      await loadHistoryList()
      historySearchValue.value = 'python'

      expect(filteredHistoryList.value).toHaveLength(1)
      expect(filteredHistoryList.value[0].chatTitle).toBe('Python Script')
    })

    it('should filter by favorite status', async () => {
      const { getGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = [
        { id: 'task-1', chatTitle: 'Chat 1', ts: 1000 },
        { id: 'task-2', chatTitle: 'Chat 2', ts: 2000 }
      ]
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve(['task-1'])
        return Promise.resolve([])
      })

      const { loadHistoryList, showOnlyFavorites, filteredHistoryList } = useChatHistory()

      await loadHistoryList()
      showOnlyFavorites.value = true

      expect(filteredHistoryList.value).toHaveLength(1)
      expect(filteredHistoryList.value[0].id).toBe('task-1')
    })

    it('should filter by both search and favorite', async () => {
      const { getGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = [
        { id: 'task-1', chatTitle: 'Python Code', ts: 1000 },
        { id: 'task-2', chatTitle: 'Python Tutorial', ts: 2000 },
        { id: 'task-3', chatTitle: 'JavaScript', ts: 3000 }
      ]
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve(['task-1', 'task-3'])
        return Promise.resolve([])
      })

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
      const { getGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = [
        { id: 'task-1', chatTitle: 'Old', ts: 1000 },
        { id: 'task-2', chatTitle: 'New', ts: 3000 },
        { id: 'task-3', chatTitle: 'Middle', ts: 2000 }
      ]
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve([])
        return Promise.resolve([])
      })

      const { loadHistoryList, sortedHistoryList } = useChatHistory()

      await loadHistoryList()

      expect(sortedHistoryList.value[0].id).toBe('task-2')
      expect(sortedHistoryList.value[1].id).toBe('task-3')
      expect(sortedHistoryList.value[2].id).toBe('task-1')
    })
  })

  describe('pagination', () => {
    it('should paginate history list', async () => {
      const { getGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = Array.from({ length: 25 }, (_, i) => ({
        id: `task-${i}`,
        chatTitle: `Chat ${i}`,
        ts: i * 1000
      }))
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve([])
        return Promise.resolve([])
      })

      const { loadHistoryList, paginatedHistoryList, currentPage } = useChatHistory()

      await loadHistoryList()

      // Default page size is 20
      expect(paginatedHistoryList.value).toHaveLength(20)
      expect(currentPage.value).toBe(1)
    })

    it('should load more history', async () => {
      const { getGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = Array.from({ length: 25 }, (_, i) => ({
        id: `task-${i}`,
        chatTitle: `Chat ${i}`,
        ts: i * 1000
      }))
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve([])
        return Promise.resolve([])
      })

      const { loadHistoryList, loadMoreHistory, paginatedHistoryList, hasMoreHistory } = useChatHistory()

      await loadHistoryList()
      expect(hasMoreHistory.value).toBe(true)

      await loadMoreHistory()

      expect(paginatedHistoryList.value).toHaveLength(25)
      expect(hasMoreHistory.value).toBe(false)
    })

    it('should not load more when already at end', async () => {
      const { getGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = [{ id: 'task-1', chatTitle: 'Chat 1', ts: 1000 }]
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve([])
        return Promise.resolve([])
      })

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
      const { getGlobalState, updateGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = [{ id: 'task-1', chatTitle: 'Test', ts: 1000 }]
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve([])
        return Promise.resolve([])
      })

      const { loadHistoryList, toggleFavorite, historyList } = useChatHistory()

      await loadHistoryList()
      const history = historyList.value[0]

      await toggleFavorite(history)

      expect(history.isFavorite).toBe(true)
      expect(updateGlobalState).toHaveBeenCalledWith('favoriteTaskList', ['task-1'])
    })

    it('should remove from favorites', async () => {
      const { getGlobalState, updateGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = [{ id: 'task-1', chatTitle: 'Test', ts: 1000 }]
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve(['task-1'])
        return Promise.resolve([])
      })

      const { loadHistoryList, toggleFavorite, historyList } = useChatHistory()

      await loadHistoryList()
      const history = historyList.value[0]

      await toggleFavorite(history)

      expect(history.isFavorite).toBe(false)
      expect(updateGlobalState).toHaveBeenCalledWith('favoriteTaskList', [])
    })

    it('should handle toggle failure', async () => {
      const { getGlobalState, updateGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = [{ id: 'task-1', chatTitle: 'Test', ts: 1000 }]
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve([])
        return Promise.resolve([])
      })
      vi.mocked(updateGlobalState).mockRejectedValue(new Error('Update failed'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { loadHistoryList, toggleFavorite, historyList } = useChatHistory()

      await loadHistoryList()
      const history = historyList.value[0]
      const initialState = history.isFavorite

      await toggleFavorite(history)

      // Should rollback
      expect(history.isFavorite).toBe(initialState)
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('editHistory', () => {
    it('should enter edit mode', async () => {
      const { getGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = [{ id: 'task-1', chatTitle: 'Original Title', ts: 1000 }]
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve([])
        return Promise.resolve([])
      })

      const { loadHistoryList, editHistory, historyList, currentEditingId } = useChatHistory()

      await loadHistoryList()
      const history = historyList.value[0]

      await editHistory(history)

      expect(history.isEditing).toBe(true)
      expect(history.editingTitle).toBe('Original Title')
      expect(currentEditingId.value).toBe('task-1')
    })

    it('should cancel previous edit when editing new item', async () => {
      const { getGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = [
        { id: 'task-1', chatTitle: 'Title 1', ts: 1000 },
        { id: 'task-2', chatTitle: 'Title 2', ts: 2000 }
      ]
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve([])
        return Promise.resolve([])
      })

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
    it('should save new title', async () => {
      const { getGlobalState, updateGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = [{ id: 'task-1', chatTitle: 'Old Title', ts: 1000 }]
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve([])
        return Promise.resolve([])
      })

      const { loadHistoryList, editHistory, saveHistoryTitle, historyList } = useChatHistory()

      await loadHistoryList()
      const history = historyList.value[0]

      await editHistory(history)
      history.editingTitle = 'New Title'
      await saveHistoryTitle(history)

      expect(history.chatTitle).toBe('New Title')
      expect(history.isEditing).toBe(false)
      expect(updateGlobalState).toHaveBeenCalledWith(
        'taskHistory',
        expect.arrayContaining([
          expect.objectContaining({
            id: 'task-1',
            chatTitle: 'New Title'
          })
        ])
      )
    })

    it('should cancel edit when title is empty', async () => {
      const { getGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = [{ id: 'task-1', chatTitle: 'Original', ts: 1000 }]
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve([])
        return Promise.resolve([])
      })

      const { loadHistoryList, editHistory, saveHistoryTitle, historyList } = useChatHistory()

      await loadHistoryList()
      const history = historyList.value[0]

      await editHistory(history)
      history.editingTitle = '   '
      await saveHistoryTitle(history)

      expect(history.chatTitle).toBe('Original')
      expect(history.isEditing).toBe(false)
    })

    it('should update tab title when saving', async () => {
      const { getGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = [{ id: 'tab-1', chatTitle: 'Old Title', ts: 1000 }]
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve([])
        return Promise.resolve([])
      })

      const mockState = vi.mocked(useSessionState)()

      const { loadHistoryList, editHistory, saveHistoryTitle, historyList } = useChatHistory()

      await loadHistoryList()
      const history = historyList.value[0]

      await editHistory(history)
      history.editingTitle = 'Updated Title'
      await saveHistoryTitle(history)

      expect(mockState.chatTabs.value[0].title).toBe('Updated Title')
    })
  })

  describe('deleteHistory', () => {
    it('should delete history item', async () => {
      const { getGlobalState, updateGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = [
        { id: 'task-1', chatTitle: 'To Delete', ts: 1000 },
        { id: 'task-2', chatTitle: 'Keep', ts: 2000 }
      ]
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve([])
        return Promise.resolve([])
      })

      const { loadHistoryList, deleteHistory, historyList } = useChatHistory()

      await loadHistoryList()
      const history = historyList.value[0]

      await deleteHistory(history)

      expect(historyList.value).toHaveLength(1)
      expect(historyList.value[0].id).toBe('task-2')
      expect(updateGlobalState).toHaveBeenCalledWith('taskHistory', expect.arrayContaining([expect.objectContaining({ id: 'task-2' })]))
    })

    it('should remove from favorites when deleting', async () => {
      const { getGlobalState, updateGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = [{ id: 'task-1', chatTitle: 'Test', ts: 1000 }]
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve(['task-1'])
        return Promise.resolve([])
      })

      const { loadHistoryList, deleteHistory, historyList } = useChatHistory()

      await loadHistoryList()
      const history = historyList.value[0]

      await deleteHistory(history)

      expect(updateGlobalState).toHaveBeenCalledWith('favoriteTaskList', [])
    })

    it('should close tab and send message to main', async () => {
      const { getGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = [{ id: 'tab-1', chatTitle: 'Test', ts: 1000 }]
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve([])
        return Promise.resolve([])
      })

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
      const { getGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = [{ id: 'tab-1', chatTitle: 'Test', ts: 1000 }]
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve([])
        return Promise.resolve([])
      })

      const { loadHistoryList, deleteHistory, historyList } = useChatHistory(mockCreateNewEmptyTab)

      await loadHistoryList()
      const history = historyList.value[0]

      await deleteHistory(history)

      expect(mockCreateNewEmptyTab).toHaveBeenCalled()
    })
  })

  describe('refreshHistoryList', () => {
    it('should reset pagination and reload', async () => {
      const { getGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = Array.from({ length: 25 }, (_, i) => ({
        id: `task-${i}`,
        chatTitle: `Chat ${i}`,
        ts: i * 1000
      }))
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve([])
        return Promise.resolve([])
      })

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
      const { getGlobalState } = await import('@renderer/agent/storage/state')
      const mockTaskHistory: TaskHistoryItem[] = [{ id: 'task-1', chatTitle: 'Original', ts: 1000 }]
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve([])
        return Promise.resolve([])
      })

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
      const { getGlobalState } = await import('@renderer/agent/storage/state')
      const now = Date.now()
      const mockTaskHistory: TaskHistoryItem[] = [
        { id: 'task-1', chatTitle: 'Today', ts: now },
        { id: 'task-2', chatTitle: 'Yesterday', ts: now - 86400000 }
      ]
      vi.mocked(getGlobalState).mockImplementation((key: string) => {
        if (key === 'taskHistory') return Promise.resolve(mockTaskHistory)
        if (key === 'favoriteTaskList') return Promise.resolve([])
        return Promise.resolve([])
      })

      const { loadHistoryList, groupedPaginatedHistory } = useChatHistory()

      await loadHistoryList()

      expect(groupedPaginatedHistory.value.length).toBeGreaterThan(0)
      expect(groupedPaginatedHistory.value[0].items).toBeDefined()
    })
  })
})
