//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0
//
// Copyright (c) 2025 cline Authors, All rights reserved.
// Licensed under the Apache License, Version 2.0

import { Anthropic } from '@anthropic-ai/sdk'
import OpenAI, { AzureOpenAI } from 'openai'
import { withRetry } from '../retry'
import { ApiHandlerOptions, azureOpenAiDefaultApiVersion, ModelInfo, openAiModelInfoSaneDefaults } from '@shared/api'
import { ApiHandler } from '../index'
import { convertToOpenAiMessages } from '../transform/openai-format'
import { convertToResponsesInput } from '../transform/responses-format'
import type { ApiStream } from '../transform/stream'
import { convertToR1Format } from '../transform/r1-format'
import type { ChatCompletionReasoningEffort } from 'openai/resources/chat/completions'
import { checkProxyConnectivity, createProxyAgent } from './proxy/index'
import type { Agent } from 'http'
const logger = createLogger('agent')

/**
 * Normalize the base URL for OpenAI SDK:
 * - URL ending with '#': strip '#', skip /v1 prefix (user wants direct path)
 * - URL already containing '/v1' path segment: use as-is
 * - Otherwise: auto-append /v1
 */
function normalizeBaseUrl(url: string | undefined): string | undefined {
  if (!url) return url
  const trimmed = url.trim()
  if (!trimmed) return trimmed

  // '#' at end = skip /v1 version prefix
  if (trimmed.endsWith('#')) {
    return trimmed.slice(0, -1)
  }

  // Check if URL already contains /v1 path segment
  try {
    const parsed = new URL(trimmed)
    const segments = parsed.pathname.split('/').filter(Boolean)
    if (segments.includes('v1')) {
      return trimmed
    }
  } catch {
    return trimmed
  }

  // Auto-add /v1
  const separator = trimmed.endsWith('/') ? '' : '/'
  return `${trimmed}${separator}v1`
}

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
        baseURL: normalizeBaseUrl(this.options.openAiBaseUrl),
        apiKey: this.options.openAiApiKey,
        apiVersion: this.options.azureApiVersion || azureOpenAiDefaultApiVersion,
        defaultHeaders: this.options.openAiHeaders,
        ...(httpAgent && { fetchOptions: { agent: httpAgent } as any }),
        timeout: timeoutMs
      })
    } else {
      this.client = new OpenAI({
        baseURL: normalizeBaseUrl(this.options.openAiBaseUrl),
        apiKey: this.options.openAiApiKey,
        defaultHeaders: this.options.openAiHeaders,
        ...(httpAgent && { fetchOptions: { agent: httpAgent } as any }),
        timeout: timeoutMs
      })
    }
  }

  @withRetry()
  async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
    const useResponsesApi = this.options.openAiModelInfo?.apiFormat === 'responses'

    if (useResponsesApi) {
      yield* this.createMessageViaResponses(systemPrompt, messages)
    } else {
      yield* this.createMessageViaChatCompletions(systemPrompt, messages)
    }
  }

  private async *createMessageViaChatCompletions(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
    const modelId = this.options.openAiModelId ?? ''
    const isDeepseekReasoner = modelId.includes('deepseek-reasoner')
    const isR1FormatRequired = this.options.openAiModelInfo?.isR1FormatRequired ?? false
    const isReasoningModelFamily = modelId.includes('o1') || modelId.includes('o3') || modelId.includes('o4')
    const isGpt5OrAbove = modelId.startsWith('gpt-5') || modelId.startsWith('gpt-6')
    const supportsTemperature = !isReasoningModelFamily && !isGpt5OrAbove

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
      reasoningEffort = (this.options.o3MiniReasoningEffort as ChatCompletionReasoningEffort) || 'medium'
    }

    const stream = await this.client.chat.completions.create({
      model: modelId,
      messages: openAiMessages,
      ...(supportsTemperature && { temperature }),
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

  private async *createMessageViaResponses(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
    const modelId = this.options.openAiModelId ?? ''
    const isReasoningModelFamily = modelId.includes('o1') || modelId.includes('o3') || modelId.includes('o4')
    const isGpt5OrAbove = modelId.startsWith('gpt-5') || modelId.startsWith('gpt-6')
    const supportsTemperature = !isReasoningModelFamily && !isGpt5OrAbove
    const temperature: number | undefined = this.options.openAiModelInfo?.temperature ?? openAiModelInfoSaneDefaults.temperature
    let maxTokens: number | undefined

    if (this.options.openAiModelInfo?.maxTokens && this.options.openAiModelInfo.maxTokens > 0) {
      maxTokens = Number(this.options.openAiModelInfo.maxTokens)
    } else {
      maxTokens = undefined
    }

    const input = convertToResponsesInput(messages)
    const responseInput = systemPrompt ? [{ role: 'developer' as const, content: systemPrompt }, ...input] : input

    const stream = await this.client.responses.create({
      model: modelId,
      input: responseInput,
      ...(supportsTemperature && temperature !== undefined && { temperature }),
      ...(maxTokens !== undefined && { max_output_tokens: maxTokens }),
      stream: true
    })

    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') {
        yield { type: 'text', text: event.delta }
      }

      if (event.type === 'response.reasoning_text.delta') {
        yield { type: 'reasoning', reasoning: event.delta }
      }

      if (event.type === 'response.completed') {
        const usage = event.response.usage
        yield {
          type: 'usage',
          inputTokens: usage?.input_tokens || 0,
          outputTokens: usage?.output_tokens || 0,
          reasoningTokens: usage?.output_tokens_details?.reasoning_tokens || 0
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

      const useResponsesApi = this.options.openAiModelInfo?.apiFormat === 'responses'

      if (useResponsesApi) {
        await this.client.responses.create({
          model: this.options.openAiModelId || '',
          input: 'test',
          max_output_tokens: 1
        })
      } else {
        await this.client.chat.completions.create({
          model: this.options.openAiModelId || '',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1
        })
      }
      return { isValid: true }
    } catch (error) {
      logger.error('OpenAI compatible configuration validation failed', { error: error })
      return {
        isValid: false,
        error: `Validation failed:  ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
}
