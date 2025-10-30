export interface ChatermMessage {
  ts: number
  type: 'ask' | 'say'
  ask?: ChatermAsk
  say?: ChatermSay
  text?: string
  reasoning?: string
  images?: string[]
  partial?: boolean
  lastCheckpointHash?: string
  isCheckpointCheckedOut?: boolean
  isOperationOutsideWorkspace?: boolean
  conversationHistoryIndex?: number
  conversationHistoryDeletedRange?: [number, number] // for when conversation history is truncated for API requests
  mcpToolCall?: ChatermAskMcpToolCall
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
  | 'resume_completed_task'
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
