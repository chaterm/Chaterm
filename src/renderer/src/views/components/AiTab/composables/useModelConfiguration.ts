import { ref, watch, computed } from 'vue'
import { createGlobalState } from '@vueuse/core'
import { getGlobalState, updateGlobalState, storeSecret, getSecret } from '@renderer/agent/storage/state'

const logger = createRendererLogger('ai.modelConfig')
import { GlobalStateKey } from '@renderer/agent/storage/state-keys'
import { notification } from 'ant-design-vue'
import { getUser } from '@api/user/user'
import { focusChatInput } from './useTabManagement'
import { useSessionState } from './useSessionState'

interface ModelSelectOption {
  label: string
  value: string
}

interface ModelOption {
  id: string
  name: string
  checked: boolean
  type: string
  apiProvider: string
}

interface DefaultModel {
  id: string
  name?: string
  provider?: string
  [key: string]: unknown
}

const isEmptyValue = (value: unknown): boolean => value === undefined || value === ''

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
    const modelOptions = (await getGlobalState('modelOptions')) as ModelOption[]
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

      // Bootstrap full locked list from server when empty (e.g. user opened settings before AI panel)
      if (allLockedNames.value.length === 0) {
        try {
          const res = await getUser({})
          const serverModels = (res?.data?.models || []).map((m: unknown) => String(m))
          const subscriptionModelsList = (res?.data?.subscriptionModels || []).map((m: unknown) => String(m))
          const availableSet = new Set(serverModels)
          allLockedNames.value = subscriptionModelsList.filter((m: string) => !availableSet.has(m))
        } catch {
          // ignore
        }
      }
      // Always derive lockedModels from full list + current checked state (so newly checked locked models show as locked in dropdown)
      lockedModels.value = allLockedNames.value.filter((name) => {
        const opt = modelOptions.find((o) => o.name === name)
        return opt && opt.checked
      })
      const lockedSet = new Set(lockedModels.value)
      AgentAiModelsOptions.value = modelOptions
        .filter((item) => item.checked && !lockedSet.has(item.name))
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
    const availableModels = modelOptions.filter((model) => model.checked)

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
      const savedModelOptions = ((await getGlobalState('modelOptions')) || []) as ModelOption[]
      logger.info('savedModelOptions', { data: savedModelOptions })

      if (savedModelOptions.length !== 0) {
        return
      }

      // Skip loading built-in models if user skipped login
      if (isSkippedLogin) {
        // Initialize with empty model options for guest users
        await updateGlobalState('modelOptions', [])
        return
      }

      let defaultModels: DefaultModel[] = []

      await getUser({}).then((res) => {
        logger.info('getUser response', { data: res })
        defaultModels = res?.data?.models || []
        updateGlobalState('defaultBaseUrl', res?.data?.llmGatewayAddr)
        storeSecret('defaultApiKey', res?.data?.key)
      })

      const modelOptions: ModelOption[] = defaultModels.map((model) => ({
        id: String(model) || '',
        name: String(model) || '',
        checked: true,
        type: 'standard',
        apiProvider: 'default'
      }))

      const serializableModelOptions = modelOptions.map((model) => ({
        id: model.id,
        name: model.name,
        checked: Boolean(model.checked),
        type: model.type || 'standard',
        apiProvider: model.apiProvider || 'default'
      }))

      await updateGlobalState('modelOptions', serializableModelOptions)
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

    let serverModels: string[] = []
    let subscriptionModelsList: string[] = []
    try {
      const res = await getUser({})
      serverModels = (res?.data?.models || []).map((model) => String(model))
      subscriptionModelsList = (res?.data?.subscriptionModels || []).map((m: unknown) => String(m))
      budgetResetAt.value = res?.data?.budgetResetAt || ''
      subscription.value = res?.data?.subscription || ''
      await updateGlobalState('defaultBaseUrl', res?.data?.llmGatewayAddr)
      await storeSecret('defaultApiKey', res?.data?.key)
    } catch (error) {
      logger.error('Failed to refresh model options', { error: error })
      return
    }

    const availableSet = new Set(serverModels)
    const lockedFromServer = subscriptionModelsList.filter((m) => !availableSet.has(m))
    allLockedNames.value = lockedFromServer

    // Skip update if server returns empty list to avoid accidental clearing
    if (serverModels.length === 0 && subscriptionModelsList.length === 0) {
      lockedModels.value = []
      return
    }

    const savedModelOptions = ((await getGlobalState('modelOptions')) || []) as ModelOption[]
    const allKnownSet = new Set([...serverModels, ...subscriptionModelsList])

    const existingStandard = savedModelOptions.filter((opt) => opt.type === 'standard')
    const existingCustom = savedModelOptions.filter((opt) => opt.type !== 'standard')

    const retainedStandard = existingStandard
      .filter((opt) => allKnownSet.has(opt.name))
      .map((opt) => ({
        id: opt.id || opt.name,
        name: opt.name,
        checked: Boolean(opt.checked),
        type: 'standard',
        apiProvider: opt.apiProvider || 'default'
      }))

    const retainedNames = new Set(retainedStandard.map((opt) => opt.name))

    const newAvailable = serverModels
      .filter((name) => !retainedNames.has(name))
      .map((name) => ({
        id: name,
        name,
        checked: true,
        type: 'standard',
        apiProvider: 'default'
      }))

    const allAddedNames = new Set([...retainedNames, ...newAvailable.map((o) => o.name)])
    const newLocked = lockedFromServer
      .filter((name) => !allAddedNames.has(name))
      .map((name) => ({
        id: name,
        name,
        checked: true,
        type: 'standard',
        apiProvider: 'default'
      }))

    const updatedOptions = [...retainedStandard, ...newAvailable, ...newLocked, ...existingCustom]
    await updateGlobalState('modelOptions', updatedOptions)

    // Compute locked models filtered by checked state
    if (lockedFromServer.length > 0) {
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
