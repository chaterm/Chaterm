<template>
  <div class="todo-compact-list">
    <!-- 单列表展示：按传入顺序编号展示，不分组 -->
    <div class="todo-items single-list">
      <div
        v-for="(todo, idx) in visibleTodos"
        :key="todo.id ?? idx"
        :class="['todo-item', statusClass(todo.status), { 'has-description': !!todo.description }]"
      >
        <div class="todo-content">
          <!-- 左侧：编号 + 状态图标（图标位于编号下方，与描述行对齐） -->
          <div class="todo-left">
            <span class="todo-index">{{ idx + 1 }}.</span>
            <component
              :is="statusIcon(todo.status)"
              :spin="todo.status === 'in_progress'"
              class="status-icon under-index"
            />
          </div>
          <div class="todo-text-container">
            <span class="todo-text">{{ todo.content }}</span>
            <div
              v-if="todo.description"
              class="todo-description"
            >
              {{ todo.description }}
            </div>
          </div>
        </div>
        <div
          v-if="showSubtasks && todo.subtasks && todo.subtasks.length > 0"
          class="subtasks"
        >
          <div
            v-for="subtask in todo.subtasks"
            :key="subtask.id"
            class="subtask-item"
          >
            <MinusOutlined />
            <div class="subtask-text-container">
              <span>{{ subtask.content }}</span>
              <div
                v-if="subtask.description"
                class="subtask-description"
              >
                {{ subtask.description }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { LoadingOutlined, BorderOutlined, MinusOutlined } from '@ant-design/icons-vue'
import type { Todo } from '../../../../../types/todo'

interface Props {
  todos: Todo[]
  showProgress?: boolean
  showSubtasks?: boolean
  maxItems?: number
}

const props = withDefaults(defineProps<Props>(), {
  showProgress: false,
  showSubtasks: true,
  maxItems: 50
})

// 单列表可见项（维持原顺序）
const visibleTodos = computed(() => props.todos.slice(0, props.maxItems))

// 图标与样式映射
const statusIcon = (status?: Todo['status']) => {
  if (status === 'in_progress') return LoadingOutlined
  if (status === 'completed') return MinusOutlined
  return BorderOutlined // pending/默认
}

const statusClass = (status?: Todo['status']) => {
  if (status === 'in_progress') return 'in-progress'
  if (status === 'completed') return 'completed'
  return 'pending'
}

// 不显示优先级，仅渲染任务文本

// 保留占位（不再显示进度统计，这里不使用）
</script>

<style scoped lang="less">
.todo-compact-list {
  font-size: 12px;
  color: var(--text-color);
}

.todo-items {
  padding-left: 6px;
}
.single-list {
  margin-top: 8px;
}

.todo-item {
  margin-bottom: 4px;

  &.completed .todo-text {
    text-decoration: line-through;
    color: var(--text-color-quaternary);
  }
}

.todo-content {
  display: flex;
  align-items: flex-start; // 与标题第一行对齐
  gap: 6px;
}

.todo-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 20px; // 统一左侧列宽，数字与图标列对齐
}

.todo-text-container {
  flex: 1;
  line-height: 1.4;
}

.todo-text {
  font-weight: 500;
  color: var(--text-color);
}

.todo-description {
  font-size: 11px;
  color: var(--text-color-tertiary);
  margin-top: 2px;
  line-height: 1.3;
}

.status-icon {
  font-size: 12px; // 放大图标
  color: var(--text-color-quaternary);
  width: 16px; // 固定宽度，保证纵向列对齐
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

// 位于编号下方的状态图标，尽量与描述行对齐
.status-icon.under-index {
  margin-top: 3px; // 更贴近描述首行
}

.todo-index {
  width: 100%;
  text-align: center;
  color: var(--text-color-secondary);
  font-variant-numeric: tabular-nums;
  margin-top: 0; // 取消上偏移，避免低于标题
  line-height: 1.4; // 与内容容器行高一致
}

// 无描述时，让状态图标与标题对齐，避免空荡
.todo-item:not(.has-description) .status-icon.under-index {
  margin-top: 0;
}

// 去除优先级徽章显示

.subtasks {
  margin-top: 4px;
  padding-left: 16px;
}

.subtask-item {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  font-size: 11px;
  color: var(--text-color-tertiary);
  margin-bottom: 2px;
}

.subtask-text-container {
  flex: 1;
}

.subtask-description {
  font-size: 10px;
  color: var(--text-color-quaternary);
  margin-top: 1px;
  line-height: 1.2;
}

// 暗色主题下的特殊处理
.theme-dark & {
  .todo-item {
    &.in-progress {
      .todo-text {
        color: var(--success-color);
      }
    }

    &.pending {
      .todo-text {
        color: var(--warning-color);
      }
    }

    &.completed {
      .todo-text {
        color: var(--text-color-quaternary);
      }
    }
  }

  // 已移除优先级徽章相关样式
}
</style>
