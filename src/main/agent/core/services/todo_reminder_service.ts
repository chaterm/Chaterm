import { Todo } from '../../shared/todo/TodoSchemas'

export interface TodoStateChange {
  previousTodos: Todo[]
  currentTodos: Todo[]
  added: Todo[]
  removed: Todo[]
  statusChanged: Todo[]
}

export class TodoReminderService {
  private static readonly EMPTY_TODO_REMINDER = `这是一个提醒：当前 todo 列表为空。如果您正在处理需要多个步骤的运维任务，请考虑使用 TodoWrite 工具创建任务列表。`

  getReminderForEmptyTodos(isComplexTask: boolean = false): string | null {
    if (!isComplexTask) {
      return null
    }
    return TodoReminderService.EMPTY_TODO_REMINDER
  }

  calculateStateChange(previousTodos: Todo[], currentTodos: Todo[]): TodoStateChange {
    const added = currentTodos.filter((newTodo) => !previousTodos.some((oldTodo) => oldTodo.id === newTodo.id))

    const removed = previousTodos.filter((oldTodo) => !currentTodos.some((newTodo) => newTodo.id === oldTodo.id))

    const statusChanged = currentTodos.filter((newTodo) => {
      const oldTodo = previousTodos.find((t) => t.id === newTodo.id)
      return oldTodo && oldTodo.status !== newTodo.status
    })

    return {
      previousTodos,
      currentTodos,
      added,
      removed,
      statusChanged
    }
  }

  shouldGenerateReminder(stateChange: TodoStateChange): boolean {
    return stateChange.added.length > 0 || stateChange.removed.length > 0 || stateChange.statusChanged.length > 0
  }

  generateStateChangeMessage(stateChange: TodoStateChange): string {
    const messages: string[] = []

    if (stateChange.added.length > 0) {
      messages.push(`新增 ${stateChange.added.length} 个任务`)
    }

    if (stateChange.removed.length > 0) {
      messages.push(`删除 ${stateChange.removed.length} 个任务`)
    }

    if (stateChange.statusChanged.length > 0) {
      const completedCount = stateChange.statusChanged.filter((t) => t.status === 'completed').length
      const inProgressCount = stateChange.statusChanged.filter((t) => t.status === 'in_progress').length
      const pendingCount = stateChange.statusChanged.filter((t) => t.status === 'pending').length

      if (completedCount > 0) {
        messages.push(`完成 ${completedCount} 个任务`)
      }
      if (inProgressCount > 0) {
        messages.push(`开始执行 ${inProgressCount} 个任务`)
      }
      if (pendingCount > 0) {
        messages.push(`暂停 ${pendingCount} 个任务`)
      }
    }

    return messages.length > 0 ? `任务状态更新：${messages.join('，')}` : ''
  }
}
