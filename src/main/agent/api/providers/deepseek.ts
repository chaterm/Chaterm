//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0
//
// Copyright (c) 2025 cline Authors, All rights reserved.
// Licensed under the Apache License, Version 2.0

import { Anthropic } from '@anthropic-ai/sdk'
import OpenAI, { type ClientOptions } from 'openai'
import { fetch as undiciFetch } from 'undici'
import { ApiHandler } from '../'
import { ApiHandlerOptions, DeepSeekModelId, ModelInfo, deepSeekModels } from '@shared/api'
import { calculateApiCostOpenAI } from '../../utils/cost'
import { convertToOpenAiMessages } from '../transform/openai-format'
import { ApiStream } from '../transform/stream'
import { checkProxyConnectivity, getSharedDispatcher, shouldUseProxy } from './proxy/index'
import { getToolMetadata, registeredToolNames } from '../../core/task/tool-registry'
import type { ToolUseName } from '../../core/assistant-message'
import { encodeNativeParam } from '../../shared/native-tools'
const logger = createLogger('agent')

const NATIVE_TOOL_INSTRUCTION = `
# Native tool calling

Native functions are available for every Chaterm tool documented above. Call the function whose name matches the tool you need and pass its parameters as a JSON object. Do not write XML or DSML tool markup in message content. When the task is complete, call the attempt_completion function.
`

interface NativeToolCall {
  id: string
  name: string
  arguments: string
}

/**
 * Build native function schemas from the tool registry. Descriptions live in
 * the system prompt; the schema only needs to expose the accepted parameter
 * names so the model can produce structured arguments.
 */
export function buildNativeTools(workspace: 'server' | 'database' = 'server'): OpenAI.Chat.ChatCompletionTool[] {
  return registeredToolNames
    .filter((name) => {
      const metadata = getToolMetadata(name)
      return !metadata || metadata.allowedIn.includes(workspace)
    })
    .map((name) => {
      const metadata = getToolMetadata(name)
      const properties: Record<string, { type: 'string' }> = {}
      for (const param of metadata?.paramNames ?? []) {
        properties[param] = { type: 'string' }
      }
      return {
        type: 'function' as const,
        function: {
          name,
          description: `Chaterm tool "${name}". Use the parameter names documented in the system prompt.`,
          parameters: {
            type: 'object',
            properties,
            additionalProperties: true
          }
        }
      }
    })
}

/**
 * Convert one native tool call into Chaterm's XML tool syntax. Parameter values
 * are base64 encoded so commands, file contents and JSON strings cannot break
 * the XML framing; the parser decodes them again.
 */
export function buildNativeToolXml(call: NativeToolCall | undefined): string {
  if (!call?.name) return ''
  const metadata = getToolMetadata(call.name as ToolUseName)
  if (!metadata) return ''

  let args: Record<string, unknown>
  try {
    args = JSON.parse(call.arguments || '{}')
  } catch {
    return ''
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) return ''

  const parts: string[] = []
  for (const param of metadata.paramNames) {
    const value = args[param]
    if (value === undefined || value === null) continue
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    if (text === undefined) continue
    parts.push(`<${param}>${encodeNativeParam(text)}</${param}>`)
  }

  // The model supplied arguments but none of them belong to this tool; let the
  // task retry instead of executing the tool with no parameters.
  if (parts.length === 0 && Object.keys(args).length > 0) return ''

  return `<${call.name}>${parts.join('')}</${call.name}>`
}

export class DeepSeekHandler implements ApiHandler {
  private options: ApiHandlerOptions
  private client: OpenAI

  constructor(options: ApiHandlerOptions) {
    this.options = options

    // Determine if a proxy is needed
    const dispatcher = shouldUseProxy(this.options) ? getSharedDispatcher(this.options.proxyConfig) : undefined
    logger.info('Using DeepSeekHandler', {
      event: 'deepseek.init',
      baseURL: 'https://api.deepseek.com/v1',
      hasApiKey: !!this.options.deepSeekApiKey,
      hasProxy: !!dispatcher
    })
    this.client = new OpenAI({
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: this.options.deepSeekApiKey,
      // undici v7's fetch only accepts dispatchers created by the same undici
      // copy, so ProxyAgent and fetch must come from this package together.
      fetch: undiciFetch as unknown as NonNullable<ClientOptions['fetch']>,
      ...(dispatcher ? { fetchOptions: { dispatcher } } : {})
    })
  }

