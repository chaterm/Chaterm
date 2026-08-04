import type { ApiProvider } from './api'

export interface KbRerankModelSelection {
  provider: ApiProvider
  modelId: string
  modelType?: string
}

export interface KbRerankConfig {
  version: 2
  model?: KbRerankModelSelection
}

export const DEFAULT_KB_RERANK_CONFIG: KbRerankConfig = {
  version: 2
}
