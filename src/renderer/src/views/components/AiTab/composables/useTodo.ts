import { computed, onMounted, onUnmounted } from 'vue'
import { todoService } from '../../../../services/todoService'
import type { Todo, TodoDisplayPreference } from '../../../../types/todo'

/**
 * Todo 功能的 composable
 */
export function useTodo() {
  // 响应式状态
  const currentTodos = computed(() => todoService.currentTodos.value)
  const displayPreference = computed(() => todoService.displayPreference.value)

  // 方法
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

  // 生命周期
  onMounted(async () => {
    await todoService.initializeTodos()
  })

  onUnmounted(() => {
    // todoService 是单例，不需要在这里销毁
  })

  return {
    // 状态
    currentTodos,
    displayPreference,

    // 方法
    setDisplayPreference,
    shouldShowTodoAfterMessage,
    getTodosForMessage,
    markLatestMessageWithTodoUpdate
  }
}

/**
 * 用于标记消息包含 todo 更新的辅助函数
 */
export function markMessageWithTodoUpdate(message: any, todos: Todo[]) {
  message.hasTodoUpdate = true
  message.relatedTodos = todos
}

/**
 * 检查消息是否包含 todo 相关内容的辅助函数
 */
export function isMessageTodoRelated(content: string): boolean {
  const todoKeywords = ['任务列表', '进度', '下一步', 'todo', 'TODO', '运维任务', '执行', '完成', '待办', '清单']

  return todoKeywords.some((keyword) => content.includes(keyword))
}
