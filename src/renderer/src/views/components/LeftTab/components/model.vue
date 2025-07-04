<template>
  <div>
    <div class="section-header">
      <h3>{{ $t('user.modelNames') }}</h3>
    </div>
    <a-card
      class="settings-section"
      :bordered="false"
    >
      <div class="model-list">
        <div
          v-for="model in modelOptions"
          :key="model.id"
          class="model-item"
        >
          <a-checkbox
            v-model:checked="model.checked"
            @change="handleModelChange(model)"
          >
            {{ model.name }}
          </a-checkbox>
          <a-button
            v-if="model.checked && model.type === 'custom'"
            type="text"
            class="remove-button"
            @click="removeModel(model)"
          >
            <span class="remove-icon">×</span>
          </a-button>
        </div>
      </div>
    </a-card>
    <div>
      <div class="add-model-switch">
        <span class="switch-label">{{ $t('user.addModel') }}</span>
        <a-switch v-model:checked="addModelSwitch" />
      </div>
      <div v-if="addModelSwitch">
        <div class="section-header">
          <h3>{{ $t('user.apiConfiguration') }}</h3>
        </div>

        <!-- OpenAI Compatible (LiteLLM) Configuration -->
        <a-card
          class="settings-section"
          :bordered="false"
        >
          <div class="api-provider-header">
            <h4>OpenAI Compatible</h4>
          </div>

          <div class="setting-item">
            <a-form-item
              :label="$t('user.liteLlmBaseUrl')"
              :label-col="{ span: 24 }"
              :wrapper-col="{ span: 24 }"
            >
              <a-input
                v-model:value="liteLlmBaseUrl"
                :placeholder="$t('user.liteLlmBaseUrlPh')"
              />
            </a-form-item>
          </div>

          <div class="setting-item">
            <a-form-item
              :label="$t('user.liteLlmApiKey')"
              :label-col="{ span: 24 }"
              :wrapper-col="{ span: 24 }"
            >
              <a-input-password
                v-model:value="liteLlmApiKey"
                :placeholder="$t('user.liteLlmApiKeyPh')"
              />
              <p class="setting-description-no-padding">
                {{ $t('user.liteLlmApiKeyDescribe') }}
              </p>
            </a-form-item>
          </div>

          <div class="setting-item">
            <a-form-item
              :label="$t('user.model')"
              :label-col="{ span: 24 }"
              :wrapper-col="{ span: 24 }"
            >
              <div class="model-input-container">
                <a-input
                  v-model:value="liteLlmModelId"
                  size="small"
                  class="model-input"
                />
                <div class="button-group">
                  <a-button
                    class="check-btn"
                    size="small"
                    :loading="checkLoadingLiteLLM"
                    @click="() => handleCheck('litellm')"
                  >
                    Check
                  </a-button>
                  <a-button
                    class="save-btn"
                    size="small"
                    @click="() => handleSave('litellm')"
                  >
                    Save
                  </a-button>
                </div>
              </div>
            </a-form-item>
          </div>
        </a-card>

        <!-- Amazon Bedrock Configuration -->
        <a-card
          class="settings-section"
          :bordered="false"
        >
          <div class="api-provider-header">
            <h4>Amazon Bedrock</h4>
          </div>

          <div class="setting-item">
            <a-form-item
              :label="$t('user.awsAccessKey')"
              :label-col="{ span: 24 }"
              :wrapper-col="{ span: 24 }"
            >
              <a-input
                v-model:value="awsAccessKey"
                :placeholder="$t('user.awsAccessKeyPh')"
              />
            </a-form-item>
          </div>

          <div class="setting-item">
            <a-form-item
              :label="$t('user.awsSecretKey')"
              :label-col="{ span: 24 }"
              :wrapper-col="{ span: 24 }"
            >
              <a-input
                v-model:value="awsSecretKey"
                :placeholder="$t('user.awsSecretKeyPh')"
              />
            </a-form-item>
          </div>

          <div class="setting-item">
            <a-form-item
              :label="$t('user.awsSessionToken')"
              :label-col="{ span: 24 }"
              :wrapper-col="{ span: 24 }"
            >
              <a-input
                v-model:value="awsSessionToken"
                :placeholder="$t('user.awsSessionTokenPh')"
              />
            </a-form-item>
          </div>

          <div class="setting-item">
            <a-form-item
              :label="$t('user.awsRegion')"
              :label-col="{ span: 24 }"
              :wrapper-col="{ span: 24 }"
            >
              <a-select
                v-model:value="awsRegion"
                size="small"
                :options="awsRegionOptions"
                :placeholder="$t('user.awsRegionPh')"
                show-search
              />
            </a-form-item>
          </div>

          <p class="setting-description-no-padding">
            {{ $t('user.apiProviderDescribe') }}
          </p>

          <div class="setting-item">
            <!-- AWS VPC Endpoint Checkbox -->
            <a-checkbox v-model:checked="awsEndpointSelected">
              {{ $t('user.awsEndpointSelected') }}
            </a-checkbox>

            <!-- AWS VPC Endpoint Input -->
            <template v-if="awsEndpointSelected">
              <a-input
                v-model:value="awsBedrockEndpoint"
                type="url"
                :placeholder="$t('user.awsBedrockEndpointPh')"
              />
            </template>
          </div>

          <div class="setting-item">
            <!-- Cross Region Inference Checkbox -->
            <a-checkbox v-model:checked="awsUseCrossRegionInference">
              {{ $t('user.awsUseCrossRegionInference') }}
            </a-checkbox>
          </div>

          <div class="setting-item">
            <a-form-item
              :label="$t('user.model')"
              :label-col="{ span: 24 }"
              :wrapper-col="{ span: 24 }"
            >
              <div class="model-input-container">
                <a-input
                  v-model:value="awsModelId"
                  size="small"
                  class="model-input"
                />
                <div class="button-group">
                  <a-button
                    class="check-btn"
                    size="small"
                    :loading="checkLoadingBedrock"
                    @click="() => handleCheck('bedrock')"
                  >
                    Check
                  </a-button>
                  <a-button
                    class="save-btn"
                    size="small"
                    @click="() => handleSave('bedrock')"
                  >
                    Save
                  </a-button>
                </div>
              </div>
            </a-form-item>
          </div>
        </a-card>

        <!-- DeepSeek Configuration -->
        <a-card
          class="settings-section"
          :bordered="false"
        >
          <div class="api-provider-header">
            <h4>DeepSeek</h4>
          </div>

          <div class="setting-item">
            <a-form-item
              :label="$t('user.deepSeekApiKey')"
              :label-col="{ span: 24 }"
              :wrapper-col="{ span: 24 }"
            >
              <a-input-password
                v-model:value="deepSeekApiKey"
                :placeholder="$t('user.deepSeekApiKeyPh')"
              />
              <p class="setting-description-no-padding">
                {{ $t('user.deepSeekApiKeyDescribe') }}
              </p>
            </a-form-item>
          </div>

          <div class="setting-item">
            <a-form-item
              :label="$t('user.model')"
              :label-col="{ span: 24 }"
              :wrapper-col="{ span: 24 }"
            >
              <div class="model-input-container">
                <a-input
                  v-model:value="deepSeekModelId"
                  size="small"
                  class="model-input"
                />
                <div class="button-group">
                  <a-button
                    class="check-btn"
                    size="small"
                    :loading="checkLoadingDeepSeek"
                    @click="() => handleCheck('deepseek')"
                  >
                    Check
                  </a-button>
                  <a-button
                    class="save-btn"
                    size="small"
                    @click="() => handleSave('deepseek')"
                  >
                    Save
                  </a-button>
                </div>
              </div>
            </a-form-item>
          </div>
        </a-card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { notification } from 'ant-design-vue'
