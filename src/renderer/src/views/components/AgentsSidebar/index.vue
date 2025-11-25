<template>
  <div class="agents-workspace">
    <div class="agents-workspace-header">
      <a-input
        v-model:value="searchValue"
        :placeholder="t('common.search')"
        class="search-input"
        allow-clear
        size="small"
        @input="handleSearch"
      >
        <template #prefix>
          <SearchOutlined />
        </template>
      </a-input>
      <a-button
        size="small"
        class="new-chat-btn"
        block
        @click="handleNewChat"
      >
        <template #icon>
          <PlusOutlined />
        </template>
        New Chat
      </a-button>
    </div>
    <div class="agents-workspace-content">
      <div
        v-if="paginatedConversations.length === 0 && !isLoadingMore"
        class="empty-state"
      >
        <div class="empty-text">{{ t('common.noData') }}</div>
      </div>
      <div
        v-else
        class="conversation-list"
      >
        <div
          v-for="conversation in paginatedConversations"
          :key="conversation.id"
          class="conversation-item"
          :class="{ active: conversation.id === activeConversationId }"
          @click="handleConversationClick(conversation.id)"
        >
          <div class="conversation-content">
            <div class="conversation-title">{{ conversation.title }}</div>
            <div class="conversation-meta">
              <span class="conversation-time">{{ formatTime(conversation.ts) }}</span>
              <span
                v-if="conversation.ipAddress"
                class="conversation-ip"
              >
                {{ conversation.ipAddress }}
              </span>
            </div>
          </div>
          <a-button
            type="text"
            size="small"
            class="delete-btn"
            @click.stop="handleDeleteConversation(conversation.id)"
          >
            <template #icon>
              <DeleteOutlined />
            </template>
          </a-button>
        </div>
        <div
          v-if="hasMoreConversations"
          class="load-more-btn"
          @click="loadMoreConversations"
        >
          {{ isLoadingMore ? t('ai.loading') : t('ai.loadMore') }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PlusOutlined, SearchOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import { getGlobalState, updateGlobalState } from '@/agent/storage/state'
import eventBus from '@/utils/eventBus'

interface Host {
  host: string
  uuid: string
  connection: string
}

interface ConversationItem {
  id: string
  title: string
  ts: number
  chatType?: string
  ipAddress?: string
}

interface TaskHistoryItem {
  id: string
  ts: number
  chatTitle?: string
  task?: string
  chatType?: string
}

const { t } = useI18n()
const searchValue = ref('')
const allConversations = ref<ConversationItem[]>([]) // Store all conversations
const activeConversationId = ref<string | null>(null)

// Pagination state for lazy loading
const PAGE_SIZE = 20
const currentPage = ref(1)
const isLoadingMore = ref(false)

const emit = defineEmits(['conversation-select', 'new-chat', 'conversation-delete'])

// Sort conversations by timestamp (newest first)
const sortedConversations = computed(() => {
  return [...allConversations.value].sort((a, b) => b.ts - a.ts)
})

// Filter conversations based on search value
const filteredConversations = computed(() => {
  if (!searchValue.value) {
    return sortedConversations.value
  }
  const query = searchValue.value.toLowerCase().trim()
  return sortedConversations.value.filter((conv) => conv.title.toLowerCase().includes(query) || conv.id.toLowerCase().includes(query))
})

// Paginated conversations (only show current page)
const paginatedConversations = computed(() => {
  const totalToShow = currentPage.value * PAGE_SIZE
  return filteredConversations.value.slice(0, totalToShow)
})

// Check if there are more conversations to load
const hasMoreConversations = computed(() => {
  const displayedCount = currentPage.value * PAGE_SIZE
  return displayedCount < filteredConversations.value.length
})

const formatTime = (ts: number) => {
  const date = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } else if (days < 7) {
    return `${days}${t('common.daysAgo')}`
  } else {
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
  }
}

const loadConversations = async () => {
  if (isLoading) {
    return
  }
  isLoading = true
  try {
    const taskHistory = ((await getGlobalState('taskHistory')) as TaskHistoryItem[]) || []
    const favorites = ((await getGlobalState('favoriteTaskList')) as string[]) || []

    // Preserve existing IP addresses to prevent flickering
    const existingIpMap = new Map<string, string>()
    allConversations.value.forEach((conv) => {
      if (conv.ipAddress) {
        existingIpMap.set(conv.id, conv.ipAddress)
      }
    })

    const historyItems = taskHistory
      .sort((a, b) => b.ts - a.ts)
      .map((task) => ({
        id: task.id,
        title: task?.chatTitle || task?.task || 'New Chat',
        ts: task.ts,
        chatType: task.chatType || 'cmd',
        isFavorite: favorites.includes(task.id),
        ipAddress: existingIpMap.get(task.id) as string | undefined
      }))

    allConversations.value = historyItems

    // Load IP addresses for displayed conversations asynchronously (only for items without IP)
    const itemsToLoadIp = paginatedConversations.value.filter((item) => !item.ipAddress)
    await Promise.all(
      itemsToLoadIp.map(async (item) => {
        try {
          const metadataResult = await window.api.getTaskMetadata(item.id)
          if (metadataResult?.success && metadataResult?.data?.hosts && Array.isArray(metadataResult.data.hosts)) {
            const hosts = metadataResult.data.hosts as Host[]
            if (hosts.length > 0) {
              // Get the first host's IP address, or combine multiple IPs
              const ipAddresses = hosts.map((h: Host) => h.host).filter(Boolean)
              if (ipAddresses.length > 0) {
                const itemIndex = allConversations.value.findIndex((conv) => conv.id === item.id)
                if (itemIndex !== -1) {
                  allConversations.value[itemIndex].ipAddress =
                    ipAddresses.length === 1 ? ipAddresses[0] : `${ipAddresses[0]}${ipAddresses.length > 1 ? ` +${ipAddresses.length - 1}` : ''}`
                }
              }
            }
          }
        } catch (error) {
          // Silently fail for individual IP loading
          console.debug('Failed to load IP for conversation:', item.id, error)
        }
      })
    )
  } catch (error) {
    console.error('Failed to load conversations:', error)
  } finally {
    isLoading = false
  }
}

