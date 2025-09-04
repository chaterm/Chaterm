<template>
  <div
    v-if="visible"
    class="todo-inline-display"
  >
    <div class="todo-inline-header">
      <div class="todo-title">
        <UnorderedListOutlined />
        <span>运维任务进度</span>
        <a-badge
          :count="todos.length"
          class="todo-count"
        />
      </div>
      <div class="todo-controls">
        <a-button
          type="text"
          size="small"
          class="control-btn"
          @click="toggleExpanded"
        >
          <UpOutlined v-if="expanded" />
          <DownOutlined v-else />
        </a-button>
        <a-button
          type="text"
          size="small"
          class="control-btn"
          @click="$emit('toggle-visibility', false)"
        >
          <CloseOutlined />
        </a-button>
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
import { ref, computed, defineAsyncComponent } from 'vue'
import { UnorderedListOutlined, UpOutlined, DownOutlined, CloseOutlined } from '@ant-design/icons-vue'
const TodoCompactList = defineAsyncComponent(() => import('./TodoCompactList.vue'))
import type { Todo } from '../../types/todo'

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

const emit = defineEmits<{
  'toggle-visibility': [visible: boolean]
}>()

const visible = ref(true)
const expanded = ref(props.showTrigger)
const activeKey = ref(props.showTrigger ? ['todos'] : [])

const toggleExpanded = () => {
  expanded.value = !expanded.value
  activeKey.value = expanded.value ? ['todos'] : []
}
</script>

<style scoped lang="less">
.todo-inline-display {
  margin: 12px 0;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  overflow: hidden;
}

.todo-inline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #ffffff;
  border-bottom: 1px solid #e9ecef;
}

.todo-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #495057;
}

.todo-controls {
  display: flex;
  gap: 4px;
}

.control-btn {
  padding: 2px 4px;
  height: auto;
  min-width: auto;

  &:hover {
    background-color: #f0f0f0;
  }
}

.todo-count {
  :deep(.ant-badge-count) {
    background: #6c757d;
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
  padding: 8px 12px;
}
</style>
