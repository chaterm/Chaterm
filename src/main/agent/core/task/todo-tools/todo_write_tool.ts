import { Todo, TodoArraySchema } from '../../../shared/todo/TodoSchemas'
import { TodoStorage } from '../../storage/todo/TodoStorage'
import { TodoContextTracker } from '../../services/todo_context_tracker'

export interface TodoWriteParams {
  todos: Todo[]
}

export class TodoWriteTool {
  static readonly name = 'todo_write'
  static readonly description =
    'Create and manage structured task lists, update the entire todo list. Each task must include content (task title) and description (detailed description) fields. content should be concise and clear, description should contain specific execution steps or detailed instructions.'

  static async execute(params: TodoWriteParams, taskId: string): Promise<string> {
    try {
      // 1. Preprocess params - add missing timestamp fields
      const now = new Date()
      const processedTodos = params.todos.map((todo) => ({
        ...todo,
        createdAt: (todo as { createdAt?: Date }).createdAt || now,
        updatedAt: (todo as { updatedAt?: Date }).updatedAt || now
      }))

      // 2. Validate params
      const result = TodoArraySchema.safeParse(processedTodos)
      if (!result.success) {
        console.error(`[TodoWriteTool] Parameter validation failed:`, result.error)
        throw new Error(`Parameter validation failed: ${result.error.message}`)
      }

      // Use processed todos
      params.todos = result.data

      // 3. Save to storage
      const storage = new TodoStorage(taskId)
      await storage.writeTodos(params.todos)

      // 4. Update active todo
      const contextTracker = TodoContextTracker.forSession(taskId)
      const inProgressTodo = params.todos.find((t) => t.status === 'in_progress')
      contextTracker.setActiveTodo(inProgressTodo?.id || null)

      // 5. Generate return message
      let output = TodoWriteTool.generateOutput(params.todos)

      // 6. Check if it's a newly created todo list, add start reminder
      const allPending = params.todos.every((todo) => todo.status === 'pending')
      const hasMultipleTasks = params.todos.length > 1

      if (allPending && hasMultipleTasks) {
        // Newly created multi-task todo list, add start reminder
        const firstTask = params.todos[0]
        output += `\n\n⚠️ **Important Reminder**: Todo list has been created. You must now immediately use the todo_write tool to update the first task "${firstTask.content}" status from "pending" to "in_progress", then start executing that task. This is a mandatory workflow requirement.`
      }
      return output
    } catch (error) {
      console.error(`[TodoWriteTool] todo_write tool execution failed:`, error)
      throw new Error(`Todo write failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  static generateOutput(todos: Todo[]): string {
    // Detect if contains Chinese content to decide which language to use
    const hasChineseContent = todos.some(
      (todo) => /[\u4e00-\u9fff]/.test(todo.content) || (todo.description && /[\u4e00-\u9fff]/.test(todo.description))
    )

    const labels = hasChineseContent
      ? {
          title: `## 运维任务列表 (${todos.length} 个任务)\n\n`,
          inProgress: '### 🔄 正在执行\n',
          pending: '### ⏳ 待执行\n',
          completed: '### ✅ 已完成\n',
          statistics: '### 📊 执行统计\n',
          total: `- 总计: ${todos.length} 个运维任务\n`,
          inProgressCount: `- 正在执行: `,
          pendingCount: `- 待执行: `,
          completedCount: `- 已完成: `,
          completionRate: `- 完成率: `
        }
      : {
          title: `## Task List (${todos.length} tasks)\n\n`,
          inProgress: '### 🔄 In Progress\n',
          pending: '### ⏳ Pending\n',
          completed: '### ✅ Completed\n',
          statistics: '### 📊 Statistics\n',
          total: `- Total: ${todos.length} tasks\n`,
          inProgressCount: `- In Progress: `,
          pendingCount: `- Pending: `,
          completedCount: `- Completed: `,
          completionRate: `- Completion Rate: `
        }

    let output = labels.title

    // Group by status for display
    const inProgress = todos.filter((t) => t.status === 'in_progress')
    const pending = todos.filter((t) => t.status === 'pending')
    const completed = todos.filter((t) => t.status === 'completed')

    if (inProgress.length > 0) {
      output += labels.inProgress
      inProgress.forEach((todo) => {
        output += `- [→] **${todo.content}** [${todo.priority.toUpperCase()}]\n`
        if (todo.description) {
          output += `  📝 ${todo.description}\n`
        }
        if (todo.subtasks && todo.subtasks.length > 0) {
          todo.subtasks.forEach((subtask) => {
            output += `  - ${subtask.content}\n`
            if (subtask.description) {
              output += `    💡 ${subtask.description}\n`
            }
          })
        }
      })
      output += '\n'
    }

    if (pending.length > 0) {
      output += labels.pending
      pending.forEach((todo) => {
        output += `- [ ] **${todo.content}** [${todo.priority.toUpperCase()}]\n`
        if (todo.description) {
          output += `  📝 ${todo.description}\n`
        }
      })
      output += '\n'
    }

    if (completed.length > 0) {
      output += labels.completed
      completed.forEach((todo) => {
        output += `- [x] **${todo.content}** [${todo.priority.toUpperCase()}]\n`
        if (todo.description) {
          output += `  📝 ${todo.description}\n`
        }
      })
      output += '\n'
    }

    // Add statistics
    output += labels.statistics
    output += labels.total
    output += labels.inProgressCount + `${inProgress.length}\n`
    output += labels.pendingCount + `${pending.length}\n`
    output += labels.completedCount + `${completed.length}\n`

    const completionRate = todos.length > 0 ? Math.round((completed.length / todos.length) * 100) : 0
    output += labels.completionRate + `${completionRate}%\n\n`

    return output
  }
}
