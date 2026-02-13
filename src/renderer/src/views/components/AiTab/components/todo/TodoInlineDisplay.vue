<template>
  <div
    v-if="visible"
    class="todo-inline-display"
    :class="{ 'has-focused': hasFocusedTodo }"
  >
    <div
      class="todo-inline-header"
      @click="toggleExpanded"
    >
      <div class="todo-header-left">
        <div class="todo-title">
          <UnorderedListOutlined class="todo-icon" />
          <span class="todo-title-text">{{ todoTitle }}</span>
          <!-- Focus Chain indicator -->
          <span
            v-if="hasFocusedTodo"
            class="focus-chain-badge"
          >
            <ThunderboltOutlined class="focus-icon" />
            <span class="focus-label">{{ t('ai.focusChain') }}</span>
          </span>
        </div>
        <div class="todo-progress-ratio">
          <span class="ratio-completed">{{ progressCounts.completed }}</span>
          <span class="ratio-separator">/</span>
          <span class="ratio-total">{{ progressCounts.total }}</span>
        </div>
      </div>
      <div class="todo-header-right">
        <!-- Context usage indicator (Focus Chain feature) -->
        <div
          v-if="contextUsagePercent > 0"
          class="context-usage-indicator"
          :class="contextUsageLevel"
        >
          <div class="context-bar-container">
            <div
              class="context-bar-fill"
              :style="{ width: contextUsagePercent + '%' }"
            />
          </div>
          <span class="context-text">{{ contextUsagePercent }}%</span>
        </div>
        <div class="todo-progress-indicator">
          <div class="progress-bar-container">
            <div
              class="progress-bar-fill"
              :style="{ width: progressPercent + '%' }"
            />
          </div>
          <span class="progress-text">{{ progressPercent }}%</span>
        </div>
        <div class="todo-controls">
          <UpOutlined
            v-if="expanded"
            class="expand-icon"
          />
          <DownOutlined
            v-else
            class="expand-icon"
          />
        </div>
      </div>
    </div>

    <!-- Focused task highlight (Focus Chain feature) -->
    <div
      v-if="expanded && focusedTodo"
      class="focus-chain-highlight"
    >
      <div class="focused-task-inline">
        <ThunderboltOutlined class="focused-icon" />
        <span class="focused-label">{{ t('ai.currentFocus') }}</span>
        <span class="focused-task-title">{{ focusedTodo.content }}</span>
        <span
          v-if="focusedTodo.description"
          class="focused-task-desc"
          >{{ focusedTodo.description }}</span
        >
      </div>
    </div>

    <a-collapse
      v-if="expanded"
      v-model:active-key="activeKey"
      :bordered="false"
    >
      <a-collapse-panel
        key="todos"
        :show-arrow="false"
      >
        <TodoCompactList
          :todos="todos"
          :show-progress="showProgress"
          :show-subtasks="showSubtasks"
          :max-items="maxItems"
          :focused-todo-id="focusedTodo?.id"
        />
      </a-collapse-panel>
    </a-collapse>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, watch } from 'vue'
import { UnorderedListOutlined, UpOutlined, DownOutlined, ThunderboltOutlined } from '@ant-design/icons-vue'
const TodoCompactList = defineAsyncComponent(() => import('./TodoCompactList.vue'))
import type { Todo, FocusChainState, ContextThresholdLevel } from '../../../../../types/todo'
import i18n from '@/locales'

const logger = createRendererLogger('ai.todo')

const { t } = i18n.global

interface Props {
  todos: Todo[]
  showTrigger?: boolean
  showProgress?: boolean
  showSubtasks?: boolean
  maxItems?: number
  // Focus Chain props
  focusChainState?: FocusChainState | null
  contextUsagePercent?: number
}

const props = withDefaults(defineProps<Props>(), {
  showTrigger: false,
  showProgress: true,
  showSubtasks: true,
  maxItems: 20,
  focusChainState: null,
  contextUsagePercent: 0
})

const visible = ref(true)
const expanded = ref(props.showTrigger)
const activeKey = ref(props.showTrigger ? ['todos'] : [])

