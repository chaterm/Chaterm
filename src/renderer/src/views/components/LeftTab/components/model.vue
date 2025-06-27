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
        <a-card
          class="settings-section"
          :bordered="false"
        >
          <!-- API Configuration Selection -->
          <div class="setting-item">
            <a-form-item
              :label="$t('user.apiProvider')"
              :label-col="{ span: 24 }"
              :wrapper-col="{ span: 24 }"
            >
              <a-select
                v-model:value="apiProvider"
                size="small"
                :options="apiProviderOptions"
                show-search
              />
            </a-form-item>
          </div>
          <div v-if="apiProvider === 'bedrock'">
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
          </div>
          <div v-else-if="apiProvider === 'litellm'">
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
              </a-form-item>
            </div>
          </div>
          <div v-else-if="apiProvider === 'deepseek'">
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
          </div>
          <!-- Model Selection -->
          <div class="setting-item">
            <a-form-item
              :label="$t('user.model')"
              :label-col="{ span: 24 }"
              :wrapper-col="{ span: 24 }"
            >
              <div class="model-input-container">
                <a-input
                  v-model:value="apiModelId"
                  size="small"
                  class="model-input"
                />
                <div class="button-group">
                  <a-button
                    class="check-btn"
                    size="small"
                    :loading="checkLoading"
                    @click="handleCheck"
                  >
                    Check
                  </a-button>
                  <a-button
                    class="save-btn"
                    size="small"
                    @click="handleSave"
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
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { notification } from 'ant-design-vue'
import { updateGlobalState, getGlobalState, getSecret, storeSecret } from '@renderer/agent/storage/state'
import eventBus from '@/utils/eventBus'
import i18n from '@/locales'

const { t } = i18n.global
const apiProviderOptions = ref([
  { value: 'litellm', label: 'OpenAI Compatible' },
  { value: 'bedrock', label: 'Amazon Bedrock' },
  { value: 'deepseek', label: 'DeepSeek' }
])

const modelOptions = ref([
  // {
  //   id: 'deepseek-r1-0528',
  //   name: 'deepseek-r1-0528',
  //   checked: true,
  //   type: 'standard',
  //   apiProvider: 'default'
  // }
])

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

const apiModelId = ref('')
const apiProvider = ref('litellm')
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
const checkLoading = ref(false)
const addModelSwitch = ref(false)

// Add specific watch for liteLlmBaseUrl
watch(
  () => liteLlmBaseUrl.value,
  async (newValue) => {
    try {
      await updateGlobalState('liteLlmBaseUrl', newValue)
    } catch (error) {
      console.error('Failed to update liteLlmBaseUrl:', error)
      notification.error({
        message: 'Error',
        description: 'Failed to save LiteLLM Base URL'
      })
    }
  }
)

// Add specific watch for liteLlmApiKey
watch(
  () => liteLlmApiKey.value,
  async (newValue) => {
    try {
      await storeSecret('liteLlmApiKey', newValue)
    } catch (error) {
      console.error('Failed to update liteLlmApiKey:', error)
      notification.error({
        message: 'Error',
        description: 'Failed to save LiteLLM API Key'
      })
    }
  }
)

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

// 保存配置到存储
const saveConfig = async () => {
  try {
    // 保存API相关配置
    // await updateGlobalState('apiProvider', apiProvider.value)
    // await updateGlobalState('apiModelId', apiModelId.value)
    await updateGlobalState('awsRegion', awsRegion.value)
    await updateGlobalState('awsUseCrossRegionInference', awsUseCrossRegionInference.value)
    await updateGlobalState('awsBedrockEndpoint', awsBedrockEndpoint.value)
    await updateGlobalState('awsEndpointSelected', awsEndpointSelected.value)
    await updateGlobalState('liteLlmBaseUrl', liteLlmBaseUrl.value)
    // await updateGlobalState('liteLlmModelId', liteLlmModelId.value)

    // 保存敏感信息
    await storeSecret('awsAccessKey', awsAccessKey.value)
    await storeSecret('awsSecretKey', awsSecretKey.value)
    await storeSecret('awsSessionToken', awsSessionToken.value)
    await storeSecret('liteLlmApiKey', liteLlmApiKey.value)
    await storeSecret('deepSeekApiKey', deepSeekApiKey.value)
  } catch (error) {
    console.error('Failed to save config:', error)
    notification.error({
      message: 'Error',
      description: 'Failed to save configuration'
    })
  }
}

watch(
  () => awsAccessKey.value,
  async (newValue) => {
    try {
      await storeSecret('awsAccessKey', newValue)
    } catch (error) {
      console.error('Failed to update awsAccessKey:', error)
    }
  }
)

watch(
  () => awsSecretKey.value,
  async (newValue) => {
    try {
      await storeSecret('awsSecretKey', newValue)
    } catch (error) {
      console.error('Failed to update awsSecretKey:', error)
    }
  }
)

watch(
  () => awsSessionToken.value,
  async (newValue) => {
    try {
      await storeSecret('awsSessionToken', newValue)
    } catch (error) {
      console.error('Failed to update awsSessionToken:', error)
    }
  }
)

