import { z } from 'zod'

// 基础数据结构
export interface Todo {
  id: string
  content: string
  description?: string
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'high' | 'medium' | 'low'
  subtasks?: Subtask[]
  toolCalls?: TodoToolCall[]
  createdAt: Date
  updatedAt: Date
}

export interface Subtask {
  id: string
  content: string
  description?: string
  toolCalls?: TodoToolCall[]
}

export interface TodoToolCall {
  id: string
  name: string
  parameters: Record<string, unknown>
  timestamp: Date
}

// Zod 验证 schemas
export const TodoStatusSchema = z.enum(['pending', 'in_progress', 'completed'])
export const TodoPrioritySchema = z.enum(['high', 'medium', 'low'])

export const TodoToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  parameters: z.record(z.any()),
  timestamp: z.date()
})

export const SubtaskSchema = z.object({
  id: z.string(),
  content: z.string().min(1),
  description: z.string().optional(),
  toolCalls: z.array(TodoToolCallSchema).optional()
})

export const TodoSchema = z.object({
  id: z.string(),
  content: z.string().min(1),
  description: z.string().optional(),
  status: TodoStatusSchema,
  priority: TodoPrioritySchema,
  subtasks: z.array(SubtaskSchema).optional(),
  toolCalls: z.array(TodoToolCallSchema).optional(),
  createdAt: z.date(),
  updatedAt: z.date()
})

export const TodoArraySchema = z.array(TodoSchema)

// 序列化/反序列化辅助函数
export class TodoSerializer {
  static serialize(todos: Todo[]): string {
    return JSON.stringify(todos, (_key, value) => {
      if (value instanceof Date) {
        return value.toISOString()
      }
      return value
    })
  }

  static deserialize(todosJson: string): Todo[] {
    try {
      const parsed = JSON.parse(todosJson)
      return parsed.map(
        (todo: {
          createdAt: string
          updatedAt: string
          toolCalls?: { timestamp: string }[]
          subtasks?: { toolCalls?: { timestamp: string }[] }[]
        }) => ({
          ...todo,
          createdAt: new Date(todo.createdAt),
          updatedAt: new Date(todo.updatedAt),
          toolCalls: todo.toolCalls?.map((call: { timestamp: string }) => ({
            ...call,
            timestamp: new Date(call.timestamp)
          })),
          subtasks: todo.subtasks?.map((subtask: { toolCalls?: { timestamp: string }[] }) => ({
            ...subtask,
            toolCalls: subtask.toolCalls?.map((call: { timestamp: string }) => ({
              ...call,
              timestamp: new Date(call.timestamp)
            }))
          }))
        })
      )
    } catch (error) {
      console.error('Failed to deserialize todos:', error)
      return []
    }
  }
}
