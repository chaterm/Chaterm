//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import { Anthropic } from '@anthropic-ai/sdk'
import { withRetry } from '../retry'
import type { ApiHandler } from '../'
import type { ApiStream } from '../transform/stream'
import { ApiHandlerOptions, ModelInfo, anthropicModelInfoSaneDefaults } from '@shared/api'
import { checkProxyConnectivity, createProxyAgent } from './proxy/index'
import type { Agent } from 'http'

const logger = createLogger('agent')

// Anthropic Direct API handler
// https://docs.anthropic.com/en/api/messages
export class AnthropicHandler implements ApiHandler {
  private options: ApiHandlerOptions
  private client: Anthropic

  constructor(options: ApiHandlerOptions) {
    this.options = options

    let httpAgent: Agent | undefined = undefined
    if (this.options.needProxy !== false) {
      httpAgent = createProxyAgent(this.options.proxyConfig)
    }

    const timeoutMs = this.options.requestTimeoutMs || 20000

    this.client = new Anthropic({
      apiKey: this.options.anthropicApiKey,
      baseURL: this.options.anthropicBaseUrl || undefined,
      ...(httpAgent && { fetchOptions: { agent: httpAgent } as any }),
      timeout: timeoutMs
    })
  }

  @withRetry()
  async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
    const modelId = this.options.anthropicModelId
    if (!modelId) {
      throw new Error('Anthropic model ID is not configured')
    }

    const maxTokens = anthropicModelInfoSaneDefaults.maxTokens || 8192
    const budgetTokens = this.options.thinkingBudgetTokens || 0
    const thinkingEnabled = budgetTokens > 0

    // Prompt caching: add cache_control to system prompt and last 2 user messages
    const userMsgIndices = messages.reduce((acc, msg, index) => (msg.role === 'user' ? [...acc, index] : acc), [] as number[])
    const lastUserMsgIndex = userMsgIndices[userMsgIndices.length - 1] ?? -1
    const secondLastUserMsgIndex = userMsgIndices[userMsgIndices.length - 2] ?? -1
    const cacheControl = { cache_control: { type: 'ephemeral' as const } }

    // Track cumulative output tokens for delta computation
    let previousOutputTokens = 0

    const stream = await this.client.messages.create({
      model: modelId,
      max_tokens: maxTokens,
      thinking: thinkingEnabled ? { type: 'enabled', budget_tokens: budgetTokens } : undefined,
      temperature: thinkingEnabled ? undefined : 0,
      system: [
        {
          text: systemPrompt,
          type: 'text',
          ...cacheControl
        }
      ],
      messages: messages.map((message, index) => {
        if (index === lastUserMsgIndex || index === secondLastUserMsgIndex) {
          return {
            ...message,
            content:
              typeof message.content === 'string'
                ? [
                    {
                      type: 'text' as const,
                      text: message.content,
                      ...cacheControl
                    }
                  ]
                : message.content.map((content, contentIndex) =>
                    contentIndex === message.content.length - 1 ? { ...content, ...cacheControl } : content
                  )
          }
        }
        return message
      }),
      stream: true
    })

    for await (const chunk of stream) {
      switch (chunk.type) {
        case 'message_start': {
          const usage = chunk.message.usage
          yield {
            type: 'usage',
            inputTokens: usage.input_tokens || 0,
            outputTokens: usage.output_tokens || 0,
            cacheWriteTokens: usage.cache_creation_input_tokens || undefined,
            cacheReadTokens: usage.cache_read_input_tokens || undefined
          }
          previousOutputTokens = usage.output_tokens || 0
          break
        }
        case 'message_delta': {
          // message_delta.usage.output_tokens is cumulative, compute delta
          const cumulativeOutputTokens = chunk.usage.output_tokens || 0
          const deltaOutputTokens = cumulativeOutputTokens - previousOutputTokens
          previousOutputTokens = cumulativeOutputTokens
          yield {
            type: 'usage',
            inputTokens: 0,
            outputTokens: deltaOutputTokens
          }
          break
        }
        case 'content_block_start': {
          switch (chunk.content_block.type) {
            case 'thinking': {
              yield {
                type: 'reasoning',
                reasoning: chunk.content_block.thinking || ''
              }
              break
            }
            case 'redacted_thinking': {
              yield {
                type: 'reasoning',
                reasoning: '[Redacted thinking block]'
              }
              break
            }
            case 'text': {
              if (chunk.index > 0) {
                yield { type: 'text', text: '\n' }
              }
              yield { type: 'text', text: chunk.content_block.text }
              break
            }
          }
          break
        }
        case 'content_block_delta': {
          switch (chunk.delta.type) {
            case 'thinking_delta': {
              yield { type: 'reasoning', reasoning: chunk.delta.thinking }
              break
            }
            case 'text_delta': {
              yield { type: 'text', text: chunk.delta.text }
              break
            }
          }
          break
        }
      }
    }
  }

  getModel(): { id: string; info: ModelInfo } {
    const modelId = this.options.anthropicModelId
    if (!modelId) {
      throw new Error('Anthropic model ID is not configured')
    }
    return {
      id: modelId,
      info: anthropicModelInfoSaneDefaults
    }
  }

  async validateApiKey(): Promise<{ isValid: boolean; error?: string }> {
    try {
      if (!this.options.anthropicApiKey) {
        throw new Error('Anthropic API Key is not configured')
      }
      if (!this.options.anthropicModelId) {
        throw new Error('Anthropic Model ID is not configured')
      }

      // Validate proxy connectivity if enabled
      if (this.options.needProxy) {
        await checkProxyConnectivity(this.options.proxyConfig!)
      }

      const testSystemPrompt = "This is a connection test. Respond with only the word 'OK'."
      const testMessages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: 'Connection test' }]

      const stream = this.createMessage(testSystemPrompt, testMessages)
      let receivedResponse = false

      for await (const _chunk of stream) {
        receivedResponse = true
        break
      }

      if (!receivedResponse) {
        throw new Error('No valid response received')
      }

      return { isValid: true }
    } catch (error) {
      logger.error('Anthropic API validation failed', { error })
      return {
        isValid: false,
        error: `Validation failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
}