import { updateGlobalState, getGlobalState, getSecret, storeSecret, getAllExtensionState } from '@renderer/agent/storage/state'
import eventBus from '@/utils/eventBus'
import i18n from '@/locales'
import { getUser } from '@api/user/user'

// Define interface for model options
interface ModelOption {
  id: string
  name: string
  checked: boolean
  type: string
  apiProvider: string
}

// Define interface for default models from API
interface DefaultModel {
  id: string
  name?: string
  provider?: string

  [key: string]: any
}

const { t } = i18n.global
const modelOptions = ref<ModelOption[]>([])

const awsRegionOptions = ref([
  { value: 'us-east-1', label: 'us-east-1' },
  { value: 'us-east-2', label: 'us-east-2' },
  { value: 'us-west-2', label: 'us-west-2' },
  { value: 'ap-south-1', label: 'ap-south-1' },
  { value: 'ap-northeast-1', label: 'ap-northeast-1' },
  { value: 'ap-northeast-2', label: 'ap-northeast-2' },
  { value: 'ap-northeast-3', label: 'ap-northeast-3' },
  { value: 'ap-southeast-1', label: 'ap-southeast-1' },
  { value: 'ap-southeast-2', label: 'ap-southeast-2' },
  { value: 'ca-central-1', label: 'ca-central-1' },
  { value: 'eu-central-1', label: 'eu-central-1' },
  { value: 'eu-central-2', label: 'eu-central-2' },
  { value: 'eu-west-1', label: 'eu-west-1' },
  { value: 'eu-west-2', label: 'eu-west-2' },
  { value: 'eu-west-3', label: 'eu-west-3' },
  { value: 'eu-north-1', label: 'eu-north-1' },
  { value: 'sa-east-1', label: 'sa-east-1' },
  { value: 'us-gov-east-1', label: 'us-gov-east-1' },
  { value: 'us-gov-west-1', label: 'us-gov-west-1' }
])

