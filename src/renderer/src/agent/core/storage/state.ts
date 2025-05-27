import { DEFAULT_CHAT_SETTINGS } from '../../shared/ChatSettings'
//import { DEFAULT_BROWSER_SETTINGS } from '../../shared/BrowserSettings'
import { DEFAULT_AUTO_APPROVAL_SETTINGS } from '../../shared/AutoApprovalSettings'
import { GlobalStateKey, SecretKey } from './state-keys'
import { ApiConfiguration, ApiProvider, BedrockModelId, ModelInfo } from '../../shared/api'
import { HistoryItem } from '../../shared/HistoryItem'
import { AutoApprovalSettings } from '../../shared/AutoApprovalSettings'
//import { BrowserSettings } from '../../shared/BrowserSettings'
import { ChatSettings } from '../../shared/ChatSettings'
import { TelemetrySetting } from '../../shared/TelemetrySetting'
import { UserInfo } from '../../shared/UserInfo'
//import { ClineRulesToggles } from '../../shared/cline-rules'
import { storageContext } from './storage-context'

// global

export async function updateGlobalState(key: GlobalStateKey, value: any) {
  await storageContext.globalState.update(key, value)
}

export async function getGlobalState(key: GlobalStateKey) {
  return await storageContext.globalState.get(key)
}

// secrets

export async function storeSecret(key: SecretKey, value?: string) {
  if (value) {
    await storageContext.secrets.store(key, value)
  } else {
    await storageContext.secrets.delete(key)
  }
}

export async function getSecret(key: SecretKey) {
  return await storageContext.secrets.get(key)
}

// workspace

export async function updateWorkspaceState(key: string, value: any) {
  await storageContext.workspaceState.update(key, value)
}

export async function getWorkspaceState(key: string) {
  return await storageContext.workspaceState.get(key)
}

