//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0
//
// Copyright (c) 2025 cline Authors, All rights reserved.
// Licensed under the Apache License, Version 2.0

import { Anthropic } from '@anthropic-ai/sdk'

function formatToolResultJsonContent(raw: string): string {
  try {
    const parsed = JSON.parse(raw)

    const formatSingle = (tr: any): string | null => {
      if (!tr || typeof tr !== 'object') return null

      const parts: string[] = []

      if (typeof tr.toolDescription === 'string' && tr.toolDescription.length > 0) {
        parts.push(tr.toolDescription)
      } else if (typeof tr.toolName === 'string' && tr.toolName.length > 0) {
        parts.push(tr.toolName)
      }

      if (typeof tr.ip === 'string' && tr.ip.length > 0) {
        parts.push(`on ${tr.ip}`)
      }

      if (typeof tr.result === 'string' && tr.result.length > 0) {
        parts.push(tr.result)
      }

      if (parts.length === 0) {
        return null
      }

      return parts.join(' - ')
    }

    if (Array.isArray(parsed)) {
      const lines = parsed.map((item) => formatSingle(item)).filter((line): line is string => typeof line === 'string' && line.length > 0)

      if (lines.length > 0) {
        return lines.join('\n')
      }
    } else {
      const line = formatSingle(parsed)
      if (line) {
        return line
      }
    }
  } catch {
    // Fallback to raw string when JSON parsing fails
  }

  return raw
}

export function formatContentBlockToMarkdown(block: Anthropic.ContentBlockParam): string {
  switch (block.type) {
    case 'text':
      return block.text
    case 'image':
      return `[Image]`
    case 'document':
      return `[Document]`
    case 'tool_use':
      let input: string
      if (typeof block.input === 'object' && block.input !== null) {
        input = Object.entries(block.input)
          .map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`)
          .join('\n')
      } else {
        input = String(block.input)
      }
      return `[Tool Use: ${block.name}]\n${input}`
    case 'tool_result':
      if (typeof block.content === 'string') {
        const body = formatToolResultJsonContent(block.content)
        return `[Tool${block.is_error ? ' (Error)' : ''}]\n${body}`
      }
      if (Array.isArray(block.content)) {
        return `[Tool${block.is_error ? ' (Error)' : ''}]\n${block.content
          .map((contentBlock) => formatContentBlockToMarkdown(contentBlock))
          .join('\n')}`
      }
      return `[Tool${block.is_error ? ' (Error)' : ''}]`
    default:
      return '[Unexpected content type]'
  }
}
