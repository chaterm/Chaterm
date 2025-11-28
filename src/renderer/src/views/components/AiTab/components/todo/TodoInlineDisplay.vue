<template>
  <div
    v-if="visible"
    class="todo-inline-display"
  >
    <div
      class="todo-inline-header"
      @click="toggleExpanded"
    >
      <div class="todo-title">
        <UnorderedListOutlined />
        <span>{{ todoTitle }}</span>
        <div class="todo-progress-chip">
          <span class="todo-progress-ratio">{{ progressRatio }}</span>
        </div>
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

  return { total, completed, inProgress }
})

// Dynamic title - automatically select based on content language
const todoTitle = computed(() => (isChineseContent.value ? '运维任务进度' : 'Task Progress'))

const progressRatio = computed(() => {
  const { total, completed } = progressCounts.value
  if (total === 0) {
    return '0/0'
  }
  return `${completed}/${total}`
})

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
  border-radius: 8px;
  overflow: hidden;
  transition:
    background-color 0.3s ease,
    border-color 0.3s ease;
}

.todo-inline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 12px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color-light);
  cursor: pointer;
  transition: background-color 0.2s;
  user-select: none;
}

.todo-inline-header:hover {
  background: var(--hover-bg-color);
}

.todo-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.todo-controls {
  display: flex;
  align-items: center;
}

.expand-icon {
  color: var(--text-color-tertiary);
  font-size: 12px;
  transition: color 0.2s;
  pointer-events: none; /* Prevent icon itself from blocking click events */
}

.todo-inline-header:hover .expand-icon {
  color: var(--text-color-secondary);
}

.todo-progress-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  min-height: 20px;
  border-radius: 10px;
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color-light);
  font-size: 12px;
  color: var(--text-color-secondary);
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
}

.todo-progress-ratio {
  color: var(--primary-color);
  font-variant-numeric: tabular-nums;
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
  .todo-inline-header:hover {
    background: var(--hover-bg-color);
  }

  .todo-progress-chip {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.12);
    color: var(--text-color-tertiary);
  }

  .todo-progress-ratio {
    color: var(--primary-color);
  }
}
</style>
