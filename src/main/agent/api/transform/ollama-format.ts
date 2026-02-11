import { Anthropic } from '@anthropic-ai/sdk'
import { Message } from 'ollama'

import { createLogger } from '@logging'

const logger = createLogger('agent')

export function convertToOllamaMessages(anthropicMessages: Anthropic.Messages.MessageParam[]): Message[] {
  const ollamaMessages: Message[] = []

  for (const anthropicMessage of anthropicMessages) {
    if (typeof anthropicMessage.content === 'string') {
      ollamaMessages.push({
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
            }
            return acc
          },
          { nonToolMessages: [], toolMessages: [] }
        )

        // Process tool result messages FIRST since they must follow the tool use messages
        const toolResultImages: string[] = []
        toolMessages.forEach((toolMessage) => {
          // The Anthropic SDK allows tool results to be a string or an array of text and image blocks, enabling rich and structured content. In contrast, the Ollama SDK only supports tool results as a single string, so we map the Anthropic tool result parts into one concatenated string to maintain compatibility.
          let content: string

          if (typeof toolMessage.content === 'string') {
            content = toolMessage.content
          } else {
            content =
              toolMessage.content
                ?.map((part) => {
                  if (part.type === 'image') {
                    if (part.source.type === 'base64') {
                      toolResultImages.push(`data:${part.source.media_type};base64,${part.source.data}`)
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
          ollamaMessages.push({
            role: 'user',
            images: toolResultImages.length > 0 ? toolResultImages : undefined,
            content: content
          })
        })

        // Process non-tool messages
        if (nonToolMessages.length > 0) {
          ollamaMessages.push({
            role: 'user',
            content: nonToolMessages
              .map((part) => {
                if (part.type === 'image') {
                  if (part.source.type === 'base64') {
                    return `data:${part.source.media_type};base64,${part.source.data}`
                  } else {
                    logger.warn('Unsupported image source type, only base64 is supported')
                    return ''
                  }
                }
                if (part.type === 'text') {
                  return part.text
                }
                return ''
              })
              .join('\n')
          })
        }
      } else if (anthropicMessage.role === 'assistant') {
        const { nonToolMessages } = anthropicMessage.content.reduce<{
          nonToolMessages: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[]
        }>(
          (acc, part) => {
            if (part.type === 'text' || part.type === 'image') {
              acc.nonToolMessages.push(part)
            }
            // Note: Ollama does not support tool calls, so we ignore tool_use messages
            return acc
          },
          { nonToolMessages: [] }
        )

        // Process non-tool messages
        let content: string = ''
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

        ollamaMessages.push({
          role: 'assistant',
          content
        })
      }
    }
  }

  return ollamaMessages
}
