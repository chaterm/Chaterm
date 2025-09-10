import { TodoContextTracker } from './todo_context_tracker'
import { TodoStorage } from '../storage/todo/TodoStorage'
import { TodoToolCall } from '../../shared/todo/TodoSchemas'

export class TodoToolCallTracker {
  /**
   * 记录工具调用到活跃的 todo 项
   */
  static async recordToolCall(taskId: string, toolName: string, parameters: Record<string, unknown>): Promise<void> {
    try {
      const contextTracker = TodoContextTracker.forSession(taskId)
      const activeTodoId = contextTracker.getActiveTodoId()
      if (!activeTodoId) {
        return // 没有活跃的 todo，不记录
      }
      const storage = new TodoStorage(taskId)
      const todos = await storage.readTodos()
      const activeTodo = todos.find((t) => t.id === activeTodoId)
      if (!activeTodo) {
        return
      }
      // 创建工具调用记录
      const toolCall: TodoToolCall = {
        id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: toolName,
        parameters: parameters,
        timestamp: new Date()
      }
      // 添加到 todo 的工具调用列表
      if (!activeTodo.toolCalls) {
        activeTodo.toolCalls = []
      }
      activeTodo.toolCalls.push(toolCall)
      // 更新 todo 的最后修改时间
      activeTodo.updatedAt = new Date()
      // 保存更新后的 todos
      await storage.writeTodos(todos)
      console.log(`Recorded tool call "${toolName}" for todo "${activeTodo.content}"`)
    } catch (error) {
      console.error('Failed to record tool call:', error)
      // 不抛出错误，避免影响主要功能
    }
  }

  /**
   * 获取指定 todo 的所有工具调用记录
   */
  static async getToolCallsForTodo(taskId: string, todoId: string): Promise<TodoToolCall[]> {
    try {
      const storage = new TodoStorage(taskId)
      const todos = await storage.readTodos()
      const todo = todos.find((t) => t.id === todoId)
      return todo?.toolCalls || []
    } catch (error) {
      console.error('Failed to get tool calls for todo:', error)
      return []
    }
  }

  /**
   * 获取所有 todos 的工具调用统计
   */
  static async getToolCallStatistics(taskId: string): Promise<{
    totalCalls: number
    callsByTool: Record<string, number>
    callsByTodo: Record<string, number>
  }> {
    try {
      const storage = new TodoStorage(taskId)
      const todos = await storage.readTodos()
      let totalCalls = 0
      const callsByTool: Record<string, number> = {}
      const callsByTodo: Record<string, number> = {}
      todos.forEach((todo) => {
        const todoCallCount = todo.toolCalls?.length || 0
        totalCalls += todoCallCount
        callsByTodo[todo.id] = todoCallCount
        todo.toolCalls?.forEach((call) => {
          callsByTool[call.name] = (callsByTool[call.name] || 0) + 1
        })
      })
      return {
        totalCalls,
        callsByTool,
        callsByTodo
      }
    } catch (error) {
      console.error('Failed to get tool call statistics:', error)
      return {
        totalCalls: 0,
        callsByTool: {},
        callsByTodo: {}
      }
    }
  }

  /**
   * 清理指定 todo 的工具调用记录
   */
  static async clearToolCallsForTodo(taskId: string, todoId: string): Promise<void> {
    try {
      const storage = new TodoStorage(taskId)
      const todos = await storage.readTodos()
      const todo = todos.find((t) => t.id === todoId)
      if (todo) {
        todo.toolCalls = []
        todo.updatedAt = new Date()
        await storage.writeTodos(todos)
        console.log(`Cleared tool calls for todo "${todo.content}"`)
      }
    } catch (error) {
      console.error('Failed to clear tool calls for todo:', error)
    }
  }

  /**
   * 获取最近的工具调用记录（跨所有 todos）
   */
  static async getRecentToolCalls(taskId: string, limit: number = 10): Promise<Array<TodoToolCall & { todoId: string; todoContent: string }>> {
    try {
      const storage = new TodoStorage(taskId)
      const todos = await storage.readTodos()
      const allCalls: Array<TodoToolCall & { todoId: string; todoContent: string }> = []
      todos.forEach((todo) => {
        if (todo.toolCalls) {
          todo.toolCalls.forEach((call) => {
            allCalls.push({
              ...call,
              todoId: todo.id,
              todoContent: todo.content
            })
          })
        }
      })
      // 按时间戳降序排序，返回最近的记录
      return allCalls.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, limit)
    } catch (error) {
      console.error('Failed to get recent tool calls:', error)
      return []
    }
  }

  /**
   * 检查是否有工具调用与指定的 todo 关联
   */
  static async hasToolCallsForTodo(taskId: string, todoId: string): Promise<boolean> {
    try {
      const toolCalls = await this.getToolCallsForTodo(taskId, todoId)
      return toolCalls.length > 0
    } catch (error) {
      console.error('Failed to check tool calls for todo:', error)
      return false
    }
  }
}