const awsModelId = ref('')
const deepSeekModelId = ref('')
const awsAccessKey = ref('')
const awsSecretKey = ref('')
const awsSessionToken = ref('')
const awsRegion = ref('us-east-1')
const awsUseCrossRegionInference = ref(false)
const awsEndpointSelected = ref(false)
const awsBedrockEndpoint = ref('')
const liteLlmBaseUrl = ref('')
const liteLlmApiKey = ref('')
const liteLlmModelId = ref('')
const deepSeekApiKey = ref('')
const checkLoadingLiteLLM = ref(false)
const checkLoadingBedrock = ref(false)
const checkLoadingDeepSeek = ref(false)
const addModelSwitch = ref(false)

// 加载保存的配置
const loadSavedConfig = async () => {
  try {
    // 加载API相关配置
    // apiProvider.value = ((await getGlobalState('apiProvider')) as string) || 'litellm'
    //aws信息
    // apiModelId.value = ((await getGlobalState('apiModelId')) as string) || ''
    awsRegion.value = ((await getGlobalState('awsRegion')) as string) || ''
    awsUseCrossRegionInference.value = ((await getGlobalState('awsUseCrossRegionInference')) as boolean) || false
    awsBedrockEndpoint.value = ((await getGlobalState('awsBedrockEndpoint')) as string) || ''
    awsAccessKey.value = (await getSecret('awsAccessKey')) || ''
    awsSecretKey.value = (await getSecret('awsSecretKey')) || ''
    awsSessionToken.value = (await getSecret('awsSessionToken')) || ''
    //openai信息
    // liteLlmModelId.value = ((await getGlobalState('liteLlmModelId')) as string) || 'claude-3-7-sonnet'
    liteLlmBaseUrl.value = ((await getGlobalState('liteLlmBaseUrl')) as string) || ''
    liteLlmApiKey.value = (await getSecret('liteLlmApiKey')) || ''
    deepSeekApiKey.value = (await getSecret('deepSeekApiKey')) || ''
    awsEndpointSelected.value = ((await getGlobalState('awsEndpointSelected')) as boolean) || false
  } catch (error) {
    console.error('Failed to load config:', error)
    notification.error({
      message: 'Error',
      description: 'Failed to load saved configuration'
    })
  }
}

// 根据不同provider保存对应配置
const saveBedrockConfig = async () => {
  try {
    await updateGlobalState('awsRegion', awsRegion.value)
    await updateGlobalState('awsUseCrossRegionInference', awsUseCrossRegionInference.value)
    await updateGlobalState('awsBedrockEndpoint', awsBedrockEndpoint.value)
    await updateGlobalState('awsEndpointSelected', awsEndpointSelected.value)
    await storeSecret('awsAccessKey', awsAccessKey.value)
    await storeSecret('awsSecretKey', awsSecretKey.value)
    await storeSecret('awsSessionToken', awsSessionToken.value)
  } catch (error) {
    console.error('Failed to save Bedrock config:', error)
    notification.error({
      message: 'Error',
      description: 'Failed to save Bedrock configuration'
    })
  }
}

