
export type ApiProvider = 'bedrock'

export type GlobalStateKey = 
  | 'apiProvider'
  | 'apiModelId'
  | 'awsRegion'
  | 'awsUseCrossRegionInference'
  | 'awsBedrockUsePromptCache'
  | 'awsBedrockEndpoint'
  | 'awsProfile'
  | 'awsUseProfile'
  | 'awsBedrockCustomSelected'
  | 'awsBedrockCustomModelBaseId'
  | 'customInstructions'
  | 'taskHistory'
  | 'autoApprovalSettings'
  | 'chatSettings'
  | 'userInfo'
  | 'previousModeApiProvider'
  | 'previousModeModelId'
  | 'previousModeModelInfo'
  | 'previousModeThinkingBudgetTokens'
  | 'previousModeReasoningEffort'
  | 'previousModeAwsBedrockCustomSelected'
  | 'previousModeAwsBedrockCustomModelBaseId'
  | 'telemetrySetting'
  | 'thinkingBudgetTokens'
  | 'reasoningEffort'
  | 'favoritedModelIds'
  | 'requestTimeoutMs'
  | 'shellIntegrationTimeout'
  | 'mcpMarketplaceEnabled'
  | 'testGlobalKey' // 用于测试

export type SecretKey =
  | 'apiKey'
  | 'openRouterApiKey'
  | 'awsAccessKey'
  | 'awsSecretKey'
  | 'awsSessionToken'
  | 'openAiApiKey'
  | 'geminiApiKey'
  | 'openAiNativeApiKey'
  | 'deepSeekApiKey'
  | 'requestyApiKey'
  | 'togetherApiKey'
  | 'qwenApiKey'
  | 'doubaoApiKey'
  | 'mistralApiKey'
  | 'clineApiKey'
  | 'liteLlmApiKey'
  | 'fireworksApiKey'
  | 'asksageApiKey'
  | 'xaiApiKey'
  | 'sambanovaApiKey'
  | 'testSecretKey' // 用于测试

export interface ApiHandlerOptions {
  apiModelId?: string
  taskId?: string
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
  requestTimeoutMs?: number
  onRetryAttempt?: (attempt: number, maxRetries: number, delay: number, error: any) => void
}

export type ApiConfiguration = ApiHandlerOptions & {
  apiProvider?: ApiProvider
  favoritedModelIds?: string[]
} 