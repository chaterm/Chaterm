<template>
  <div class="todo-compact-list">
    <!-- Single list display: show items in order with numbering, no grouping -->
    <div class="todo-items single-list">
      <div
        v-for="(todo, idx) in visibleTodos"
        :key="todo.id ?? idx"
        :class="['todo-item', statusClass(todo.status), { 'has-description': !!todo.description }]"
      >
        <div class="todo-content">
          <!-- Left side: index number + status icon (icon below index, aligned with description line) -->
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

// Visible items in single list (maintain original order)
const visibleTodos = computed(() => props.todos.slice(0, props.maxItems))

// Icon and style mapping
const statusIcon = (status?: Todo['status']) => {
  if (status === 'in_progress') return LoadingOutlined
  if (status === 'completed') return MinusOutlined
  return BorderOutlined // pending/default
}

const statusClass = (status?: Todo['status']) => {
  if (status === 'in_progress') return 'in-progress'
  if (status === 'completed') return 'completed'
  return 'pending'
}
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
  align-items: flex-start; // Align with first line of title
  gap: 6px;
}

.todo-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 20px; // Unified left column width, align numbers and icons
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
  font-size: 12px; // Enlarge icon
  color: var(--text-color-quaternary);
  width: 16px; // Fixed width to ensure vertical column alignment
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

// Status icon below index number, align with description line as much as possible
.status-icon.under-index {
  margin-top: 3px; // Closer to first line of description
}

.todo-index {
  width: 100%;
  text-align: center;
  color: var(--text-color-secondary);
  font-variant-numeric: tabular-nums;
  margin-top: 0; // Remove top offset to avoid being below title
  line-height: 1.4; // Match line height of content container
}

// When no description, align status icon with title to avoid empty space
.todo-item:not(.has-description) .status-icon.under-index {
  margin-top: 0;
}

// Remove priority badge display

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

// Special handling for dark theme
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

  // Priority badge related styles have been removed
}
</style>
