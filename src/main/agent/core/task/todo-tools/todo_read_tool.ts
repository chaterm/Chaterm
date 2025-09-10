import { Todo } from '../../../shared/todo/TodoSchemas'
import { TodoStorage } from '../../storage/todo/TodoStorage'
import { TodoReminderService } from '../../services/todo_reminder_service'
import { TodoWriteTool } from './todo_write_tool'

export type TodoReadParams = {
  // 空参数，读取当前任务的所有 todos
}

export class TodoReadTool {
  static readonly name = 'todo_read'
  static readonly description = '读取当前会话的 todo 列表，返回所有任务的状态和内容'

  static readonly parameterSchema = {
    type: 'object',
    properties: {},
    required: []
  }

  static async execute(params: TodoReadParams, taskId: string): Promise<string> {
    try {
      const storage = new TodoStorage(taskId)
      const todos = await storage.readTodos()

      if (todos.length === 0) {
        const reminderService = new TodoReminderService()
        const reminder = reminderService.getReminderForEmptyTodos(true)

        return `## 运维任务列表\n\n暂无任务。\n\n对于复杂的服务端运维操作，建议使用 todo_write 工具创建任务列表来确保所有步骤都被正确执行。${reminder ? '\n\n' + reminder : ''}`
      }

      return TodoWriteTool.generateOutput(todos)
    } catch (error) {
      throw new Error(`Todo 读取失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