const saveLiteLlmConfig = async () => {
  try {
    await updateGlobalState('liteLlmBaseUrl', liteLlmBaseUrl.value)
    await storeSecret('liteLlmApiKey', liteLlmApiKey.value)
  } catch (error) {
    console.error('Failed to save LiteLLM config:', error)
    notification.error({
      message: 'Error',
      description: 'Failed to save LiteLLM configuration'
    })
  }
}

const saveDeepSeekConfig = async () => {
  try {
    await storeSecret('deepSeekApiKey', deepSeekApiKey.value)
  } catch (error) {
    console.error('Failed to save DeepSeek config:', error)
    notification.error({
      message: 'Error',
      description: 'Failed to save DeepSeek configuration'
    })
  }
}

// 组件挂载时加载保存的配置
onMounted(async () => {
  await loadSavedConfig()
  await loadModelOptions()
})

// 组件卸载前保存配置
onBeforeUnmount(async () => {})

const isEmptyValue = (value) => value === undefined || value === ''

const checkModelConfig = async (provider) => {
  switch (provider) {
    case 'bedrock':
      if (isEmptyValue(awsModelId.value) || isEmptyValue(awsAccessKey.value) || isEmptyValue(awsSecretKey.value) || isEmptyValue(awsRegion.value)) {
        return false
      }
      break
    case 'litellm':
      if (isEmptyValue(liteLlmBaseUrl.value) || isEmptyValue(liteLlmApiKey.value) || isEmptyValue(liteLlmModelId.value)) {
        return false
      }
      break
    case 'deepseek':
      if (isEmptyValue(deepSeekApiKey.value) || isEmptyValue(deepSeekModelId.value)) {
        return false
      }
      break
  }
  return true
}

const handleCheck = async (provider) => {
  const checkModelConfigResult = await checkModelConfig(provider)
  if (!checkModelConfigResult) {
    notification.error({
      message: t('user.checkModelConfigFailMessage'),
      description: t('user.checkModelConfigFailDescription'),
      duration: 3
    })
    return 'SEND_ERROR'
  }

  // 设置对应的loading状态,check参数
  let checkParam = await getAllExtensionState()
  console.log('[handleCheck] getAllExtensionState.apiConfiguration', checkParam?.apiConfiguration)
  let checkApiConfiguration = checkParam?.apiConfiguration
  let checkOptions = {}

  switch (provider) {
    case 'bedrock':
      checkLoadingBedrock.value = true
      checkOptions = {
        apiProvider: provider,
        apiModelId: awsModelId.value,
        awsAccessKey: awsAccessKey.value,
        awsSecretKey: awsSecretKey.value,
        awsRegion: awsRegion.value
      }
      break
    case 'litellm':
      checkLoadingLiteLLM.value = true
      checkOptions = {
        apiProvider: provider,
        liteLlmBaseUrl: liteLlmBaseUrl.value,
        liteLlmApiKey: liteLlmApiKey.value,
        liteLlmModelId: liteLlmModelId.value
      }
      break
    case 'deepseek':
      checkLoadingDeepSeek.value = true
      checkOptions = {
        apiProvider: provider,
        apiModelId: deepSeekModelId.value,
        deepSeekApiKey: deepSeekApiKey.value
      }
      break
  }

  // 覆盖checkApiConfiguration的内容
  checkApiConfiguration = { ...checkApiConfiguration, ...checkOptions }
  try {
    console.log('[validateApiKey] checkApiConfiguration', checkApiConfiguration)
    // 确保传递正确的参数格式
    const result = await (window.api as any).validateApiKey(checkApiConfiguration)
    if (result.isValid) {
      notification.success({
        message: t('user.checkSuccessMessage'),
        description: t('user.checkSuccessDescription'),
        duration: 3
      })
    } else {
      notification.error({
        message: t('user.checkFailMessage'),
        description: result.error || t('user.checkFailDescriptionDefault'),
        duration: 3
      })
    }
  } catch (error) {
    notification.error({
      message: t('user.checkFailMessage'),
      description: String(error),
      duration: 3
    })
  } finally {
    // 重置loading状态
    checkLoadingBedrock.value = false
    checkLoadingLiteLLM.value = false
    checkLoadingDeepSeek.value = false
  }
}