export async function getAllExtensionState() {
  const [
    storedApiProvider,
    apiModelId,
    apiKey,
    //openRouterApiKey,
    //clineApiKey,
    awsAccessKey,
    awsSecretKey,
    awsSessionToken,
    awsRegion,
    awsUseCrossRegionInference,
    awsBedrockUsePromptCache,
    awsBedrockEndpoint,
    awsProfile,
    awsUseProfile,
    awsBedrockCustomSelected,
    awsBedrockCustomModelBaseId,
    //vertexProjectId,
    //vertexRegion,
    //openAiBaseUrl,
    //openAiApiKey,
    //openAiModelId,
    //openAiModelInfo,
    //openAiHeaders,
    //ollamaModelId,
    //ollamaBaseUrl,
    //ollamaApiOptionsCtxNum,
    //lmStudioModelId,
    //lmStudioBaseUrl,
    //anthropicBaseUrl,
    //geminiApiKey,
    //geminiBaseUrl,
    //openAiNativeApiKey,
    //deepSeekApiKey,
    //requestyApiKey,
    //requestyModelId,
    //requestyModelInfo,
    //togetherApiKey,
    //togetherModelId,
    //qwenApiKey,
    //doubaoApiKey,
    //mistralApiKey,
    //azureApiVersion,
    //openRouterModelId,
    //openRouterModelInfo,
    //openRouterProviderSorting,
    //lastShownAnnouncementId,
    customInstructions,
    taskHistory,
    autoApprovalSettings,
    //browserSettings,
    chatSettings,
    //vsCodeLmModelSelector,
    //liteLlmBaseUrl,
    //liteLlmModelId,
    //liteLlmModelInfo,
    //liteLlmUsePromptCache,
    //fireworksApiKey,
    //fireworksModelId,
    //fireworksModelMaxCompletionTokens,
    //fireworksModelMaxTokens,
    userInfo,
    previousModeApiProvider,
    previousModeModelId,
    previousModeModelInfo,
    //previousModeVsCodeLmModelSelector,
    previousModeThinkingBudgetTokens,
    previousModeReasoningEffort,
    previousModeAwsBedrockCustomSelected,
    previousModeAwsBedrockCustomModelBaseId,
    //qwenApiLine,
    //liteLlmApiKey,
    telemetrySetting,
    //asksageApiKey,
    //asksageApiUrl,
    //xaiApiKey,
    thinkingBudgetTokens,
    reasoningEffort,
    //sambanovaApiKey,
    //planActSeparateModelsSettingRaw,
    favoritedModelIds,
    //globalClineRulesToggles,
    requestTimeoutMs,
    shellIntegrationTimeout
  ] = await Promise.all([
    getGlobalState('apiProvider') as Promise<ApiProvider | undefined>,
    getGlobalState('apiModelId') as Promise<string | undefined>,
    getSecret('apiKey') as Promise<string | undefined>,
    //getSecret('openRouterApiKey') as Promise<string | undefined>,
    //getSecret('clineApiKey') as Promise<string | undefined>,
    getSecret('awsAccessKey') as Promise<string | undefined>,
    getSecret('awsSecretKey') as Promise<string | undefined>,
    getSecret('awsSessionToken') as Promise<string | undefined>,
    getGlobalState('awsRegion') as Promise<string | undefined>,
    getGlobalState('awsUseCrossRegionInference') as Promise<boolean | undefined>,
    getGlobalState('awsBedrockUsePromptCache') as Promise<boolean | undefined>,
    getGlobalState('awsBedrockEndpoint') as Promise<string | undefined>,
    getGlobalState('awsProfile') as Promise<string | undefined>,
    getGlobalState('awsUseProfile') as Promise<boolean | undefined>,
    getGlobalState('awsBedrockCustomSelected') as Promise<boolean | undefined>,
    getGlobalState('awsBedrockCustomModelBaseId') as Promise<BedrockModelId | undefined>,
    //getGlobalState('vertexProjectId') as Promise<string | undefined>,
    //getGlobalState('vertexRegion') as Promise<string | undefined>,
    //getGlobalState('openAiBaseUrl') as Promise<string | undefined>,
    //getSecret('openAiApiKey') as Promise<string | undefined>,
    //getGlobalState('openAiModelId') as Promise<string | undefined>,
    //getGlobalState('openAiModelInfo') as Promise<ModelInfo | undefined>,
    //getGlobalState('openAiHeaders') as Promise<Record<string, string> | undefined>,
    //getGlobalState('ollamaModelId') as Promise<string | undefined>,
    //getGlobalState('ollamaBaseUrl') as Promise<string | undefined>,
    //getGlobalState('ollamaApiOptionsCtxNum') as Promise<string | undefined>,
    //getGlobalState('lmStudioModelId') as Promise<string | undefined>,
    //getGlobalState('lmStudioBaseUrl') as Promise<string | undefined>,
    //getGlobalState('anthropicBaseUrl') as Promise<string | undefined>,
    //getSecret('geminiApiKey') as Promise<string | undefined>,
    //getGlobalState('geminiBaseUrl') as Promise<string | undefined>,
    //getSecret('openAiNativeApiKey') as Promise<string | undefined>,
    //getSecret('deepSeekApiKey') as Promise<string | undefined>,
    //getSecret('requestyApiKey') as Promise<string | undefined>,
    //getGlobalState('requestyModelId') as Promise<string | undefined>,
    //getGlobalState('requestyModelInfo') as Promise<ModelInfo | undefined>,
    //getSecret('togetherApiKey') as Promise<string | undefined>,
    //getGlobalState('togetherModelId') as Promise<string | undefined>,
    //getSecret('qwenApiKey') as Promise<string | undefined>,
    //getSecret('doubaoApiKey') as Promise<string | undefined>,
    //getSecret('mistralApiKey') as Promise<string | undefined>,
    //getGlobalState('azureApiVersion') as Promise<string | undefined>,
    //getGlobalState('openRouterModelId') as Promise<string | undefined>,
    //getGlobalState('openRouterModelInfo') as Promise<ModelInfo | undefined>,
    //getGlobalState('openRouterProviderSorting') as Promise<string | undefined>,
    //getGlobalState('lastShownAnnouncementId') as Promise<string | undefined>,
    getGlobalState('customInstructions') as Promise<string | undefined>,
    getGlobalState('taskHistory') as Promise<HistoryItem[] | undefined>,
    getGlobalState('autoApprovalSettings') as Promise<AutoApprovalSettings | undefined>,
    //getGlobalState('browserSettings') as Promise<BrowserSettings | undefined>,
    getGlobalState('chatSettings') as Promise<ChatSettings | undefined>,
    //getGlobalState('vsCodeLmModelSelector') as Promise<any | undefined>,
    //getGlobalState('liteLlmBaseUrl') as Promise<string | undefined>,
    //getGlobalState('liteLlmModelId') as Promise<string | undefined>,
    //getGlobalState('liteLlmModelInfo') as Promise<ModelInfo | undefined>,
    //getGlobalState('liteLlmUsePromptCache') as Promise<boolean | undefined>,
    //getSecret('fireworksApiKey') as Promise<string | undefined>,
    //getGlobalState('fireworksModelId') as Promise<string | undefined>,
    //getGlobalState('fireworksModelMaxCompletionTokens') as Promise<number | undefined>,
    //getGlobalState('fireworksModelMaxTokens') as Promise<number | undefined>,
    getGlobalState('userInfo') as Promise<UserInfo | undefined>,
    getGlobalState('previousModeApiProvider') as Promise<ApiProvider | undefined>,
    getGlobalState('previousModeModelId') as Promise<string | undefined>,
    getGlobalState('previousModeModelInfo') as Promise<ModelInfo | undefined>,
    //getGlobalState('previousModeVsCodeLmModelSelector') as Promise<any | undefined>,
    getGlobalState('previousModeThinkingBudgetTokens') as Promise<number | undefined>,
    getGlobalState('previousModeReasoningEffort') as Promise<string | undefined>,
    getGlobalState('previousModeAwsBedrockCustomSelected') as Promise<boolean | undefined>,
    getGlobalState('previousModeAwsBedrockCustomModelBaseId') as Promise<
      BedrockModelId | undefined
    >,
    //getGlobalState('qwenApiLine') as Promise<string | undefined>,
    //getSecret('liteLlmApiKey') as Promise<string | undefined>,
    getGlobalState('telemetrySetting') as Promise<TelemetrySetting | undefined>,
    //getSecret('asksageApiKey') as Promise<string | undefined>,
    //getGlobalState('asksageApiUrl') as Promise<string | undefined>,
    //getSecret('xaiApiKey') as Promise<string | undefined>,
    getGlobalState('thinkingBudgetTokens') as Promise<number | undefined>,
    getGlobalState('reasoningEffort') as Promise<string | undefined>,
    //getSecret('sambanovaApiKey') as Promise<string | undefined>,
    //getGlobalState('planActSeparateModelsSetting') as Promise<boolean | undefined>,
    getGlobalState('favoritedModelIds') as Promise<string[] | undefined>,
    //getGlobalState('globalClineRulesToggles') as Promise<ClineRulesToggles | undefined>,
    getGlobalState('requestTimeoutMs') as Promise<number | undefined>,
    getGlobalState('shellIntegrationTimeout') as Promise<number | undefined>
  ])

  let apiProvider: ApiProvider

  if (storedApiProvider) {
    apiProvider = storedApiProvider
  } else {
    // Either new user or legacy user that doesn't have the apiProvider stored in state
    // (If they're using OpenRouter or Bedrock, then apiProvider state will exist)
    apiProvider = 'bedrock'
    // if (apiKey) {
    //   apiProvider = 'anthropic'
    // } else {
    //   // New users should default to openrouter, since they've opted to use an API key instead of signing in
    //   apiProvider = 'openrouter'
    // }
  }

  // const localClineRulesToggles = (await getWorkspaceState(
  //   'localClineRulesToggles'
  // )) as ClineRulesToggles

  const o3MiniReasoningEffort = 'medium'

  const mcpMarketplaceEnabled = true

  // Plan/Act separate models setting is a boolean indicating whether the user wants to use different models for plan and act. Existing users expect this to be enabled, while we want new users to opt in to this being disabled by default.
  // On win11 state sometimes initializes as empty string instead of undefined
  // let planActSeparateModelsSetting: boolean | undefined = undefined
  // if (planActSeparateModelsSettingRaw === true || planActSeparateModelsSettingRaw === false) {
  //   planActSeparateModelsSetting = planActSeparateModelsSettingRaw
  // } else {
  //   // default to true for existing users
  //   if (storedApiProvider) {
  //     planActSeparateModelsSetting = true
  //   } else {
  //     // default to false for new users
  //     planActSeparateModelsSetting = false
  //   }
  //   // this is a special case where it's a new state, but we want it to default to different values for existing and new users.
  //   // persist so next time state is retrieved it's set to the correct value.
  //   await updateGlobalState('planActSeparateModelsSetting', planActSeparateModelsSetting)
  // }

  return {
    apiConfiguration: {
      apiProvider,
      apiModelId,
      apiKey,
      //openRouterApiKey,
      //clineApiKey,
      awsAccessKey,
      awsSecretKey,
      awsSessionToken,
      awsRegion,
      awsUseCrossRegionInference,
      awsBedrockUsePromptCache,
      awsBedrockEndpoint,
      awsProfile,
      awsUseProfile,
      awsBedrockCustomSelected,
      awsBedrockCustomModelBaseId,
      //vertexProjectId,
      //vertexRegion,
      //openAiBaseUrl,
      //openAiApiKey,
      //openAiModelId,
      //openAiModelInfo,
      //openAiHeaders: openAiHeaders || {},
      //ollamaModelId,
      //ollamaBaseUrl,
      //ollamaApiOptionsCtxNum,
      //lmStudioModelId,
      //lmStudioBaseUrl,
      //anthropicBaseUrl,
      //geminiApiKey,
      //geminiBaseUrl,
      //openAiNativeApiKey,
      //deepSeekApiKey,
      //requestyApiKey,
      //requestyModelId,
      //requestyModelInfo,
      //togetherApiKey,
      //togetherModelId,
      //qwenApiKey,
      //qwenApiLine,
      //doubaoApiKey,
      //mistralApiKey,
      //azureApiVersion,
      //openRouterModelId,
      //openRouterModelInfo,
      //openRouterProviderSorting,
      //vsCodeLmModelSelector,
      o3MiniReasoningEffort,
      thinkingBudgetTokens,
      reasoningEffort,
      //liteLlmBaseUrl,
      //liteLlmModelId,
      //liteLlmModelInfo,
      //liteLlmApiKey,
      //liteLlmUsePromptCache,
      //fireworksApiKey,
      //fireworksModelId,
      //fireworksModelMaxCompletionTokens,
      //fireworksModelMaxTokens,
      //asksageApiKey,
      //asksageApiUrl,
      //xaiApiKey,
      //sambanovaApiKey,
      favoritedModelIds,
      requestTimeoutMs
    },
    //lastShownAnnouncementId,
    customInstructions,
    taskHistory,
    autoApprovalSettings: autoApprovalSettings || DEFAULT_AUTO_APPROVAL_SETTINGS, // default value can be 0 or empty string
    //globalClineRulesToggles: globalClineRulesToggles || {},
    //localClineRulesToggles: localClineRulesToggles || {},
    //browserSettings: { ...DEFAULT_BROWSER_SETTINGS, ...browserSettings }, // this will ensure that older versions of browserSettings (e.g. before remoteBrowserEnabled was added) are merged with the default values (false for remoteBrowserEnabled)
    chatSettings: chatSettings || DEFAULT_CHAT_SETTINGS,
    userInfo,
    previousModeApiProvider,
    previousModeModelId,
    previousModeModelInfo,
    //previousModeVsCodeLmModelSelector,
    previousModeThinkingBudgetTokens,
    previousModeReasoningEffort,
    previousModeAwsBedrockCustomSelected,
    previousModeAwsBedrockCustomModelBaseId,
    mcpMarketplaceEnabled,
    telemetrySetting: telemetrySetting || 'unset',
    //planActSeparateModelsSetting,
    shellIntegrationTimeout: shellIntegrationTimeout || 4000
  }
}