const handleSearch = () => {
  // Reset pagination when search value changes
  currentPage.value = 1
}

const handleConversationClick = (conversationId: string) => {
  activeConversationId.value = conversationId
  emit('conversation-select', conversationId)
}

const handleNewChat = () => {
  activeConversationId.value = null
  emit('new-chat')
}

const handleDeleteConversation = async (conversationId: string) => {
  try {
    // Remove from local list
    allConversations.value = allConversations.value.filter((conv) => conv.id !== conversationId)
    if (activeConversationId.value === conversationId) {
      activeConversationId.value = null
    }

    // Remove from globalState taskHistory
    const taskHistory = ((await getGlobalState('taskHistory')) as TaskHistoryItem[]) || []
    const updatedHistory = taskHistory.filter((item) => item.id !== conversationId)
    await updateGlobalState('taskHistory', updatedHistory)

    // Remove from favoriteTaskList if exists
    const favoriteTaskList = ((await getGlobalState('favoriteTaskList')) as string[]) || []
    const favoriteIndex = favoriteTaskList.indexOf(conversationId)
    if (favoriteIndex > -1) {
      favoriteTaskList.splice(favoriteIndex, 1)
      await updateGlobalState('favoriteTaskList', favoriteTaskList)
    }

    // Send message to main process to delete task
    const message = {
      type: 'deleteTaskWithId',
      text: conversationId,
      taskId: conversationId,
      cwd: ''
    }
    await window.api.sendToMain(message)

    emit('conversation-delete', conversationId)
  } catch (error) {
    console.error('Failed to delete conversation:', error)
  }
}

// Load more conversations when user clicks "Load More" button
const loadMoreConversations = async () => {
  if (isLoadingMore.value || !hasMoreConversations.value) return

  isLoadingMore.value = true
  try {
    // Add small delay to make loading smoother
    await new Promise((resolve) => setTimeout(resolve, 300))

    // Record the previous displayed count before incrementing page
    const previousDisplayedCount = currentPage.value * PAGE_SIZE
    currentPage.value++

    // Load IP addresses for newly displayed conversations
    const newItems = filteredConversations.value.slice(previousDisplayedCount, currentPage.value * PAGE_SIZE).filter((item) => !item.ipAddress)

    await Promise.all(
      newItems.map(async (item) => {
        try {
          const metadataResult = await window.api.getTaskMetadata(item.id)
          if (metadataResult?.success && metadataResult?.data?.hosts && Array.isArray(metadataResult.data.hosts)) {
            const hosts = metadataResult.data.hosts as Host[]
            if (hosts.length > 0) {
              const ipAddresses = hosts.map((h: Host) => h.host).filter(Boolean)
              if (ipAddresses.length > 0) {
                const itemIndex = allConversations.value.findIndex((conv) => conv.id === item.id)
                if (itemIndex !== -1) {
                  allConversations.value[itemIndex].ipAddress =
                    ipAddresses.length === 1 ? ipAddresses[0] : `${ipAddresses[0]}${ipAddresses.length > 1 ? ` +${ipAddresses.length - 1}` : ''}`
                }
              }
            }
          }
        } catch (error) {
          console.debug('Failed to load IP for conversation:', item.id, error)
        }
      })
    )
  } finally {
    isLoadingMore.value = false
  }
}

// Listen for search value changes to reset pagination
watch(searchValue, () => {
  currentPage.value = 1
})

// Track loading state to prevent concurrent loads
let isLoading = false

// Lazy load: refresh when window gains focus
const handleVisibilityChange = () => {
  if (!document.hidden && !isLoading) {
    loadConversations()
  }
}

// Lazy load: refresh when new chat is created
const handleNewChatCreated = () => {
  if (!isLoading) {
    loadConversations()
  }
}

// Lazy load: refresh when tab is restored
const handleTabRestored = () => {
  if (!isLoading) {
    loadConversations()
  }
}

// Handle taskHistory updated notification from main process
const handleTaskHistoryUpdated = () => {
  if (!isLoading) {
    loadConversations()
  }
}

