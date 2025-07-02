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
            @change="getApiProviderDefaultModelId"
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
            style="width: calc(100% - 100px); margin-right: 6px"
          />
          <a-input
            v-else-if="apiProvider === 'litellm'"
            v-model:value="liteLlmModelId"
            size="small"
            style="width: calc(100% - 100px); margin-right: 6px"
          />
          <a-select
            v-else-if="apiProvider === 'deepseek'"
            v-model:value="apiModelId"
            size="small"
            :options="deepseekAiModelOptions"
            show-search
            style="width: calc(100% - 100px); margin-right: 6px"
          />
          <a-button
            class="check-btn"
            size="small"
            :loading="checkLoading"
            @click="handleCheck"
          >
            Check
          </a-button>
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
            <a-select-option value="cmd">Command</a-select-option>
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
            <label class="budget-label"> <strong>Budget:</strong> {{ thinkingBudgetTokens.toLocaleString() }} tokens </label>
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
            <a-select-option value="medium">{{ $t('user.openAIReasoningEffortMedium') }}</a-select-option>
            <a-select-option value="high">{{ $t('user.openAIReasoningEffortHigh') }}</a-select-option>
          </a-select>
        </a-form-item>
      </div>
    </a-card>

    <div class="section-header">
      <h3>{{ $t('user.proxySettings') }}</h3>
    </div>
    <a-card
      class="settings-section"
      :bordered="false"
    >
      <!-- 开关 -->
      <div class="setting-item">
        <a-checkbox v-model:checked="needProxy">
          {{ $t('user.enableProxy') }}
        </a-checkbox>

        <!-- 配置项：仅在开启时显示 -->
        <template v-if="needProxy">
          <div class="setting-item">
            <a-form-item
              :label="$t('user.proxyType')"
              :label-col="{ span: 24 }"
              :wrapper-col="{ span: 24 }"
            >
              <a-select
                v-model:value="proxyConfig.type"
                size="small"
              >
                <a-select-option value="HTTP">HTTP</a-select-option>
                <a-select-option value="HTTPS">HTTPS</a-select-option>
                <a-select-option value="SOCKS4">SOCKS4</a-select-option>
                <a-select-option value="SOCKS5">SOCKS5</a-select-option>
              </a-select>
            </a-form-item>
          </div>
          <div class="setting-item">
            <a-form-item
              :label="$t('user.proxyHost')"
              :label-col="{ span: 24 }"
              :wrapper-col="{ span: 24 }"
            >
              <a-input
                v-model:value="proxyConfig.host"
                placeholder="127.0.0.1"
              />
            </a-form-item>
          </div>

          <div class="setting-item">
            <a-form-item
              :label="$t('user.proxyPort')"
              :label-col="{ span: 24 }"
              :wrapper-col="{ span: 24 }"
            >
              <a-input-number
                v-model:value="proxyConfig.port"
                :min="1"
                :max="65535"
                style="width: 100%"
              />
            </a-form-item>
          </div>

          <div class="setting-item">
            <!-- AWS VPC Endpoint Checkbox -->
            <a-checkbox v-model:checked="proxyConfig.enableProxyIdentity">
              {{ $t('user.enableProxyIdentity') }}
            </a-checkbox>

            <!-- AWS VPC Endpoint Input -->
            <template v-if="proxyConfig.enableProxyIdentity">
              <a-form-item
                :label="$t('user.proxyUsername')"
                :label-col="{ span: 24 }"
                :wrapper-col="{ span: 24 }"
              >
                <a-input v-model:value="proxyConfig.username" />
              </a-form-item>
              <a-form-item
                :label="$t('user.proxyPassword')"
                :label-col="{ span: 24 }"
                :wrapper-col="{ span: 24 }"
              >
                <a-input-password v-model:value="proxyConfig.password" />
              </a-form-item>
            </template>
          </div>
        </template>
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
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { notification } from 'ant-design-vue'
import { updateGlobalState, getGlobalState, getSecret, storeSecret } from '@renderer/agent/storage/state'
import { AutoApprovalSettings, DEFAULT_AUTO_APPROVAL_SETTINGS } from '@/agent/storage/shared'
import { ChatSettings, DEFAULT_CHAT_SETTINGS, ProxyConfig } from '@/agent/storage/shared'
import { aiModelOptions, deepseekAiModelOptions } from './aiOptions'
import eventBus from '@/utils/eventBus'
import i18n from '@/locales'

