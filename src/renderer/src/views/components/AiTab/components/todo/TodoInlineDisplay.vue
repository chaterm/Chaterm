<template>
  <div
    v-if="visible"
    class="todo-inline-display"
  >
    <div
      class="todo-inline-header"
      @click="toggleExpanded"
    >
      <div class="todo-header-left">
        <div class="todo-title">
          <UnorderedListOutlined class="todo-icon" />
          <span class="todo-title-text">{{ todoTitle }}</span>
        </div>
        <div class="todo-progress-ratio">
          <span class="ratio-completed">{{ progressCounts.completed }}</span>
          <span class="ratio-separator">/</span>
          <span class="ratio-total">{{ progressCounts.total }}</span>
        </div>
      </div>
      <div class="todo-header-right">
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
        />
      </a-collapse-panel>
    </a-collapse>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, watch } from 'vue'
import { UnorderedListOutlined, UpOutlined, DownOutlined } from '@ant-design/icons-vue'
const TodoCompactList = defineAsyncComponent(() => import('./TodoCompactList.vue'))
import type { Todo } from '../../../../../types/todo'

interface Props {
  todos: Todo[]
  showTrigger?: boolean
  showProgress?: boolean
  showSubtasks?: boolean
  maxItems?: number
}

const props = withDefaults(defineProps<Props>(), {
  showTrigger: false,
  showProgress: true,
  showSubtasks: true,
  maxItems: 20
})

const visible = ref(true)
const expanded = ref(props.showTrigger)
const activeKey = ref(props.showTrigger ? ['todos'] : [])

// Language and statistics
const isChineseContent = computed(() =>
  props.todos.some((todo) => /[\u4e00-\u9fff]/.test(todo.content) || (todo.description && /[\u4e00-\u9fff]/.test(todo.description)))
)

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

// Dynamic title - automatically select based on content language
const todoTitle = computed(() => (isChineseContent.value ? '运维任务进度' : 'Task Progress'))

// Add debug logs
watch(
  () => props.todos,
  (newTodos) => {
    console.log('TodoInlineDisplay - todos prop changed:', newTodos)
    console.log('TodoInlineDisplay - todos length:', newTodos?.length || 0)
    console.log('TodoInlineDisplay - visible:', visible.value)
    console.log('TodoInlineDisplay - expanded:', expanded.value)
  },
  { immediate: true, deep: true }
)

watch(visible, (newVisible) => {
  console.log('TodoInlineDisplay - visible changed:', newVisible)
})

watch(expanded, (newExpanded) => {
  console.log('TodoInlineDisplay - expanded changed:', newExpanded)
})

const toggleExpanded = () => {
  console.log('TodoInlineDisplay - toggleExpanded called, current expanded:', expanded.value)
  expanded.value = !expanded.value
  activeKey.value = expanded.value ? ['todos'] : []
  console.log('TodoInlineDisplay - toggleExpanded new expanded:', expanded.value)
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