const progressCounts = computed(() => {
  const total = props.todos.length
  let completed = 0
  let inProgress = 0

  props.todos.forEach((todo) => {
    if (todo.status === 'completed') {
      completed++
    } else if (todo.status === 'in_progress') {
      inProgress++
    }
  })

  const pending = total - completed - inProgress
  return { total, completed, inProgress, pending }
})

const progressPercent = computed(() => {
  const { total, completed } = progressCounts.value
  if (total === 0) return 0
  return Math.round((completed / total) * 100)
})

// Focus Chain: Find the currently focused todo
const focusedTodo = computed(() => {
  // First check for explicitly focused todo
  const focused = props.todos.find((todo) => todo.isFocused)
  if (focused) return focused

  // Fall back to in_progress todo
  return props.todos.find((todo) => todo.status === 'in_progress') || null
})

// Focus Chain: Check if there's a focused todo
const hasFocusedTodo = computed(() => focusedTodo.value !== null)

// Focus Chain: Get context usage level for styling
const contextUsageLevel = computed((): ContextThresholdLevel => {
  const usage = props.contextUsagePercent || props.focusChainState?.currentContextUsage || 0
  if (usage >= 90) return 'maximum'
  if (usage >= 70) return 'critical'
  if (usage >= 50) return 'warning'
  return 'normal'
})

// Dynamic title - use i18n
const todoTitle = computed(() => t('ai.taskProgress'))

// Add debug logs
watch(
  () => props.todos,
  (newTodos) => {
    logger.debug('todos prop changed', {
      data: { length: newTodos?.length || 0, visible: visible.value, expanded: expanded.value, focusedTodo: focusedTodo.value?.content }
    })
  },
  { immediate: true, deep: true }
)

watch(visible, (newVisible) => {
  logger.debug('visible changed', { data: newVisible })
})

watch(expanded, (newExpanded) => {
  logger.debug('expanded changed', { data: newExpanded })
})

const toggleExpanded = () => {
  logger.debug('toggleExpanded called', { data: { current: expanded.value } })
  expanded.value = !expanded.value
  activeKey.value = expanded.value ? ['todos'] : []
  logger.debug('toggleExpanded result', { data: { new: expanded.value } })
}
</script>

<style scoped lang="less">
.todo-inline-display {
  margin: 12px 0;
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color-light);
  border-radius: 10px;
  overflow: hidden;
  transition:
    background-color 0.3s ease,
    border-color 0.3s ease,
    box-shadow 0.3s ease;

  &:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }

  // Focus Chain enhancement: highlight when task is focused
  &.has-focused {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 1px rgba(var(--primary-color-rgb, 24, 144, 255), 0.1);
  }
}

.todo-inline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: linear-gradient(135deg, var(--bg-color) 0%, var(--bg-color-secondary) 100%);
  border-bottom: 1px solid var(--border-color-light);
  cursor: pointer;
  transition: background 0.2s;
  user-select: none;
  gap: 10px;
}

.todo-inline-header:hover {
  background: linear-gradient(135deg, var(--hover-bg-color) 0%, var(--bg-color-secondary) 100%);
}

.todo-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.todo-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.todo-title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.todo-icon {
  font-size: 12px;
  color: var(--text-color-secondary);
  opacity: 0.85;
}

.todo-title-text {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color);
}

.todo-progress-ratio {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color-light);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;

  .ratio-completed {
    color: var(--text-color);
  }

  .ratio-separator {
    color: var(--text-color-tertiary);
    margin: 0 1px;
  }

  .ratio-total {
    color: var(--text-color-secondary);
  }
}

// Focus Chain badge
.focus-chain-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border-radius: 6px;
  background: linear-gradient(135deg, rgba(250, 173, 20, 0.15) 0%, rgba(250, 140, 22, 0.1) 100%);
  border: 1px solid rgba(250, 173, 20, 0.3);
  margin-left: 6px;
  animation: focusPulse 2s ease-in-out infinite;

  .focus-icon {
    font-size: 10px;
    color: #faad14;
  }

  .focus-label {
    font-size: 10px;
    font-weight: 500;
    color: #d48806;
  }
}

@keyframes focusPulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

