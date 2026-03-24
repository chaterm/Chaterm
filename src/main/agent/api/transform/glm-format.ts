//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0
//
// Copyright (c) 2025 cline Authors, All rights reserved.
// Licensed under the Apache License, Version 2.0

import { Anthropic } from '@anthropic-ai/sdk'
import OpenAI from 'openai'
const logger = createLogger('agent')

// Convert Anthropic messages to GLM-compatible OpenAI format.
// Key difference from standard OpenAI format: user messages that contain only
// text blocks are serialized as a plain string instead of a content-part array,
// because GLM models do not support the array-of-parts content format for text.
export function convertToGlmMessages(anthropicMessages: Anthropic.Messages.MessageParam[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = []

  for (const anthropicMessage of anthropicMessages) {
    if (typeof anthropicMessage.content === 'string') {
      openAiMessages.push({
        role: anthropicMessage.role,
        content: anthropicMessage.content
      })
    } else {
      if (anthropicMessage.role === 'user') {
        const { nonToolMessages, toolMessages } = anthropicMessage.content.reduce<{
          nonToolMessages: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[]
          toolMessages: Anthropic.ToolResultBlockParam[]
        }>(
          (acc, part) => {
            if (part.type === 'tool_result') {
              acc.toolMessages.push(part)
            } else if (part.type === 'text' || part.type === 'image') {
              acc.nonToolMessages.push(part)
            } // user cannot send tool_use messages
            return acc
          },
          { nonToolMessages: [], toolMessages: [] }
        )

        // Process tool result messages FIRST since they must follow the tool use messages
        const toolResultImages: Anthropic.Messages.ImageBlockParam[] = []
        toolMessages.forEach((toolMessage) => {
          // The Anthropic SDK allows tool results to be a string or an array of text and image blocks, enabling rich and structured content. In contrast, the OpenAI SDK only supports tool results as a single string, so we map the Anthropic tool result parts into one concatenated string to maintain compatibility.
          let content: string

          if (typeof toolMessage.content === 'string') {
            content = toolMessage.content
          } else {
            content =
              toolMessage.content
                ?.map((part) => {
                  if (part.type === 'image') {
                    // Only push base64 images (URL images are not supported in tool results)
                    if (part.source.type === 'base64') {
                      toolResultImages.push(part)
                      return '(see following user message for image)'
                    } else {
                      logger.warn('Unsupported image source type in tool result, only base64 is supported')
                      return '(image not supported)'
                    }
                  }
                  if (part.type === 'text') {
                    return part.text
                  }
                  return ''
                })
                .join('\n') ?? ''
          }
          openAiMessages.push({
            role: 'tool',
            tool_call_id: toolMessage.tool_use_id,
            content: content
          })
        })

        // Process non-tool messages
        if (nonToolMessages.length > 0) {
          const isTextOnly = nonToolMessages.every((part): part is Anthropic.TextBlockParam => part.type === 'text')

          if (isTextOnly) {
            // GLM format: use plain string content for text-only messages
            openAiMessages.push({
              role: 'user',
              content: nonToolMessages
                .map((part) => part.text)
                .filter(Boolean)
                .join('\n')
            })
          } else {
            // Keep array format when message contains images
            openAiMessages.push({
              role: 'user',
              content: nonToolMessages.map((part) => {
                if (part.type === 'image') {
                  if (part.source.type === 'base64') {
                    return {
                      type: 'image_url',
                      image_url: {
                        url: `data:${part.source.media_type};base64,${part.source.data}`
                      }
                    }
                  } else {
                    logger.warn('Unsupported image source type, only base64 is supported')
                    return { type: 'text', text: '' }
                  }
                }
                if (part.type === 'text') {
                  return { type: 'text', text: part.text }
                }
                return { type: 'text', text: '' }
              })
            })
          }
        }
      } else if (anthropicMessage.role === 'assistant') {
        const { nonToolMessages, toolMessages } = anthropicMessage.content.reduce<{
          nonToolMessages: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[]
          toolMessages: Anthropic.ToolUseBlockParam[]
        }>(
          (acc, part) => {
            if (part.type === 'tool_use') {
              acc.toolMessages.push(part)
            } else if (part.type === 'text' || part.type === 'image') {
              acc.nonToolMessages.push(part)
            } // assistant cannot send tool_result messages
            return acc
          },
          { nonToolMessages: [], toolMessages: [] }
        )

        // Process non-tool messages
        let content: string | undefined
        if (nonToolMessages.length > 0) {
          content = nonToolMessages
            .map((part) => {
              if (part.type === 'image') {
                return '' // impossible as the assistant cannot send images
              }
              if (part.type === 'text') {
                return part.text
              }
              return ''
            })
            .join('\n')
        }

        // Process tool use messages
        const tool_calls: OpenAI.Chat.ChatCompletionMessageToolCall[] = toolMessages.map((toolMessage) => ({
          id: toolMessage.id,
          type: 'function',
          function: {
            name: toolMessage.name,
            // json string
            arguments: JSON.stringify(toolMessage.input)
          }
        }))

        openAiMessages.push({
          role: 'assistant',
          content,
          // Cannot be an empty array. API expects an array with minimum length 1, and will respond with an error if it's empty
          tool_calls: tool_calls.length > 0 ? tool_calls : undefined
        })
      }
    }
  }

  return openAiMessages
}