watch(
  () => awsRegion.value,
  async (newValue) => {
    try {
      await updateGlobalState('awsRegion', newValue)
    } catch (error) {
      console.error('Failed to update awsRegion:', error)
    }
  }
)

watch(
  () => awsUseCrossRegionInference.value,
  async (newValue) => {
    try {
      await updateGlobalState('awsUseCrossRegionInference', newValue)
    } catch (error) {
      console.error('Failed to update awsUseCrossRegionInference:', error)
    }
  }
)

watch(
  () => awsEndpointSelected.value,
  async (newValue) => {
    try {
      await updateGlobalState('awsEndpointSelected', newValue)
    } catch (error) {
      console.error('Failed to update awsEndpointSelected:', error)
    }
  }
)

watch(
  () => awsBedrockEndpoint.value,
  async (newValue) => {
    try {
      await updateGlobalState('awsBedrockEndpoint', newValue)
    } catch (error) {
      console.error('Failed to update awsBedrockEndpoint:', error)
    }
  }
)

watch(
  () => deepSeekApiKey.value,
  async (newValue) => {
    try {
      await storeSecret('deepSeekApiKey', newValue)
    } catch (error) {
      console.error('Failed to update deepSeekApiKey:', error)
    }
  }
)

// 组件挂载时加载保存的配置
onMounted(async () => {
  await loadSavedConfig()
  await saveConfig()
  await loadModelOptions()
})

// 组件卸载前保存配置
onBeforeUnmount(async () => {
  await saveConfig()
})

const isEmptyValue = (value) => value === undefined || value === ''

const checkModelConfig = async () => {
  console.log('apiProvider.value', apiProvider.value)
  switch (apiProvider.value) {
    case 'bedrock':
      console.log('bedrock', apiModelId.value, awsAccessKey.value, awsSecretKey.value, awsRegion.value)
      if (isEmptyValue(apiModelId.value) || isEmptyValue(awsAccessKey.value) || isEmptyValue(awsSecretKey.value) || isEmptyValue(awsRegion.value)) {
        return false
      }
      break
    case 'litellm':
      console.log('litellm', liteLlmBaseUrl.value, liteLlmApiKey.value, apiModelId.value)
      if (isEmptyValue(liteLlmBaseUrl.value) || isEmptyValue(liteLlmApiKey.value) || isEmptyValue(apiModelId.value)) {
        return false
      }
      break
    case 'deepseek':
      console.log('deepseek', deepSeekApiKey.value, apiModelId.value)
      if (isEmptyValue(deepSeekApiKey.value) || isEmptyValue(apiModelId.value)) {
        return false
      }
      break
  }
  return true
}

const handleCheck = async () => {
  await saveConfig()
  const checkModelConfigResult = await checkModelConfig()
  if (!checkModelConfigResult) {
    notification.error({
      message: t('user.checkModelConfigFailMessage'),
      description: t('user.checkModelConfigFailDescription'),
      duration: 3
    })
    return 'SEND_ERROR'
  }
  const originApiProvider = ((await getGlobalState('apiProvider')) as string) || ''
  let originApiModel = ''
  await updateGlobalState('apiProvider', apiProvider.value)
  try {
    checkLoading.value = true
    // validateApiKey 根据 apiProvider 进行验证，所以此处暂需要先更新为需要 check 模型的 apiProvider
    await updateGlobalState('apiProvider', apiProvider.value)
    switch (apiProvider.value) {
      case 'bedrock':
        originApiModel = ((await getGlobalState('apiModelId')) as string) || ''
        await updateGlobalState('apiModelId', apiModelId.value)
        break
      case 'litellm':
        originApiModel = ((await getGlobalState('liteLlmModelId')) as string) || ''
        await updateGlobalState('liteLlmModelId', apiModelId.value)
        break
      case 'deepseek':
        originApiModel = ((await getGlobalState('apiModelId')) as string) || ''
        await updateGlobalState('apiModelId', apiModelId.value)
        break
    }
    const result = await (window.api as any).validateApiKey()
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
    checkLoading.value = false
    await updateGlobalState('apiProvider', originApiProvider)
    switch (apiProvider.value) {
      case 'bedrock':
        await updateGlobalState('apiModelId', originApiModel)
        break
      case 'litellm':
        await updateGlobalState('liteLlmModelId', originApiModel)
        break
      case 'deepseek':
        await updateGlobalState('apiModelId', originApiModel)
        break
    }
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
    const savedModelOptions = await getGlobalState('modelOptions')
    if (savedModelOptions && Array.isArray(savedModelOptions)) {
      // 确保加载的数据包含所有必要的属性
      modelOptions.value = savedModelOptions.map((option) => ({
        id: option.id || '',
        name: option.name || '',
        checked: Boolean(option.checked),
        type: option.type || 'standard',
        apiProvider: option.apiProvider || 'litellm'
      }))
    }
  } catch (error) {
    console.error('Failed to load model options:', error)
  }
}

