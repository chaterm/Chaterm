import { ref, watch, computed } from 'vue'
import { createGlobalState } from '@vueuse/core'
import { getGlobalState, updateGlobalState, storeSecret, getSecret } from '@renderer/agent/storage/state'

const logger = createRendererLogger('ai.modelConfig')
import { GlobalStateKey, SecretKey } from '@renderer/agent/storage/state-keys'
import { notification } from 'ant-design-vue'
import { getUser } from '@api/user/user'
import { focusChatInput } from './useTabManagement'
import { useSessionState } from './useSessionState'
import eventBus from '@/utils/eventBus'
import { isEnterpriseDeployEnabled as isEnterpriseDeployEnabledFromEdition } from '@/utils/edition'

interface ModelSelectOption {
  label: string
  value: string
}

export interface ModelOption {
  id: string
  name: string
  checked: boolean
  type: string
  apiProvider: string
  contextWindow?: number
  maxTokens?: number
}

type PersistedModelLimits = Record<string, Pick<ModelOption, 'contextWindow' | 'maxTokens'>>

interface EnterpriseModelConfig {
  modelName: string
  provider: string
  baseUrl?: string
  apiKey?: string
  apiFormat?: string
  awsAccessKey?: string
  awsSecretKey?: string
  awsRegion?: string
  awsSessionToken?: string
  awsBedrockEndpoint?: string
  awsUseCrossRegionInference?: boolean
}

interface UserInfoPayload {
  models?: unknown[]
  subscriptionModels?: unknown[]
  llmGatewayAddr?: string
  key?: string
  budgetResetAt?: string
  subscription?: string
  enterpriseModelConfigs?: unknown[]
  enterpriseModelConfigVersion?: string | number
}

const isEmptyValue = (value: unknown): boolean => value === undefined || value === ''
const ENTERPRISE_MODEL_ID_PREFIX = 'enterprise:'
const ENTERPRISE_SYNC_INTERVAL_MS = 60_000
const ENTERPRISE_RUNTIME_GLOBAL_KEYS: GlobalStateKey[] = [
  'apiProvider',
  'apiModelId',
  'awsRegion',
  'awsUseCrossRegionInference',
  'awsBedrockEndpoint',
  'awsEndpointSelected',
  'openAiBaseUrl',
  'openAiModelId',
  'openAiModelInfo',
  'ollamaModelId',
  'ollamaBaseUrl',
  'anthropicBaseUrl',
  'anthropicModelId',
  'liteLlmBaseUrl',
  'liteLlmModelId'
]
const ENTERPRISE_RUNTIME_SECRET_KEYS: SecretKey[] = [
  'awsAccessKey',
  'awsSecretKey',
  'awsSessionToken',
  'openAiApiKey',
  'deepSeekApiKey',
  'anthropicApiKey',
  'liteLlmApiKey'
]

let enterpriseSyncTimer: ReturnType<typeof setInterval> | null = null
let enterpriseSyncInFlight = false

export function isEnterpriseDeployEnabled(): boolean {
  return isEnterpriseDeployEnabledFromEdition()
}

export function normalizeProvider(rawProvider: unknown): string {
  const provider = String(rawProvider || '')
    .trim()
    .toLowerCase()
  if (provider === 'openai-compatible') return 'openai'
  if (provider === 'anthropic-compatible') return 'anthropic'
  return provider || 'default'
}

export function normalizeModelName(rawModel: unknown): string {
  if (typeof rawModel === 'string') return rawModel.trim()
  if (!rawModel || typeof rawModel !== 'object') return ''
  const model = rawModel as Record<string, unknown>
  return String(model.name || model.modelName || model.modelId || model.id || '').trim()
}

export function normalizeModelType(rawType: unknown): string {
  const type = String(rawType || 'standard')
    .trim()
    .toLowerCase()
  if (type === 'reranker') return 'rerank'
  return type || 'standard'
}

function normalizeTokenLimit(value: unknown): number | undefined {
  const limit = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(limit) && limit > 0 ? limit : undefined
}

