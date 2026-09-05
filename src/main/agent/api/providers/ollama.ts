import type { Anthropic } from '@anthropic-ai/sdk'
import { Message, Ollama } from 'ollama'
import type { ApiHandler } from '../'
import type { ApiHandlerOptions, ModelInfo } from '../../shared/api'
import { openAiModelInfoSaneDefaults } from '../../shared/api'
import { convertToOllamaMessages } from '../transform/ollama-format'
import type { ApiStream } from '../transform/stream'
import { withRetry } from '../retry'
const logger = createLogger('agent')

export class OllamaHandler implements ApiHandler {
  private options: ApiHandlerOptions
  private client: Ollama

  constructor(options: ApiHandlerOptions) {
    this.options = options
    this.client = new Ollama({ host: this.options.ollamaBaseUrl || 'http://localhost:11434' })
  }

  @withRetry({ retryAllErrors: true })
  async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
    const ollamaMessages: Message[] = [{ role: 'system', content: systemPrompt }, ...convertToOllamaMessages(messages)]

    try {
      // Create a promise that rejects after timeout
      const timeoutMs = this.options.requestTimeoutMs || 30000
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Ollama request timed out after ${timeoutMs / 1000} seconds`)), timeoutMs)
      })

      // Create the actual API request promise
      const model = this.getModel()
      const apiPromise = this.client.chat({
        model: model.id,
        messages: ollamaMessages,
        stream: true,
        options: {
          num_ctx: Number(this.options.ollamaApiOptionsCtxNum) || this.options.ollamaModelInfo?.contextWindow || 32768,
          ...(model.info.maxTokens && model.info.maxTokens > 0 ? { num_predict: model.info.maxTokens } : {})
        }
      })

      // Race the API request against the timeout
      const stream = (await Promise.race([apiPromise, timeoutPromise])) as Awaited<typeof apiPromise>

      try {
        for await (const chunk of stream) {
          if (typeof chunk.message.content === 'string') {
            yield {
              type: 'text',
              text: chunk.message.content
            }
          }

          // Handle token usage if available
          if (chunk.eval_count !== undefined || chunk.prompt_eval_count !== undefined) {
            yield {
              type: 'usage',
              inputTokens: chunk.prompt_eval_count || 0,
              outputTokens: chunk.eval_count || 0
            }
          }
        }
      } catch (streamError: unknown) {
        logger.error('Error processing Ollama stream', { error: streamError })
        const errorMessage = streamError instanceof Error ? streamError.message : 'Unknown error'
        throw new Error(`Ollama stream processing error: ${errorMessage}`)
      }
    } catch (error: unknown) {
      // Check if it's a timeout error
      if (error instanceof Error && error.message.includes('timed out')) {
        const timeoutMs = this.options.requestTimeoutMs || 30000
        throw new Error(`Ollama request timed out after ${timeoutMs / 1000} seconds`)
      }

      // Enhance error reporting
      const errorWithStatus = error as { status?: number; statusCode?: number }
      const statusCode = errorWithStatus?.status || errorWithStatus?.statusCode
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      logger.error(`Ollama API error (${statusCode || 'unknown'}): ${errorMessage}`)
      throw error
    }
  }

  getModel(): { id: string; info: ModelInfo } {
    const configuredContextWindow = Number(this.options.ollamaApiOptionsCtxNum)
    const modelContextWindow = configuredContextWindow > 0 ? configuredContextWindow : this.options.ollamaModelInfo?.contextWindow || 32768
    return {
      id: this.options.ollamaModelId || '',
      info: {
        ...openAiModelInfoSaneDefaults,
        contextWindow: modelContextWindow,
        ...(this.options.ollamaModelInfo || {})
      }
    }
  }

  async validateApiKey(): Promise<{ isValid: boolean; error?: string }> {
    try {
      // For Ollama, we validate by checking if the service is accessible
      // and if the specified model is available
      const modelId = this.options.ollamaModelId || ''

      if (!modelId) {
        return {
          isValid: false,
          error: 'Ollama model ID is required'
        }
      }

      // Try to list models to verify Ollama service is accessible
      const models = await this.client.list()

      // Check if the specified model exists
      const modelExists = models.models.some((model) => model.name === modelId)

      if (!modelExists) {
        return {
          isValid: false,
          error: `Model '${modelId}' not found. Available models: ${models.models.map((m) => m.name).join(', ')}`
        }
      }

      return { isValid: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Ollama configuration validation failed', {
        event: 'ollama.validate.failed',
        message: errorMessage,
        status: (error as { status?: number })?.status
      })
      return {
        isValid: false,
        error: `Validation failed: ${errorMessage}`
      }
    }
  }
}