// Add model management methods
const handleModelChange = (model) => {
  // Update model selection state
  const index = modelOptions.value.findIndex((m) => m.id === model.id)
  if (index !== -1) {
    modelOptions.value[index].checked = model.checked
    saveModelOptions()
  }
}

const removeModel = (model) => {
  if (model.type === 'custom') {
    const index = modelOptions.value.findIndex((m) => m.id === model.id)
    if (index !== -1) {
      modelOptions.value.splice(index, 1)
      saveModelOptions()
    }
  }
}

const saveModelOptions = async () => {
  try {
    // 创建一个简单的可序列化对象数组
    const serializableModelOptions = modelOptions.value.map((model) => ({
      id: model.id,
      name: model.name,
      checked: Boolean(model.checked),
      type: model.type || 'standard',
      apiProvider: model.apiProvider || 'default'
    }))

    await updateGlobalState('modelOptions', serializableModelOptions)
    eventBus.emit('SettingModelOptionsChanged')
  } catch (error) {
    console.error('Failed to save model options:', error)
    notification.error({
      message: 'Error',
      description: 'Failed to save model options'
    })
  }
}

const loadModelOptions = async () => {
  try {
    let defaultModels: DefaultModel[] = []
    await getUser({}).then((res) => {
      defaultModels = res?.data?.models || []
      updateGlobalState('defaultBaseUrl', res?.data?.llmGatewayAddr)
      storeSecret('defaultApiKey', res?.data?.key)
    })
    const savedModelOptions = (await getGlobalState('modelOptions')) || []
    if (savedModelOptions && Array.isArray(savedModelOptions)) {
      // 1. 过滤掉 type=='standard' 且不存在于 defaultModels 中的模型
      const filteredOptions = savedModelOptions.filter((option) => {
        if (option.type !== 'standard') return true
        return defaultModels.some((defaultModel) => defaultModel === option.name)
      })

      // 2. 添加 defaultModels 中不存在于 savedModelOptions 的模型
      defaultModels.forEach((defaultModel) => {
        const exists = filteredOptions.some((option) => option.name === defaultModel)
        if (!exists) {
          filteredOptions.push({
            id: defaultModel || '',
            name: defaultModel || defaultModel || '',
            checked: true,
            type: 'standard',
            apiProvider: 'default'
          })
        }
      })

      // 确保加载的数据包含所有必要的属性
      modelOptions.value = filteredOptions.map((option) => ({
        id: option.id || '',
        name: option.name || '',
        checked: Boolean(option.checked),
        type: option.type || 'standard',
        apiProvider: option.apiProvider || 'default'
      }))
    }
    await saveModelOptions()
  } catch (error) {
    console.error('Failed to load model options:', error)
  }
}

// 处理保存新模型
const handleSave = async (provider) => {
  let modelId = ''
  let modelName = ''

  switch (provider) {
    case 'bedrock':
      modelId = awsModelId.value
      modelName = awsModelId.value
      break
    case 'litellm':
      modelId = liteLlmModelId.value
      modelName = liteLlmModelId.value
      break
    case 'deepseek':
      modelId = deepSeekModelId.value
      modelName = deepSeekModelId.value
      break
  }

  // 检查模型 ID 或名称是否为空
  if (!modelId || !modelName) {
    notification.error({
      message: t('user.checkModelConfigFailMessage'),
      description: t('user.checkModelConfigFailDescription'),
      duration: 3
    })
    return
  }
  // 检查是否已存在同名模型
  const existingModel = modelOptions.value.find((model) => model.name === modelName)
  if (existingModel) {
    notification.error({
      message: 'Error',
      description: t('user.addModelExistError'),
      duration: 3
    })
    return
  }

  // 根据provider保存对应配置
  switch (provider) {
    case 'bedrock':
      await saveBedrockConfig()
      break
    case 'litellm':
      await saveLiteLlmConfig()
      break
    case 'deepseek':
      await saveDeepSeekConfig()
      break
  }

  // 添加新模型
  const newModel = {
    id: modelId,
    name: modelName,
    checked: true,
    type: 'custom',
    apiProvider: provider
  }

  modelOptions.value.push(newModel)
  await saveModelOptions()

  notification.success({
    message: 'Success',
    description: t('user.addModelSuccess'),
    duration: 3
  })
}
</script>