function normalizeModelLimits(rawModel: Record<string, unknown>): Pick<ModelOption, 'contextWindow' | 'maxTokens'> {
  const modelInfo = rawModel.modelInfo && typeof rawModel.modelInfo === 'object' ? (rawModel.modelInfo as Record<string, unknown>) : undefined
  const contextWindow = normalizeTokenLimit(
    rawModel.contextWindow ?? rawModel.maxContextTokens ?? rawModel.max_input_tokens ?? modelInfo?.contextWindow ?? modelInfo?.max_input_tokens
  )
  const maxTokens = normalizeTokenLimit(
    rawModel.maxTokens ?? rawModel.maxOutputTokens ?? rawModel.max_output_tokens ?? modelInfo?.maxTokens ?? modelInfo?.max_output_tokens
  )

  return {
    ...(contextWindow ? { contextWindow } : {}),
    ...(maxTokens ? { maxTokens } : {})
  }
}

function normalizePersistedModelLimits(value: unknown): PersistedModelLimits {
  if (!value || typeof value !== 'object') return {}

  const normalized: PersistedModelLimits = {}
  for (const [modelName, rawLimits] of Object.entries(value as Record<string, unknown>)) {
    if (!rawLimits || typeof rawLimits !== 'object') continue
    const limits = normalizeModelLimits(rawLimits as Record<string, unknown>)
    if (limits.contextWindow || limits.maxTokens) {
      normalized[modelName] = limits
    }
  }
  return normalized
}

function applyPersistedModelLimits(model: ModelOption, persistedModelLimits: PersistedModelLimits): ModelOption {
  const limits = persistedModelLimits[model.name]
  if (!limits) return model

  return {
    ...model,
    ...(limits.contextWindow ? { contextWindow: limits.contextWindow } : {}),
    ...(limits.maxTokens ? { maxTokens: limits.maxTokens } : {})
  }
}

export function isServerManagedModelType(type: string | undefined): boolean {
  return type === 'standard' || type === 'rerank'
}

export function normalizeUserModelOption(rawModel: unknown): ModelOption | null {
  const name = normalizeModelName(rawModel)
  if (!name) return null

  if (typeof rawModel === 'string') {
    return {
      id: name,
      name,
      checked: true,
      type: 'standard',
      apiProvider: 'default'
    }
  }

  const model = rawModel as Record<string, unknown>
  return {
    id: String(model.id || name),
    name,
    checked: true,
    type: normalizeModelType(model.type || model.modelType),
    apiProvider: normalizeProvider(model.apiProvider || model.provider),
    ...normalizeModelLimits(model)
  }
}

export function normalizeUserModelOptions(rawModels: unknown): ModelOption[] {
  if (!Array.isArray(rawModels)) return []
  return rawModels.map(normalizeUserModelOption).filter((model): model is ModelOption => Boolean(model))
}

export function normalizeModelNames(rawModels: unknown[]): string[] {
  return rawModels.map(normalizeModelName).filter(Boolean)
}

function isEnterpriseModelOption(model: Pick<ModelOption, 'id'> | undefined): boolean {
  return Boolean(model?.id && String(model.id).startsWith(ENTERPRISE_MODEL_ID_PREFIX))
}

function normalizeEnterpriseModelConfigs(rawConfigs: unknown): EnterpriseModelConfig[] {
  if (!Array.isArray(rawConfigs)) return []

  const normalizedConfigs: EnterpriseModelConfig[] = []
  for (const item of rawConfigs) {
    const config = item as Record<string, unknown>
    const modelName = String(config?.modelName || '').trim()
    const provider = normalizeProvider(config?.provider)
    if (!modelName || !provider) {
      continue
    }

    normalizedConfigs.push({
      modelName,
      provider,
      baseUrl: String(config?.baseUrl || '').trim() || undefined,
      apiKey: String(config?.apiKey || '').trim() || undefined,
      apiFormat: String(config?.apiFormat || '').trim() || undefined,
      awsAccessKey: String(config?.awsAccessKey || '').trim() || undefined,
      awsSecretKey: String(config?.awsSecretKey || '').trim() || undefined,
      awsRegion: String(config?.awsRegion || '').trim() || undefined,
      awsSessionToken: String(config?.awsSessionToken || '').trim() || undefined,
      awsBedrockEndpoint: String(config?.awsBedrockEndpoint || '').trim() || undefined,
      awsUseCrossRegionInference: typeof config?.awsUseCrossRegionInference === 'boolean' ? config.awsUseCrossRegionInference : undefined
    })
  }

  return normalizedConfigs
}

