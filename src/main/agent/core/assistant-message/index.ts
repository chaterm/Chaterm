export type AssistantMessageContent = TextContent | ToolUse

export { parseAssistantMessageV2 } from './parse-assistant-message'

export interface TextContent {
  type: 'text'
  content: string
  partial: boolean
}

export const toolUseNames = [
  'execute_command',
  'write_to_file',
  'ask_followup_question',
  'attempt_completion',
  'new_task',
  'condense',
  'report_bug',
  'todo_write',
  'todo_read'
] as const

// Converts array of tool call names into a union type ("execute_command" | "read_file" | ...)
export type ToolUseName = (typeof toolUseNames)[number]

export const toolParamNames = [
  'ip',
  'command',
  'requires_approval',
  'interactive',
  'path',
  'content',
  'diff',
  'regex',
  'file_pattern',
  'recursive',
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
  'todos'
] as const

export type ToolParamName = (typeof toolParamNames)[number]

export interface ToolUse {
  type: 'tool_use'
  name: ToolUseName
  // params is a partial record, allowing only some or none of the possible parameters to be used
  params: Partial<Record<ToolParamName, string>>
  partial: boolean
}
