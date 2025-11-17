<template>
  <div class="agents-sidebar">
    <div class="agents-sidebar-header">
      <div class="header-title">{{ t('common.agentsMode') }}</div>
      <a-button
        type="text"
        size="small"
        class="new-chat-btn"
        @click="handleNewChat"
      >
        <template #icon>
          <PlusOutlined />
        </template>
        {{ t('common.newChat') }}
      </a-button>
    </div>
    <div class="agents-sidebar-content">
      <a-input
        v-model:value="searchValue"
        :placeholder="t('common.search')"
        class="search-input"
        allow-clear
        @input="handleSearch"
      >
        <template #prefix>
          <SearchOutlined />
        </template>
      </a-input>
      <div
        v-if="filteredConversations.length === 0"
        class="empty-state"
      >
        <div class="empty-text">{{ t('common.noData') }}</div>
      </div>
      <div
        v-else
        class="conversation-list"
      >
        <div
          v-for="conversation in filteredConversations"
          :key="conversation.id"
          class="conversation-item"
          :class="{ active: conversation.id === activeConversationId }"
          @click="handleConversationClick(conversation.id)"
        >
          <div class="conversation-title">{{ conversation.title }}</div>
          <div class="conversation-meta">
            <span class="conversation-time">{{ formatTime(conversation.ts) }}</span>
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
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PlusOutlined, SearchOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import { getGlobalState } from '@/agent/storage/state'

interface ConversationItem {
  id: string
  title: string
  ts: number
  chatType?: string
}

const { t } = useI18n()
const searchValue = ref('')
const conversations = ref<ConversationItem[]>([])
const activeConversationId = ref<string | null>(null)

const emit = defineEmits(['conversation-select', 'new-chat', 'conversation-delete'])

const filteredConversations = computed(() => {
  if (!searchValue.value) {
    return conversations.value
  }
  const query = searchValue.value.toLowerCase().trim()
  return conversations.value.filter((conv) => conv.title.toLowerCase().includes(query) || conv.id.toLowerCase().includes(query))
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
  try {
    const taskHistory = ((await getGlobalState('taskHistory')) as any[]) || []
    const favorites = ((await getGlobalState('favoriteTaskList')) as string[]) || []

    const historyItems = taskHistory
      .sort((a, b) => b.ts - a.ts)
      .map((task) => ({
        id: task.id,
        title: task?.chatTitle || task?.task || 'New Chat',
        ts: task.ts,
        chatType: task.chatType || 'cmd',
        isFavorite: favorites.includes(task.id)
      }))

    conversations.value = historyItems
  } catch (error) {
    console.error('Failed to load conversations:', error)
  }
}

const handleSearch = () => {
  // Search is handled by computed property
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
    conversations.value = conversations.value.filter((conv) => conv.id !== conversationId)
    if (activeConversationId.value === conversationId) {
      activeConversationId.value = null
    }
    emit('conversation-delete', conversationId)
  } catch (error) {
    console.error('Failed to delete conversation:', error)
  }
}

// Watch for task history updates
watch(
  () => conversations.value,
  () => {
    // Reload when conversations change
  },
  { deep: true }
)

onMounted(() => {
  loadConversations()
  // Listen for task history updates
  const interval = setInterval(() => {
    loadConversations()
  }, 5000) // Refresh every 5 seconds

  // Cleanup on unmount
  return () => {
    clearInterval(interval)
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
.agents-sidebar {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  border-right: 1px solid var(--border-color);

  .agents-sidebar-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;

    .header-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-color);
    }

    .new-chat-btn {
      color: var(--text-color);
      font-size: 12px;
      padding: 0 8px;
      height: 24px;
    }
  }

  .agents-sidebar-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;

    .search-input {
      margin: 12px 16px;
      border-radius: 4px;
    }

    .empty-state {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;

      .empty-text {
        color: var(--text-color-tertiary);
        font-size: 12px;
      }
    }

    .conversation-list {
      flex: 1;
      overflow-y: auto;
      padding: 0 8px;

      .conversation-item {
        padding: 12px;
        margin: 4px 0;
        border-radius: 6px;
        cursor: pointer;
        transition: background-color 0.2s;
        border: 1px solid transparent;

        &:hover {
          background: var(--hover-bg-color);
        }

        &.active {
          background: var(--primary-color);
          color: #fff;
          border-color: var(--primary-color);

          .conversation-title {
            color: #fff;
          }

          .conversation-meta {
            .conversation-time {
              color: rgba(255, 255, 255, 0.8);
            }
          }
        }

        .conversation-title {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-color);
          margin-bottom: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .conversation-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;

          .conversation-time {
            color: var(--text-color-tertiary);
          }

          .delete-btn {
            opacity: 0;
            transition: opacity 0.2s;
            color: var(--text-color-tertiary);
            padding: 0 4px;
            height: 20px;

            &:hover {
              color: var(--error-color, #ff4d4f);
            }
          }
        }

        &:hover .delete-btn {
          opacity: 1;
        }
      }
    }
  }
}
</style>
