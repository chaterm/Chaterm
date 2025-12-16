import { ref, computed, watch, nextTick } from 'vue'
import { getGlobalState, updateGlobalState } from '@renderer/agent/storage/state'
import type { HistoryItem, TaskHistoryItem } from '../types'
import { useSessionState } from './useSessionState'
import { getDateLabel } from '../utils'
import i18n from '@/locales'
const { t } = i18n.global
interface GroupedHistory {
  dateLabel: string
  items: HistoryItem[]
}

const PAGE_SIZE = 20

/**
 * Composable for chat history management
 * Handles history loading, search, pagination, favorites and other functionalities
 *
 * @param t Internationalization translation function
 * @param createNewEmptyTab Function to create new empty tab
 */
export function useChatHistory(createNewEmptyTab?: () => Promise<string>) {
  // Get required state from global singleton state
  const { chatTabs, currentChatId, attachTabContext } = useSessionState()

  // History list
  const historyList = ref<HistoryItem[]>([])

  // Favorite list
  const favoriteTaskList = ref<string[]>([])

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
   * Filtered by search value and favorite status
   */
  const filteredHistoryList = computed(() => {
    return historyList.value.filter((history) => {
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
   * Callback after history title save - update Tab title
   */
  const handleHistorySave = async (history: HistoryItem) => {
    if (!chatTabs || !currentChatId) return

    // Update current Tab title (if current Tab is the edited history)
    if (currentChatId.value === history.id) {
      const targetTab = chatTabs.value.find((tab) => tab.id === history.id)
      if (targetTab) {
        targetTab.title = history.chatTitle
      }
    }

    // Also update corresponding Tab title
    const tabIndex = chatTabs.value.findIndex((tab) => tab.id === history.id)
    if (tabIndex !== -1) {
      chatTabs.value[tabIndex].title = history.chatTitle
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
    const message = {
      type: 'deleteTaskWithId',
      text: history.id,
      taskId: history.id
    }
    console.log('Send message to main process:', message)
    const finalMessage = attachTabContext(message)
    const response = await window.api.sendToMain(finalMessage)
    console.log('Main process response:', response)
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
      // If empty, cancel edit
      await cancelEdit(history)
      return
    }

    try {
      // Update local display
      history.chatTitle = newTitle
      history.isEditing = false
      history.editingTitle = ''
      currentEditingId.value = null

      // Update globalState
      const taskHistory = ((await getGlobalState('taskHistory')) as TaskHistoryItem[]) || []
      const targetHistory = taskHistory.find((item) => item.id === history.id)

      if (targetHistory) {
        targetHistory.chatTitle = newTitle
        await updateGlobalState('taskHistory', taskHistory)
      }

      // Directly call logic to update Tab title
      await handleHistorySave(history)
    } catch (err) {
      console.error('Failed to save history title:', err)
      // Restore original title
      await cancelEdit(history)
    }
  }

  /**
   * Cancel editing history title
   */
  const cancelEdit = async (history: HistoryItem) => {
    try {
      // Get original title from globalState
      const taskHistory = ((await getGlobalState('taskHistory')) as TaskHistoryItem[]) || []
      const targetHistory = taskHistory.find((item) => item.id === history.id)

      if (targetHistory) {
        history.chatTitle = targetHistory?.chatTitle || targetHistory?.task || 'Agent Chat'
      }

      history.isEditing = false
      history.editingTitle = ''
      currentEditingId.value = null
    } catch (err) {
      console.error('Failed to cancel edit:', err)
      history.isEditing = false
      history.editingTitle = ''
      currentEditingId.value = null
    }
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

      // Remove from globalState
      const taskHistory = ((await getGlobalState('taskHistory')) as TaskHistoryItem[]) || []
      const updatedHistory = taskHistory.filter((item) => item.id !== history.id)
      await updateGlobalState('taskHistory', updatedHistory)

      // Remove from favorite list (if exists)
      const favoriteIndex = favoriteTaskList.value.indexOf(history.id)
      if (favoriteIndex > -1) {
        favoriteTaskList.value.splice(favoriteIndex, 1)
        await updateGlobalState('favoriteTaskList', favoriteTaskList.value)
      }

      // Directly call logic to delete Tab and notify main process
      await handleHistoryDelete({ ...history })
    } catch (err) {
      console.error('Failed to delete history:', err)
    }
  }

  /**
   * Toggle favorite status
   */
  const toggleFavorite = async (history: HistoryItem) => {
    history.isFavorite = !history.isFavorite

    try {
      // Load current favorite list
      const currentFavorites = ((await getGlobalState('favoriteTaskList')) as string[]) || []

      if (history.isFavorite) {
        // Add to favorites
        if (!currentFavorites.includes(history.id)) {
          currentFavorites.push(history.id)
        }
      } else {
        // Remove from favorites
        const index = currentFavorites.indexOf(history.id)
        if (index !== -1) {
          currentFavorites.splice(index, 1)
        }
      }

      // Update local state
      favoriteTaskList.value = currentFavorites

      // Save to globalState
      await updateGlobalState('favoriteTaskList', currentFavorites)
    } catch (err) {
      console.error('Failed to update favorite status:', err)
      // Rollback local state
      history.isFavorite = !history.isFavorite
    }
  }

  /**
   * Load history list
   */
  const loadHistoryList = async () => {
    try {
      const taskHistory = ((await getGlobalState('taskHistory')) as TaskHistoryItem[]) || []
      const favorites = ((await getGlobalState('favoriteTaskList')) as string[]) || []

      favoriteTaskList.value = favorites

      // Convert to HistoryItem format
      historyList.value = taskHistory.map((item) => ({
        id: item.id,
        chatTitle: item.chatTitle || item.task || 'Agent Chat',
        chatType: 'agent', // Default type
        chatContent: [],
        isEditing: false,
        editingTitle: '',
        isFavorite: favorites.includes(item.id),
        ts: item.ts
      }))
    } catch (err) {
      console.error('Failed to load history list:', err)
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
      console.error('Failed to refresh history list:', err)
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
