import { ref, computed, watch, nextTick } from 'vue'
import { getGlobalState, updateGlobalState } from '@renderer/agent/storage/state'
import { useCurrentCwdStore } from '@/store/currentCwdStore'
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
 * 聊天历史记录管理的 composable
 * 负责历史记录的加载、搜索、分页、收藏等功能
 *
 * @param t 国际化翻译函数
 * @param createNewEmptyTab 创建新空白标签的函数
 */
export function useChatHistory(createNewEmptyTab?: () => Promise<string>) {
  // 从全局单例状态获取需要的状态
  const { chatTabs, currentChatId, attachTabContext } = useSessionState()

  // 从 store 获取 currentCwd
  const currentCwdStore = useCurrentCwdStore()
  const currentCwd = computed(() => currentCwdStore.keyValueMap)
  // 历史记录列表
  const historyList = ref<HistoryItem[]>([])

  // 收藏列表
  const favoriteTaskList = ref<string[]>([])

  // 搜索值
  const historySearchValue = ref('')

  // 是否只显示收藏
  const showOnlyFavorites = ref(false)

  // 分页相关
  const currentPage = ref(1)
  const isLoadingMore = ref(false)

  // 编辑相关
  const currentEditingId = ref<string | null>(null)

  /**
   * 过滤后的历史记录列表
   * 根据搜索值和收藏状态过滤
   */
  const filteredHistoryList = computed(() => {
    return historyList.value.filter((history) => {
      // 搜索过滤
      const matchesSearch = history.chatTitle.toLowerCase().includes(historySearchValue.value.toLowerCase())

      // 收藏过滤
      const matchesFavorite = !showOnlyFavorites.value || history.isFavorite

      return matchesSearch && matchesFavorite
    })
  })

  /**
   * 排序后的历史记录列表
   * 按时间戳降序排序
   */
  const sortedHistoryList = computed(() => {
    return [...filteredHistoryList.value].sort((a, b) => (b.ts || 0) - (a.ts || 0))
  })

  /**
   * 分页后的历史记录列表
   */
  const paginatedHistoryList = computed(() => {
    const totalToShow = currentPage.value * PAGE_SIZE
    return sortedHistoryList.value.slice(0, totalToShow)
  })

  /**
   * 按日期分组的历史记录
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
      // 对每个分组内的项目按时间戳降序排序
      items.sort((a, b) => (b.ts || 0) - (a.ts || 0))
      result.push({ dateLabel, items })
    })

    return result
  })

  /**
   * 是否还有更多历史记录
   */
  const hasMoreHistory = computed(() => {
    const displayedCount = currentPage.value * PAGE_SIZE
    return displayedCount < sortedHistoryList.value.length
  })

  /**
   * 加载更多历史记录
   */
  const loadMoreHistory = async () => {
    if (isLoadingMore.value || !hasMoreHistory.value) return

    isLoadingMore.value = true
    try {
      // 添加小延迟使加载更平滑
      await new Promise((resolve) => setTimeout(resolve, 300))
      currentPage.value++
    } finally {
      isLoadingMore.value = false
    }
  }

  /**
   * Intersection Observer 回调
   * 用于无限滚动
   */
  const handleIntersection = (entries: IntersectionObserverEntry[]) => {
    if (entries[0].isIntersecting) {
      loadMoreHistory()
    }
  }

  /**
   * 历史记录编辑后的回调 - DOM 焦点逻辑
   */
  const handleHistoryEdit = async () => {
    const input = document.querySelector('.history-title-input input') as HTMLInputElement
    if (input) {
      input.focus()
      input.select()
    }
  }
  /**
   * 历史记录标题保存后的回调 - 更新 Tab 标题
   */
  const handleHistorySave = async (history: HistoryItem) => {
    if (!chatTabs || !currentChatId) return

    // 更新当前 Tab 标题（如果当前 Tab 是被编辑的历史记录）
    if (currentChatId.value === history.id) {
      const targetTab = chatTabs.value.find((tab) => tab.id === history.id)
      if (targetTab) {
        targetTab.title = history.chatTitle
      }
    }

    // 同时更新对应 Tab 的标题
    const tabIndex = chatTabs.value.findIndex((tab) => tab.id === history.id)
    if (tabIndex !== -1) {
      chatTabs.value[tabIndex].title = history.chatTitle
    }
  }

  /**
   * 历史记录删除后的回调 - 删除对应 Tab 并发送消息到主进程
   */
  const handleHistoryDelete = async (history: HistoryItem) => {
    if (!chatTabs || !currentChatId) return

    // 检查被删除的历史记录是否有对应的打开 Tab，并移除它
    const tabIndex = chatTabs.value.findIndex((tab) => tab.id === history.id)
    if (tabIndex !== -1) {
      // 从 chatTabs 中移除该 Tab
      chatTabs.value.splice(tabIndex, 1)

      // 如果被删除的 Tab 是当前激活的，切换到另一个 Tab
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

    // 发送消息到主进程
    const message = {
      type: 'deleteTaskWithId',
      text: history.id,
      taskId: history.id,
      cwd: currentCwd.value
    }
    console.log('Send message to main process:', message)
    const finalMessage = attachTabContext(message)
    const response = await window.api.sendToMain(finalMessage)
    console.log('Main process response:', response)
  }

  /**
   * 编辑历史记录标题
   */
  const editHistory = async (history: HistoryItem) => {
    // 如果已有其他项目正在编辑，先取消
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

    // 直接调用 DOM 焦点逻辑
    await nextTick()
    await handleHistoryEdit()
  }

  /**
   * 保存历史记录标题
   */
  const saveHistoryTitle = async (history: HistoryItem) => {
    const newTitle = history.editingTitle?.trim()

    if (!newTitle) {
      // 如果为空，取消编辑
      await cancelEdit(history)
      return
    }

    try {
      // 更新本地显示
      history.chatTitle = newTitle
      history.isEditing = false
      history.editingTitle = ''
      currentEditingId.value = null

      // 更新 globalState
      const taskHistory = ((await getGlobalState('taskHistory')) as TaskHistoryItem[]) || []
      const targetHistory = taskHistory.find((item) => item.id === history.id)

      if (targetHistory) {
        targetHistory.chatTitle = newTitle
        await updateGlobalState('taskHistory', taskHistory)
      }

      // 直接调用更新 Tab 标题的逻辑
      await handleHistorySave(history)
    } catch (err) {
      console.error('Failed to save history title:', err)
      // 恢复原标题
      await cancelEdit(history)
    }
  }

  /**
   * 取消编辑历史记录标题
   */
  const cancelEdit = async (history: HistoryItem) => {
    try {
      // 从 globalState 获取原标题
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
   * 删除历史记录
   */
  const deleteHistory = async (history: HistoryItem) => {
    try {
      // 从本地列表中移除
      const index = historyList.value.findIndex((item) => item.id === history.id)
      if (index > -1) {
        historyList.value.splice(index, 1)
      }

      // 从 globalState 中移除
      const taskHistory = ((await getGlobalState('taskHistory')) as TaskHistoryItem[]) || []
      const updatedHistory = taskHistory.filter((item) => item.id !== history.id)
      await updateGlobalState('taskHistory', updatedHistory)

      // 从收藏列表中移除（如果存在）
      const favoriteIndex = favoriteTaskList.value.indexOf(history.id)
      if (favoriteIndex > -1) {
        favoriteTaskList.value.splice(favoriteIndex, 1)
        await updateGlobalState('favoriteTaskList', favoriteTaskList.value)
      }

      // 直接调用删除 Tab 和主进程通知逻辑
      await handleHistoryDelete(history)
    } catch (err) {
      console.error('Failed to delete history:', err)
    }
  }

  /**
   * 切换收藏状态
   */
  const toggleFavorite = async (history: HistoryItem) => {
    history.isFavorite = !history.isFavorite

    try {
      // 加载当前收藏列表
      const currentFavorites = ((await getGlobalState('favoriteTaskList')) as string[]) || []

      if (history.isFavorite) {
        // 添加到收藏
        if (!currentFavorites.includes(history.id)) {
          currentFavorites.push(history.id)
        }
      } else {
        // 从收藏中移除
        const index = currentFavorites.indexOf(history.id)
        if (index !== -1) {
          currentFavorites.splice(index, 1)
        }
      }

      // 更新本地状态
      favoriteTaskList.value = currentFavorites

      // 保存到 globalState
      await updateGlobalState('favoriteTaskList', currentFavorites)
    } catch (err) {
      console.error('Failed to update favorite status:', err)
      // 回滚本地状态
      history.isFavorite = !history.isFavorite
    }
  }

  /**
   * 加载历史记录列表
   */
  const loadHistoryList = async () => {
    try {
      const taskHistory = ((await getGlobalState('taskHistory')) as TaskHistoryItem[]) || []
      const favorites = ((await getGlobalState('favoriteTaskList')) as string[]) || []

      favoriteTaskList.value = favorites

      // 转换为 HistoryItem 格式
      historyList.value = taskHistory.map((item) => ({
        id: item.id,
        chatTitle: item.chatTitle || item.task || 'Agent Chat',
        chatType: 'agent', // 默认类型
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
   * 刷新历史记录列表（重置分页并重新加载）
   * 通常在点击历史记录按钮时调用
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

  // 监听搜索值变化，重置分页
  watch(historySearchValue, () => {
    currentPage.value = 1
  })

  // 监听收藏筛选变化，重置分页
  watch(showOnlyFavorites, () => {
    currentPage.value = 1
  })

  return {
    // 状态
    historyList,
    historySearchValue,
    showOnlyFavorites,
    currentPage,
    isLoadingMore,
    currentEditingId,

    // 计算属性
    filteredHistoryList,
    sortedHistoryList,
    paginatedHistoryList,
    groupedPaginatedHistory,
    hasMoreHistory,

    // 方法
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