// 处理保存新模型
const handleSave = () => {
  let modelId = apiModelId.value
  let modelName = apiModelId.value

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

  // 添加新模型
  const newModel = {
    id: modelId,
    name: modelName,
    checked: true,
    type: 'custom',
    apiProvider: apiProvider.value
  }

  modelOptions.value.push(newModel)
  saveModelOptions()

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
  color: rgba(255, 255, 255, 0.45);
  padding-left: 22px;
}

.setting-description-no-padding {
  margin-top: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}

// 统一组件样式
:deep(.ant-checkbox-wrapper),
:deep(.ant-form-item-label label),
:deep(.ant-select),
:deep(.ant-input),
:deep(.ant-input-password) {
  color: rgba(255, 255, 255, 0.85);
}

:deep(.ant-checkbox),
:deep(.ant-select-selector),
:deep(.ant-input),
:deep(.ant-input-password) {
  background-color: #4a4a4a !important; // 添加 !important 确保覆盖默认样式
  border: none;

  &:hover,
  &:focus {
    border-color: #1890ff;
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.25) !important;
  }
}

// 密码输入框特定样式
:deep(.ant-input-password) {
  .ant-input {
    background-color: #4a4a4a !important;
    color: rgba(255, 255, 255, 0.85);
  }

  .anticon {
    color: rgba(255, 255, 255, 0.45);
  }

  &:hover .anticon {
    color: rgba(255, 255, 255, 0.65);
  }
}

// 添加选择框的特定样式
:deep(.ant-select) {
  .ant-select-selector {
    background-color: #4a4a4a !important;
    border: none;

    .ant-select-selection-placeholder {
      color: rgba(255, 255, 255, 0.25) !important;
    }
  }

  &.ant-select-focused {
    .ant-select-selector {
      background-color: #4a4a4a !important;
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
  background-color: #4a4a4a;
  border: 1px solid rgba(255, 255, 255, 0.15);

  .ant-select-item {
    color: rgba(255, 255, 255, 0.85);
    background-color: #4a4a4a;

    &-option-active,
    &-option-selected {
      color: rgba(255, 255, 255, 0.85) !important; // 添加选中项的文字颜色
      background-color: rgba(24, 144, 255, 0.2);
    }

    &-option:hover {
      color: rgba(255, 255, 255, 0.85);
      background-color: rgba(255, 255, 255, 0.08);
    }
  }
}

// 选择框中已选项的颜色
:deep(.ant-select-selection-item) {
  color: rgba(255, 255, 255, 0.85) !important;
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
  color: rgba(255, 255, 255, 0.45);
}

.slider-container {
  padding: 8px 0;
  color: rgba(255, 255, 255, 0.45);

  :deep(.ant-slider) {
    margin: 0;
    // 轨道样式
    .ant-slider-rail {
      background-color: #4a4a4a;
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
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);

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
      background-color: rgba(255, 255, 255, 0.1); // 浅灰色背景
      color: #ffffff; // 白色文字
      border: none; // 移除边框
      width: 90%; // 父组件的90%宽度
      margin-left: auto; // 靠右对齐
    }

    &.assistant {
      align-self: flex-start;
      background-color: #1e2a38;
      color: #e0e0e0;
      border: 1px solid #2c3e50;
      width: 100%;
    }
  }
}

.check-btn {
  margin-left: 4px;
  width: 90px;
  background-color: #4a4a4a !important;
  color: #fff !important;
  border: none !important;
  box-shadow: none !important;
  transition: background 0.2s;
}

.check-btn:hover,
.check-btn:focus {
  background-color: #5a5a5a !important;
  color: #fff !important;
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
  background-color: rgba(255, 255, 255, 0.05);
}

.remove-button {
  padding: 0 8px;
  color: rgba(255, 255, 255, 0.45);
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
  color: rgba(255, 255, 255, 0.85);
}

.remove-icon {
  font-size: 16px;
  font-weight: bold;
  line-height: 1;
}

:deep(.ant-checkbox-wrapper) {
  color: rgba(255, 255, 255, 0.85);
  height: 24px;
  line-height: 24px;
  display: flex;
  align-items: center;
}

:deep(.ant-checkbox) {
  top: 0;
}

:deep(.ant-checkbox-inner) {
  background-color: #4a4a4a !important;
  border-color: rgba(255, 255, 255, 0.15) !important;
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
    color: rgba(255, 255, 255, 0.85);
  }

  :deep(.ant-switch) {
    background-color: #4a4a4a;
    transition: background-color 0.1s ease !important; // 减少过渡时间

    &.ant-switch-checked {
      background-color: #1890ff;

      &:hover:not(.ant-switch-disabled) {
        background-color: #1890ff; // 选中状态下悬浮保持蓝色
      }
    }

    &:hover:not(.ant-switch-disabled):not(.ant-switch-checked) {
      background-color: #4a4a4a; // 未选中状态下悬浮保持灰色
    }
  }
}

.save-btn {
  width: 90px;
  background-color: #4a4a4a !important;
  color: #fff !important;
  border: none !important;
  box-shadow: none !important;
  transition: background 0.2s;
}

.save-btn:hover,
.save-btn:focus {
  background-color: #5a5a5a !important;
  color: #fff !important;
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
</style>
