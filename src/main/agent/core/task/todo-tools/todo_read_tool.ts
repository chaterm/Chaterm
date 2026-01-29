import { TodoStorage } from '../../storage/todo/TodoStorage'
import { TodoReminderService } from '../../services/todo_reminder_service'
import { TodoWriteTool } from './todo_write_tool'
import { FocusChainService } from '../../services/focus_chain_service'

export type TodoReadParams = Record<string, never> // Empty params, read all todos for current task

export class TodoReadTool {
  static readonly name = 'todo_read'
  static readonly description = 'Read the todo list for the current session, return all task statuses, Focus Chain state and content'

  static readonly parameterSchema = {
    type: 'object',
    properties: {},
    required: []
  }

  static async execute(_params: TodoReadParams, taskId: string): Promise<string> {
    try {
      const storage = new TodoStorage(taskId)
      const todos = await storage.readTodos()

      if (todos.length === 0) {
        const reminderService = new TodoReminderService()
        const reminder = reminderService.getReminderForEmptyTodos(true)

        return `## Operations Task List\n\nNo tasks yet.\n\nFor complex server operations, it is recommended to use the todo_write tool to create a task list to ensure all steps are executed correctly.${reminder ? '\n\n' + reminder : ''}`
      }

      // Don't show checklist when less than 3 items, prompt to execute directly
      if (todos.length < 3) {
        const hasChinese = todos.some((t) => /[\u4e00-\u9fff]/.test(t.content) || (t.description && /[\u4e00-\u9fff]/.test(t.description)))
        return hasChinese
          ? '当前仅有 1-2 个任务，不构成复杂清单。请直接执行并在完成后反馈结果。'
          : 'Only 1–2 tasks present. This is not a complex checklist; execute directly and report the outcome.'
      }

      // Generate base output
      let output = TodoWriteTool.generateOutput(todos)

      // Add Focus Chain status
      const focusChainService = FocusChainService.forTask(taskId)
      await focusChainService.syncWithTodos()
      const focusChainProgress = focusChainService.getProgressSummary()

      if (focusChainProgress.total > 0) {
        output += TodoWriteTool.generateFocusChainInfo(focusChainProgress, todos)
      }

      // Check if should suggest new task
      const suggestion = focusChainService.shouldSuggestNewTask()
      if (suggestion.suggest && suggestion.reason) {
        output += `\n💡 **Focus Chain Suggestion**: ${suggestion.reason}`
      }

      return output
    } catch (error) {
      throw new Error(`Todo read failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
