import { Todo, TodoArraySchema } from '../../../shared/todo/TodoSchemas'
import { TodoStorage } from '../../storage/todo/TodoStorage'
import { TodoContextTracker } from '../../services/TodoContextTracker'

export interface TodoWriteParams {
  todos: Todo[]
}

export class TodoWriteTool {
  static readonly name = 'todo_write'
  static readonly description = '创建和管理结构化任务列表，更新整个 todo 列表'

  static async execute(params: TodoWriteParams, taskId: string): Promise<string> {
    try {
      // 1. 预处理参数 - 添加缺失的时间戳字段
      const now = new Date()
      const processedTodos = params.todos.map((todo) => ({
        ...todo,
        createdAt: (todo as { createdAt?: Date }).createdAt || now,
        updatedAt: (todo as { updatedAt?: Date }).updatedAt || now
      }))

      // 2. 验证参数
      const result = TodoArraySchema.safeParse(processedTodos)
      if (!result.success) {
        throw new Error(`参数验证失败: ${result.error.message}`)
      }

      // 使用处理后的todos
      params.todos = result.data

      // 3. 保存到存储
      const storage = new TodoStorage(taskId)
      await storage.writeTodos(params.todos)

      // 4. 更新活跃 todo
      const contextTracker = TodoContextTracker.forSession(taskId)
      const inProgressTodo = params.todos.find((t) => t.status === 'in_progress')
      contextTracker.setActiveTodo(inProgressTodo?.id || null)

      // 5. 生成返回消息
      const output = TodoWriteTool.generateOutput(params.todos)
      return output
    } catch (error) {
      throw new Error(`Todo 写入失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  static generateOutput(todos: Todo[]): string {
    let output = `## 运维任务列表 (${todos.length} 个任务)\n\n`

    // 按状态分组显示
    const inProgress = todos.filter((t) => t.status === 'in_progress')
    const pending = todos.filter((t) => t.status === 'pending')
    const completed = todos.filter((t) => t.status === 'completed')

    if (inProgress.length > 0) {
      output += '### 🔄 正在执行\n'
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
      output += '### ⏳ 待执行\n'
      pending.forEach((todo) => {
        output += `- [ ] **${todo.content}** [${todo.priority.toUpperCase()}]\n`
        if (todo.description) {
          output += `  📝 ${todo.description}\n`
        }
      })
      output += '\n'
    }

    if (completed.length > 0) {
      output += '### ✅ 已完成\n'
      completed.forEach((todo) => {
        output += `- [x] **${todo.content}** [${todo.priority.toUpperCase()}]\n`
        if (todo.description) {
          output += `  📝 ${todo.description}\n`
        }
      })
      output += '\n'
    }

    // 添加统计信息
    output += '### 📊 执行统计\n'
    output += `- 总计: ${todos.length} 个运维任务\n`
    output += `- 正在执行: ${inProgress.length}\n`
    output += `- 待执行: ${pending.length}\n`
    output += `- 已完成: ${completed.length}\n`

    const completionRate = todos.length > 0 ? Math.round((completed.length / todos.length) * 100) : 0
    output += `- 完成率: ${completionRate}%\n\n`

    return output
  }
}
