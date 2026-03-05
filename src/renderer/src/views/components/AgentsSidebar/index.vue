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
          @click="handleConversationClick(conversation)"
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
import type { WebviewMessage } from '@shared/WebviewMessage'
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
  favorite?: boolean
  ipAddress?: string
}

const { t } = useI18n()

const logger = createRendererLogger('agents')

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
    const result = await window.api.getTaskList()
    if (!result.success || !result.data) return

    const taskList = result.data // sorted by updatedAt DESC from DB

    // Map to conversation format, derive IP from hosts in single query result
    allConversations.value = taskList.map((item) => {
      let ipAddress: string | undefined
      const hosts = (item as any).hosts as Host[] | undefined
      if (hosts && hosts.length > 0) {
        const ipAddresses = hosts.map((h: Host) => h.host).filter(Boolean)
        if (ipAddresses.length > 0) {
          ipAddress = ipAddresses.length === 1 ? ipAddresses[0] : `${ipAddresses[0]} +${ipAddresses.length - 1}`
        }
      }
      return {
        id: item.id,
        title: item.title || 'New Chat',
        favorite: item.favorite,
        ts: item.updatedAt,
        ipAddress
      }
    })
  } catch (error) {
    logger.error('Failed to load conversations', { error: error })
  } finally {
    isLoading = false
  }
}

const handleSearch = () => {
  // Reset pagination when search value changes
  currentPage.value = 1
}

const handleConversationClick = (conversation: ConversationItem) => {
  activeConversationId.value = conversation.id
  emit('conversation-select', conversation)
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

    // Send message to main process to delete task (DB handles metadata cleanup)
    const message: WebviewMessage = {
      type: 'deleteTaskWithId',
      text: conversationId,
      taskId: conversationId
    }
    await window.api.sendToMain(message)

    emit('conversation-delete', conversationId)
  } catch (error) {
    logger.error('Failed to delete conversation', { error: error })
  }
}

// Load more conversations when user clicks "Load More" button
const loadMoreConversations = async () => {
  if (isLoadingMore.value || !hasMoreConversations.value) return

  isLoadingMore.value = true
  try {
    // Add small delay to make loading smoother
    await new Promise((resolve) => setTimeout(resolve, 300))

    // IP addresses are already loaded from getTaskList, just increment page
    currentPage.value++
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

  // Listen for incremental task update notifications from main process
  if (window.api && window.api.onMainMessage) {
    removeMainMessageListener = window.api.onMainMessage((message: { type?: string; taskId?: string; title?: string; favorite?: boolean }) => {
      if (message?.type === 'taskTitleUpdated' && message.taskId) {
        const conv = allConversations.value.find((c) => c.id === message.taskId)
        if (conv) conv.title = message.title || 'New Chat'
      } else if (message?.type === 'taskFavoriteUpdated' && message.taskId) {
        const conv = allConversations.value.find((c) => c.id === message.taskId)
        if (conv) conv.favorite = message.favorite ?? false
      } else if (message?.type === 'taskDeleted' && message.taskId) {
        allConversations.value = allConversations.value.filter((c) => c.id !== message.taskId)
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
