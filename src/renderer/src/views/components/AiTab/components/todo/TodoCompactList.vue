<template>
  <div class="todo-compact-list">
    <!-- Single list display: show items in order with numbering, no grouping -->
    <div class="todo-items single-list">
      <div
        v-for="(todo, idx) in visibleTodos"
        :key="todo.id ?? idx"
        :class="[
          'todo-item',
          statusClass(todo.status),
          {
            'has-description': !!todo.description,
            'is-focused': isFocused(todo)
          }
        ]"
      >
        <div class="todo-content">
          <!-- Left side: index number + status icon (icon below index, aligned with description line) -->
          <div class="todo-left">
            <span class="todo-index">{{ idx + 1 }}.</span>
            <component
              :is="statusIcon(todo.status, isFocused(todo))"
              :spin="todo.status === 'in_progress'"
              class="status-icon under-index"
              :class="{ 'focused-icon': isFocused(todo) }"
            />
          </div>
          <div class="todo-text-container">
            <span class="todo-text">
              {{ todo.content }}
              <!-- Focus indicator badge -->
              <span
                v-if="isFocused(todo)"
                class="focus-badge"
              >
                <ThunderboltFilled class="focus-badge-icon" />
              </span>
            </span>
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
import { LoadingOutlined, BorderOutlined, MinusOutlined, ThunderboltFilled, ThunderboltOutlined } from '@ant-design/icons-vue'
import type { Todo } from '../../../../../types/todo'

interface Props {
  todos: Todo[]
  showProgress?: boolean
  showSubtasks?: boolean
  maxItems?: number
  // Focus Chain props
  focusedTodoId?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  showProgress: false,
  showSubtasks: true,
  maxItems: 50,
  focusedTodoId: null
})

// Visible items in single list (maintain original order)
const visibleTodos = computed(() => props.todos.slice(0, props.maxItems))

// Check if a todo is the focused one
const isFocused = (todo: Todo): boolean => {
  // Check explicit focus prop
  if (props.focusedTodoId && todo.id === props.focusedTodoId) return true
  // Check todo's own isFocused flag
  if (todo.isFocused) return true
  // Fall back to in_progress status (only if no explicit focusedTodoId is set)
  if (!props.focusedTodoId && todo.status === 'in_progress') return true
  return false
}

// Icon and style mapping
const statusIcon = (status?: Todo['status'], focused?: boolean) => {
  if (focused && status === 'in_progress') return ThunderboltOutlined
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

  // Focus Chain: highlight focused todo
  &.is-focused {
    background: linear-gradient(135deg, rgba(250, 173, 20, 0.1) 0%, rgba(250, 140, 22, 0.05) 100%);
    border-radius: 6px;
    padding: 4px 6px;
    margin-left: -6px;
    margin-right: -6px;
    border-left: 2px solid #faad14;

    .todo-text {
      color: var(--text-color) !important;
      font-weight: 600;
    }

    .status-icon.focused-icon {
      color: #faad14 !important;
    }
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
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

// Focus badge for focused todo
.focus-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: linear-gradient(135deg, #faad14 0%, #fa8c16 100%);
  animation: focusBadgePulse 1.5s ease-in-out infinite;

  .focus-badge-icon {
    font-size: 8px;
    color: #fff;
  }
}

@keyframes focusBadgePulse {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(250, 173, 20, 0.4);
  }
  50% {
    transform: scale(1.1);
    box-shadow: 0 0 0 4px rgba(250, 173, 20, 0);
  }
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

// Special handling for light theme
.theme-light & {
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
}
</style>
