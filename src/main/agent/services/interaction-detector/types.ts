/**
 * Interaction Detector Types
 *
 * Types and interfaces for the interactive command detection system.
 * This module handles detection of commands that require user input
 * such as password prompts, confirmations, and pager controls.
 */

/**
 * Interaction types that can be detected
 */
export type InteractionType = 'confirm' | 'select' | 'password' | 'pager' | 'enter' | 'freeform'

/**
 * Values for confirm-type interactions
 */
export interface ConfirmValues {
  /** Positive response value (e.g., "y", "Y", "yes") */
  yes: string
  /** Negative response value (e.g., "n", "N", "no") */
  no: string
  /** Default value if user presses Enter (optional) */
  default?: string
}

/**
 * Result from interaction detection
 */
export interface InteractionResult {
  /** Whether interaction is needed */
  needsInteraction: boolean
  /** Type of interaction detected */
  interactionType: InteractionType
  /** Human-readable hint about what input is expected */
  promptHint: string
  /** Options for select-type interactions */
  options?: string[]
  /** Actual values to send for each option */
  optionValues?: string[]
  /** Values for confirm-type interactions */
  confirmValues?: ConfirmValues
  /** Exit key/command for the interactive program (e.g., 'q', 'quit', 'exit') */
  exitKey?: string
  /** Whether to append newline when sending exit key (default: true) */
  exitAppendNewline?: boolean
}

/**
 * Request sent to renderer process when interaction is needed
 */
export interface InteractionRequest {
  /** Unique command identifier */
  commandId: string
  /** Task identifier this command belongs to */
  taskId?: string
  /** Type of interaction needed */
  interactionType: InteractionType
  /** Human-readable prompt hint */
  promptHint: string
  /** Options for select-type interactions */
  options?: string[]
  /** Actual values to send for each option */
  optionValues?: string[]
  /** Values for confirm-type interactions */
  confirmValues?: ConfirmValues
  /** Exit key/command for the interactive program (e.g., 'q', 'quit', 'exit') */
  exitKey?: string
  /** Whether to append newline when sending exit key (default: true) */
  exitAppendNewline?: boolean
}

/**
 * Response from user interaction
 */
export interface InteractionResponse {
  /** Command identifier this response is for */
  commandId: string
  /** User input value */
  input: string
  /** Whether to append newline to input */
  appendNewline: boolean
  /** Type of interaction (for special handling like pager) */
  interactionType?: InteractionType
}

/**
 * Result of submitting an interaction
 */
export interface InteractionSubmitResult {
  /** Whether the submission was successful */
  success: boolean
  /** Error message if submission failed */
  error?: string
  /** Error code for UI to differentiate error types */
  code?: 'timeout' | 'closed' | 'not-writable' | 'write-failed'
}

/**
 * Result of sending input to a command
 */
export interface SendInputResult {
  /** Whether the send was successful */
  success: boolean
  /** Error message if send failed */
  error?: string
  /** Error code for categorizing the failure */
  code?: 'timeout' | 'closed' | 'not-writable' | 'write-failed'
}

/**
 * Quick pattern rule for fast matching
 */
export interface QuickPattern {
  /** Regex pattern to match */
  pattern: RegExp
  /** Interaction type if matched */
  type: InteractionType
  /** Confirm values if this is a confirm-type pattern */
  confirmValues?: ConfirmValues
  /** Exit key/command for the interactive program (e.g., 'q', 'quit', 'exit') */
  exitKey?: string
  /** Whether to append newline when sending exit key (default: true) */
  exitAppendNewline?: boolean
}

/**
 * Events emitted by InteractionDetector
 */
export interface InteractionDetectorEvents {
  /** Interaction is needed - UI should be shown */
  'interaction-needed': [request: InteractionRequest]
  /** Interaction has been suppressed */
  'interaction-suppressed': [data: { commandId: string }]
  /** TUI program detected - user should interact directly in terminal */
  'tui-detected': [data: { commandId: string; taskId?: string; message: string }]
  /** Alternate screen entered (vim, less, etc.) - includes autoCancel flag */
  'alternate-screen-entered': [data: { commandId: string; taskId?: string; autoCancel: boolean }]
  /** Command completed */
  'command-completed': [data: { commandId: string; exitCode: number }]
  /** Index signature for TypedEventEmitter compatibility */
  [key: string]: unknown[]
}

/**
 * Configuration for InteractionDetector
 */
export interface InteractionDetectorConfig {
  /** Initial timeout before first detection (ms) */
  initialTimeout?: number
  /** Maximum timeout after backoff (ms) */
  maxTimeout?: number
  /** Maximum LLM calls before switching to long polling */
  maxLlmCalls?: number
  /** Maximum lines to keep in output buffer */
  maxLines?: number
  /** Maximum line buffer length (bytes) */
  lineBufferMaxLength?: number
  /** Maximum LLM context length (chars) */
  maxLlmContextLength?: number
  /** Maximum network failures before degrading */
  maxNetworkFails?: number
  /** Maximum hash unchanged count before forcing popup */
  maxHashUnchangedCount?: number
  /** Maximum silent timeout (ms) */
  maxSilentTimeout?: number
  /** Pager observation window timeout (ms) */
  pagerObservationTimeout?: number
  /** User locale for LLM prompts */
  userLocale?: string
  /** TUI silence timeout before auto-cancel (ms) - default 6000ms */
  tuiCancelSilenceMs?: number
  /** Hard timeout for blacklisted TUI commands (ms) */
  tuiHardTimeoutMs?: number
}

/**
 * TUI command category for conditional auto-cancel behavior
 * - 'always': Always TUI programs (vim, nano, tmux) - auto-cancel after silence
 * - 'conditional': Conditionally TUI (top, mysql) - auto-cancel unless non-interactive args
 * - 'non-blacklist': Not in TUI blacklist - never auto-cancel
 * - null: Not applicable (e.g., pager commands)
 */
export type TuiCategory = 'always' | 'conditional' | 'non-blacklist' | null
