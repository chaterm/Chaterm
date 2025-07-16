import { Anthropic } from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { ApiHandlerOptions, liteLlmDefaultModelId, liteLlmModelInfoSaneDefaults } from '@shared/api'
import { ApiHandler } from '..'
import { ApiStream } from '../transform/stream'
import { convertToOpenAiMessages } from '../transform/openai-format'
import { createProxyAgent, checkProxyConnectivity } from './proxy'
import type { Agent } from 'http'

/**
 * LiteLLM Handler for OpenAI-compatible API with enhanced reasoning support
 *
 * Reasoning/Thinking Data Handling:
 * - Supports multiple field formats for maximum compatibility
 * - Follows OpenAI's Responses API standards where possible
 * - Handles both streaming and non-streaming reasoning content
 *
 * Supported reasoning field formats:
 * 1. delta.reasoning (OpenAI Responses API standard)
 * 2. delta.thinking (legacy format)
 * 3. delta.reasoning_content (some LiteLLM providers)
 *
 *
 * Reference: https://platform.openai.com/docs/guides/reasoning
 * Reference: https://docs.litellm.ai/docs/reasoning_content
 */

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

    // 设置超时时间，默认为 20 秒，由于内部会重试3次，所以实际超时时间为 60 秒
    const timeoutMs = this.options.requestTimeoutMs || 20000

    this.client = new OpenAI({
      baseURL: this.options.liteLlmBaseUrl || 'http://localhost:4000',
      apiKey: this.options.liteLlmApiKey || 'noop',
      httpAgent: httpAgent,
      timeout: timeoutMs // 设置超时时间（毫秒）
    })
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
    const budgetTokens = 1024
    const isThinkingModel = modelId.endsWith('-Thinking')
    const reasoningOn = isThinkingModel
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

    const params: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      model: this.options.liteLlmModelId || liteLlmDefaultModelId,
      messages: [enhancedSystemMessage, ...enhancedMessages],
      temperature,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: this.options.liteLlmModelInfo?.maxTokens || 8192
    }

    if (reasoningOn) {
      Object.assign(params, {
        thinking: thinkingConfig,
        enable_thinking: true,
        thinking_budget: budgetTokens
      })
    }

    const stream = await this.client.chat.completions.create(params)

    let usageInfo: OpenAI.CompletionUsage | undefined | null = undefined

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
      // Different providers may use different field names for reasoning content
      // Based on OpenAI's documentation, reasoning data can appear in multiple formats:
      // 1. delta.thinking (legacy format)
      // 2. delta.reasoning_content (some LiteLLM providers)
      // 3. delta.reasoning (OpenAI Responses API format)
      interface ReasoningDelta {
        thinking?: string
        reasoning_content?: string
        reasoning?: string
      }

      const reasoningContent =
        (delta as ReasoningDelta)?.reasoning || (delta as ReasoningDelta)?.thinking || (delta as ReasoningDelta)?.reasoning_content

      if (reasoningContent) {
        yield {
          type: 'reasoning',
          reasoning: reasoningContent
        }
      }

      // Handle token usage information
      if (chunk.usage) {
        usageInfo = chunk.usage
      }
    }

    if (usageInfo) {
      // Extract cache-related information if available
      // Need to use type assertion since these properties are not in the standard OpenAI types
      const usage = usageInfo as {
        prompt_tokens: number
        completion_tokens: number
        cache_creation_input_tokens?: number
        prompt_cache_miss_tokens?: number
        cache_read_input_tokens?: number
        prompt_cache_hit_tokens?: number
        reasoning_tokens?: number // Add reasoning tokens support
      }

      const cacheWriteTokens = usage.cache_creation_input_tokens || usage.prompt_cache_miss_tokens || 0
      const cacheReadTokens = usage.cache_read_input_tokens || usage.prompt_cache_hit_tokens || 0

      yield {
        type: 'usage',
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
        cacheWriteTokens: cacheWriteTokens > 0 ? cacheWriteTokens : undefined,
        cacheReadTokens: cacheReadTokens > 0 ? cacheReadTokens : undefined,
        reasoningTokens: usage.reasoning_tokens || undefined,
        totalCost: 0
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
