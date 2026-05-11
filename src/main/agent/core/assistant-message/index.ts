//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0
//
// Copyright (c) 2025 cline Authors, All rights reserved.
// Licensed under the Apache License, Version 2.0

// Tool names and the `ToolUseName` union are owned by the ToolRegistry
// (see `../task/tool-registry.ts`). We re-export them here so existing
// parser/dispatch call sites keep working unchanged.
import { registeredToolNames, type ToolUseName as RegistryToolUseName } from '../task/tool-registry'

export type AssistantMessageContent = TextContent | ToolUse

export { parseAssistantMessageV2 } from './parse-assistant-message'

export interface TextContent {
  type: 'text'
  content: string
  partial: boolean
}

/**
 * Canonical list of tool names accepted by the parser. Derived from
 * `toolMetadata` in the registry so there is exactly one source of truth.
 */
export const toolUseNames: readonly RegistryToolUseName[] = registeredToolNames

/** Union type of all registered tool names. */
export type ToolUseName = RegistryToolUseName

export const toolParamNames = [
  'ip',
  'command',
  'depositExperience',
  'requires_approval',
  'interactive',
  'path',
  'file_path',
  'offset',
  'content',
  'diff',
  'regex',
  'file_pattern',
  'recursive',
  'pattern',
  'include',
  'limit',
  'sort',
  'case_sensitive',
  'context_lines',
  'max_matches',
  'action',
  'url',
  'coordinate',
  'text',
  'server_name',
  'tool_name',
  'arguments',
  'uri',
  'question',
  'options',
  'response',
  'result',
  'context',
  'title',
  'what_happened',
  'steps_to_reproduce',
  'api_request_output',
  'additional_context',
  'todos',
  'name',
  'file_name',
  'summary',
  'skill_name',
  'description',
  'query',
  'max_results',
  'extract_mode',
  'max_chars',
  'database',
  'schema',
  'table',
  'sql',
  'exact',
  'query_patterns'
] as const

export type ToolParamName = (typeof toolParamNames)[number]

export interface ToolUse {
  type: 'tool_use'
  name: ToolUseName
  // params is a partial record, allowing only some or none of the possible parameters to be used
  params: Partial<Record<ToolParamName, string>>
  partial: boolean
}
