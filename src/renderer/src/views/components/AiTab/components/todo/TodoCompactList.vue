<template>
  <div class="todo-compact-list">
    <!-- 正在执行的任务 -->
    <div
      v-if="inProgressTodos.length > 0"
      class="todo-section"
    >
      <div class="section-header">
        <LoadingOutlined spin />
        <span>{{ labels.inProgress }} ({{ inProgressTodos.length }})</span>
      </div>
      <div class="todo-items">
        <div
          v-for="todo in inProgressTodos"
          :key="todo.id"
          class="todo-item in-progress"
        >
          <div class="todo-content">
            <ArrowRightOutlined class="status-icon" />
            <div class="todo-text-container">
              <span class="todo-text">{{ todo.content }}</span>
              <div
                v-if="todo.description"
                class="todo-description"
              >
                {{ todo.description }}
              </div>
            </div>
            <span :class="['priority-badge', `priority-${todo.priority}`]">
              {{ getPriorityText(todo.priority) }}
            </span>
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

    <!-- 待执行的任务 -->
    <div
      v-if="pendingTodos.length > 0"
      class="todo-section"
    >
      <div class="section-header">
        <ClockCircleOutlined />
        <span>{{ labels.pending }} ({{ pendingTodos.length }})</span>
      </div>
      <div class="todo-items">
        <div
          v-for="todo in pendingTodos"
          :key="todo.id"
          class="todo-item pending"
        >
          <div class="todo-content">
            <BorderOutlined class="status-icon" />
            <div class="todo-text-container">
              <span class="todo-text">{{ todo.content }}</span>
              <div
                v-if="todo.description"
                class="todo-description"
              >
                {{ todo.description }}
              </div>
            </div>
            <span :class="['priority-badge', `priority-${todo.priority}`]">
              {{ getPriorityText(todo.priority) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 已完成的任务 -->
    <div
      v-if="completedTodos.length > 0"
      class="todo-section"
    >
      <div class="section-header">
        <CheckCircleOutlined />
        <span>{{ labels.completed }} ({{ completedTodos.length }})</span>
      </div>
      <div class="todo-items">
        <div
          v-for="todo in completedTodos"
          :key="todo.id"
          class="todo-item completed"
        >
          <div class="todo-content">
            <CheckOutlined class="status-icon" />
            <div class="todo-text-container">
              <span class="todo-text">{{ todo.content }}</span>
              <div
                v-if="todo.description"
                class="todo-description"
              >
                {{ todo.description }}
              </div>
            </div>
            <span :class="['priority-badge', `priority-${todo.priority}`]">
              {{ getPriorityText(todo.priority) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 进度统计 - 三元素横向布局 -->
    <div
      v-if="showProgress"
      class="progress-section-compact"
    >
      <div class="progress-inline">
        <!-- 左侧：统计图表 -->
        <div class="progress-chart">
          <BarChartOutlined class="progress-icon" />
          <span class="progress-text">{{ completedTodos.length }}/{{ todos.length }}</span>
        </div>

        <!-- 中间：进度条 -->
        <div class="progress-bar-container">
          <a-progress
            :percent="completionRate"
            :stroke-color="getProgressColor(completionRate)"
            size="small"
            :show-info="false"
          />
        </div>

        <!-- 右侧：百分比数据 -->
        <div class="progress-percentage">
          <span class="progress-rate">{{ completionRate }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { BarChartOutlined } from '@ant-design/icons-vue'
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

// 动态标签 - 根据内容语言自动选择
const labels = computed(() => {
  // 检查 todos 内容是否包含中文字符
  const hasChineseContent = props.todos.some(
    (todo) => /[\u4e00-\u9fff]/.test(todo.content) || (todo.description && /[\u4e00-\u9fff]/.test(todo.description))
  )

  return hasChineseContent
    ? {
        inProgress: '正在执行',
        pending: '待执行',
        completed: '已完成'
      }
    : {
        inProgress: 'In Progress',
        pending: 'Pending',
        completed: 'Completed'
      }
})

// 按状态分组
const inProgressTodos = computed(() => props.todos.filter((t) => t.status === 'in_progress').slice(0, props.maxItems))
const pendingTodos = computed(() => props.todos.filter((t) => t.status === 'pending').slice(0, props.maxItems))
const completedTodos = computed(() => props.todos.filter((t) => t.status === 'completed').slice(0, props.maxItems))

// 完成率计算
const completionRate = computed(() => {
  if (props.todos.length === 0) return 0
  return Math.round((completedTodos.value.length / props.todos.length) * 100)
})

// 优先级文本
const getPriorityText = (priority: string): string => {
  // 检查是否有中文内容来决定使用哪种语言
  const hasChineseContent = props.todos.some(
    (todo) => /[\u4e00-\u9fff]/.test(todo.content) || (todo.description && /[\u4e00-\u9fff]/.test(todo.description))
  )

  const texts = hasChineseContent
    ? {
        high: '高',
        medium: '中',
        low: '低'
      }
    : {
        high: 'HIGH',
        medium: 'MED',
        low: 'LOW'
      }

  return texts[priority as keyof typeof texts] || priority.toUpperCase()
}

// 进度条颜色 - 使用主题变量
const getProgressColor = (rate: number): string => {
  if (rate >= 80) return 'var(--success-color)'
  if (rate >= 50) return 'var(--warning-color)'
  return 'var(--error-color)'
}
</script>

<style scoped lang="less">
.todo-compact-list {
  font-size: 12px;
  color: var(--text-color);

  // 减少整体底部间距
  .progress-section:last-child {
    margin-bottom: 0;
    padding-bottom: 0;
  }
}

.todo-section {
  margin-bottom: 12px;

  &:last-child {
    margin-bottom: 0;
  }
}

.section-header {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
  color: var(--text-color-tertiary);
  margin-bottom: 6px;
}

.todo-items {
  padding-left: 8px;
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
  align-items: center;
  gap: 6px;
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
  font-size: 10px;
  color: var(--text-color-quaternary);
}

// 优先级徽章样式
.priority-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 16px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 500;
  border-radius: 6px;
  line-height: 1;

  &.priority-high {
    background: rgba(239, 68, 68, 0.1);
    color: var(--error-color);
    border: 1px solid rgba(239, 68, 68, 0.2);
  }

  &.priority-medium {
    background: rgba(245, 158, 11, 0.1);
    color: var(--warning-color);
    border: 1px solid rgba(245, 158, 11, 0.2);
  }

  &.priority-low {
    background: rgba(59, 130, 246, 0.1);
    color: #3b82f6;
    border: 1px solid rgba(59, 130, 246, 0.2);
  }
}

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

// 紧凑版进度统计样式 - 三元素横向布局
.progress-section-compact {
  margin-top: 4px;
  padding-top: 2px;
  border-top: 1px solid var(--border-color-light);
}

.progress-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 16px; // 固定最小高度，确保紧凑
}

// 左侧：统计图表区域
.progress-chart {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0; // 防止压缩
  min-width: 50px; // 确保有足够空间显示数字
}

.progress-icon {
  color: var(--text-color-tertiary);
  font-size: 10px;
}

.progress-text {
  color: var(--text-color);
  font-weight: 500;
  font-size: 10px;
  white-space: nowrap; // 防止换行
}

// 中间：进度条区域
.progress-bar-container {
  flex: 1;
  min-width: 60px; // 确保进度条有最小宽度
  margin: 0 4px; // 左右留一点间距
}

// 右侧：百分比数据区域
.progress-percentage {
  flex-shrink: 0; // 防止压缩
  min-width: 32px; // 确保百分比显示完整
  text-align: right; // 右对齐
}

.progress-rate {
  color: var(--text-color-secondary);
  font-size: 10px;
  font-weight: 600; // 稍微加粗突出百分比
  white-space: nowrap; // 防止换行
}

// 超紧凑进度条样式
.progress-section-compact {
  :deep(.ant-progress) {
    margin: 0;
    line-height: 1;
    display: flex;
    align-items: center;
  }

  :deep(.ant-progress-outer) {
    margin: 0;
    padding: 0;
    flex: 1;
  }

  :deep(.ant-progress-inner) {
    height: 5px; // 适中的进度条宽度
    background-color: var(--border-color-light);
    border-radius: 2.5px;
  }

  :deep(.ant-progress-bg) {
    height: 5px !important;
    border-radius: 2.5px;
  }
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

  .section-header {
    color: var(--text-color-secondary);
  }

  // 暗色主题下的优先级徽章
  .priority-badge {
    &.priority-high {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.3);
    }

    &.priority-medium {
      background: rgba(245, 158, 11, 0.15);
      border-color: rgba(245, 158, 11, 0.3);
    }

    &.priority-low {
      background: rgba(59, 130, 246, 0.15);
      border-color: rgba(59, 130, 246, 0.3);
    }
  }
}
</style>
