import { Anthropic } from '@anthropic-ai/sdk'
import OpenAI, { AzureOpenAI } from 'openai'
import { withRetry } from '../retry'
import { ApiHandlerOptions, azureOpenAiDefaultApiVersion, ModelInfo, openAiModelInfoSaneDefaults } from '@shared/api'
import { ApiHandler } from '../index'
import { convertToOpenAiMessages } from '../transform/openai-format'
import type { ApiStream } from '../transform/stream'
import { convertToR1Format } from '../transform/r1-format'
import type { ChatCompletionReasoningEffort } from 'openai/resources/chat/completions'
import { checkProxyConnectivity, createProxyAgent } from './proxy/index'
import type { Agent } from 'http'

export class OpenAiHandler implements ApiHandler {
  private options: ApiHandlerOptions
  private client: OpenAI

  constructor(options: ApiHandlerOptions) {
    this.options = options
    // Azure API shape slightly differs from the core API shape: https://github.com/openai/openai-node?tab=readme-ov-file#microsoft-azure-openai
    // Use azureApiVersion to determine if this is an Azure endpoint, since the URL may not always contain 'azure.com'
    let httpAgent: Agent | undefined = undefined
    if (this.options.needProxy !== false) {
      const proxyConfig = this.options.proxyConfig
      httpAgent = createProxyAgent(proxyConfig)
    }
    const timeoutMs = this.options.requestTimeoutMs || 20000

    if (
      this.options.azureApiVersion ||
      (this.options.openAiBaseUrl?.toLowerCase().includes('azure.com') && !this.options.openAiModelId?.toLowerCase().includes('deepseek'))
    ) {
      this.client = new AzureOpenAI({
        baseURL: this.options.openAiBaseUrl,
        apiKey: this.options.openAiApiKey,
        apiVersion: this.options.azureApiVersion || azureOpenAiDefaultApiVersion,
        defaultHeaders: this.options.openAiHeaders,
        httpAgent: httpAgent,
        timeout: timeoutMs
      })
    } else {
      this.client = new OpenAI({
        baseURL: this.options.openAiBaseUrl,
        apiKey: this.options.openAiApiKey,
        defaultHeaders: this.options.openAiHeaders,
        httpAgent: httpAgent,
        timeout: timeoutMs
      })
    }
  }

  @withRetry()
  async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
    const modelId = this.options.openAiModelId ?? ''
    const isDeepseekReasoner = modelId.includes('deepseek-reasoner')
    const isR1FormatRequired = this.options.openAiModelInfo?.isR1FormatRequired ?? false
    const isReasoningModelFamily = modelId.includes('o1') || modelId.includes('o3') || modelId.includes('o4')

    let openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: 'system', content: systemPrompt }, ...convertToOpenAiMessages(messages)]
    let temperature: number | undefined = this.options.openAiModelInfo?.temperature ?? openAiModelInfoSaneDefaults.temperature
    let reasoningEffort: ChatCompletionReasoningEffort | undefined = undefined
    let maxTokens: number | undefined

    if (this.options.openAiModelInfo?.maxTokens && this.options.openAiModelInfo.maxTokens > 0) {
      maxTokens = Number(this.options.openAiModelInfo.maxTokens)
    } else {
      maxTokens = undefined
    }

    if (isDeepseekReasoner || isR1FormatRequired) {
      openAiMessages = convertToR1Format([{ role: 'user', content: systemPrompt }, ...messages])
    }

    if (isReasoningModelFamily) {
      openAiMessages = [{ role: 'developer', content: systemPrompt }, ...convertToOpenAiMessages(messages)]
      temperature = undefined // does not support temperature
      reasoningEffort = (this.options.o3MiniReasoningEffort as ChatCompletionReasoningEffort) || 'medium'
    }

    const stream = await this.client.chat.completions.create({
      model: modelId,
      messages: openAiMessages,
      temperature,
      max_tokens: maxTokens,
      reasoning_effort: reasoningEffort,
      stream: true,
      stream_options: { include_usage: true }
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
        yield {
          type: 'usage',
          inputTokens: chunk.usage.prompt_tokens || 0,
          outputTokens: chunk.usage.completion_tokens || 0
        }
      }
    }
  }

  getModel(): { id: string; info: ModelInfo } {
    return {
      id: this.options.openAiModelId ?? '',
      info: this.options.openAiModelInfo ?? openAiModelInfoSaneDefaults
    }
  }

  async validateApiKey(): Promise<{ isValid: boolean; error?: string }> {
    try {
      // Validate proxy
      if (this.options.needProxy) {
        await checkProxyConnectivity(this.options.proxyConfig!)
      }

      await this.client.chat.completions.create({
        model: this.options.openAiModelId || '',
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