function buildEnterpriseConfigSignature(configs: EnterpriseModelConfig[], version?: string | number): string {
  const normalizedVersion = String(version ?? '').trim()
  if (normalizedVersion) {
    return normalizedVersion
  }

  const stableConfigs = configs
    .slice()
    .sort((left, right) => {
      const leftKey = `${left.provider}:${left.modelName}`
      const rightKey = `${right.provider}:${right.modelName}`
      return leftKey.localeCompare(rightKey)
    })
    .map((config) => ({
      modelName: config.modelName,
      provider: config.provider,
      baseUrl: config.baseUrl || '',
      apiKey: config.apiKey || '',
      apiFormat: config.apiFormat || '',
      awsAccessKey: config.awsAccessKey || '',
      awsSecretKey: config.awsSecretKey || '',
      awsRegion: config.awsRegion || '',
      awsSessionToken: config.awsSessionToken || '',
      awsBedrockEndpoint: config.awsBedrockEndpoint || '',
      awsUseCrossRegionInference: Boolean(config.awsUseCrossRegionInference)
    }))

  return JSON.stringify(stableConfigs)
}

function clearEnterpriseSyncTimer(): void {
  if (!enterpriseSyncTimer) return
  clearInterval(enterpriseSyncTimer)
  enterpriseSyncTimer = null
}

function ensureEnterpriseSyncTimer(): void {
  if (enterpriseSyncTimer) return

  enterpriseSyncTimer = setInterval(() => {
    if (enterpriseSyncInFlight) return
    enterpriseSyncInFlight = true
    void syncEnterpriseModelsFromServer({ reloadPlugins: true })
      .catch((error) => {
        logger.warn('Failed to poll enterprise model configuration', { error })
      })
      .finally(() => {
        enterpriseSyncInFlight = false
      })
  }, ENTERPRISE_SYNC_INTERVAL_MS)
}

async function removeEnterpriseModelOptions(): Promise<void> {
  const savedModelOptions = (((await getGlobalState('modelOptions')) || []) as ModelOption[]).filter((option) => !isEnterpriseModelOption(option))
  await updateGlobalState('modelOptions', savedModelOptions)
  eventBus.emit('SettingModelOptionsChanged')
}

async function clearEnterpriseRuntimeConfiguration(): Promise<void> {
  for (const key of ENTERPRISE_RUNTIME_GLOBAL_KEYS) {
    await updateGlobalState(key, undefined)
  }
  for (const key of ENTERPRISE_RUNTIME_SECRET_KEYS) {
    await storeSecret(key, undefined)
  }
}

async function cleanupEnterpriseManagedState(options: { preserveConfigs: boolean; clearRuntimeConfiguration?: boolean }): Promise<void> {
  clearEnterpriseSyncTimer()

  const savedModelOptions = (((await getGlobalState('modelOptions')) || []) as ModelOption[]) || []
  if (savedModelOptions.some((option) => isEnterpriseModelOption(option))) {
    await removeEnterpriseModelOptions()
  }

  if (options.clearRuntimeConfiguration !== false) {
    await clearEnterpriseRuntimeConfiguration()
  }
  await updateGlobalState('enterpriseModelPluginActive', false)
  await updateGlobalState('enterpriseModelPluginResolvedSignature', '')
  if (!options.preserveConfigs) {
    await updateGlobalState('enterpriseModelConfigs', [])
    await updateGlobalState('enterpriseModelConfigVersion', '')
  }
}

async function resetEnterpriseState(): Promise<void> {
  await cleanupEnterpriseManagedState({ preserveConfigs: false, clearRuntimeConfiguration: false })
}

async function maybeReloadEnterprisePlugins(shouldReload: boolean): Promise<void> {
  if (!shouldReload) return
  if (typeof window === 'undefined') {
    logger.warn('Plugin reload is unavailable while syncing enterprise models')
    return
  }
  const reloadPlugins = (window as unknown as { api?: { reloadPlugins?: () => Promise<void> } }).api?.reloadPlugins
  if (typeof reloadPlugins !== 'function') {
    logger.warn('Plugin reload is unavailable while syncing enterprise models')
    return
  }
  await reloadPlugins()
}

