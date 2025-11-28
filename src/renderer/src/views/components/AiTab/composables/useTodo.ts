import { computed, onMounted } from 'vue'
import { todoService } from '../../../../services/todoService'
import type { Todo, TodoDisplayPreference } from '../../../../types/todo'

/**
 * Composable for Todo functionality
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
