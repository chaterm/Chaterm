import OpenAI from 'openai'
import type { EmbeddingProvider } from './types'

const MAX_BATCH_SIZE = 10 // text-embedding-v4 supports up to 10 inputs per request
const MAX_RETRIES = 3
const INITIAL_DELAY_MS = 500

export class QwenEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'qwen'
  readonly model = 'text-embedding-v4'
  readonly dims = 1024

  private client: OpenAI

  constructor(apiKey: string, baseUrl: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`
    })
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const allEmbeddings: number[][] = []

    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
      const batch = texts.slice(i, i + MAX_BATCH_SIZE)
      const embeddings = await this.embedWithRetry(batch)
      allEmbeddings.push(...embeddings)
    }

    return allEmbeddings
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vec] = await this.embedBatch([text])
    return vec
  }

  private async embedWithRetry(texts: string[]): Promise<number[][]> {
    let delay = INITIAL_DELAY_MS
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const resp = await this.client.embeddings.create({
          model: this.model,
          input: texts
        })
        return resp.data
          .slice()
          .sort((a, b) => a.index - b.index)
          .map((d) => d.embedding)
      } catch (err) {
        if (attempt === MAX_RETRIES - 1) throw err
        await new Promise((r) => setTimeout(r, delay))
        delay *= 4
      }
    }
    throw new Error('unreachable')
  }
}
