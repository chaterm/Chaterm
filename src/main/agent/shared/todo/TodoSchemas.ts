import { z } from 'zod'
import { createLogger } from '@logging'
const logger = createLogger('agent.todo')

// Basic data structures
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
  // Focus Chain enhancements
  isFocused?: boolean // Whether this is the currently focused task in the chain
  focusedAt?: Date // When this task was focused
  completedAt?: Date // When this task was completed
  contextUsagePercent?: number // Context usage when task started (0-100)
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

// Zod validation schemas
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
  updatedAt: z.date(),
  // Focus Chain enhancements
  isFocused: z.boolean().optional(),
  focusedAt: z.date().optional(),
  completedAt: z.date().optional(),
  contextUsagePercent: z.number().min(0).max(100).optional()
})

export const TodoArraySchema = z.array(TodoSchema)

// Focus Chain types
export interface FocusChainState {
  taskId: string
  focusedTodoId: string | null
  chainProgress: number // Overall progress percentage (0-100)
  totalTodos: number
  completedTodos: number
  currentContextUsage: number // Current context usage percentage (0-100)
  lastFocusChangeAt: Date
  autoTransitionEnabled: boolean // Whether to auto-transition to next task
}

export interface FocusChainTransition {
  fromTodoId: string | null
  toTodoId: string | null
  reason: 'task_completed' | 'context_threshold' | 'user_request' | 'auto_progress'
  timestamp: Date
  contextUsageAtTransition: number
}

export interface FocusChainHandoff {
  completedWork: string // Description of what was completed
  currentState: string // Current state of the task
  nextSteps: string // What needs to be done next
  relevantFiles?: string[] // Files that are relevant to the handoff
  contextSnapshot?: Record<string, unknown> // Any context that should be preserved
}

export const FocusChainStateSchema = z.object({
  taskId: z.string(),
  focusedTodoId: z.string().nullable(),
  chainProgress: z.number().min(0).max(100),
  totalTodos: z.number().min(0),
  completedTodos: z.number().min(0),
  currentContextUsage: z.number().min(0).max(100),
  lastFocusChangeAt: z.date(),
  autoTransitionEnabled: z.boolean()
})

// Serialization/deserialization helper functions
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
          focusedAt?: string
          completedAt?: string
          toolCalls?: { timestamp: string }[]
          subtasks?: { toolCalls?: { timestamp: string }[] }[]
        }) => ({
          ...todo,
          createdAt: new Date(todo.createdAt),
          updatedAt: new Date(todo.updatedAt),
          focusedAt: todo.focusedAt ? new Date(todo.focusedAt) : undefined,
          completedAt: todo.completedAt ? new Date(todo.completedAt) : undefined,
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
      logger.error('Failed to deserialize todos', { error: error })
      return []
    }
  }

  static serializeFocusChainState(state: FocusChainState): string {
    return JSON.stringify(state, (_key, value) => {
      if (value instanceof Date) {
        return value.toISOString()
      }
      return value
    })
  }

  static deserializeFocusChainState(stateJson: string): FocusChainState | null {
    try {
      const parsed = JSON.parse(stateJson)
      return {
        ...parsed,
        lastFocusChangeAt: new Date(parsed.lastFocusChangeAt)
      }
    } catch (error) {
      logger.error('Failed to deserialize focus chain state', { error: error })
      return null
    }
  }
}