export async function syncEnterpriseStateFromUserData(
  userData: UserInfoPayload,
  options: { reloadPlugins?: boolean } = {}
): Promise<EnterpriseModelConfig[]> {
  if (!isEnterpriseDeployEnabled()) {
    await resetEnterpriseState()
    return []
  }

  const enterpriseModelConfigs = normalizeEnterpriseModelConfigs(userData.enterpriseModelConfigs)
  const signature = buildEnterpriseConfigSignature(enterpriseModelConfigs, userData.enterpriseModelConfigVersion)
  const resolvedSignature = String((await getGlobalState('enterpriseModelPluginResolvedSignature')) || '')

  await updateGlobalState('enterpriseModelConfigs', enterpriseModelConfigs)
  await updateGlobalState('enterpriseModelConfigVersion', signature)

  if (enterpriseModelConfigs.length === 0) {
    await cleanupEnterpriseManagedState({ preserveConfigs: false })
    return []
  }

  ensureEnterpriseSyncTimer()

  const shouldReload = options.reloadPlugins !== false && signature !== resolvedSignature
  if (shouldReload) {
    await updateGlobalState('enterpriseModelPluginActive', false)
    await maybeReloadEnterprisePlugins(true)
    await updateGlobalState('enterpriseModelPluginResolvedSignature', signature)
  }

  if (shouldReload) {
    eventBus.emit('SettingModelOptionsChanged')
  }

  return enterpriseModelConfigs
}

export async function syncEnterpriseModelsFromServer(options: { reloadPlugins?: boolean } = {}): Promise<UserInfoPayload | undefined> {
  const response = await getUser({})
  const userData = (response?.data || {}) as UserInfoPayload
  await syncEnterpriseStateFromUserData(userData, options)
  return userData
}

/**
 * Fetch model info from LiteLLM gateway /model/info endpoint.
 * Returns a map of model name to { contextWindow, maxTokens }.
 * Silently returns empty map on failure to avoid blocking main flow.
 */
async function fetchDefaultModelInfoMap(baseUrl: string, apiKey: string): Promise<Record<string, { contextWindow?: number; maxTokens?: number }>> {
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), 10_000)
  try {
    const url = `${baseUrl.replace(/\/+$/, '')}/model/info`
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: abortController.signal
    })
    if (!response.ok) {
      logger.warn('Failed to fetch model info from gateway', { status: response.status })
      return {}
    }
    const json = await response.json()
    const data = json?.data
    if (!Array.isArray(data)) return {}

    const map: Record<string, { contextWindow?: number; maxTokens?: number }> = {}
    for (const item of data) {
      const name = item?.model_name
      const info = item?.model_info
      if (!name || !info) continue
      const maxInputTokens = info.max_input_tokens
      const maxOutputTokens = info.max_output_tokens
      if (maxInputTokens == null && maxOutputTokens == null) continue
      const entry: { contextWindow?: number; maxTokens?: number } = {}
      const parsedMaxInputTokens = Number(maxInputTokens)
      const parsedMaxOutputTokens = Number(maxOutputTokens)
      if (Number.isSafeInteger(parsedMaxInputTokens) && parsedMaxInputTokens > 0) {
        entry.contextWindow = parsedMaxInputTokens
      }
      if (Number.isSafeInteger(parsedMaxOutputTokens) && parsedMaxOutputTokens > 0) {
        entry.maxTokens = parsedMaxOutputTokens
      }
      if (entry.contextWindow || entry.maxTokens) {
        map[name] = entry
      }
    }
    return map
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    logger.warn('Error fetching model info from gateway', { error: message })
    return {}
  } finally {
    clearTimeout(timeoutId)
  }
}

function hasCachedModelInfoMap(value: unknown): boolean {
  return !!value && typeof value === 'object' && Object.keys(value as Record<string, unknown>).length > 0
}

/**
 * Refresh default model info map asynchronously.
 * This must not block model options initialization/refresh flow.
 */
function refreshDefaultModelInfoMapInBackground(baseUrl?: string, apiKey?: string): void {
  void (async () => {
    if (!baseUrl || !apiKey) {
      await updateGlobalState('defaultModelInfoMap', {})
      return
    }
    const cachedModelInfoMap = await getGlobalState('defaultModelInfoMap')
    if (hasCachedModelInfoMap(cachedModelInfoMap)) {
      return
    }
    const modelInfoMap = await fetchDefaultModelInfoMap(baseUrl, apiKey)
    await updateGlobalState('defaultModelInfoMap', modelInfoMap)
  })().catch((error) => {
    const message = error instanceof Error ? error.message : 'unknown error'
    logger.warn('Failed to refresh default model info map', { error: message })
  })
}

