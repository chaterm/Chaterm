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
}