  // Add API validation method
  async validateApiKey(): Promise<{ isValid: boolean; error?: string }> {
    try {
      const testSystemPrompt = "This is a connection test. Respond with only the word 'OK'."
      const testMessage = [{ role: 'user', content: 'Connection test' }] as Anthropic.Messages.MessageParam[]

      // Validate proxy
      if (shouldUseProxy(this.options)) {
        await checkProxyConnectivity(this.options.proxyConfig)
      }

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
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('DeepSeek configuration validation failed', {
        event: 'deepseek.validate.failed',
        message: errorMessage,
        status: (error as { status?: number })?.status
      })

      return {
        isValid: false,
        error: `Validation failed: ${errorMessage}`
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
    const nativeTools = this.options.useNativeTools === true
    const tools = nativeTools ? buildNativeTools(this.options.workspace ?? 'server') : undefined
    const effectiveSystemPrompt = nativeTools ? `${systemPrompt}\n\n${NATIVE_TOOL_INSTRUCTION}` : systemPrompt

    const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: effectiveSystemPrompt },
      ...convertToOpenAiMessages(messages)
    ]

    const stream = await this.client.chat.completions.create({
      model: model.id,
      // DeepSeek API expects `max_tokens` (1-393216); it does not document
      // the OpenAI `max_completion_tokens` alias.
      // https://api-docs.deepseek.com/zh-cn/api/create-chat-completion
      max_tokens: model.info.maxTokens,
      messages: openAiMessages,
      stream: true,
      stream_options: { include_usage: true },
      // Ignored in thinking mode, keeps non-thinking mode deterministic
      temperature: 0,
      // Thinking mode rejects tool_choice "required"; "auto" lets the model
      // choose a tool while keeping its reasoning context.
      ...(nativeTools && tools ? { tools, tool_choice: 'auto' as const } : {})
    })

    const pendingToolCalls = new Map<number, NativeToolCall>()

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

      if (nativeTools && delta?.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          const index = toolCall.index ?? 0
          const current = pendingToolCalls.get(index) ?? { id: '', name: '', arguments: '' }
          if (toolCall.id) current.id = toolCall.id
          if (toolCall.function?.name) current.name += toolCall.function.name
          if (toolCall.function?.arguments) current.arguments += toolCall.function.arguments
          pendingToolCalls.set(index, current)
        }
      }

      if (chunk.usage) {
        yield* this.yieldUsage(model.info, chunk.usage)
      }
    }

    if (nativeTools && pendingToolCalls.size > 0) {
      const calls = [...pendingToolCalls.values()]
      if (calls.length > 1) {
        logger.warn('DeepSeek returned multiple native tool calls; using the first', {
          event: 'deepseek.native_tools.multiple_calls',
          count: calls.length
        })
      }
      const toolXml = buildNativeToolXml(calls[0])
      if (toolXml) {
        yield {
          type: 'text',
          text: toolXml
        }
      }
    }
  }

  getModel(): { id: DeepSeekModelId; info: ModelInfo } {
    const modelId = this.options.apiModelId
    if (!modelId) {
      throw new Error('DeepSeek model ID is not configured')
    }

    if (!(modelId in deepSeekModels)) {
      const availableModels = Object.keys(deepSeekModels).join(', ')
      throw new Error(`Invalid DeepSeek model ID: "${modelId}". Available model IDs: ${availableModels}`)
    }

    const id = modelId as DeepSeekModelId
    return { id, info: { ...deepSeekModels[id], ...(this.options.deepSeekModelInfo || {}) } }
  }

  async fetchModels(): Promise<{ models: string[]; error?: string }> {
    try {
      const response = await this.client.models.list()
      const models = response.data.map((m) => m.id).sort()
      return { models }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { models: [], error: `Failed to fetch models: ${errorMessage}` }
    }
  }
}
