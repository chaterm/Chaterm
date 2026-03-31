import type { EmbeddingProvider, EmbeddingConfig } from './types'
import { QwenEmbeddingProvider } from './embedding-qwen'
import { OpenAIEmbeddingProvider } from './embedding-openai'

export { type EmbeddingProvider }

export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider {
  if (config.region === 'cn') {
    return new QwenEmbeddingProvider(config.apiKey, config.baseUrl)
  }
  return new OpenAIEmbeddingProvider(config.apiKey, config.baseUrl)
}
