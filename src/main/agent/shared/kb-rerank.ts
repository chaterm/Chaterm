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

export type KbRerankEdition = 'cn' | 'global'

const DEFAULT_KB_RERANK_MODELS: Record<KbRerankEdition, KbRerankModelSelection> = {
  cn: { provider: 'default', modelId: 'Qwen-Plus', modelType: 'standard' },
  global: { provider: 'default', modelId: 'gemini-2.5-flash', modelType: 'standard' }
}

export const getDefaultKbRerankConfig = (edition: KbRerankEdition): KbRerankConfig => ({
  version: 2,
  model: { ...DEFAULT_KB_RERANK_MODELS[edition] }
})
