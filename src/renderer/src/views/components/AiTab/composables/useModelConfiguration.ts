import { ref, watch } from 'vue'
import { getGlobalState, updateGlobalState, storeSecret, getSecret } from '@renderer/agent/storage/state'
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
 * Composable for AI model configuration management
 * Handles model selection, configuration and initialization
 */
export function useModelConfiguration() {
  const { chatAiModelValue } = useSessionState()

  const AgentAiModelsOptions = ref<ModelSelectOption[]>([])

  const PROVIDER_MODEL_KEY_MAP: Record<string, GlobalStateKey> = {
    bedrock: 'apiModelId',
    litellm: 'liteLlmModelId',
    deepseek: 'apiModelId',
    openai: 'openAiModelId',
    default: 'defaultModelId'
  }

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
    // 先初始化模型选项列表
    const modelOptions = (await getGlobalState('modelOptions')) as ModelOption[]

    modelOptions.sort((a, b) => {
      const aIsThinking = a.name.endsWith('-Thinking')
      const bIsThinking = b.name.endsWith('-Thinking')

      if (aIsThinking && !bIsThinking) return -1
      if (!aIsThinking && bIsThinking) return 1

      return a.name.localeCompare(b.name)
    })

    AgentAiModelsOptions.value = modelOptions
      .filter((item) => item.checked)
      .map((item) => ({
        label: item.name,
        value: item.name
      }))

    if (chatAiModelValue.value && chatAiModelValue.value !== '') {
      const isValidModel = AgentAiModelsOptions.value.some((option) => option.value === chatAiModelValue.value)
      if (isValidModel) {
        return
      }
    }

    const apiProvider = (await getGlobalState('apiProvider')) as string
    const key = PROVIDER_MODEL_KEY_MAP[apiProvider || 'default'] || 'defaultModelId'
    chatAiModelValue.value = (await getGlobalState(key)) as string

    if ((chatAiModelValue.value === undefined || chatAiModelValue.value === '') && AgentAiModelsOptions.value[0]) {
      chatAiModelValue.value = AgentAiModelsOptions.value[0].label
      await handleChatAiModelChange()
    }
  }

  const checkModelConfig = async (): Promise<boolean> => {
    const apiProvider = (await getGlobalState('apiProvider')) as string

    switch (apiProvider) {
      case 'bedrock':
        const awsAccessKey = await getSecret('awsAccessKey')
        const awsSecretKey = await getSecret('awsSecretKey')
        const awsRegion = await getGlobalState('awsRegion')
        const apiModelId = await getGlobalState('apiModelId')
        if (isEmptyValue(apiModelId) || isEmptyValue(awsAccessKey) || isEmptyValue(awsSecretKey) || isEmptyValue(awsRegion)) {
          return false
        }
        break
      case 'litellm':
        const liteLlmBaseUrl = await getGlobalState('liteLlmBaseUrl')
        const liteLlmApiKey = await getSecret('liteLlmApiKey')
        const liteLlmModelId = await getGlobalState('liteLlmModelId')
        if (isEmptyValue(liteLlmBaseUrl) || isEmptyValue(liteLlmApiKey) || isEmptyValue(liteLlmModelId)) {
          return false
        }
        break
      case 'deepseek':
        const deepSeekApiKey = await getSecret('deepSeekApiKey')
        const apiModelIdDeepSeek = await getGlobalState('apiModelId')
        if (isEmptyValue(deepSeekApiKey) || isEmptyValue(apiModelIdDeepSeek)) {
          return false
        }
        break
      case 'openai':
        const openAiBaseUrl = await getGlobalState('openAiBaseUrl')
        const openAiApiKey = await getSecret('openAiApiKey')
        const openAiModelId = await getGlobalState('openAiModelId')
        if (isEmptyValue(openAiBaseUrl) || isEmptyValue(openAiApiKey) || isEmptyValue(openAiModelId)) {
          return false
        }
        break
    }
    return true
  }

  const initModelOptions = async () => {
    try {
      const savedModelOptions = ((await getGlobalState('modelOptions')) || []) as ModelOption[]
      console.log('savedModelOptions', savedModelOptions)

      if (savedModelOptions.length !== 0) {
        return
      }

      let defaultModels: DefaultModel[] = []

      await getUser({}).then((res) => {
        console.log('res', res)
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
      console.error('Failed to get/save model options:', error)
      notification.error({
        message: 'Error',
        description: 'Failed to get/save model options'
      })
    }
  }

  watch(
    AgentAiModelsOptions,
    async (newOptions) => {
      if (newOptions.length > 0) {
        const isCurrentValueValid = newOptions.some((option) => option.value === chatAiModelValue.value)
        if (!isCurrentValueValid && newOptions[0]) {
          chatAiModelValue.value = ''
        }
      }
    },
    { immediate: true }
  )

  return {
    AgentAiModelsOptions,
    initModel,
    handleChatAiModelChange,
    checkModelConfig,
    initModelOptions
  }
}
