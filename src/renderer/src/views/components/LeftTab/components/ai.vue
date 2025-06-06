<template>
  <div>
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
            <a-input
              v-model:value="liteLlmApiKey"
              :placeholder="$t('user.liteLlmApiKeyPh')"
            />
          </a-form-item>
        </div>
      </div>
    </a-card>
    <div class="section-header">
      <h3>{{ $t('user.general') }}</h3>
    </div>
    <a-card
      class="settings-section"
      :bordered="false"
    >
      <!-- Model Selection -->
      <div class="setting-item">
        <a-form-item
          :label="$t('user.model')"
          :label-col="{ span: 24 }"
          :wrapper-col="{ span: 24 }"
        >
          <a-select
            v-if="apiProvider === 'bedrock'"
            v-model:value="apiModelId"
            size="small"
            :options="aiModelOptions"
            show-search
          />
          <a-select
            v-else-if="apiProvider === 'litellm'"
            v-model:value="liteLlmModelId"
            size="small"
            :options="litellmAiModelOptions"
            show-search
          />
        </a-form-item>
      </div>
      <!-- ChatSetting -->
      <div class="setting-item">
        <a-form-item
          :label="$t('user.chatSettings')"
          :label-col="{ span: 24 }"
          :wrapper-col="{ span: 24 }"
        >
          <a-select
            v-model:value="chatSettings.mode"
            size="small"
          >
            <a-select-option value="chat">Chat</a-select-option>
            <a-select-option value="cmd">Cmd</a-select-option>
            <a-select-option value="agent">Agent</a-select-option>
          </a-select>
        </a-form-item>
      </div>
      <!-- Extended Thinking -->
      <div class="setting-item">
        <a-checkbox
          v-model:checked="enableExtendedThinking"
          @change="handleEnableExtendedThinking(enableExtendedThinking)"
        >
          {{ $t('user.enableExtendedThinking') }}
        </a-checkbox>
        <template v-if="enableExtendedThinking">
          <div class="label-container">
            <label class="budget-label">
              <strong>Budget:</strong> {{ thinkingBudgetTokens.toLocaleString() }} tokens
            </label>
          </div>

          <div class="slider-container">
            <a-slider
              v-model:value="thinkingBudgetTokens"
              :min="1024"
              :max="6553"
              :step="1"
              :tooltip-visible="false"
            />
          </div>

          <p class="setting-description-no-padding">
            {{ $t('user.enableExtendedThinkingDescribe') }}
          </p>
        </template>
      </div>

      <!-- Auto Approval -->
      <div class="setting-item">
        <a-checkbox v-model:checked="autoApprovalSettings.enabled">
          {{ $t('user.autoApproval') }}
        </a-checkbox>
        <p class="setting-description">
          {{ $t('user.autoApprovalDescribe') }}
        </p>
      </div>
      <div class="setting-item">
        <a-form-item
          :label="$t('user.customInstructions')"
          :label-col="{ span: 24 }"
          :wrapper-col="{ span: 24 }"
        >
          <a-textarea
            v-model:value="customInstructions"
            :rows="2"
            :placeholder="$t('user.customInstructionsPh')"
          />
        </a-form-item>
      </div>
    </a-card>

    <div class="section-header">
      <h3>{{ $t('user.features') }}</h3>
    </div>
    <a-card
      class="settings-section"
      :bordered="false"
    >
      <!-- Reasoning Effort -->
      <div class="setting-item">
        <a-form-item
          :label="$t('user.openAIReasoningEffort')"
          :label-col="{ span: 24 }"
          :wrapper-col="{ span: 24 }"
        >
          <a-select
            v-model:value="reasoningEffort"
            size="small"
          >
            <a-select-option value="low">{{ $t('user.openAIReasoningEffortLow') }}</a-select-option>
            <a-select-option value="medium"
              >{{ $t('user.openAIReasoningEffortMedium') }}
            </a-select-option>
            <a-select-option value="high"
              >{{ $t('user.openAIReasoningEffortHigh') }}
            </a-select-option>
          </a-select>
        </a-form-item>
      </div>
    </a-card>

    <div class="section-header">
      <h3>{{ $t('user.terminal') }}</h3>
    </div>
    <a-card
      class="settings-section"
      :bordered="false"
    >
      <div class="setting-item">
        <a-form-item
          :label="$t('user.shellIntegrationTimeout')"
          :label-col="{ span: 24 }"
          :wrapper-col="{ span: 24 }"
        >
          <a-input
            v-model:value="shellIntegrationTimeout"
            :placeholder="$t('user.shellIntegrationTimeoutPh')"
            :status="inputError ? 'error' : ''"
          />
          <template v-if="inputError">
            <span class="error-message">{{ inputError }}</span>
          </template>
          <p class="setting-description-no-padding">
            {{ $t('user.shellIntegrationTimeoutDescribe') }}
          </p>
        </a-form-item>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { notification } from 'ant-design-vue'
