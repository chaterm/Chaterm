//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0
//
// Copyright (c) 2025 cline Authors, All rights reserved.
// Licensed under the Apache License, Version 2.0

import { ApiConfiguration } from './api'
import { TelemetrySetting } from './TelemetrySetting'
import { z } from 'zod'

export type Host = { host: string; uuid: string; connection: string; organizationUuid?: string; assetType?: string }

export type CommandGenerationContext = {
  platform: string
  shell: string
  osVersion?: string
  hostname?: string
  username?: string
  homeDir?: string
  sudoPermission?: boolean
}

export type ContextDocRef = {
  absPath: string
  relPath?: string
  name?: string
  type?: 'file' | 'dir'
  startLine?: number
  endLine?: number
}

export type ContextPastChatRef = { taskId: string; title?: string }

// Slash command reference (e.g., /summary-to-doc or custom commands from knowledge base)
export type ContextCommandRef = {
  command: string
  label?: string
  summarizeUpToTs?: number
  path?: string // absolute path to command file in knowledge base
}

// Skill reference (activated via @ mention in chat input)
export type ContextSkillRef = { skillName: string; description?: string }

export type ContextRefs = {
  docs?: ContextDocRef[]
  pastChats?: ContextPastChatRef[]
}

export type TextContentPart = { type: 'text'; text: string }
export type DocChipContentPart = { type: 'chip'; chipType: 'doc'; ref: ContextDocRef }
export type ChatChipContentPart = { type: 'chip'; chipType: 'chat'; ref: ContextPastChatRef }
export type CommandChipContentPart = { type: 'chip'; chipType: 'command'; ref: ContextCommandRef }
export type SkillChipContentPart = { type: 'chip'; chipType: 'skill'; ref: ContextSkillRef }
export type ChipContentPart = DocChipContentPart | ChatChipContentPart | CommandChipContentPart | SkillChipContentPart
export type ImageContentPart = {
  type: 'image'
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'image/bmp' | 'image/svg+xml'
  data: string // base64 encoded image data
}
export type ContentPart = TextContentPart | ChipContentPart | ImageContentPart

export type ToolResultPayload = {
  output: string
  toolName?: string
  isError?: boolean
}

export type WebviewMessageType =
  | 'apiConfiguration'
  | 'newTask'
  | 'condense'
  | 'telemetrySetting'
  | 'askResponse'
  | 'deleteTaskWithId'
  | 'showTaskWithId'
  | 'taskFeedback'
  | 'commandGeneration'
  | 'explainCommand'
  | 'todoUpdated'

export interface WebviewMessage {
  type: WebviewMessageType
  text?: string
  toolResult?: ToolResultPayload
  apiConfiguration?: ApiConfiguration
  telemetrySetting?: TelemetrySetting
  askResponse?: ChatermAskResponse
  hosts?: Host[]
  feedbackType?: TaskFeedbackType
  instruction?: string // For command generation
  modelName?: string
  tabId?: string
  context?: CommandGenerationContext
  command?: string // For explain command
  commandMessageId?: string // For explain command, to attach result to message

  contentParts?: ContentPart[]

  todos?: unknown[] // For todo updates
  sessionId?: string
  taskId?: string
  changeType?: 'created' | 'updated' | 'completed' | 'progress'
  triggerReason?: 'agent_update' | 'user_request' | 'auto_progress'
  truncateAtMessageTs?: number // For truncate and resend
}

export type ChatermAskResponse = 'yesButtonClicked' | 'noButtonClicked' | 'messageResponse' | 'autoApproveReadOnlyClicked'

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
    toolResult: z
      .object({
        output: z.string(),
        toolName: z.string().optional(),
        isError: z.boolean().optional()
      })
      .optional(),
    apiConfiguration: z.record(z.unknown()).optional()
  })
  .passthrough()

export function validateWebviewMessageContract(message: unknown): { ok: true } | { ok: false; error: string } {
  const res = WebviewMessageSchema.safeParse(message)
  if (res.success) return { ok: true }
  return { ok: false, error: res.error.message }
}
