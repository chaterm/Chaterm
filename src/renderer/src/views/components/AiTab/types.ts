export interface MessageContent {
  question: string
  options?: string[]
  selected?: string
  type?: string
  content?: string
  partial?: boolean
}

export interface McpToolCallInfo {
  serverName: string
  toolName: string
  arguments: Record<string, unknown>
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
  // MCP tool call info
  mcpToolCall?: McpToolCallInfo
  // Multi-host execution identification
  hostId?: string
  hostName?: string
  colorTag?: string
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
  organizationUuid?: string
}

// Tree structure types for host list
export type HostItemType = 'personal' | 'jumpserver' | 'jumpserver_child'

export interface TreeHostOption {
  key: string
  label: string
  type: HostItemType
  selectable: boolean
  uuid: string
  connection: string
  organizationUuid?: string
  children?: TreeHostOption[]
  expanded?: boolean
}

export interface GetUserHostsResponse {
  data: {
    personal: TreeHostOption[]
    jumpservers: TreeHostOption[]
  }
  total: number
  hasMore: boolean
}

export interface HostOption {
  label: string
  value: string
  key: string
  uuid: string
  connect: string
  title?: string
  isLocalHost?: boolean
  type: HostItemType
  selectable: boolean
  organizationUuid?: string
  children?: TreeHostOption[]
  expanded?: boolean
  level: number
  childrenCount?: number
}
