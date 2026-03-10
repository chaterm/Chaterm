import { describe, it, expect } from 'vitest'
import { Anthropic } from '@anthropic-ai/sdk'
import { formatContentBlockToMarkdown } from '../export-markdown'

describe('formatContentBlockToMarkdown - tool_result with JSON string content', () => {
  it('should extract result text from JSON-encoded ToolResult', () => {
    const toolResult = {
      toolName: 'execute_command',
      toolDescription: '[execute_command for "ls"]',
      ip: '127.0.0.1',
      result: 'ls output here'
    }

    const block: Anthropic.ToolResultBlockParam = {
      type: 'tool_result',
      tool_use_id: 'tool-1',
      content: JSON.stringify(toolResult),
      is_error: false
    }

    const markdown = formatContentBlockToMarkdown(block as Anthropic.ContentBlockParam)

    expect(markdown).toContain('execute_command')
    expect(markdown).toContain('ls output here')
  })

  it('should fall back to raw string when JSON is invalid', () => {
    const raw = '{not-valid-json'
    const block: Anthropic.ToolResultBlockParam = {
      type: 'tool_result',
      tool_use_id: 'tool-1',
      content: raw,
      is_error: false
    }

    const markdown = formatContentBlockToMarkdown(block as Anthropic.ContentBlockParam)

    expect(markdown).toContain(raw)
  })
})
