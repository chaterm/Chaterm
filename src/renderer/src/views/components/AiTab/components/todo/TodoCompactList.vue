<template>
  <div class="todo-compact-list">
    <!-- 正在执行的任务 -->
    <div
      v-if="inProgressTodos.length > 0"
      class="todo-section"
    >
      <div class="section-header">
        <LoadingOutlined spin />
        <span>正在执行 ({{ inProgressTodos.length }})</span>
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
            <a-tag
              :color="getPriorityColor(todo.priority)"
              size="small"
            >
              {{ todo.priority.toUpperCase() }}
            </a-tag>
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
        <span>待执行 ({{ pendingTodos.length }})</span>
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
            <a-tag
              :color="getPriorityColor(todo.priority)"
              size="small"
            >
              {{ todo.priority.toUpperCase() }}
            </a-tag>
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
        <span>已完成 ({{ completedTodos.length }})</span>
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
            <a-tag
              :color="getPriorityColor(todo.priority)"
              size="small"
            >
              {{ todo.priority.toUpperCase() }}
            </a-tag>
          </div>
        </div>
      </div>
    </div>

    <!-- 进度统计 -->
    <div
      v-if="showProgress"
      class="progress-section"
    >
      <div class="progress-header">
        <BarChartOutlined />
        <span>执行统计</span>
      </div>
      <div class="progress-stats">
        <div class="stat-item">
          <span class="stat-label">总计:</span>
          <span class="stat-value">{{ todos.length }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">完成率:</span>
          <span class="stat-value">{{ completionRate }}%</span>
        </div>
      </div>
      <a-progress
        :percent="completionRate"
        :stroke-color="getProgressColor(completionRate)"
        size="small"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  LoadingOutlined,
  ArrowRightOutlined,
  ClockCircleOutlined,
  BorderOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  MinusOutlined,
  BarChartOutlined
} from '@ant-design/icons-vue'
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

// 按状态分组
const inProgressTodos = computed(() => props.todos.filter((t) => t.status === 'in_progress').slice(0, props.maxItems))
const pendingTodos = computed(() => props.todos.filter((t) => t.status === 'pending').slice(0, props.maxItems))
const completedTodos = computed(() => props.todos.filter((t) => t.status === 'completed').slice(0, props.maxItems))

// 完成率计算
const completionRate = computed(() => {
  if (props.todos.length === 0) return 0
  return Math.round((completedTodos.value.length / props.todos.length) * 100)
})

// 优先级颜色
const getPriorityColor = (priority: string): string => {
  const colors = {
    high: 'red',
    medium: 'orange',
    low: 'blue'
  }
  return colors[priority as keyof typeof colors] || 'default'
}

// 进度条颜色
const getProgressColor = (rate: number): string => {
  if (rate >= 80) return '#52c41a'
  if (rate >= 50) return '#faad14'
  return '#ff4d4f'
}
</script>

<style scoped lang="less">
.todo-compact-list {
  font-size: 12px;
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
  color: #666;
  margin-bottom: 6px;
}

.todo-items {
  padding-left: 8px;
}

.todo-item {
  margin-bottom: 4px;

  &.completed .todo-text {
    text-decoration: line-through;
    color: #999;
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
  color: #333;
}

.todo-description {
  font-size: 11px;
  color: #666;
  margin-top: 2px;
  line-height: 1.3;
}

.status-icon {
  font-size: 10px;
  color: #999;
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
  color: #666;
  margin-bottom: 2px;
}

.subtask-text-container {
  flex: 1;
}

.subtask-description {
  font-size: 10px;
  color: #999;
  margin-top: 1px;
  line-height: 1.2;
}

.progress-section {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid #e8e8e8;
}

.progress-header {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
  color: #666;
  margin-bottom: 6px;
}

.progress-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 6px;
}

.stat-item {
  display: flex;
  gap: 4px;
}

.stat-label {
  color: #999;
}

.stat-value {
  font-weight: 500;
  color: #333;
}
</style>