/**
 * Mapping from API provider to corresponding model ID global state key
 */
export const PROVIDER_MODEL_KEY_MAP: Record<string, GlobalStateKey> = {
  anthropic: 'anthropicModelId',
  bedrock: 'apiModelId',
  litellm: 'liteLlmModelId',
  deepseek: 'apiModelId',
  openai: 'openAiModelId',
  ollama: 'ollamaModelId',
  default: 'defaultModelId'
}

/**
 * Composable for AI model configuration management
 * Handles model selection, configuration and initialization
 */
export const useModelConfiguration = createGlobalState(() => {
  const { chatAiModelValue } = useSessionState()

  const AgentAiModelsOptions = ref<ModelSelectOption[]>([])
  const lockedModels = ref<string[]>([])
  /** Full list of locked model names from server (subscription but not available); used to include newly checked locked models in dropdown locked section */
  const allLockedNames = ref<string[]>([])
  const budgetResetAt = ref<string>('')
  const subscription = ref<string>('')
  const modelsLoading = ref(true)

  const handleChatAiModelChange = async () => {
    const modelOptions = ((await getGlobalState('modelOptions')) as ModelOption[]) || []
    const selectedModel = modelOptions.find((model) => model.name === chatAiModelValue.value)

    if (selectedModel && selectedModel.apiProvider) {
      await updateGlobalState('apiProvider', selectedModel.apiProvider)
    }

    const apiProvider = selectedModel?.apiProvider
    const key = PROVIDER_MODEL_KEY_MAP[apiProvider || 'default'] || 'defaultModelId'
    await updateGlobalState(key, chatAiModelValue.value)

    focusChatInput()
  }

  const initModel = async () => {
    try {
      const modelOptions = ((await getGlobalState('modelOptions')) || []) as ModelOption[]

      modelOptions.sort((a, b) => {
        const aIsThinking = a.name.endsWith('-Thinking')
        const bIsThinking = b.name.endsWith('-Thinking')

        if (aIsThinking && !bIsThinking) return -1
        if (!aIsThinking && bIsThinking) return 1

        return a.name.localeCompare(b.name)
      })

      // Always derive lockedModels from full list + current checked state (so newly checked locked models show as locked in dropdown)
      lockedModels.value = allLockedNames.value.filter((name) => {
        const opt = modelOptions.find((o) => o.name === name)
        return opt && opt.checked
      })
      const lockedSet = new Set(lockedModels.value)
      AgentAiModelsOptions.value = modelOptions
        .filter((item) => item.checked && item.type !== 'rerank' && !lockedSet.has(item.name))
        .map((item) => ({
          label: item.name,
          value: item.name
        }))

      const availableModelNames = AgentAiModelsOptions.value.map((option) => option.value)

      // If no available models, keep existing behavior and bail out
      if (availableModelNames.length === 0) {
        return
      }

      let targetModel: string | undefined

      // 1. Prefer current tab model if it is still valid (in available and not locked)
      if (chatAiModelValue.value && availableModelNames.includes(chatAiModelValue.value)) {
        targetModel = chatAiModelValue.value
      } else {
        // 2. Try to use the model saved for current apiProvider
        const apiProvider = (await getGlobalState('apiProvider')) as string
        const key = PROVIDER_MODEL_KEY_MAP[apiProvider || 'default'] || 'defaultModelId'
        const storedModelId = (await getGlobalState(key)) as string

        if (storedModelId && availableModelNames.includes(storedModelId)) {
          targetModel = storedModelId
        } else {
          // 3. Fallback: use the first available model
          targetModel = AgentAiModelsOptions.value[0]?.label
        }
      }

      if (!targetModel) {
        return
      }

      // Only update when necessary, but always sync global provider/model
      if (chatAiModelValue.value !== targetModel) {
        chatAiModelValue.value = targetModel
      }
      await handleChatAiModelChange()
    } finally {
      modelsLoading.value = false
    }
  }

  const checkModelConfig = async (): Promise<{ success: boolean; message?: string; description?: string }> => {
    // Check if there are any available models
    const modelOptions = (await getGlobalState('modelOptions')) as ModelOption[]
    const availableModels = modelOptions.filter((model) => model.checked && model.type !== 'rerank')

    if (availableModels.length === 0) {
      return {
        success: false,
        message: 'user.noAvailableModelMessage',
        description: 'user.noAvailableModelDescription'
      }
    }

    const apiProvider = (await getGlobalState('apiProvider')) as string

    switch (apiProvider) {
      case 'bedrock':
        const awsAccessKey = await getSecret('awsAccessKey')
        const awsSecretKey = await getSecret('awsSecretKey')
        const awsRegion = await getGlobalState('awsRegion')
        const apiModelId = await getGlobalState('apiModelId')
        if (isEmptyValue(apiModelId) || isEmptyValue(awsAccessKey) || isEmptyValue(awsSecretKey) || isEmptyValue(awsRegion)) {
          return {
            success: false,
            message: 'user.checkModelConfigFailMessage',
            description: 'user.checkModelConfigFailDescription'
          }
        }
        break
      case 'litellm':
        const liteLlmBaseUrl = await getGlobalState('liteLlmBaseUrl')
        const liteLlmApiKey = await getSecret('liteLlmApiKey')
        const liteLlmModelId = await getGlobalState('liteLlmModelId')
        if (isEmptyValue(liteLlmBaseUrl) || isEmptyValue(liteLlmApiKey) || isEmptyValue(liteLlmModelId)) {
          return {
            success: false,
            message: 'user.checkModelConfigFailMessage',
            description: 'user.checkModelConfigFailDescription'
          }
        }
        break
      case 'deepseek':
        const deepSeekApiKey = await getSecret('deepSeekApiKey')
        const apiModelIdDeepSeek = await getGlobalState('apiModelId')
        if (isEmptyValue(deepSeekApiKey) || isEmptyValue(apiModelIdDeepSeek)) {
          return {
            success: false,
            message: 'user.checkModelConfigFailMessage',
            description: 'user.checkModelConfigFailDescription'
          }
        }
        break
      case 'openai':
        const openAiBaseUrl = await getGlobalState('openAiBaseUrl')
        const openAiApiKey = await getSecret('openAiApiKey')
        const openAiModelId = await getGlobalState('openAiModelId')
        if (isEmptyValue(openAiBaseUrl) || isEmptyValue(openAiApiKey) || isEmptyValue(openAiModelId)) {
          return {
            success: false,
            message: 'user.checkModelConfigFailMessage',
            description: 'user.checkModelConfigFailDescription'
          }
        }
        break
      case 'anthropic':
        const anthropicApiKey = await getSecret('anthropicApiKey')
        const anthropicModelId = await getGlobalState('anthropicModelId')
        if (isEmptyValue(anthropicApiKey) || isEmptyValue(anthropicModelId)) {
          return {
            success: false,
            message: 'user.checkModelConfigFailMessage',
            description: 'user.checkModelConfigFailDescription'
          }
        }
        break
    }
    return { success: true }
  }

  const initModelOptions = async () => {
    try {
      modelsLoading.value = true
      const isSkippedLogin = localStorage.getItem('login-skipped') === 'true'
      const initialSavedModelOptions = ((await getGlobalState('modelOptions')) || []) as ModelOption[]
      logger.info('savedModelOptions', { data: initialSavedModelOptions })

      // Skip loading built-in models if user skipped login
      if (isSkippedLogin) {
        return
      }

      if (initialSavedModelOptions.length !== 0) {
        const [gatewayAddr, gatewayKey] = await Promise.all([
          getGlobalState('defaultBaseUrl') as Promise<string | undefined>,
          getSecret('defaultApiKey')
        ])
        refreshDefaultModelInfoMapInBackground(gatewayAddr, gatewayKey)
        return
      }

      const res = await getUser({})
      logger.info('getUser response', { data: res })
      const userData = (res?.data || {}) as UserInfoPayload
      const persistedModelLimits = normalizePersistedModelLimits(await getGlobalState('modelLimits'))
      const enterpriseModelConfigs = await syncEnterpriseStateFromUserData(userData, { reloadPlugins: true })
      const enterprisePluginActive =
        isEnterpriseDeployEnabled() && enterpriseModelConfigs.length > 0 && Boolean(await getGlobalState('enterpriseModelPluginActive'))
      const defaultModelOptions = enterprisePluginActive
        ? []
        : normalizeUserModelOptions(userData.models).map((model) => applyPersistedModelLimits(model, persistedModelLimits))
      const subscriptionModelsList = enterprisePluginActive ? [] : normalizeModelNames(userData.subscriptionModels || [])
      const gatewayAddr = userData.llmGatewayAddr || ''
      const gatewayKey = userData.key || ''
      await updateGlobalState('defaultBaseUrl', gatewayAddr)
      await storeSecret('defaultApiKey', gatewayKey)

      const availableSet = new Set(defaultModelOptions.map((model) => model.name))
      allLockedNames.value = enterprisePluginActive ? [] : subscriptionModelsList.filter((model) => !availableSet.has(model))
      budgetResetAt.value = userData.budgetResetAt || ''
      subscription.value = userData.subscription || ''
      await updateGlobalState('defaultLockedModelNames', allLockedNames.value)

      if (enterprisePluginActive) {
        refreshDefaultModelInfoMapInBackground(gatewayAddr, gatewayKey)
        return
      }

      const modelOptions: ModelOption[] = defaultModelOptions
      const lockedModelOptions: ModelOption[] = allLockedNames.value.map((model) =>
        applyPersistedModelLimits(
          {
            id: model,
            name: model,
            checked: true,
            type: 'standard',
            apiProvider: 'default'
          },
          persistedModelLimits
        )
      )

      const serializableModelOptions = [...modelOptions, ...lockedModelOptions].map((model) => ({
        id: model.id,
        name: model.name,
        checked: Boolean(model.checked),
        type: model.type || 'standard',
        apiProvider: model.apiProvider || 'default',
        ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
        ...(model.maxTokens ? { maxTokens: model.maxTokens } : {})
      }))

      await updateGlobalState('modelOptions', serializableModelOptions)

      // Refresh model context info asynchronously to avoid blocking model options init.
      refreshDefaultModelInfoMapInBackground(gatewayAddr, gatewayKey)
    } catch (error) {
      logger.error('Failed to get/save model options', { error: error })
      notification.error({
        message: 'Error',
        description: 'Failed to get/save model options'
      })
      modelsLoading.value = false
    }
  }

  const refreshModelOptions = async (): Promise<void> => {
    const isSkippedLogin = localStorage.getItem('login-skipped') === 'true'
    if (isSkippedLogin) return

    let serverModelOptions: ModelOption[] = []
    let subscriptionModelsList: string[] = []
    let enterpriseModelConfigs: EnterpriseModelConfig[] = []
    let gatewayAddr = ''
    let gatewayKey = ''
    try {
      const res = await getUser({})
      const userData = (res?.data || {}) as UserInfoPayload
      enterpriseModelConfigs = await syncEnterpriseStateFromUserData(userData, { reloadPlugins: true })
      const enterprisePluginActive =
        isEnterpriseDeployEnabled() && enterpriseModelConfigs.length > 0 && Boolean(await getGlobalState('enterpriseModelPluginActive'))
      serverModelOptions = enterprisePluginActive ? [] : normalizeUserModelOptions(userData.models)
      subscriptionModelsList = enterprisePluginActive ? [] : normalizeModelNames(userData.subscriptionModels || [])
      budgetResetAt.value = userData.budgetResetAt || ''
      subscription.value = userData.subscription || ''
      gatewayAddr = userData.llmGatewayAddr || ''
      gatewayKey = userData.key || ''
      await updateGlobalState('defaultBaseUrl', gatewayAddr)
      await storeSecret('defaultApiKey', gatewayKey)

      if (enterprisePluginActive) {
        allLockedNames.value = []
        lockedModels.value = []
        await updateGlobalState('defaultLockedModelNames', [])
        await initModel()
        return
      }
    } catch (error) {
      logger.error('Failed to refresh model options', { error: error })
      return
    }

    // Refresh model context info asynchronously to avoid blocking model options refresh.
    refreshDefaultModelInfoMapInBackground(gatewayAddr, gatewayKey)

    const availableSet = new Set(serverModelOptions.map((model) => model.name))
    const lockedFromServer = subscriptionModelsList.filter((m) => !availableSet.has(m))
    allLockedNames.value = lockedFromServer
    await updateGlobalState('defaultLockedModelNames', lockedFromServer)

    // Skip update if server returns empty list to avoid accidental clearing
    if (enterpriseModelConfigs.length === 0 && serverModelOptions.length === 0 && subscriptionModelsList.length === 0) {
      lockedModels.value = []
      return
    }

    const savedModelOptions = ((await getGlobalState('modelOptions')) || []) as ModelOption[]
    const persistedModelLimits = normalizePersistedModelLimits(await getGlobalState('modelLimits'))
    const allKnownSet = new Set([...serverModelOptions.map((model) => model.name), ...subscriptionModelsList])
    const enterpriseModelNames = new Set(enterpriseModelConfigs.map((config) => config.modelName))

    const existingStandard = savedModelOptions.filter((opt) => isServerManagedModelType(opt.type) && !isEnterpriseModelOption(opt))
    const existingEnterprise = savedModelOptions.filter((opt) => isEnterpriseModelOption(opt))
    const existingCustom = savedModelOptions.filter((opt) => !isServerManagedModelType(opt.type))

    const retainedStandard = existingStandard
      .filter((opt) => {
        if (enterpriseModelConfigs.length > 0) {
          return !enterpriseModelNames.has(opt.name)
        }
        return allKnownSet.has(opt.name)
      })
      .map((opt) =>
        applyPersistedModelLimits(
          {
            id: opt.id || opt.name,
            name: opt.name,
            checked: Boolean(opt.checked),
            type: opt.type || 'standard',
            apiProvider: opt.apiProvider || 'default',
            ...(opt.contextWindow ? { contextWindow: opt.contextWindow } : {}),
            ...(opt.maxTokens ? { maxTokens: opt.maxTokens } : {})
          },
          persistedModelLimits
        )
      )

    const retainedNames = new Set(retainedStandard.map((opt) => opt.name))

    const newAvailable = (enterpriseModelConfigs.length > 0 ? [] : serverModelOptions)
      .filter((model) => !retainedNames.has(model.name))
      .map((model) => applyPersistedModelLimits(model, persistedModelLimits))

    const allAddedNames = new Set([...retainedNames, ...newAvailable.map((o) => o.name)])
    const newLocked = (enterpriseModelConfigs.length > 0 ? [] : lockedFromServer)
      .filter((name) => !allAddedNames.has(name))
      .map((name) =>
        applyPersistedModelLimits(
          {
            id: name,
            name,
            checked: true,
            type: 'standard',
            apiProvider: 'default'
          },
          persistedModelLimits
        )
      )

    const updatedOptions = [
      ...retainedStandard,
      ...newAvailable,
      ...newLocked,
      ...existingEnterprise.map((model) => applyPersistedModelLimits(model, persistedModelLimits)),
      ...existingCustom.map((model) => applyPersistedModelLimits(model, persistedModelLimits))
    ]
    await updateGlobalState('modelOptions', updatedOptions)

    // Compute locked models filtered by checked state
    if (enterpriseModelConfigs.length > 0) {
      lockedModels.value = []
    } else if (lockedFromServer.length > 0) {
      lockedModels.value = lockedFromServer.filter((name) => {
        const opt = updatedOptions.find((o) => o.name === name)
        return !opt || opt.checked
      })
    } else {
      lockedModels.value = []
    }

    await initModel()
  }

  // Check if there are available models
  const hasAvailableModels = computed(() => {
    if (modelsLoading.value) {
      return true
    }
    return AgentAiModelsOptions.value && AgentAiModelsOptions.value.length > 0
  })

  // Auto-switch to first available model when selected model is locked or invalid
  watch(
    [AgentAiModelsOptions, lockedModels],
    ([newOptions, newLocked]) => {
      if (newOptions.length > 0) {
        const current = chatAiModelValue.value
        const isInAvailable = newOptions.some((opt) => opt.value === current)
        const isInLocked = (newLocked || []).includes(current)
        const isInvalid = !current || !isInAvailable || isInLocked
        if (isInvalid && newOptions[0]) {
          chatAiModelValue.value = newOptions[0].value
          handleChatAiModelChange()
        }
      }
    },
    { immediate: true }
  )

  const showLockedModelUpgradeTag = computed(() => {
    if (isEnterpriseDeployEnabled()) return false
    const sub = (subscription.value || '').toLowerCase()
    return sub === 'free' || sub === 'lite'
  })

  return {
    AgentAiModelsOptions,
    lockedModels,
    budgetResetAt,
    showLockedModelUpgradeTag,
    modelsLoading,
    hasAvailableModels,
    initModel,
    handleChatAiModelChange,
    checkModelConfig,
    initModelOptions,
    refreshModelOptions
  }
})