let removeMainMessageListener: (() => void) | undefined

onMounted(() => {
  // Initial load
  loadConversations()

  // Listen for window visibility changes (lazy load on focus)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('focus', handleVisibilityChange)

  // Listen for new chat creation events
  eventBus.on('create-new-empty-tab', handleNewChatCreated)
  eventBus.on('restore-history-tab', handleTabRestored)

  // Listen for taskHistory updates from main process
  if (window.api && window.api.onMainMessage) {
    removeMainMessageListener = window.api.onMainMessage((message: { type?: string }) => {
      if (message?.type === 'taskHistoryUpdated') {
        handleTaskHistoryUpdated()
      }
    })
  }
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('focus', handleVisibilityChange)
  eventBus.off('create-new-empty-tab', handleNewChatCreated)
  eventBus.off('restore-history-tab', handleTabRestored)
  if (removeMainMessageListener) {
    removeMainMessageListener()
  }
})

defineExpose({
  loadConversations,
  setActiveConversation: (id: string | null) => {
    activeConversationId.value = id
  }
})
</script>

<style lang="less" scoped>
.agents-workspace {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  padding: 4px;

  .agents-workspace-header {
    padding: 8px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;

    .search-input {
      background-color: var(--bg-color-secondary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      box-shadow: none;
      transition: all 0.3s ease;

      :deep(.ant-input) {
        background-color: var(--bg-color-secondary);
        color: var(--text-color);
        border: none;
        box-shadow: none;

        &::placeholder {
          color: var(--text-color-tertiary);
        }

        &:hover,
        &:focus {
          background-color: var(--bg-color-secondary);
          border: none;
          box-shadow: none;
        }
      }

      :deep(.ant-input-prefix) {
        color: var(--text-color-tertiary);
      }

      :deep(.ant-input-clear-icon) {
        color: var(--text-color-tertiary);

        &:hover {
          color: var(--text-color);
        }
      }

      &:hover {
        border-color: var(--border-color-light);
      }

      &:focus-within {
        border-color: #1890ff;
        box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.1);
      }
    }

    .new-chat-btn {
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      background-color: var(--bg-color);
      border-color: var(--border-color);
      color: var(--text-color);
      transition: all 0.2s ease;

      &:hover {
        background-color: var(--button-bg-color);
        border-color: var(--button-bg-color);
        color: var(--text-color);
      }

      &:active {
        background-color: var(--button-active-bg);
        border-color: var(--button-active-bg);
        color: var(--text-color);
      }

      :deep(.anticon) {
        color: var(--text-color);
      }
    }
  }

  .agents-workspace-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;

    .empty-state {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;

      .empty-text {
        color: var(--text-color-tertiary);
        font-size: 13px;
      }
    }

    .conversation-list {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      scrollbar-width: thin;
      scrollbar-color: var(--border-color-light) transparent;

      &::-webkit-scrollbar {
        width: 6px;
      }

      &::-webkit-scrollbar-track {
        background: transparent;
      }

      &::-webkit-scrollbar-thumb {
        background-color: var(--border-color-light);
        border-radius: 3px;
      }

      &::-webkit-scrollbar-thumb:hover {
        background-color: var(--text-color-tertiary);
      }

      .load-more-btn {
        padding: 8px;
        text-align: center;
        cursor: pointer;
        color: var(--text-color-tertiary);
        font-size: 12px;
        border-radius: 6px;
        transition: all 0.2s ease;
        margin-top: 4px;

        &:hover {
          background: var(--hover-bg-color);
          color: var(--text-color);
        }
      }

      .conversation-item {
        padding: 6px 10px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
        border: 1px solid transparent;
        display: flex;
        align-items: center;
        justify-content: space-between;
        position: relative;

        &:hover {
          background: var(--hover-bg-color);

          .delete-btn {
            opacity: 1;
          }
        }

        &.active {
          background: rgba(24, 144, 255, 0.1);
          border-color: rgba(24, 144, 255, 0.2);

          .conversation-content {
            .conversation-title {
              color: #1890ff;
            }

            .conversation-time {
              color: var(--text-color-tertiary);
            }
          }

          .delete-btn {
            opacity: 1;
            color: var(--text-color-tertiary);

            &:hover {
              color: var(--text-color);
            }
          }
        }

        .conversation-content {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;

          .conversation-title {
            font-size: 12px;
            font-weight: 500;
            color: var(--text-color);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            line-height: 1.3;
          }

          .conversation-meta {
            display: flex;
            align-items: center;
            gap: 6px;
            line-height: 1.2;
          }

          .conversation-time {
            font-size: 10px;
            color: var(--text-color-tertiary);
          }

          .conversation-ip {
            font-size: 10px;
            color: var(--text-color-tertiary);
          }
        }

        .delete-btn {
          opacity: 0;
          transition: opacity 0.2s ease;
          color: var(--text-color-tertiary);
          padding: 2px;
          height: 20px;
          width: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-left: 6px;

          &:hover {
            color: var(--error-color, #ff4d4f);
            background: var(--hover-bg-color);
          }
        }
      }
    }
  }
}
</style>