<style lang="less" scoped>
.settings-section {
  background-color: transparent;

  :deep(.ant-card-body) {
    padding: 16px;
  }
}

.section-header {
  margin-top: 8px;
  margin-left: 16px;

  h3 {
    font-size: 20px;
    font-weight: 500;
    margin: 0;
  }
}

.setting-item {
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }
}

.setting-description {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-color-tertiary);
  padding-left: 22px;
}

.setting-description-no-padding {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-color-tertiary);
}

// 统一组件样式
:deep(.ant-checkbox-wrapper),
:deep(.ant-form-item-label label),
:deep(.ant-select),
:deep(.ant-input),
:deep(.ant-input-password) {
  color: var(--text-color-secondary);
}

:deep(.ant-checkbox),
:deep(.ant-select-selector),
:deep(.ant-input),
:deep(.ant-input-password) {
  background-color: var(--bg-color-octonary) !important;
  border: 1px solid var(--bg-color-octonary) !important;

  &:hover,
  &:focus {
    border-color: #1890ff;
  }

  &::placeholder {
    color: var(--text-color-quaternary) !important;
  }
}

// 密码输入框特定样式
:deep(.ant-input-password) {
  .ant-input {
    background-color: var(--bg-color-octonary) !important;
    color: var(--text-color-secondary);
  }
  .anticon {
    color: var(--text-color-tertiary);
  }

  &:hover .anticon {
    color: var(--text-color-secondary-light);
  }
}

// 添加选择框的特定样式
:deep(.ant-select) {
  .ant-select-selector {
    background-color: var(--bg-color-octonary) !important;
    border: none;

    .ant-select-selection-placeholder {
      color: var(--text-color-quaternary) !important;
    }
  }

  &.ant-select-focused {
    .ant-select-selector {
      background-color: var(--bg-color-octonary) !important;
      border-color: #1890ff !important;
    }
  }
}

:deep(.ant-checkbox-checked .ant-checkbox-inner) {
  background-color: #1890ff !important;
  border-color: #1890ff !important;
}

// 下拉菜单样式
:deep(.ant-select-dropdown) {
  background-color: var(--bg-color-octonary);
  border: 1px solid rgba(255, 255, 255, 0.15);

  .ant-select-item {
    color: var(--text-color-secondary);
    background-color: var(--bg-color-octonary);

    &-option-active,
    &-option-selected {
      color: var(--text-color-secondary) !important; // 添加选中项的文字颜色
      background-color: rgba(24, 144, 255, 0.2);
    }

    &-option:hover {
      color: var(--text-color-secondary);
      background-color: rgba(255, 255, 255, 0.08);
    }
  }
}

// 选择框中已选项的颜色
:deep(.ant-select-selection-item) {
  color: var(--text-color-secondary) !important;
}

.label-container {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
}

.budget-label {
  font-weight: 500;
  display: block;
  margin-right: auto;
  color: var(--text-color-tertiary);
}

.slider-container {
  padding: 8px 0;
  color: var(--text-color-tertiary);

  :deep(.ant-slider) {
    margin: 0;
    // 轨道样式
    .ant-slider-rail {
      background-color: var(--bg-color-octonary);
    }

    // 已选择部分的轨道样式
    .ant-slider-track {
      background-color: #1890ff;
    }

    // 滑块手柄样式
    .ant-slider-handle {
      width: 16px;
      height: 16px;
      border: 2px solid var(--vscode-progressBar-background);
      background-color: var(--vscode-foreground);
      box-shadow: var(--box-shadow);

      &:focus {
        box-shadow: 0 0 0 5px var(--vscode-focusBorder);
      }

      &:hover {
        border-color: var(--vscode-progressBar-background);
      }

      &:active {
        box-shadow: 0 0 0 5px var(--vscode-focusBorder);
      }
    }
  }
}

