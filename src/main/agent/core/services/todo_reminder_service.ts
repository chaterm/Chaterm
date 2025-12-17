import { Todo } from '../../shared/todo/TodoSchemas'

export interface TodoStateChange {
  previousTodos: Todo[]
  currentTodos: Todo[]
  added: Todo[]
  removed: Todo[]
  statusChanged: Todo[]
}

export class TodoReminderService {
  private static readonly EMPTY_TODO_REMINDER = `Reminder: Current todo list is empty. Only use TodoWrite to create a checklist when tasks contain 3 or more explicit steps; for simple tasks, execute directly.`

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
      messages.push(`Added ${stateChange.added.length} tasks`)
    }

    if (stateChange.removed.length > 0) {
      messages.push(`Removed ${stateChange.removed.length} tasks`)
    }

    if (stateChange.statusChanged.length > 0) {
      const completedCount = stateChange.statusChanged.filter((t) => t.status === 'completed').length
      const inProgressCount = stateChange.statusChanged.filter((t) => t.status === 'in_progress').length
      const pendingCount = stateChange.statusChanged.filter((t) => t.status === 'pending').length

      if (completedCount > 0) {
        messages.push(`Completed ${completedCount} tasks`)
      }
      if (inProgressCount > 0) {
        messages.push(`Started executing ${inProgressCount} tasks`)
      }
      if (pendingCount > 0) {
        messages.push(`Paused ${pendingCount} tasks`)
      }
    }

    return messages.length > 0 ? `Task status updated: ${messages.join(', ')}` : ''
  }
}
