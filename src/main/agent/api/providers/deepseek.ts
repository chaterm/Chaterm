import { Anthropic } from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { ApiHandler } from '../'
import { ApiHandlerOptions, DeepSeekModelId, ModelInfo, deepSeekDefaultModelId, deepSeekModels } from '@shared/api'
import { calculateApiCostOpenAI } from '../../utils/cost'
import { convertToOpenAiMessages } from '../transform/openai-format'
import { ApiStream } from '../transform/stream'
import { convertToR1Format } from '../transform/r1-format'

export class DeepSeekHandler implements ApiHandler {
  private options: ApiHandlerOptions
  private client: OpenAI

  constructor(options: ApiHandlerOptions) {
    this.options = options
    this.client = new OpenAI({
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: this.options.deepSeekApiKey
    })
  }

  // 新增API验证方法
  async validateApiKey(): Promise<{ isValid: boolean; error?: string }> {
    try {
      const testSystemPrompt = "This is a connection test. Respond with only the word 'OK'."
      const testMessage = [{ role: 'user', content: 'Connection test' }] as Anthropic.Messages.MessageParam[]

      const stream = this.createMessage(testSystemPrompt, testMessage)
      let firstResponse = false

      for await (const chunk of stream) {
        if (chunk.type === 'text' || chunk.type === 'reasoning') {
          firstResponse = true
          break
        }
      }
      if (!firstResponse) {
        throw new Error('No valid response received')
      }
      return { isValid: true }
    } catch (error) {
      console.error('DeepSeek configuration validation failed:', error)

      return {
        isValid: false,
        error: `Validation failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  private async *yieldUsage(info: ModelInfo, usage: OpenAI.Completions.CompletionUsage | undefined): ApiStream {
    // Deepseek reports total input AND cache reads/writes,
    // see context caching: https://api-docs.deepseek.com/guides/kv_cache)
    // where the input tokens is the sum of the cache hits/misses, just like OpenAI.
    // This affects:
    // 1) context management truncation algorithm, and
    // 2) cost calculation

    // Deepseek usage includes extra fields.
    // Safely cast the prompt token details section to the appropriate structure.
    interface DeepSeekUsage extends OpenAI.CompletionUsage {
      prompt_cache_hit_tokens?: number
      prompt_cache_miss_tokens?: number
    }

    const deepUsage = usage as DeepSeekUsage

    const inputTokens = deepUsage?.prompt_tokens || 0 // sum of cache hits and misses
    const outputTokens = deepUsage?.completion_tokens || 0
    const cacheReadTokens = deepUsage?.prompt_cache_hit_tokens || 0
    const cacheWriteTokens = deepUsage?.prompt_cache_miss_tokens || 0
    const totalCost = calculateApiCostOpenAI(info, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens)
    const nonCachedInputTokens = Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens) // this will always be 0
    yield {
      type: 'usage',
      inputTokens: nonCachedInputTokens,
      outputTokens: outputTokens,
      cacheWriteTokens: cacheWriteTokens,
      cacheReadTokens: cacheReadTokens,
      totalCost: totalCost
    }
  }

  async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
    const model = this.getModel()

    const isDeepseekReasoner = model.id.includes('deepseek-reasoner')

    let openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: 'system', content: systemPrompt }, ...convertToOpenAiMessages(messages)]

    if (isDeepseekReasoner) {
      openAiMessages = convertToR1Format([{ role: 'user', content: systemPrompt }, ...messages])
    }

    const stream = await this.client.chat.completions.create({
      model: model.id,
      max_completion_tokens: model.info.maxTokens,
      messages: openAiMessages,
      stream: true,
      stream_options: { include_usage: true },
      // Only set temperature for non-reasoner models
      ...(model.id === 'deepseek-reasoner' ? {} : { temperature: 0 })
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta
      if (delta?.content) {
        yield {
          type: 'text',
          text: delta.content
        }
      }

      if (delta && 'reasoning_content' in delta && delta.reasoning_content) {
        yield {
          type: 'reasoning',
          reasoning: (delta.reasoning_content as string | undefined) || ''
        }
      }

      if (chunk.usage) {
        yield* this.yieldUsage(model.info, chunk.usage)
      }
    }
  }

  getModel(): { id: DeepSeekModelId; info: ModelInfo } {
    const modelId = this.options.apiModelId
    if (modelId && modelId in deepSeekModels) {
      const id = modelId as DeepSeekModelId
      return { id, info: deepSeekModels[id] }
    }
    return {
      id: deepSeekDefaultModelId,
      info: deepSeekModels[deepSeekDefaultModelId]
    }
  }
}
