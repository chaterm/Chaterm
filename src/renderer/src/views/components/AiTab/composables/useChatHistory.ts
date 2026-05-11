import { ref, computed, watch, nextTick } from 'vue'

const logger = createRendererLogger('ai.chatHistory')
import type { HistoryItem } from '../types'
import { useSessionState } from './useSessionState'
import type { WebviewMessage } from '@shared/WebviewMessage'
import { getDateLabel } from '../utils'
import i18n from '@/locales'
const { t } = i18n.global
interface GroupedHistory {
  dateLabel: string
  items: HistoryItem[]
}

const PAGE_SIZE = 20

interface ChatHistoryOptions {
  createNewEmptyTab?: () => Promise<string>
  renameTab?: (tabId: string, title: string) => Promise<void>
  workspace?: 'terminal' | 'database'
}

/**
 * Composable for chat history management
 * Handles history loading, search, pagination, favorites and other functionalities
 *
 * @param options Configuration options including createNewEmptyTab and renameTab functions
 */
export function useChatHistory(options?: ChatHistoryOptions) {
  const { createNewEmptyTab, renameTab, workspace } = options || {}
  const taskWorkspaceFilter: 'server' | 'database' = workspace === 'database' ? 'database' : 'server'
  // Get required state from global singleton state
  const { chatTabs, currentChatId, attachTabContext } = useSessionState()

  // History list
  const historyList = ref<HistoryItem[]>([])

  // Search value
  const historySearchValue = ref('')

  // Whether to show only favorites
  const showOnlyFavorites = ref(false)

  // Pagination related
  const currentPage = ref(1)
  const isLoadingMore = ref(false)

  // Edit related
  const currentEditingId = ref<string | null>(null)

  /**
   * Filtered history list
   * Filtered by search value, favorite status, and workspace
   */
  const filteredHistoryList = computed(() => {
    return historyList.value.filter((history) => {
      // Defensive filter: backend already supports workspace filtering, and we
      // keep this check to protect against mixed legacy callers.
      if (workspace === 'database') {
        if (history.workspace !== 'database') return false
      } else {
        // Default 'terminal' workspace excludes database tasks
        if (history.workspace === 'database') return false
      }

      // Search filter
      const matchesSearch = history.chatTitle.toLowerCase().includes(historySearchValue.value.toLowerCase())

      // Favorite filter
      const matchesFavorite = !showOnlyFavorites.value || history.isFavorite

      return matchesSearch && matchesFavorite
    })
  })

  /**
   * Sorted history list
   * Sorted by timestamp in descending order
   */
  const sortedHistoryList = computed(() => {
    return [...filteredHistoryList.value].sort((a, b) => (b.ts || 0) - (a.ts || 0))
  })

  /**
   * Paginated history list
   */
  const paginatedHistoryList = computed(() => {
    const totalToShow = currentPage.value * PAGE_SIZE
    return sortedHistoryList.value.slice(0, totalToShow)
  })

  /**
   * History grouped by date
   */
  const groupedPaginatedHistory = computed(() => {
    const result: GroupedHistory[] = []
    const groups = new Map<string, HistoryItem[]>()

    paginatedHistoryList.value.forEach((item) => {
      const ts = item.ts || Date.now()
      const dateLabel = getDateLabel(ts, t)

      if (!groups.has(dateLabel)) {
        groups.set(dateLabel, [])
      }
      groups.get(dateLabel)!.push(item)
    })

    groups.forEach((items, dateLabel) => {
      // Sort items within each group by timestamp in descending order
      items.sort((a, b) => (b.ts || 0) - (a.ts || 0))
      result.push({ dateLabel, items })
    })

    return result
  })

  /**
   * Whether there are more history records
   */
  const hasMoreHistory = computed(() => {
    const displayedCount = currentPage.value * PAGE_SIZE
    return displayedCount < sortedHistoryList.value.length
  })

  /**
   * Load more history records
   */
  const loadMoreHistory = async () => {
    if (isLoadingMore.value || !hasMoreHistory.value) return

    isLoadingMore.value = true
    try {
      // Add small delay to make loading smoother
      await new Promise((resolve) => setTimeout(resolve, 300))
      currentPage.value++
    } finally {
      isLoadingMore.value = false
    }
  }

  /**
   * Intersection Observer callback
   * Used for infinite scroll
   */
  const handleIntersection = (entries: IntersectionObserverEntry[]) => {
    if (entries[0].isIntersecting) {
      loadMoreHistory()
    }
  }

  /**
   * Callback after history edit - DOM focus logic
   */
  const handleHistoryEdit = async () => {
    const input = document.querySelector('.history-title-input input') as HTMLInputElement
    if (input) {
      input.focus()
      input.select()
    }
  }
  /**
   * Callback after history delete - delete corresponding Tab and send message to main process
   */
  const handleHistoryDelete = async (history: HistoryItem) => {
    if (!chatTabs || !currentChatId) return

    // Check if deleted history has corresponding open Tab and remove it
    const tabIndex = chatTabs.value.findIndex((tab) => tab.id === history.id)
    if (tabIndex !== -1) {
      // Remove this Tab from chatTabs
      chatTabs.value.splice(tabIndex, 1)

      // If deleted Tab is currently active, switch to another Tab
      if (currentChatId.value === history.id) {
        if (chatTabs.value.length > 0) {
          const newActiveIndex = Math.min(tabIndex, chatTabs.value.length - 1)
          const newActiveTab = chatTabs.value[newActiveIndex]
          currentChatId.value = newActiveTab.id
        } else if (createNewEmptyTab) {
          await createNewEmptyTab()
        }
      }
    }

    // Send message to main process
    const message: WebviewMessage = {
      type: 'deleteTaskWithId',
      text: history.id,
      taskId: history.id
    }
    logger.info('Send message to main process', { data: message })
    const finalMessage = attachTabContext(message)
    const response = await window.api.sendToMain(finalMessage)
    logger.info('Main process response', { data: response })
  }

  /**
   * Edit history title
   */
  const editHistory = async (history: HistoryItem) => {
    // If another item is already being edited, cancel it first
    if (currentEditingId.value && currentEditingId.value !== history.id) {
      const previousEditingHistory = historyList.value.find((item) => item.id === currentEditingId.value)
      if (previousEditingHistory) {
        previousEditingHistory.isEditing = false
        previousEditingHistory.editingTitle = ''
      }
    }

    history.isEditing = true
    history.editingTitle = history.chatTitle
    currentEditingId.value = history.id

    // Directly call DOM focus logic
    await nextTick()
    await handleHistoryEdit()
  }

  /**
   * Save history title
   */
  const saveHistoryTitle = async (history: HistoryItem) => {
    const newTitle = history.editingTitle?.trim()

    if (!newTitle) {
      await cancelEdit(history)
      return
    }

    try {
      // Update local history list display
      history.chatTitle = newTitle
      history.isEditing = false
      history.editingTitle = ''
      currentEditingId.value = null

      // Use renameTab to persist and update tab title (avoid duplicate logic)
      if (renameTab) {
        await renameTab(history.id, newTitle)
      }
    } catch (err) {
      logger.error('Failed to save history title', { error: err })
      await cancelEdit(history)
    }
  }

  /**
   * Cancel editing history title
   */
  const cancelEdit = async (history: HistoryItem) => {
    // No legacy fallback read. Keep current title, just exit edit mode.
    history.isEditing = false
    history.editingTitle = ''
    currentEditingId.value = null
  }

  /**
   * Delete history record
   */
  const deleteHistory = async (history: HistoryItem) => {
    try {
      // Remove from local list
      const index = historyList.value.findIndex((item) => item.id === history.id)
      if (index > -1) {
        historyList.value.splice(index, 1)
      }

      // Call delete IPC (DB DELETE handles agent_task_metadata_v1 cleanup)
      await handleHistoryDelete({ ...history })
    } catch (err) {
      logger.error('Failed to delete history', { error: err })
    }
  }

  /**
   * Toggle favorite status
   */
  const toggleFavorite = async (history: HistoryItem) => {
    const newValue = !history.isFavorite
    history.isFavorite = newValue

    try {
      await window.api.saveTaskFavorite(history.id, newValue)
    } catch (err) {
      logger.error('Failed to update favorite status', { error: err })
      // Rollback local state
      history.isFavorite = !newValue
    }
  }

  /**
   * Load history list
   */
  const loadHistoryList = async () => {
    try {
      const result = await window.api.getTaskList(taskWorkspaceFilter)
      if (!result.success || !result.data) return

      historyList.value = result.data.map((item) => ({
        id: item.id,
        chatTitle: item.title || 'New Chat',
        chatContent: [],
        isFavorite: item.favorite,
        ts: item.updatedAt,
        workspace: item.workspace,
        dbContext: item.dbContext
      }))
    } catch (err) {
      logger.error('Failed to load history list', { error: err })
    }
  }

  /**
   * Refresh history list (reset pagination and reload)
   * Usually called when clicking history button
   */
  const refreshHistoryList = async () => {
    try {
      currentPage.value = 1
      isLoadingMore.value = false
      await loadHistoryList()
    } catch (err) {
      logger.error('Failed to refresh history list', { error: err })
    }
  }

  // Watch search value changes, reset pagination
  watch(historySearchValue, () => {
    currentPage.value = 1
  })

  // Watch favorite filter changes, reset pagination
  watch(showOnlyFavorites, () => {
    currentPage.value = 1
  })

  return {
    // State
    historyList,
    historySearchValue,
    showOnlyFavorites,
    currentPage,
    isLoadingMore,
    currentEditingId,

    // Computed properties
    filteredHistoryList,
    sortedHistoryList,
    paginatedHistoryList,
    groupedPaginatedHistory,
    hasMoreHistory,

    // Methods
    loadMoreHistory,
    handleIntersection,
    editHistory,
    saveHistoryTitle,
    cancelEdit,
    deleteHistory,
    toggleFavorite,
    loadHistoryList,
    refreshHistoryList
  }
}
