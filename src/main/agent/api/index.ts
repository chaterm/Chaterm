import { Anthropic } from '@anthropic-ai/sdk'
import { ApiConfiguration, ModelInfo } from '../shared/api'
import { AwsBedrockHandler } from './providers/bedrock'
import { LiteLlmHandler } from './providers/litellm'
import { DeepSeekHandler } from './providers/deepseek'
import { OpenAiHandler } from './providers/openai'
import { OllamaHandler } from './providers/ollama'
import { ApiStream, ApiStreamUsageChunk } from './transform/stream'

export interface ApiHandler {
  createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream
  getModel(): { id: string; info: ModelInfo }
  getApiStreamUsage?(): Promise<ApiStreamUsageChunk | undefined>
  validateApiKey(): Promise<{ isValid: boolean; error?: string }>
}

export interface SingleCompletionHandler {
  completePrompt(prompt: string): Promise<string>
}

class MockApiHandler implements ApiHandler {
  private lastUsage?: ApiStreamUsageChunk

  async *createMessage(_systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
    const last = messages[messages.length - 1]
    const lastText =
      typeof last?.content === 'string'
        ? last.content
        : Array.isArray(last?.content)
          ? last.content
              .map((c: any) => (typeof c?.text === 'string' ? c.text : ''))
              .filter(Boolean)
              .join(' ')
          : ''

    const reply = /\bping\b/i.test(lastText) ? 'pong' : 'ok'

    // Keep it deterministic and lightweight for CI smoke
    yield { type: 'text', text: reply }
    this.lastUsage = { type: 'usage', inputTokens: 1, outputTokens: 1 }
    yield this.lastUsage
  }

  getModel(): { id: string; info: ModelInfo } {
    return {
      id: 'mock-llm',
      info: {
        supportsPromptCache: false,
        maxTokens: 8192,
        contextWindow: 8192,
        description: 'Deterministic mock LLM for tests'
      }
    }
  }

  async getApiStreamUsage(): Promise<ApiStreamUsageChunk | undefined> {
    return this.lastUsage
  }

  async validateApiKey(): Promise<{ isValid: boolean; error?: string }> {
    return { isValid: true }
  }
}

export function buildApiHandler(configuration: ApiConfiguration): ApiHandler {
  if (process.env.CHATERM_TEST_MOCK_LLM === '1') {
    return new MockApiHandler()
  }

  const { apiProvider, ...options } = configuration
  switch (apiProvider) {
    case 'bedrock':
      return new AwsBedrockHandler(options)
    case 'litellm':
      return LiteLlmHandler.createSync(options)
    case 'deepseek':
      return new DeepSeekHandler(options)
    case 'openai':
      return new OpenAiHandler(options)
    case 'ollama':
      return new OllamaHandler(options)
    case 'default':
      return LiteLlmHandler.createSync({
        ...options,
        liteLlmModelId: options.defaultModelId,
        liteLlmBaseUrl: options.defaultBaseUrl,
        liteLlmApiKey: options.defaultApiKey
      })
    default:
      throw new Error(`Unsupported API provider: ${apiProvider}`)
  }
}