// Context usage indicator (Focus Chain feature)
.context-usage-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-right: 8px;

  .context-bar-container {
    width: 30px;
    height: 3px;
    background: var(--bg-color-secondary);
    border-radius: 2px;
    overflow: hidden;
    border: 1px solid var(--border-color-light);
  }

  .context-bar-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    min-width: 1px;
  }

  .context-text {
    font-size: 9px;
    font-weight: 500;
    color: var(--text-color-tertiary);
    font-variant-numeric: tabular-nums;
    min-width: 24px;
    text-align: right;
  }

  // Context level colors
  &.normal .context-bar-fill {
    background: linear-gradient(90deg, #52c41a 0%, #73d13d 100%);
  }

  &.warning .context-bar-fill {
    background: linear-gradient(90deg, #faad14 0%, #ffc53d 100%);
  }

  &.critical .context-bar-fill {
    background: linear-gradient(90deg, #fa8c16 0%, #ffa940 100%);
  }

  &.maximum .context-bar-fill {
    background: linear-gradient(90deg, #f5222d 0%, #ff4d4f 100%);
  }

  &.warning .context-text,
  &.critical .context-text,
  &.maximum .context-text {
    color: var(--text-color-secondary);
  }
}

// Focus Chain highlight section
.focus-chain-highlight {
  padding: 8px 12px;
  background: linear-gradient(135deg, rgba(250, 173, 20, 0.08) 0%, rgba(250, 140, 22, 0.04) 100%);
  border-bottom: 1px solid rgba(250, 173, 20, 0.15);

  .focused-task-inline {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: nowrap;
    min-width: 0;

    .focused-icon {
      font-size: 11px;
      color: #faad14;
    }

    .focused-label {
      font-size: 10px;
      font-weight: 600;
      color: #d48806;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .focused-task-title {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-color);
      margin-left: 4px;
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
      max-width: 40%;
    }

    .focused-task-desc {
      font-size: 11px;
      color: var(--text-color-secondary);
      line-height: 1.4;
      margin-left: 4px;
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
      max-width: 45%;
    }
  }
}

.todo-progress-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}

.progress-bar-container {
  width: 50px;
  height: 4px;
  background: var(--bg-color-secondary);
  border-radius: 2px;
  overflow: hidden;
  border: 1px solid var(--border-color-light);
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #52c41a 0%, #73d13d 100%);
  border-radius: 2px;
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  min-width: 2px;
}

.progress-text {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-color-secondary);
  font-variant-numeric: tabular-nums;
  min-width: 28px;
  text-align: right;
}

.todo-controls {
  display: flex;
  align-items: center;
  padding: 2px;
  border-radius: 4px;
  transition: background 0.2s;
}

.todo-inline-header:hover .todo-controls {
  background: var(--bg-color-secondary);
}

.expand-icon {
  color: var(--text-color-tertiary);
  font-size: 10px;
  transition:
    color 0.2s,
    transform 0.2s;
  pointer-events: none;
}

.todo-inline-header:hover .expand-icon {
  color: var(--text-color-secondary);
}

:deep(.ant-collapse) {
  background: transparent;
  border: none;
  margin: 0 !important;
}

:deep(.ant-collapse-item) {
  border: none;
  margin: 0 !important;
}

:deep(.ant-collapse-item > .ant-collapse-header) {
  display: none !important; // Remove empty Panel header placeholder
  height: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
}

:deep(.ant-collapse-content) {
  border: none;
  background: transparent;
  padding: 0 !important;
}

:deep(.ant-collapse-content-box) {
  padding: 4px 8px 8px 8px !important;
}

// Additional forced styles to ensure they take effect
.todo-inline-display :deep(.ant-collapse .ant-collapse-content > .ant-collapse-content-box) {
  padding: 4px 8px 8px 8px !important;
}

// Special handling for dark theme
.theme-dark & {
  .todo-inline-display {
    &:hover {
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
    }
  }

  .todo-inline-header:hover {
    background: linear-gradient(135deg, var(--hover-bg-color) 0%, var(--bg-color-secondary) 100%);
  }

  .todo-progress-ratio {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.12);
  }

  .progress-bar-container {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.12);
  }

  .progress-bar-fill {
    background: linear-gradient(90deg, #52c41a 0%, #95de64 100%);
  }
}
</style>
