import { Todo, TodoArraySchema } from '../../../shared/todo/TodoSchemas'
import { ChatermDatabaseService } from '../../../../storage/database'
import { TaskMetadataHelper } from '../../context/context-tracking/ContextTrackerTypes'

import { createLogger } from '@logging'

const logger = createLogger('agent')

export class TodoStorage {
  private readonly taskId: string

  constructor(taskId: string) {
    this.taskId = taskId
  }

  async readTodos(): Promise<Todo[]> {
    try {
      const dbService = await ChatermDatabaseService.getInstance()
      const metadata = await dbService.getTaskMetadata(this.taskId)

      if (!metadata || !metadata.todos) {
        return []
      }

      // Handle date field conversion
      const processedTodos = Array.isArray(metadata.todos)
        ? metadata.todos.map((todo: any) => ({
            ...todo,
            createdAt: typeof todo.createdAt === 'string' ? new Date(todo.createdAt) : todo.createdAt,
            updatedAt: typeof todo.updatedAt === 'string' ? new Date(todo.updatedAt) : todo.updatedAt,
            focusedAt: typeof todo.focusedAt === 'string' ? new Date(todo.focusedAt) : todo.focusedAt,
            completedAt: typeof todo.completedAt === 'string' ? new Date(todo.completedAt) : todo.completedAt,
            toolCalls: todo.toolCalls?.map((call: any) => ({
              ...call,
              timestamp: typeof call.timestamp === 'string' ? new Date(call.timestamp) : call.timestamp
            })),
            subtasks: todo.subtasks?.map((subtask: any) => ({
              ...subtask,
              toolCalls: subtask.toolCalls?.map((call: any) => ({
                ...call,
                timestamp: typeof call.timestamp === 'string' ? new Date(call.timestamp) : call.timestamp
              }))
            }))
          }))
        : []

      // Validate data format
      const result = TodoArraySchema.safeParse(processedTodos)
      if (!result.success) {
        logger.warn(`Invalid todo data format for task ${this.taskId}`, { value: result.error })
        return []
      }

      return result.data
    } catch (error: unknown) {
      logger.error(`Failed to read todos for task ${this.taskId}`, { error: error instanceof Error ? error.message : String(error) })
      return []
    }
  }

  async writeTodos(todos: Todo[]): Promise<void> {
    try {
      // Validate data format
      const result = TodoArraySchema.safeParse(todos)
      if (!result.success) {
        logger.error('[TodoStorage] Data validation failed', { error: result.error instanceof Error ? result.error.message : String(result.error) })
        throw new Error(`Invalid todo data: ${result.error.message}`)
      }

      const dbService = await ChatermDatabaseService.getInstance()

      // Get existing metadata
      const existingMetadata = (await dbService.getTaskMetadata(this.taskId)) || TaskMetadataHelper.createEmptyMetadata()

      // Update todos field
      const updatedMetadata = TaskMetadataHelper.updateTodos(existingMetadata, result.data)

      // Save back to database
      await dbService.saveTaskMetadata(this.taskId, updatedMetadata)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`[TodoStorage] Failed to write todos, taskId: ${this.taskId}`, { error: error instanceof Error ? error.message : String(error) })
      throw new Error(`Failed to write todos for task ${this.taskId}: ${errorMessage}`)
    }
  }

  async deleteTodos(): Promise<void> {
    try {
      const dbService = await ChatermDatabaseService.getInstance()
      const existingMetadata = await dbService.getTaskMetadata(this.taskId)

      if (existingMetadata) {
        const updatedMetadata = TaskMetadataHelper.updateTodos(existingMetadata, [])
        await dbService.saveTaskMetadata(this.taskId, updatedMetadata)
      }

      logger.info(`Deleted todos for task ${this.taskId}`)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to delete todos for task ${this.taskId}: ${errorMessage}`)
    }
  }

  async todoExists(): Promise<boolean> {
    try {
      const todos = await this.readTodos()
      return todos.length > 0
    } catch {
      return false
    }
  }

  async addTodo(todo: Todo): Promise<void> {
    const todos = await this.readTodos()
    todos.push(todo)
    await this.writeTodos(todos)
  }

  async updateTodo(todoId: string, updates: Partial<Todo>): Promise<void> {
    const todos = await this.readTodos()
    const index = todos.findIndex((t) => t.id === todoId)

    if (index === -1) {
      throw new Error(`Todo with id ${todoId} not found`)
    }

    todos[index] = { ...todos[index], ...updates, updatedAt: new Date() }
    await this.writeTodos(todos)
  }

  async deleteTodo(todoId: string): Promise<void> {
    const todos = await this.readTodos()
    const filteredTodos = todos.filter((t) => t.id !== todoId)

    if (filteredTodos.length === todos.length) {
      throw new Error(`Todo with id ${todoId} not found`)
    }

    await this.writeTodos(filteredTodos)
  }

  async getTodo(todoId: string): Promise<Todo | null> {
    const todos = await this.readTodos()
    return todos.find((t) => t.id === todoId) || null
  }
}