import {
  updateGlobalState,
  getGlobalState,
  getSecret,
  storeSecret
} from '@renderer/agent/storage/state'
import { AutoApprovalSettings, DEFAULT_AUTO_APPROVAL_SETTINGS } from '@/agent/storage/shared'
import { ChatSettings, DEFAULT_CHAT_SETTINGS } from '@/agent/storage/shared'

const apiProviderOptions = ref([
  { value: 'litellm', label: 'OpenAI Compatible' },
  { value: 'bedrock', label: 'Amazon Bedrock' }
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

const aiModelOptions = ref([
  { value: 'amazon.nova-pro-v1:0', label: 'amazon.nova-pro-v1:0' },
  { value: 'amazon.nova-lite-v1:0', label: 'amazon.nova-lite-v1:0' },
  { value: 'amazon.nova-micro-v1:0', label: 'amazon.nova-micro-v1:0' },
  {
    value: 'anthropic.claude-3-7-sonnet-20250219-v1:0',
    label: 'anthropic.claude-3-7-sonnet-20250219-v1:0'
  },
  {
    value: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    label: 'anthropic.claude-3-5-sonnet-20241022-v2:0'
  },
  {
    value: 'anthropic.claude-3-5-haiku-20241022-v1:0',
    label: 'anthropic.claude-3-5-haiku-20241022-v1:0'
  },
  {
    value: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
    label: 'anthropic.claude-3-5-sonnet-20240620-v1:0'
  },
  {
    value: 'anthropic.claude-3-opus-20240229-v1:0',
    label: 'anthropic.claude-3-opus-20240229-v1:0'
  },
  {
    value: 'anthropic.claude-3-sonnet-20240229-v1:0',
    label: 'anthropic.claude-3-sonnet-20240229-v1:0'
  },
  {
    value: 'anthropic.claude-3-haiku-20240307-v1:0',
    label: 'anthropic.claude-3-haiku-20240307-v1:0'
  },
  { value: 'deepseek.r1-v1:0', label: 'deepseek.r1-v1:0' }
])

const litellmAiModelOptions = ref([
  { value: 'claude-sonnet-4', label: 'claude-sonnet-4' },
  { value: 'claude-opus-4', label: 'claude-opus-4' },
  { value: 'claude-3-7-sonnet', label: 'claude-3-7-sonnet' },
  { value: 'claude-3-5-haiku', label: 'claude-3-5-haiku' },
  { value: 'claude-3-5-sonnet', label: 'claude-3-5-sonnet' },
  { value: 'claude-3-opus', label: 'claude-3-opus' },
  { value: 'gpt-4.1', label: 'gpt-4.1' },
  { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
  { value: 'gpt-4.1-nano', label: 'gpt-4.1-nano' },
  { value: 'gpt-4o', label: 'gpt-4o' },
  { value: 'qwen-plus-latest', label: 'qwen-plus-latest' },
  { value: 'qwen3-235b-a22b', label: 'qwen3-235b-a22b' },
  { value: 'qwen3-32b', label: 'qwen3-32b' },
  { value: 'qwen3-30b-a3b', label: 'qwen3-30b-a3b' },
  { value: 'qwen3-14b', label: 'qwen3-14b' },
  { value: 'qwen3-8b', label: 'qwen3-8b' },
  { value: 'deepseek-r1', label: 'deepseek-r1' },
  { value: 'deepseek-v3-0324', label: 'deepseek-v3-0324' }
])

const apiModelId = ref('anthropic.claude-3-7-sonnet-20250219-v1:0')
const thinkingBudgetTokens = ref(2048)
const enableExtendedThinking = ref(true)
// const enableCheckpoints = ref(false)
const reasoningEffort = ref('low')
const shellIntegrationTimeout = ref(4)
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
const liteLlmModelId = ref('claude-3-7-sonnet')
const autoApprovalSettings = ref<AutoApprovalSettings>(DEFAULT_AUTO_APPROVAL_SETTINGS)
const chatSettings = ref<ChatSettings>(DEFAULT_CHAT_SETTINGS)
const customInstructions = ref('')
const inputError = ref('')

// Add specific watch for autoApprovalSettings.enabled
watch(
  () => autoApprovalSettings.value.enabled,
  async (newValue) => {
    try {
      // Create a clean object with only the necessary properties
      const settingsToStore = {
        version: (autoApprovalSettings.value.version || 1) + 1,
        enabled: newValue,
        actions: { ...autoApprovalSettings.value.actions },
        maxRequests: autoApprovalSettings.value.maxRequests,
        enableNotifications: autoApprovalSettings.value.enableNotifications,
        favorites: [...(autoApprovalSettings.value.favorites || [])]
      }

      await updateGlobalState('autoApprovalSettings', settingsToStore)
    } catch (error) {
      console.error('Failed to update auto approval settings:', error)
      notification.error({
        message: 'Error',
        description: 'Failed to update auto approval settings'
      })
    }
  }
)

// Add specific watch for chatSettings.mode
watch(
  () => chatSettings.value.mode,
  async (newValue) => {
    try {
      // Create a clean object with only the necessary properties
      const settingsToStore = {
        mode: newValue
      }

      await updateGlobalState('chatSettings', settingsToStore)
    } catch (error) {
      console.error('Failed to update chat settings:', error)
      notification.error({
        message: 'Error',
        description: 'Failed to update chat settings'
      })
    }
  }
)

// 加载保存的配置
const loadSavedConfig = async () => {
  try {
    // 加载API相关配置
    apiProvider.value = ((await getGlobalState('apiProvider')) as string) || ''
    //aws信息
    apiModelId.value = ((await getGlobalState('apiModelId')) as string) || ''
    awsRegion.value = ((await getGlobalState('awsRegion')) as string) || ''
    awsUseCrossRegionInference.value =
      ((await getGlobalState('awsUseCrossRegionInference')) as boolean) || false
    awsBedrockEndpoint.value = ((await getGlobalState('awsBedrockEndpoint')) as string) || ''
    awsAccessKey.value = (await getSecret('awsAccessKey')) || ''
    awsSecretKey.value = (await getSecret('awsSecretKey')) || ''
    awsSessionToken.value = (await getSecret('awsSessionToken')) || ''
    //openai信息
    liteLlmModelId.value = ((await getGlobalState('liteLlmModelId')) as string) || ''
    liteLlmBaseUrl.value = ((await getGlobalState('liteLlmBaseUrl')) as string) || ''
    liteLlmApiKey.value = (await getSecret('liteLlmApiKey')) || ''

    // 加载其他配置
    thinkingBudgetTokens.value = ((await getGlobalState('thinkingBudgetTokens')) as number) || 0
    customInstructions.value = ((await getGlobalState('customInstructions')) as string) || ''
    // enableCheckpoints.value = (await getGlobalState('enableCheckpoints')) || false

    const savedAutoApprovalSettings = await getGlobalState('autoApprovalSettings')
    if (savedAutoApprovalSettings) {
      autoApprovalSettings.value = {
        ...DEFAULT_AUTO_APPROVAL_SETTINGS,
        ...savedAutoApprovalSettings
      }
    } else {
      autoApprovalSettings.value = DEFAULT_AUTO_APPROVAL_SETTINGS
    }

    const savedChatSettings = await getGlobalState('chatSettings')
    if (savedChatSettings) {
      chatSettings.value = {
        ...DEFAULT_CHAT_SETTINGS,
        ...savedChatSettings
      }
    } else {
      chatSettings.value = DEFAULT_CHAT_SETTINGS
    }

    reasoningEffort.value = ((await getGlobalState('reasoningEffort')) as string) || 'low'
    shellIntegrationTimeout.value =
      ((await getGlobalState('shellIntegrationTimeout')) as number) || 4
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
    await updateGlobalState('apiProvider', apiProvider.value)
    await updateGlobalState('apiModelId', apiModelId.value)
    await updateGlobalState('awsRegion', awsRegion.value)
    await updateGlobalState('awsUseCrossRegionInference', awsUseCrossRegionInference.value)
    await updateGlobalState('awsBedrockEndpoint', awsBedrockEndpoint.value)
    await updateGlobalState('awsEndpointSelected', awsEndpointSelected.value)
    await updateGlobalState('liteLlmBaseUrl', liteLlmBaseUrl.value)
    await updateGlobalState('liteLlmModelId', liteLlmModelId.value)

    // 保存敏感信息
    await storeSecret('awsAccessKey', awsAccessKey.value)
    await storeSecret('awsSecretKey', awsSecretKey.value)
    await storeSecret('awsSessionToken', awsSessionToken.value)
    await storeSecret('liteLlmApiKey', liteLlmApiKey.value)
    // 保存其他配置
    await updateGlobalState('thinkingBudgetTokens', thinkingBudgetTokens.value)
    await updateGlobalState('customInstructions', customInstructions.value)
    // await updateGlobalState('enableCheckpoints', enableCheckpoints.value)
    await updateGlobalState('autoApprovalSettings', {
      enabled: autoApprovalSettings.value.enabled
    })
    await updateGlobalState('chatSettings', {
      mode: chatSettings.value.mode
    })
    await updateGlobalState('reasoningEffort', reasoningEffort.value)
    await updateGlobalState('shellIntegrationTimeout', shellIntegrationTimeout.value)
  } catch (error) {
    console.error('Failed to save config:', error)
    notification.error({
      message: 'Error',
      description: 'Failed to save configuration'
    })
  }
}

// 监听配置变化
watch(
  [
    apiModelId,
    thinkingBudgetTokens,
    enableExtendedThinking,
    // enableCheckpoints,
    autoApprovalSettings,
    chatSettings,
    reasoningEffort,
    shellIntegrationTimeout,
    apiProvider,
    awsAccessKey,
    awsSecretKey,
    awsSessionToken,
    awsRegion,
    awsUseCrossRegionInference,
    awsEndpointSelected,
    awsBedrockEndpoint,
    liteLlmBaseUrl,
    liteLlmModelId,
    liteLlmApiKey,
    customInstructions
  ],
  async () => {
    // Skip autoApprovalSettings.enabled and chatSettings.mode updates as they're handled by specific watchers
    const currentState = await getGlobalState('autoApprovalSettings')
    const currentChatSettings = await getGlobalState('chatSettings')

    if (
      autoApprovalSettings.value.enabled !== (currentState as AutoApprovalSettings)?.enabled ||
      chatSettings.value.mode !== (currentChatSettings as ChatSettings)?.mode
    ) {
      return
    }
    await saveConfig()
  }
)

// 监听thinkingBudgetTokens变化来同步enableExtendedThinking状态
watch(
  () => thinkingBudgetTokens.value,
  (newValue) => {
    enableExtendedThinking.value = newValue > 0
  }
)

// 监听enableExtendedThinking变化来同步thinkingBudgetTokens
watch(
  () => enableExtendedThinking.value,
  (newValue) => {
    if (!newValue && thinkingBudgetTokens.value > 0) {
      thinkingBudgetTokens.value = 0
    } else if (newValue && thinkingBudgetTokens.value === 0) {
      thinkingBudgetTokens.value = 1024
    }
  }
)

// 组件挂载时加载保存的配置
onMounted(async () => {
  await loadSavedConfig()
})

// 验证 shell integration timeout 输入
const validateTimeout = (value: string) => {
  const timeout = parseInt(value)
  if (isNaN(timeout)) {
    inputError.value = 'Please enter a valid number'
    return false
  }
  if (timeout <= 0) {
    inputError.value = 'Timeout must be greater than 0'
    return false
  }
  if (timeout > 300) {
    inputError.value = 'Timeout must not exceed 300 seconds'
    return false
  }
  inputError.value = ''
  return true
}

// 处理 shell integration timeout 变化
watch(
  () => shellIntegrationTimeout.value,
  (newValue) => {
    if (validateTimeout(String(newValue))) {
      saveConfig()
    }
  }
)

// 处理扩展思考开关
const handleEnableExtendedThinking = (checked: boolean) => {
  if (!checked) {
    thinkingBudgetTokens.value = 0
  } else if (thinkingBudgetTokens.value === 0) {
    thinkingBudgetTokens.value = 1024 // 默认值
  }
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
:deep(.ant-input) {
  color: rgba(255, 255, 255, 0.85);
}

:deep(.ant-checkbox),
:deep(.ant-select-selector),
:deep(.ant-input) {
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

:deep(.ant-checkbox-checked .ant-checkbox-inner),
:deep(.ant-select-focused .ant-select-selector) {
  background-color: #1890ff;
  border-color: #1890ff;
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
</style>
