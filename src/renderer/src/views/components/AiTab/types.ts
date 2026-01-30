import type { ContentPart, ContextRefs } from '@shared/WebviewMessage'

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
  contentParts?: ContentPart[]
  contextRefs?: ContextRefs
  type?: string
  ask?: string
  say?: string
  action?: 'approved' | 'rejected'
  ts?: number
  selectedOption?: string
  partial?: boolean
  actioned?: boolean
  // Todo related properties
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
  // AI explanation for command (inline, not in history)
  explanation?: string
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
  assetType?: string
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
  assetType?: string
}

// Tree structure types for host list
// 'bastion' represents all bastion host types (JumpServer, Qizhi, etc.)
export type HostItemType = 'personal' | 'bastion' | 'bastion_child'

// Helper function to check if type is a bastion host parent node
export function isBastionHostType(type: string | undefined): boolean {
  return type === 'bastion'
}

export interface TreeHostOption {
  key: string
  label: string
  type: HostItemType
  selectable: boolean
  uuid: string
  connection: string
  organizationUuid?: string
  assetType?: string
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
  assetType?: string
  children?: TreeHostOption[]
  expanded?: boolean
  level: number
  childrenCount?: number
}

// Menu level for context popup
export type ContextMenuLevel = 'main' | 'hosts' | 'docs' | 'chats'

// Knowledge base document option
export interface DocOption {
  name: string
  absPath: string
  relPath?: string
  type: 'file' | 'dir'
}

// Past chat option
export interface ChatOption {
  id: string
  title: string
  ts: number
}
