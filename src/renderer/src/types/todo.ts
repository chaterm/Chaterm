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
  parameters: Record<string, any>
  timestamp: Date
}

export interface TodoUpdateEvent {
  sessionId: string
  taskId: string
  todos: Todo[]
  timestamp: Date
  changeType: 'created' | 'updated' | 'completed' | 'progress'
  triggerReason: 'agent_update' | 'user_request' | 'auto_progress'
}

export type TodoDisplayPreference = 'inline' | 'floating' | 'hidden'

export interface TodoDisplayConfig {
  showProgress: boolean
  showSubtasks: boolean
  autoExpand: boolean
  maxItemsToShow: number
}

// Message type for communication with main process
export interface TodoWebviewMessage {
  type: 'todoUpdated'
  todos: Todo[]
  sessionId?: string
  taskId?: string
  changeType?: 'created' | 'updated' | 'completed' | 'progress'
  triggerReason?: 'agent_update' | 'user_request' | 'auto_progress'
  // Focus Chain enhancements
  focusChainState?: FocusChainState
}

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

export type ContextThresholdLevel = 'normal' | 'warning' | 'critical' | 'maximum'

export interface FocusChainProgress {
  total: number
  completed: number
  inProgress: number
  pending: number
  progressPercent: number
  focusedTodoId: string | null
  contextUsage: number
  contextLevel: ContextThresholdLevel
}
