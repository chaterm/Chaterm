//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0
//
// Copyright (c) 2025 cline Authors, All rights reserved.
// Licensed under the Apache License, Version 2.0

import { ApiConfiguration } from './api'
import { AutoApprovalSettings } from './AutoApprovalSettings'
import { ChatSettings } from './ChatSettings'
export interface ExtensionMessage {
  type:
    | 'state'
    | 'partialMessage'
    | 'commandGenerationResponse'
    | 'explainCommandResponse'
    | 'todoUpdated'
    | 'chatTitleGenerated'
    | 'mcpServersUpdate'
    | 'notification'
    | 'taskHistoryUpdated'

  text?: string
  state?: ExtensionState
  partialMessage?: ChatermMessage
  error?: string
  // For command generation response
  command?: string
  tabId?: string
  // For explain command response
  explanation?: string
  commandMessageId?: string
  // For todo updates
  todos?: unknown[]
  sessionId?: string
  taskId?: string
  changeType?: 'created' | 'updated' | 'completed' | 'progress'
  triggerReason?: 'agent_update' | 'user_request' | 'auto_progress'
  // For chat title generation
  chatTitle?: string
  // For MCP servers update
  mcpServers?: any[]
  // For notifications
  notification?: {
    type: 'info' | 'success' | 'warning' | 'error'
    title?: string
    description: string
    duration?: number
  }
}

export type Platform = 'aix' | 'darwin' | 'freebsd' | 'linux' | 'openbsd' | 'sunos' | 'win32' | 'unknown'

export const DEFAULT_PLATFORM = 'unknown'

export interface ExtensionState {
  isNewUser: boolean
  apiConfiguration?: ApiConfiguration
  autoApprovalSettings: AutoApprovalSettings
  chatSettings: ChatSettings
  checkpointTrackerErrorMessage?: string
  chatermMessages: ChatermMessage[]
  customInstructions?: string
  mcpMarketplaceEnabled?: boolean
  platform: Platform
  shouldShowAnnouncement: boolean
  shellIntegrationTimeout: number
  userInfo?: {
    displayName: string | null
    email: string | null
    photoURL: string | null
  }
  version: string
}

export interface ChatermMessage {
  ts: number
  type: 'ask' | 'say'
  ask?: ChatermAsk
  say?: ChatermSay
  text?: string
  contentParts?: import('./WebviewMessage').ContentPart[]
  reasoning?: string
  images?: string[]
  partial?: boolean
  lastCheckpointHash?: string
  isCheckpointCheckedOut?: boolean
  isOperationOutsideWorkspace?: boolean
  conversationHistoryIndex?: number
  conversationHistoryDeletedRange?: [number, number]
  mcpToolCall?: ChatermAskMcpToolCall
  // Multi-host execution identification
  hostId?: string
  hostName?: string
  colorTag?: string
}

// Shared host info payload for multi-host display
export interface HostInfo {
  hostId?: string
  hostName?: string
  colorTag?: string
}

export type ChatermAsk =
  | 'followup'
  | 'command'
  | 'command_output'
  | 'completion_result'
  | 'tool'
  | 'api_req_failed'
  | 'ssh_con_failed'
  | 'resume_task'
  | 'mistake_limit_reached'
  | 'auto_approval_max_req_reached'
  | 'condense'
  | 'report_bug'
  | 'mcp_tool_call'

export type ChatermSay =
  | 'task'
  | 'error'
  | 'api_req_started'
  | 'api_req_finished'
  | 'text'
  | 'reasoning'
  | 'completion_result'
  | 'user_feedback'
  | 'user_feedback_diff'
  | 'api_req_retried'
  | 'command'
  | 'command_output'
  | 'command_blocked'
  | 'tool'
  | 'mcp_tool_call'
  | 'shell_integration_warning'
  | 'diff_error'
  | 'deleted_api_reqs'
  | 'checkpoint_created'
  | 'sshInfo'
  | 'interactive_command_notification'
  | 'search_result'

export interface ChatermSayTool {
  tool: 'readFile' | 'listFilesTopLevel' | 'listFilesRecursive' | 'searchFiles'
  path?: string
  diff?: string
  content?: string
  regex?: string
  filePattern?: string
  operationIsLocatedInWorkspace?: boolean
}

export interface ChatermAskQuestion {
  question: string
  options?: string[]
  selected?: string
}

export interface ChatermAskMcpToolCall {
  serverName: string
  toolName: string
  arguments: Record<string, unknown>
}

export interface ChatermAskNewTask {
  context: string
}

export interface ChatermApiReqInfo {
  request?: string
  tokensIn?: number
  tokensOut?: number
  cacheWrites?: number
  cacheReads?: number
  cost?: number
  cancelReason?: ChatermApiReqCancelReason
  streamingFailedMessage?: string
  retryStatus?: {
    attempt: number
    maxAttempts: number
    delaySec: number
    errorSnippet?: string
  }
}

export type ChatermApiReqCancelReason = 'streaming_failed' | 'user_cancelled' | 'retries_exhausted'

export const COMPLETION_RESULT_CHANGES_FLAG = 'HAS_CHANGES'
