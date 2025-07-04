export type ApiStream = AsyncGenerator<ApiStreamChunk>
export type ApiStreamChunk = ApiStreamTextChunk | ApiStreamReasoningChunk | ApiStreamUsageChunk

export interface ApiStreamTextChunk {
  type: 'text'
  text: string
}

export interface ApiStreamReasoningChunk {
  type: 'reasoning'
  reasoning: string
}

export interface ApiStreamUsageChunk {
  type: 'usage'
  inputTokens: number
  outputTokens: number
  cacheWriteTokens?: number
  cacheReadTokens?: number
  reasoningTokens?: number // for reasoning models like o1, o3, etc.
  totalCost?: number // openrouter
}
