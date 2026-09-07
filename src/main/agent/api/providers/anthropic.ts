//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import { Anthropic, type ClientOptions } from '@anthropic-ai/sdk'
import { withRetry } from '../retry'
import type { ApiHandler } from '../'
import type { ApiStream } from '../transform/stream'
import { ApiHandlerOptions, ModelInfo, anthropicModelInfoSaneDefaults } from '@shared/api'
import { fetch as undiciFetch } from 'undici'
import { checkProxyConnectivity, getSharedDispatcher, shouldUseProxy } from './proxy/index'

const logger = createLogger('agent')

// Anthropic Direct API handler
// https://docs.anthropic.com/en/api/messages
export class AnthropicHandler implements ApiHandler {
  private options: ApiHandlerOptions
  private client: Anthropic

  constructor(options: ApiHandlerOptions) {
    this.options = options

    const dispatcher = shouldUseProxy(this.options) ? getSharedDispatcher(this.options.proxyConfig) : undefined

    const timeoutMs = this.options.requestTimeoutMs || 20000

    this.client = new Anthropic({
      apiKey: this.options.anthropicApiKey,
      baseURL: this.options.anthropicBaseUrl || undefined,
      // undici v7's fetch only accepts dispatchers created by the same undici
      // copy, so ProxyAgent and fetch must come from this package together.
      fetch: undiciFetch as unknown as NonNullable<ClientOptions['fetch']>,
      ...(dispatcher ? { fetchOptions: { dispatcher } } : {}),
      timeout: timeoutMs
    })
  }

  @withRetry()
  async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
    const modelId = this.options.anthropicModelId
    if (!modelId) {
      throw new Error('Anthropic model ID is not configured')
    }

    const maxTokens = this.getModel().info.maxTokens || 8192
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
      info: { ...anthropicModelInfoSaneDefaults, ...(this.options.anthropicModelInfo || {}) }
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
      if (shouldUseProxy(this.options)) {
        await checkProxyConnectivity(this.options.proxyConfig)
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
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Anthropic API validation failed', {
        event: 'anthropic.validate.failed',
        message: errorMessage,
        status: (error as { status?: number })?.status
      })
      return {
        isValid: false,
        error: `Validation failed: ${errorMessage}`
      }
    }
  }
}
