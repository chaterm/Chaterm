import { Anthropic } from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { ApiHandlerOptions, liteLlmDefaultModelId, liteLlmModelInfoSaneDefaults } from '@shared/api'
import { ApiHandler } from '..'
import { ApiStream } from '../transform/stream'
import { convertToOpenAiMessages } from '../transform/openai-format'
import { createProxyAgent, checkProxyConnectivity } from './proxy'
import type { Agent } from 'http'

export class LiteLlmHandler implements ApiHandler {
  private options: ApiHandlerOptions
  private client: OpenAI

  constructor(options: ApiHandlerOptions) {
    this.options = options

    // 判断是否需要使用代理
    let httpAgent: Agent | undefined = undefined
    if (this.options.needProxy !== false) {
      const proxyConfig = this.options.proxyConfig
      httpAgent = createProxyAgent(proxyConfig)
    }
    this.client = new OpenAI({
      baseURL: this.options.liteLlmBaseUrl || 'http://localhost:4000',
      apiKey: this.options.liteLlmApiKey || 'noop',
      httpAgent: httpAgent
    })
  }

  async calculateCost(prompt_tokens: number, completion_tokens: number): Promise<number | undefined> {
    // Reference: https://github.com/BerriAI/litellm/blob/122ee634f434014267af104814022af1d9a0882f/litellm/proxy/spend_tracking/spend_management_endpoints.py#L1473
    const modelId = this.options.liteLlmModelId || liteLlmDefaultModelId
    try {
      const response = await fetch(`${this.client.baseURL}/spend/calculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.options.liteLlmApiKey}`
        },
        body: JSON.stringify({
          completion_response: {
            model: modelId,
            usage: {
              prompt_tokens,
              completion_tokens
            }
          }
        })
      })

      if (response.ok) {
        const data: { cost: number } = await response.json()
        return data.cost
      } else if (response.status === 404) {
        // 如果接口不存在，使用默认计算方式
        console.warn('Spend calculation endpoint not found, using default calculation')
        const defaultInputPrice = 0.000003 // $3 per million tokens
        const defaultOutputPrice = 0.000015 // $15 per million tokens
        return prompt_tokens * defaultInputPrice + completion_tokens * defaultOutputPrice
      } else {
        console.error('Error calculating spend:', response.statusText)
        return undefined
      }
    } catch (error) {
      console.error('Error calculating spend:', error)
      // 发生错误时使用默认计算方式
      const defaultInputPrice = 0.000003 // $3 per million tokens
      const defaultOutputPrice = 0.000015 // $15 per million tokens
      return prompt_tokens * defaultInputPrice + completion_tokens * defaultOutputPrice
    }
  }

  async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
    const formattedMessages = convertToOpenAiMessages(messages)
    const systemMessage: OpenAI.Chat.ChatCompletionSystemMessageParam = {
      role: 'system',
      content: systemPrompt
    }
    const modelId = this.options.liteLlmModelId || liteLlmDefaultModelId
    const isOminiModel = modelId.includes('o1-mini') || modelId.includes('o3-mini') || modelId.includes('o4-mini')

    // Configuration for extended thinking
    const budgetTokens = this.options.thinkingBudgetTokens || 0
    const reasoningOn = budgetTokens !== 0 ? true : false
    const thinkingConfig = reasoningOn ? { type: 'enabled', budget_tokens: budgetTokens } : undefined

    let temperature: number | undefined = this.options.liteLlmModelInfo?.temperature ?? 0

    if (isOminiModel && reasoningOn) {
      temperature = undefined // Thinking mode doesn't support temperature
    }

    const cacheControl = { cache_control: { type: 'ephemeral' as const } }

    // Add cache_control to system message if enabled
    const enhancedSystemMessage = {
      ...systemMessage,
      ...(cacheControl && cacheControl)
    }

    // Find the last two user messages to apply caching
    const userMsgIndices = formattedMessages.reduce((acc, msg, index) => (msg.role === 'user' ? [...acc, index] : acc), [] as number[])
    const lastUserMsgIndex = userMsgIndices[userMsgIndices.length - 1] ?? -1
    const secondLastUserMsgIndex = userMsgIndices[userMsgIndices.length - 2] ?? -1

    // Apply cache_control to the last two user messages if enabled
    const enhancedMessages = formattedMessages.map((message, index) => {
      if ((index === lastUserMsgIndex || index === secondLastUserMsgIndex) && cacheControl) {
        return {
          ...message,
          ...cacheControl
        }
      }
      return message
    })

    const stream = await this.client.chat.completions.create({
      model: this.options.liteLlmModelId || liteLlmDefaultModelId,
      messages: [enhancedSystemMessage, ...enhancedMessages],
      temperature,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: this.options.liteLlmModelInfo?.maxTokens || 8192,
      ...(thinkingConfig && { thinking: thinkingConfig }) // Add thinking configuration when applicable
    })

    const inputCost = (await this.calculateCost(1e6, 0)) || 0
    const outputCost = (await this.calculateCost(0, 1e6)) || 0

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta

      // Handle normal text content
      if (delta?.content) {
        yield {
          type: 'text',
          text: delta.content
        }
      }

      // Handle reasoning events (thinking)
      // Thinking is not in the standard types but may be in the response
      interface ThinkingDelta {
        thinking?: string
      }

      if ((delta as ThinkingDelta)?.thinking) {
        yield {
          type: 'reasoning',
          reasoning: (delta as ThinkingDelta).thinking || ''
        }
      }

      // Handle token usage information
      if (chunk.usage) {
        const totalCost = (inputCost * chunk.usage.prompt_tokens) / 1e6 + (outputCost * chunk.usage.completion_tokens) / 1e6

        // Extract cache-related information if available
        // Need to use type assertion since these properties are not in the standard OpenAI types
        const usage = chunk.usage as {
          prompt_tokens: number
          completion_tokens: number
          cache_creation_input_tokens?: number
          prompt_cache_miss_tokens?: number
          cache_read_input_tokens?: number
          prompt_cache_hit_tokens?: number
        }

        const cacheWriteTokens = usage.cache_creation_input_tokens || usage.prompt_cache_miss_tokens || 0
        const cacheReadTokens = usage.cache_read_input_tokens || usage.prompt_cache_hit_tokens || 0

        yield {
          type: 'usage',
          inputTokens: usage.prompt_tokens || 0,
          outputTokens: usage.completion_tokens || 0,
          cacheWriteTokens: cacheWriteTokens > 0 ? cacheWriteTokens : undefined,
          cacheReadTokens: cacheReadTokens > 0 ? cacheReadTokens : undefined,
          totalCost
        }
      }
    }
  }

  getModel() {
    return {
      id: this.options.liteLlmModelId || liteLlmDefaultModelId,
      info: this.options.liteLlmModelInfo || liteLlmModelInfoSaneDefaults
    }
  }

  async validateApiKey(): Promise<{ isValid: boolean; error?: string }> {
    try {
      // 验证代理
      if (this.options.needProxy) {
        await checkProxyConnectivity(this.options.proxyConfig!)
      }

      // 尝试创建一个最小的聊天请求来验证 API key
      await this.client.chat.completions.create({
        model: this.options.liteLlmModelId || liteLlmDefaultModelId,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1
      })
      return { isValid: true }
    } catch (error) {
      console.error('OpenAI compatible configuration validation failed:', error)
      return {
        isValid: false,
        error: `Validation failed:  ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
}
