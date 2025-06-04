import { Anthropic } from '@anthropic-ai/sdk'
import { ApiConfiguration, ModelInfo } from '../shared/api'
import { AwsBedrockHandler } from './providers/bedrock'
import { LiteLlmHandler } from './providers/litellm'
import { ApiStream, ApiStreamUsageChunk } from './transform/stream'

export interface ApiHandler {
  createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream
  getModel(): { id: string; info: ModelInfo }
  getApiStreamUsage?(): Promise<ApiStreamUsageChunk | undefined>
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
      return new LiteLlmHandler(options)
    default:
      return new AwsBedrockHandler(options)
  }
}
