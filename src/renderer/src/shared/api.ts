export type ApiProvider = 'bedrock'

export interface ApiHandlerOptions {
  apiModelId?: string
  taskId?: string // Used to identify the task in API requests
  awsAccessKey?: string
  awsSecretKey?: string
  awsSessionToken?: string
  awsRegion?: string
  awsUseCrossRegionInference?: boolean
  awsBedrockUsePromptCache?: boolean
  awsUseProfile?: boolean
  awsProfile?: string
  awsBedrockEndpoint?: string
  thinkingBudgetTokens?: number
  reasoningEffort?: string
}

export type ApiConfiguration = ApiHandlerOptions & {
  apiProvider?: ApiProvider
  favoritedModelIds?: string[]
}

// Models

interface PriceTier {
  tokenLimit: number // Upper limit (inclusive) of *input* tokens for this price. Use Infinity for the highest tier.
  price: number // Price per million tokens for this tier.
}

export interface ModelInfo {
  maxTokens?: number
  contextWindow?: number
  supportsImages?: boolean
  supportsComputerUse?: boolean
  supportsPromptCache: boolean // this value is hardcoded for now
  inputPrice?: number // Keep for non-tiered input models
  inputPriceTiers?: PriceTier[] // Add for tiered input pricing
  outputPrice?: number // Keep for non-tiered output models
  outputPriceTiers?: PriceTier[] // Add for tiered output pricing
  cacheWritesPrice?: number
  cacheReadsPrice?: number
  description?: string
}

// AWS Bedrock
// https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html
export type BedrockModelId = keyof typeof bedrockModels
export const bedrockDefaultModelId: BedrockModelId = 'anthropic.claude-3-7-sonnet-20250219-v1:0'
export const bedrockModels = {
  'amazon.nova-pro-v1:0': {
    maxTokens: 5000,
    contextWindow: 300_000,
    supportsImages: true,
    supportsComputerUse: false,
    supportsPromptCache: false,
    inputPrice: 0.8,
    outputPrice: 3.2
  },
  'amazon.nova-lite-v1:0': {
    maxTokens: 5000,
    contextWindow: 300_000,
    supportsImages: true,
    supportsComputerUse: false,
    supportsPromptCache: false,
    inputPrice: 0.06,
    outputPrice: 0.24
  },
  'amazon.nova-micro-v1:0': {
    maxTokens: 5000,
    contextWindow: 128_000,
    supportsImages: false,
    supportsComputerUse: false,
    supportsPromptCache: false,
    inputPrice: 0.035,
    outputPrice: 0.14
  },
  'anthropic.claude-3-7-sonnet-20250219-v1:0': {
    maxTokens: 8192,
    contextWindow: 200_000,
    supportsImages: true,
    supportsComputerUse: true,
    supportsPromptCache: true,
    inputPrice: 3.0,
    outputPrice: 15.0,
    cacheWritesPrice: 3.75,
    cacheReadsPrice: 0.3
  },
  'anthropic.claude-3-5-sonnet-20241022-v2:0': {
    maxTokens: 8192,
    contextWindow: 200_000,
    supportsImages: true,
    supportsComputerUse: true,
    supportsPromptCache: true,
    inputPrice: 3.0,
    outputPrice: 15.0,
    cacheWritesPrice: 3.75,
    cacheReadsPrice: 0.3
  },
  'anthropic.claude-3-5-haiku-20241022-v1:0': {
    maxTokens: 8192,
    contextWindow: 200_000,
    supportsImages: false,
    supportsPromptCache: true,
    inputPrice: 1.0,
    outputPrice: 5.0,
    cacheWritesPrice: 1.0,
    cacheReadsPrice: 0.08
  },
  'anthropic.claude-3-5-sonnet-20240620-v1:0': {
    maxTokens: 8192,
    contextWindow: 200_000,
    supportsImages: true,
    supportsPromptCache: false,
    inputPrice: 3.0,
    outputPrice: 15.0
  },
  'anthropic.claude-3-opus-20240229-v1:0': {
    maxTokens: 4096,
    contextWindow: 200_000,
    supportsImages: true,
    supportsPromptCache: false,
    inputPrice: 15.0,
    outputPrice: 75.0
  },
  'anthropic.claude-3-sonnet-20240229-v1:0': {
    maxTokens: 4096,
    contextWindow: 200_000,
    supportsImages: true,
    supportsPromptCache: false,
    inputPrice: 3.0,
    outputPrice: 15.0
  },
  'anthropic.claude-3-haiku-20240307-v1:0': {
    maxTokens: 4096,
    contextWindow: 200_000,
    supportsImages: true,
    supportsPromptCache: false,
    inputPrice: 0.25,
    outputPrice: 1.25
  },
  'deepseek.r1-v1:0': {
    maxTokens: 8_000,
    contextWindow: 64_000,
    supportsImages: false,
    supportsPromptCache: false,
    inputPrice: 1.35,
    outputPrice: 5.4
  }
} as const satisfies Record<string, ModelInfo>
