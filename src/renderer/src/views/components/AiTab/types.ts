export interface MessageContent {
  question: string
  options?: string[]
  selected?: string
  type?: string
  content?: string
  partial?: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string | MessageContent
  type?: string
  ask?: string
  say?: string
  action?: 'approved' | 'rejected'
  ts?: number
  selectedOption?: string
  partial?: boolean
  actioned?: boolean
  // Todo 相关属性
  hasTodoUpdate?: boolean
  relatedTodos?: any[]
  // Command execution tracking
  executedCommand?: string
}

export interface AssetInfo {
  uuid: string
  title: string
  ip: string
  organizationId: string
  type?: string
  outputContext?: string
  tabSessionId?: string
  connection?: string
}

export interface HistoryItem {
  id: string
  chatTitle: string
  chatType: string
  chatContent: ChatMessage[]
  isEditing?: boolean
  editingTitle?: string
  isFavorite?: boolean
  ts?: number
}

export interface TaskHistoryItem {
  id: string
  task?: string // Original full task description
  chatTitle?: string // Optional LLM-generated short title
  ts: number
  isFavorite?: boolean
}

export interface ModelOption {
  label: string
  value: string
}

export interface Host {
  host: string
  uuid: string
  connection: string
}
