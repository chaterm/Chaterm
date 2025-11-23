import { computed, onMounted, onUnmounted } from 'vue'
import { todoService } from '../../../../services/todoService'
import type { Todo, TodoDisplayPreference } from '../../../../types/todo'

/**
 * Todo 功能的 composable
 */
export function useTodo() {
  const currentTodos = computed(() => todoService.currentTodos.value)
  const displayPreference = computed(() => todoService.displayPreference.value)

  const setDisplayPreference = (preference: TodoDisplayPreference) => {
    todoService.setDisplayPreference(preference)
  }

  const shouldShowTodoAfterMessage = (message: any): boolean => {
    return todoService.shouldShowTodoAfterMessage(message)
  }

  const getTodosForMessage = (message: any): Todo[] => {
    return todoService.getTodosForMessage(message)
  }

  const markLatestMessageWithTodoUpdate = todoService.getMarkLatestMessageWithTodoUpdate()
  const clearTodoState = (messages?: any[]) => {
    todoService.clearTodoState(messages)
  }

  onMounted(async () => {
    await todoService.initializeTodos()
  })

  onUnmounted(() => {
    // todoService 是单例，不需要在这里销毁
  })

  return {
    currentTodos,
    displayPreference,
    setDisplayPreference,
    shouldShowTodoAfterMessage,
    getTodosForMessage,
    markLatestMessageWithTodoUpdate,
    clearTodoState
  }
}
