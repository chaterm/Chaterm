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
        <span>运维任务进度</span>
        <a-badge
          :count="todos.length"
          class="todo-count"
        />
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

// 移除toggle-visibility事件，不再支持关闭功能
// const emit = defineEmits<{
//   'toggle-visibility': [visible: boolean]
// }>()

const visible = ref(true)
const expanded = ref(props.showTrigger)
const activeKey = ref(props.showTrigger ? ['todos'] : [])

// 添加调试日志
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
  padding: 8px 12px;
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
  pointer-events: none; /* 防止图标本身阻止点击事件 */
}

.todo-inline-header:hover .expand-icon {
  color: var(--text-color-secondary);
}

.todo-count {
  :deep(.ant-badge-count) {
    background: var(--text-color-tertiary);
    color: var(--bg-color);
    font-size: 10px;
    min-width: 16px;
    height: 16px;
    line-height: 16px;
  }
}

:deep(.ant-collapse) {
  background: transparent;
  border: none;
}

:deep(.ant-collapse-item) {
  border: none;
}

:deep(.ant-collapse-content) {
  border: none;
  background: transparent;
}

:deep(.ant-collapse-content-box) {
  padding: 6px 12px 8px 12px !important;
}

// 额外的强制样式，确保生效
.todo-inline-display :deep(.ant-collapse .ant-collapse-content > .ant-collapse-content-box) {
  padding: 6px 12px 8px 12px !important;
}

// 暗色主题下的特殊处理
.theme-dark & {
  .todo-inline-header:hover {
    background: var(--hover-bg-color);
  }

  .todo-count {
    :deep(.ant-badge-count) {
      background: var(--text-color-tertiary);
      color: var(--bg-color);
    }
  }
}
</style>
