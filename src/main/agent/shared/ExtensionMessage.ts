// type that represents json data that is sent from extension to webview, called ExtensionMessage and has 'type' enum which can be 'plusButtonClicked' or 'settingsButtonClicked' or 'hello'

//import { GitCommit } from "../utils/git"
import { ApiConfiguration, ModelInfo } from './api'
import { AutoApprovalSettings } from './AutoApprovalSettings'
import { ChatSettings } from './ChatSettings'
// import { HistoryItem } from "./HistoryItem"
// import { TelemetrySetting } from "./TelemetrySetting"
// import type { BalanceResponse, UsageTransaction, PaymentTransaction } from "../shared/ClineAccount"

// webview will hold state
export interface ExtensionMessage {
  type:
    | 'action'
    | 'state'
    | 'selectedImages'
    | 'theme'
    | 'workspaceUpdated'
    | 'invoke'
    | 'partialMessage'
    | 'relinquishControl'
    | 'authCallback'
    | 'commitSearchResults'
    | 'openGraphData'
    | 'didUpdateSettings'
    | 'userCreditsBalance'
    | 'userCreditsUsage'
    | 'userCreditsPayments'
    | 'totalTasksSize'
    | 'addToInput'
    | 'browserConnectionResult'
    | 'fileSearchResults'
    | 'grpc_response' // New type for gRPC responses
    | 'requestyModels'

  text?: string
  action?:
    | 'mcpButtonClicked'
    | 'settingsButtonClicked'
    | 'historyButtonClicked'
    | 'didBecomeVisible'
    | 'accountLogoutClicked'
    | 'accountButtonClicked'
    | 'focusChatInput'
  invoke?: Invoke
  state?: ExtensionState
  filePaths?: string[]
  partialMessage?: ChatermMessage
  customToken?: string
  error?: string
  // commits?: GitCommit[]
  openGraphData?: {
    title?: string
    description?: string
    image?: string
    url?: string
    siteName?: string
    type?: string
  }
  url?: string
  totalTasksSize?: number | null
  success?: boolean
  endpoint?: string
  isBundled?: boolean
  isConnected?: boolean
  isRemote?: boolean
  host?: string
  mentionsRequestId?: string
  results?: Array<{
    path: string
    type: 'file' | 'folder'
    label?: string
  }>
  grpc_response?: {
    message?: any // JSON serialized protobuf message
    request_id: string // Same ID as the request
    error?: string // Optional error message
    is_streaming?: boolean // Whether this is part of a streaming response
    sequence_number?: number // For ordering chunks in streaming responses
  }
}

export type Invoke = 'sendMessage' | 'primaryButtonClick' | 'secondaryButtonClick'

export type Platform =
  | 'aix'
  | 'darwin'
  | 'freebsd'
  | 'linux'
  | 'openbsd'
  | 'sunos'
  | 'win32'
  | 'unknown'

export const DEFAULT_PLATFORM = 'unknown'

export interface ExtensionState {
  isNewUser: boolean
  apiConfiguration?: ApiConfiguration
  autoApprovalSettings: AutoApprovalSettings
  remoteBrowserHost?: string
  chatSettings: ChatSettings
  checkpointTrackerErrorMessage?: string
  chatermMessages: ChatermMessage[]
  // currentTaskItem?: HistoryItem
  customInstructions?: string
  mcpMarketplaceEnabled?: boolean
  // planActSeparateModelsSetting: boolean
  enableCheckpointsSetting?: boolean
  platform: Platform
  shouldShowAnnouncement: boolean
  // taskHistory: HistoryItem[]
  // telemetrySetting: TelemetrySetting
  shellIntegrationTimeout: number
  uriScheme?: string
  userInfo?: {
    displayName: string | null
    email: string | null
    photoURL: string | null
  }
  version: string
  vscMachineId: string
}

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
}

export type ChatermAsk =
  | 'followup'
  | 'command'
  | 'command_output'
  | 'completion_result'
  | 'tool'
  | 'api_req_failed'
  | 'resume_task'
  | 'resume_completed_task'
  | 'mistake_limit_reached'
  | 'auto_approval_max_req_reached'
  // | 'new_task'
  | 'condense'
  | 'report_bug'

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
  | 'tool'
  | 'shell_integration_warning'
  | 'diff_error'
  | 'deleted_api_reqs'
  // | "clineignore_error"
  | 'checkpoint_created'
  | 'info' // Added for general informational messages like retry status

export interface ChatermSayTool {
  tool: // | "newFileCreated"
  | 'readFile'
    | 'listFilesTopLevel'
    | 'listFilesRecursive'
    // | "listCodeDefinitionNames"
    | 'searchFiles'
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
