//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0
//
// Shared types for structured tool execution results.
// These types are used to represent tool outputs in a normalized way
// before they are persisted to the API conversation history or transformed
// for specific providers.

import type { Host } from './WebviewMessage'

/**
 * Metadata describing a single tool execution result.
 * This metadata is intended to be lightweight but expressive enough
 * for auditing and dynamic context decisions.
 */
export interface ToolResult {
  /** Low-level tool name, e.g. "execute_command", "grep_search". */
  toolName: string
  /** Human-readable description, e.g. "[execute_command for 'df -h']". */
  toolDescription: string
  /** Associated task identifier. */
  taskId: string
  /** Unix timestamp (ms) when this result was produced. */
  timestamp: number

  /** Optional IP or host identifier where the tool ran. */
  ip?: string
  /** Optional multi-host execution metadata. */
  hosts?: Host[]

  /**
   * Offloaded document path, if the raw output was written to disk.
   * Conventionally uses the "@offload/..." prefix when exposed to the model.
   */
  docPath?: string
  /** Size of the raw output in bytes (or an approximate size). */
  size?: number
  /** Number of lines in the raw output (approximate). */
  lineCount?: number

  /** Whether this result represents an error from the tool. */
  isError?: boolean
  /** Optional human-readable error message. */
  errorMessage?: string

  /**
   * Whether this result is ephemeral (exploration-only).
   * Ephemeral results are:
   * - Used only for the current reasoning round
   * - Not persisted to long-term API conversation history
   * - Not intended to be surfaced to the frontend UI
   */
  ephemeral?: boolean

  result?: string
}
