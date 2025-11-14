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

export function buildApiHandler(configuration: ApiConfiguration): ApiHandler {
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