export async function updateApiConfiguration(apiConfiguration: ApiConfiguration) {
  const {
    apiProvider,
    apiModelId,
    // apiKey,
    awsAccessKey,
    awsSecretKey,
    awsSessionToken,
    awsRegion,
    awsUseCrossRegionInference,
    awsBedrockUsePromptCache,
    awsBedrockEndpoint,
    awsProfile,
    awsUseProfile,
    //awsBedrockCustomSelected,
    //awsBedrockCustomModelBaseId,
    thinkingBudgetTokens,
    reasoningEffort,
    favoritedModelIds
  } = apiConfiguration
  await updateGlobalState('apiProvider', apiProvider)
  await updateGlobalState('apiModelId', apiModelId)
  //await storeSecret('apiKey', apiKey)
  //await storeSecret('openRouterApiKey', openRouterApiKey)
  await storeSecret('awsAccessKey', awsAccessKey)
  await storeSecret('awsSecretKey', awsSecretKey)
  await storeSecret('awsSessionToken', awsSessionToken)
  await updateGlobalState('awsRegion', awsRegion)
  await updateGlobalState('awsUseCrossRegionInference', awsUseCrossRegionInference)
  await updateGlobalState('awsBedrockUsePromptCache', awsBedrockUsePromptCache)
  await updateGlobalState('awsBedrockEndpoint', awsBedrockEndpoint)
  await updateGlobalState('awsProfile', awsProfile)
  await updateGlobalState('awsUseProfile', awsUseProfile)
  //await updateGlobalState('awsBedrockCustomSelected', awsBedrockCustomSelected)
  //await updateGlobalState('awsBedrockCustomModelBaseId', awsBedrockCustomModelBaseId)
  //await updateGlobalState('vertexProjectId', vertexProjectId)
  //await updateGlobalState('vertexRegion', vertexRegion)
  //await updateGlobalState('openAiBaseUrl', openAiBaseUrl)
  //await storeSecret('openAiApiKey', openAiApiKey)
  //await updateGlobalState('openAiModelId', openAiModelId)
  //await updateGlobalState('openAiModelInfo', openAiModelInfo)
  //await updateGlobalState('openAiHeaders', openAiHeaders || {})
  //await updateGlobalState('ollamaModelId', ollamaModelId)
  //await updateGlobalState('ollamaBaseUrl', ollamaBaseUrl)
  //await updateGlobalState('ollamaApiOptionsCtxNum', ollamaApiOptionsCtxNum)
  //await updateGlobalState('lmStudioModelId', lmStudioModelId)
  //await updateGlobalState('lmStudioBaseUrl', lmStudioBaseUrl)
  //await updateGlobalState('anthropicBaseUrl', anthropicBaseUrl)
  //await storeSecret('geminiApiKey', geminiApiKey)
  //await updateGlobalState('geminiBaseUrl', geminiBaseUrl)
  //await storeSecret('openAiNativeApiKey', openAiNativeApiKey)
  //await storeSecret('deepSeekApiKey', deepSeekApiKey)
  //await storeSecret('requestyApiKey', requestyApiKey)
  //await storeSecret('togetherApiKey', togetherApiKey)
  //await storeSecret('qwenApiKey', qwenApiKey)
  //await storeSecret('doubaoApiKey', doubaoApiKey)
  //await storeSecret('mistralApiKey', mistralApiKey)
  //await storeSecret('liteLlmApiKey', liteLlmApiKey)
  //await storeSecret('xaiApiKey', xaiApiKey)
  //await updateGlobalState('azureApiVersion', azureApiVersion)
  //await updateGlobalState('openRouterModelId', openRouterModelId)
  //await updateGlobalState('openRouterModelInfo', openRouterModelInfo)
  //await updateGlobalState('openRouterProviderSorting', openRouterProviderSorting)
  //await updateGlobalState('vsCodeLmModelSelector', vsCodeLmModelSelector)
  //await updateGlobalState('liteLlmBaseUrl', liteLlmBaseUrl)
  //await updateGlobalState('liteLlmModelId', liteLlmModelId)
  //await updateGlobalState('liteLlmModelInfo', liteLlmModelInfo)
  //await updateGlobalState('liteLlmUsePromptCache', liteLlmUsePromptCache)
  //await updateGlobalState('qwenApiLine', qwenApiLine)
  //await updateGlobalState('requestyModelId', requestyModelId)
  //await updateGlobalState('requestyModelInfo', requestyModelInfo)
  //await updateGlobalState('togetherModelId', togetherModelId)
  //await storeSecret('asksageApiKey', asksageApiKey)
  //await updateGlobalState('asksageApiUrl', asksageApiUrl)
  await updateGlobalState('thinkingBudgetTokens', thinkingBudgetTokens)
  await updateGlobalState('reasoningEffort', reasoningEffort)
  //await storeSecret('clineApiKey', clineApiKey)
  //await storeSecret('sambanovaApiKey', sambanovaApiKey)
  await updateGlobalState('favoritedModelIds', favoritedModelIds)
  await updateGlobalState('requestTimeoutMs', apiConfiguration.requestTimeoutMs)
}

export async function resetExtensionState() {
  if (storageContext.globalState.keys) {
    const globalKeys = await storageContext.globalState.keys()
    for (const key of globalKeys) {
      await storageContext.globalState.update(key, undefined)
    }
  }
  const secretKeys: SecretKey[] = [
    'apiKey',
    'openRouterApiKey',
    'awsAccessKey',
    'awsSecretKey',
    'awsSessionToken',
    'openAiApiKey',
    'geminiApiKey',
    'openAiNativeApiKey',
    'deepSeekApiKey',
    'requestyApiKey',
    'togetherApiKey',
    'qwenApiKey',
    'doubaoApiKey',
    'mistralApiKey',
    'clineApiKey',
    'liteLlmApiKey',
    'fireworksApiKey',
    'asksageApiKey',
    'xaiApiKey',
    'sambanovaApiKey'
  ]
  for (const key of secretKeys) {
    await storageContext.secrets.delete(key)
  }

  if (storageContext.workspaceState.keys) {
    const workspaceKeys = await storageContext.workspaceState.keys()
    for (const key of workspaceKeys) {
      await storageContext.workspaceState.update(key, undefined)
    }
  }
}
