import { TodoContextTracker } from '../../services/todo_context_tracker'

export interface TodoPauseParams {
  reason?: string
}

export class TodoPauseTool {
  static readonly name = 'todo_pause'
  static readonly description = '暂停当前 todo 任务的处理，用于中断任务执行'

  static readonly parameterSchema = {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: '暂停原因（可选）'
      }
    },
    required: []
  }

  static async execute(params: TodoPauseParams, taskId: string): Promise<string> {
    try {
      // 清除活跃 todo
      const contextTracker = TodoContextTracker.forSession(taskId)
      contextTracker.setActiveTodo(null)

      const reason = params.reason || '用户请求暂停'

      return `任务已暂停。原因: ${reason}\n\n可以稍后使用 todo_read 查看任务列表，或使用 todo_write 更新任务状态继续工作。`
    } catch (error) {
      throw new Error(`Todo 暂停失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
