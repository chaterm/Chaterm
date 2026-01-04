//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0
//
// Copyright (c) 2025 cline Authors, All rights reserved.
// Licensed under the Apache License, Version 2.0

import { ApiConfiguration } from './api'
import { ChatSettings } from './ChatSettings'
// import { UserInfo } from "./UserInfo"
import { ChatContent } from './ChatContent'
import { TelemetrySetting } from './TelemetrySetting'
import { z } from 'zod'

export type Host = { host: string; uuid: string; connection: string }

export interface WebviewMessage {
  type:
    | 'apiConfiguration'
    | 'newTask'
    | 'condense'
    | 'telemetrySetting'
    | 'searchFiles'
    | 'askResponse'
    | 'deleteTaskWithId'
    | 'showTaskWithId'
    | 'taskFeedback'
    | 'interactiveCommandInput'
    | 'commandGeneration'
    | 'todoUpdated'
  text?: string
  disabled?: boolean
  apiConfiguration?: ApiConfiguration
  images?: string[]
  bool?: boolean
  number?: number
  chatSettings?: ChatSettings
  chatContent?: ChatContent
  mcpId?: string
  timeout?: number
  // For toggleToolAutoApprove
  serverName?: string
  serverUrl?: string
  toolNames?: string[]
  autoApprove?: boolean

  // For auth
  // user?: UserInfo | null
  customToken?: string
  // For openInBrowser
  // url?: string
  planActSeparateModelsSetting?: boolean
  enableCheckpointsSetting?: boolean
  telemetrySetting?: TelemetrySetting
  customInstructionsSetting?: string
  mentionsRequestId?: string
  query?: string
  // For toggleFavoriteModel
  modelId?: string

  offset?: number
  shellIntegrationTimeout?: number
  askResponse?: ChatermAskResponse
  terminalOutput?: string
  hosts?: Host[]
  cwd?: Map<string, string>
  feedbackType?: TaskFeedbackType
  // For interactive command input
  input?: string
  // For command generation
  instruction?: string
  modelName?: string
  tabId?: string
  context?: {
    cwd: string
    platform: string
    shell: string
  }
  // For todo updates
  todos?: unknown[]
  sessionId?: string
  taskId?: string
  changeType?: 'created' | 'updated' | 'completed' | 'progress'
  triggerReason?: 'agent_update' | 'user_request' | 'auto_progress'
  truncateAtMessageTs?: number // For truncate and resend
}

export type ChatermAskResponse = 'yesButtonClicked' | 'noButtonClicked' | 'messageResponse'

export type ChatermCheckpointRestore = 'task' | 'workspace' | 'taskAndWorkspace'

export type TaskFeedbackType = 'thumbs_up' | 'thumbs_down'

// Runtime contract validation (dev/test only).
// Keep it lightweight: validate the discriminant and the most safety-critical shapes.
export const WebviewMessageSchema = z
  .object({
    type: z.string(),
    tabId: z.string().optional(),
    taskId: z.string().optional(),
    text: z.string().optional(),
    apiConfiguration: z.record(z.unknown()).optional()
  })
  .passthrough()

export function validateWebviewMessageContract(message: unknown): { ok: true } | { ok: false; error: string } {
  const res = WebviewMessageSchema.safeParse(message)
  if (res.success) return { ok: true }
  return { ok: false, error: res.error.message }
}