const { t } = i18n.global
const apiProviderOptions = ref([
  { value: 'litellm', label: 'OpenAI Compatible' },
  { value: 'bedrock', label: 'Amazon Bedrock' },
  { value: 'deepseek', label: 'DeepSeek' }
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
const liteLlmModelId = ref('')
const deepSeekApiKey = ref('')
const autoApprovalSettings = ref<AutoApprovalSettings>(DEFAULT_AUTO_APPROVAL_SETTINGS)
const chatSettings = ref<ChatSettings>(DEFAULT_CHAT_SETTINGS)
const customInstructions = ref('')
const inputError = ref('')
const checkLoading = ref(false)
const needProxy = ref(false)
const defaultProxyConfig: ProxyConfig = {
  type: 'SOCKS5',
  host: '',
  port: 22,
  enableProxyIdentity: false,
  username: '',
  password: ''
}
const proxyConfig = ref<ProxyConfig>(defaultProxyConfig)

// Add specific watch for autoApprovalSettings.enabled
watch(
  () => autoApprovalSettings.value.enabled,
  async (newValue) => {
    try {
      // Create a clean object with only the necessary properties
      const settingsToStore = {
        version: (autoApprovalSettings.value.version || 1) + 1,
        enabled: newValue,
        actions: {
          ...autoApprovalSettings.value.actions,
          executeAllCommands: newValue // 根据开关状态设置 executeAllCommands
        },
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
      eventBus.emit('SettingModelChanged', [newValue, apiModelId.value, liteLlmModelId.value])
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
    apiProvider.value = ((await getGlobalState('apiProvider')) as string) || 'litellm'
    //aws信息
    apiModelId.value = ((await getGlobalState('apiModelId')) as string) || ''
    awsRegion.value = ((await getGlobalState('awsRegion')) as string) || ''
    awsUseCrossRegionInference.value = ((await getGlobalState('awsUseCrossRegionInference')) as boolean) || false
    awsBedrockEndpoint.value = ((await getGlobalState('awsBedrockEndpoint')) as string) || ''
    awsAccessKey.value = (await getSecret('awsAccessKey')) || ''
    awsSecretKey.value = (await getSecret('awsSecretKey')) || ''
    awsSessionToken.value = (await getSecret('awsSessionToken')) || ''
    //openai信息
    liteLlmModelId.value = ((await getGlobalState('liteLlmModelId')) as string) || 'claude-3-7-sonnet'
    liteLlmBaseUrl.value = ((await getGlobalState('liteLlmBaseUrl')) as string) || ''
    liteLlmApiKey.value = (await getSecret('liteLlmApiKey')) || ''
    deepSeekApiKey.value = (await getSecret('deepSeekApiKey')) || ''
    // 加载其他配置
    thinkingBudgetTokens.value = ((await getGlobalState('thinkingBudgetTokens')) as number) || 2048
    customInstructions.value = ((await getGlobalState('customInstructions')) as string) || ''

    needProxy.value = ((await getGlobalState('needProxy')) as boolean) || false
    proxyConfig.value = ((await getGlobalState('proxyConfig')) as ProxyConfig) || defaultProxyConfig
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
    shellIntegrationTimeout.value = ((await getGlobalState('shellIntegrationTimeout')) as number) || 4
    awsEndpointSelected.value = ((await getGlobalState('awsEndpointSelected')) as boolean) || false
    if (!checkApiProviderAndModelId()) {
      getApiProviderDefaultModelId()
    }
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
    await storeSecret('deepSeekApiKey', deepSeekApiKey.value)

    // 保存其他配置
    await updateGlobalState('thinkingBudgetTokens', thinkingBudgetTokens.value)
    await updateGlobalState('customInstructions', customInstructions.value)
    // await updateGlobalState('enableCheckpoints', enableCheckpoints.value)
    const settingsToSave: AutoApprovalSettings = {
      version: autoApprovalSettings.value.version,
      enabled: autoApprovalSettings.value.enabled,
      actions: { ...autoApprovalSettings.value.actions },
      maxRequests: autoApprovalSettings.value.maxRequests,
      enableNotifications: autoApprovalSettings.value.enableNotifications,
      favorites: [...(autoApprovalSettings.value.favorites || [])]
    }
    await updateGlobalState('autoApprovalSettings', settingsToSave)
    const chatSettingsToSave: ChatSettings = {
      mode: chatSettings.value.mode
    }
    await updateGlobalState('chatSettings', chatSettingsToSave)
    await updateGlobalState('reasoningEffort', reasoningEffort.value)
    await updateGlobalState('shellIntegrationTimeout', shellIntegrationTimeout.value)
    await updateGlobalState('needProxy', needProxy.value)
    const proxyConfigToSave: ProxyConfig = {
      ...proxyConfig.value
    }
    await updateGlobalState('proxyConfig', proxyConfigToSave)
  } catch (error) {
    console.error('Failed to save config:', error)
    notification.error({
      message: 'Error',
      description: 'Failed to save configuration'
    })
  }
}

watch(
  () => apiProvider.value,
  async (newValue) => {
    try {
      await updateGlobalState('apiProvider', newValue)
    } catch (error) {
      console.error('Failed to update apiProvider:', error)
    }
  }
)

watch(
  () => apiModelId.value,
  async (newValue) => {
    try {
      await updateGlobalState('apiModelId', newValue)
    } catch (error) {
      console.error('Failed to update apiModelId:', error)
    }
  }
)

watch(
  () => reasoningEffort.value,
  async (newValue) => {
    try {
      await updateGlobalState('reasoningEffort', newValue)
    } catch (error) {
      console.error('Failed to update reasoningEffort:', error)
    }
  }
)

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
  () => customInstructions.value,
  async (newValue) => {
    try {
      await updateGlobalState('customInstructions', newValue)
    } catch (error) {
      console.error('Failed to update customInstructions:', error)
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

// 监听thinkingBudgetTokens变化来同步enableExtendedThinking状态
watch(
  () => thinkingBudgetTokens.value,
  async (newValue) => {
    enableExtendedThinking.value = newValue > 0
    await updateGlobalState('thinkingBudgetTokens', newValue)
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
  await saveConfig()
  // 添加事件监听
  eventBus.on('AiTabModelChanged', async (newValue) => {
    console.log(newValue)
    await changeModel(newValue)
  })
})

const changeModel = (newValue) => {
  chatSettings.value.mode = newValue?.[0]
  switch (apiProvider.value) {
    case 'bedrock':
      apiModelId.value = newValue?.[1]
      break
    case 'litellm':
      liteLlmModelId.value = newValue?.[1]
      break
    case 'deepseek':
      apiModelId.value = newValue?.[1]
      break
  }
}

// 组件卸载前保存配置
onBeforeUnmount(async () => {
  await saveConfig()
  // 移除 apiProvider 变更事件监听
  eventBus.off('AiTabModelChanged')
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
  async (newValue) => {
    try {
      if (validateTimeout(String(newValue))) {
        await updateGlobalState('shellIntegrationTimeout', newValue)
      }
    } catch (error) {
      console.error('Failed to update shellIntegrationTimeout:', error)
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

watch([apiProvider, apiModelId, liteLlmModelId], async (newValue) => {
  try {
    // 发送事件通知其他组件
    eventBus.emit('SettingModelChanged', newValue)
  } catch (error) {
    console.error('Failed to update AiTab', error)
  }
})

const getApiProviderDefaultModelId = () => {
  switch (apiProvider.value) {
    case 'bedrock':
      apiModelId.value = 'anthropic.claude-3-7-sonnet-20250219-v1:0'
      break
    case 'litellm':
      if (liteLlmModelId.value === '') {
        liteLlmModelId.value = 'claude-3-7-sonnet'
      }
      break
    case 'deepseek':
      apiModelId.value = 'deepseek-chat'
      break
  }
}

const checkApiProviderAndModelId = () => {
  interface ModelOption {
    value: string
    label: string
  }

  let checkModelList: ModelOption[] = []
  switch (apiProvider.value) {
    case 'bedrock':
      checkModelList = aiModelOptions
      break
    case 'litellm':
      return true
    case 'deepseek':
      checkModelList = deepseekAiModelOptions
      break
  }
  const modelIndex = checkModelList.findIndex((model) => model.value === apiModelId.value)
  return modelIndex !== -1
}

const isEmptyValue = (value) => value === undefined || value === ''

const checkModelConfig = async () => {
  const apiProvider = await getGlobalState('apiProvider')
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
  try {
    checkLoading.value = true
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
  }
}
</script>

<style lang="less" scoped>
.settings-section {
  background-color: var(--bg-color);

  :deep(.ant-card-body) {
    padding: 16px;
  }

  :deep(.ant-form-item) {
    .ant-form-item-label > label {
      color: var(--text-color);
    }
  }
}

.section-header {
  margin-top: 8px;
  margin-left: 16px;

  h3 {
    font-size: 20px;
    font-weight: 500;
    margin: 0;
    color: var(--text-color);
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
  color: var(--text-color);
}

:deep(.ant-checkbox) {
  border: 0 !important;
}

:deep(.ant-select-selector),
:deep(.ant-input),
:deep(.ant-input-number),
:deep(.ant-input-password) {
  background-color: var(--bg-color-secondary) !important;
  border: 1px solid var(--border-color);

  &:hover,
  &:focus {
    border-color: #1890ff;
  }

  &::placeholder {
    color: var(--text-color-tertiary) !important;
  }
}

// 密码输入框特定样式
:deep(.ant-input-password) {
  .ant-input {
    background-color: var(--bg-color-secondary) !important;
    color: var(--text-color);
  }

  .anticon {
    color: var(--text-color-tertiary);
  }

  &:hover .anticon {
    color: var(--text-color-secondary);
  }
}
:deep(.ant-input-number) {
  .ant-input-number-input {
    background-color: #4a4a4a !important;
    color: rgba(255, 255, 255, 0.85);
  }
}

// 添加选择框的特定样式
:deep(.ant-select) {
  .ant-select-selector {
    background-color: var(--bg-color-secondary) !important;
    border: 1px solid var(--border-color);

    .ant-select-selection-placeholder {
      color: var(--text-color-tertiary) !important;
    }
  }

  &.ant-select-focused {
    .ant-select-selector {
      background-color: var(--bg-color-secondary) !important;
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
  background-color: var(--bg-color);
  border: 1px solid var(--border-color);

  .ant-select-item {
    color: var(--text-color);
    background-color: var(--bg-color);

    &-option-active,
    &-option-selected {
      color: var(--text-color) !important;
      background-color: var(--hover-bg-color);
    }

    &-option:hover {
      color: var(--text-color);
      background-color: var(--hover-bg-color);
    }
  }
}

// 选择框中已选项的颜色
:deep(.ant-select-selection-item) {
  color: var(--text-color) !important;
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
      background-color: var(--bg-color-secondary);
    }

    // 已选择部分的轨道样式
    .ant-slider-track {
      background-color: #1890ff;
    }

    // 滑块手柄样式
    .ant-slider-handle {
      background-color: var(--bg-color);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);

      &:focus {
        box-shadow: 0 0 0 5px rgba(24, 144, 255, 0.2);
      }

      &:hover {
        border-color: #40a9ff;
      }

      &:active {
        box-shadow: 0 0 0 5px rgba(24, 144, 255, 0.2);
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
  margin-bottom: 8px;
}

// 减小label和输入框之间的间距
:deep(.ant-form-item-label) {
  padding-bottom: 0;
  > label {
    height: 24px;
    line-height: 24px;
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
      background-color: var(--hover-bg-color);
      color: var(--text-color);
      border: none;
      width: 90%;
      margin-left: auto;
    }

    &.assistant {
      align-self: flex-start;
      background-color: var(--bg-color-secondary);
      color: var(--text-color);
      border: 1px solid var(--border-color);
      width: 100%;
    }
  }
}

.check-btn {
  margin-left: 4px;
  width: 90px;
  background-color: var(--bg-color-secondary) !important;
  color: var(--text-color) !important;
  border: 1px solid var(--border-color) !important;
  box-shadow: none !important;
  transition: background 0.2s;
}

.check-btn:hover,
.check-btn:focus {
  background-color: var(--hover-bg-color) !important;
  color: var(--text-color) !important;
  border-color: #1890ff !important;
}
</style>