.error-message {
  color: #ff4d4f;
  font-size: 12px;
  margin-top: 4px;
}

// 减小表单项之间的间距
:deep(.ant-form-item) {
  margin-bottom: 8px; // 减小底部边距
}

// 减小label和输入框之间的间距
:deep(.ant-form-item-label) {
  padding-bottom: 0; // 移除label的底部padding
  > label {
    height: 24px; // 减小label高度
    line-height: 24px; // 调整行高以匹配高度
  }
}

.chat-response {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;

  .message {
    width: 100%;
    padding: 8px 12px;
    border-radius: 12px;
    font-size: 12px;
    line-height: 1.5;

    &.user {
      align-self: flex-end;
      background-color: var(--text-color-senary); // 浅灰色背景
      color: var(--text-color); // 白色文字
      border: none; // 移除边框
      width: 90%; // 父组件的90%宽度
      margin-left: auto; // 靠右对齐
    }

    &.assistant {
      align-self: flex-start;
      background-color: var(--bg-color-quinary);
      color: var(--text-color);
      border: 1px solid var(--bg-color-quinary);
      width: 100%;
    }
  }
}

.check-btn {
  margin-left: 4px;
  width: 90px;
  background-color: var(--bg-color-octonary) !important;
  color: var(--text-color) !important;
  border: none !important;
  box-shadow: none !important;
  transition: background 0.2s;
}

.check-btn:hover,
.check-btn:focus {
  background-color: var(--bg-color-novenary) !important;
  color: var(--text-color) !important;
}

/* Model list styles */
.model-header {
  margin-top: 0;
  margin-left: 0;
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.2s;
  height: 28px; /* 固定高度 */
  box-sizing: border-box;
}

.model-item:hover {
  background-color: var(--text-color-septenary);
}

.remove-button {
  padding: 0 8px;
  color: var(--text-color-tertiary);
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  height: 24px;
  width: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.remove-button:hover {
  color: var(--text-color-secondary);
}

.remove-icon {
  font-size: 16px;
  font-weight: bold;
  line-height: 1;
}

:deep(.ant-checkbox-wrapper) {
  color: var(--text-color-secondary);
  height: 24px;
  line-height: 24px;
  display: flex;
  align-items: center;
}

:deep(.ant-checkbox) {
  top: 0;
}

:deep(.ant-checkbox-inner) {
  background-color: var(--bg-color-octonary) !important;
  border-color: var(--text-color-quinary) !important;
}

:deep(.ant-checkbox-checked .ant-checkbox-inner) {
  background-color: #1890ff !important;
  border-color: #1890ff !important;
}

.add-model-switch {
  display: flex;
  align-items: center;
  margin: 16px 0 16px 16px;

  .switch-label {
    margin-right: 16px;
    color: var(--text-color-secondary);
  }

  :deep(.ant-switch) {
    background-color: var(--bg-color-octonary);
    transition: background-color 0.1s ease !important; // 减少过渡时间

    &.ant-switch-checked {
      background-color: #1890ff;

      &:hover:not(.ant-switch-disabled) {
        background-color: #1890ff; // 选中状态下悬浮保持蓝色
      }
    }

    &:hover:not(.ant-switch-disabled):not(.ant-switch-checked) {
      background-color: var(--bg-color-octonary); // 未选中状态下悬浮保持灰色
    }
  }
}

.save-btn {
  width: 90px;
  background-color: var(--bg-color-octonary) !important;
  color: var(--text-color) !important;
  border: none !important;
  box-shadow: none !important;
  transition: background 0.2s;
}

.save-btn:hover,
.save-btn:focus {
  background-color: var(--bg-color-novenary) !important;
  color: var(--text-color) !important;
}

.model-input-container {
  display: flex;
  align-items: center;
  width: 100%;
}

.model-input {
  flex: 1;
  margin-right: 8px;
}

.button-group {
  display: flex;
  gap: 8px;
}

.api-provider-options {
  margin-bottom: 16px;
}

.api-provider-header {
  margin-bottom: 16px;
  border-bottom: 1px solid var(--bg-color-quaternary);
  padding-bottom: 8px;

  h4 {
    margin: 0;
    font-size: 16px;
    color: #1890ff;
  }
}
</style>
