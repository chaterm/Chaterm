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
}

export interface TaskHistoryItem {
  id: string
  task?: string
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
