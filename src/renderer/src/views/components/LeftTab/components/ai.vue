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
            v-model:value="userConfig.apiProvider"
            size="small"
            :options="apiProviderOptions"
            show-search
          />
        </a-form-item>
      </div>
      <div v-if="userConfig.apiProvider">
        <div class="setting-item">
          <a-form-item
            :label="$t('user.awsAccessKey')"
            :label-col="{ span: 24 }"
            :wrapper-col="{ span: 24 }"
          >
            <a-input
              v-model:value="userConfig.awsAccessKey"
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
              v-model:value="userConfig.awsSecretKey"
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
              v-model:value="userConfig.awsSessionToken"
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
              v-model:value="userConfig.awsRegion"
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
            v-model:value="userConfig.model"
            size="small"
            :options="aiModelOptions"
            show-search
          />
        </a-form-item>
      </div>

      <!-- Extended Thinking -->
      <div class="setting-item">
        <a-checkbox v-model:checked="userConfig.enableExtendedThinking">
          {{ $t('user.enableExtendedThinking') }}
        </a-checkbox>
        <template v-if="userConfig.enableExtendedThinking">
          <div class="label-container">
            <label class="budget-label">
              <strong>Budget:</strong> {{ userConfig.budget.toLocaleString() }} tokens
            </label>
          </div>

          <div class="slider-container">
            <a-slider
              v-model:value="userConfig.budget"
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
        <a-checkbox v-model:checked="userConfig.autoApproval">
          {{ $t('user.autoApproval') }}
        </a-checkbox>
        <p class="setting-description">
          {{ $t('user.autoApprovalDescribe') }}
        </p>
      </div>
    </a-card>

    <div class="section-header">
      <h3>{{ $t('user.features') }}</h3>
    </div>
    <a-card
      class="settings-section"
      :bordered="false"
    >
      <!-- Checkpoints -->
      <div class="setting-item">
        <a-checkbox v-model:checked="userConfig.enableCheckpoints">
          {{ $t('user.enableCheckpoints') }}
        </a-checkbox>
        <p class="setting-description">
          {{ $t('user.enableCheckpointsDescribe') }}
        </p>
      </div>

      <!-- Reasoning Effort -->
      <div class="setting-item">
        <a-form-item
          :label="$t('user.openAIReasoningEffort')"
          :label-col="{ span: 24 }"
          :wrapper-col="{ span: 24 }"
        >
          <a-select
            v-model:value="userConfig.reasoningEffort"
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
            v-model:value="userConfig.shellIntegrationTimeout"
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
import { userConfigStore } from '@/services/userConfigStoreService'

const apiProviderOptions = ref([{ value: 'Amazon Bedrock', label: 'Amazon Bedrock' }])

const awsRegionOptions = ref([{ value: 'us-east-1', label: 'us-east-1' }])

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

const userConfig = ref({
  model: 'anthropic.claude-3-7-sonnet-20250219-v1:0',
  enableExtendedThinking: false,
  budget: 1024,
  enableCheckpoints: false,
  autoApproval: false,
  reasoningEffort: 'low',
  shellIntegrationTimeout: 4,
  apiProvider: 'Amazon Bedrock',
  awsAccessKey: '',
  awsSecretKey: '',
  awsSessionToken: '',
  awsRegion: ''
})

const inputError = ref('')

// 加载保存的配置
const loadSavedConfig = async () => {
  try {
    const savedConfig = await userConfigStore.getConfig()
    if (savedConfig) {
      userConfig.value = { ...userConfig.value, ...savedConfig }
    }
  } catch (error) {
    console.error('Failed to load config:', error)
    notification.error({
      message: 'Error',
      description: 'Failed to load saved configuration'
    })
  }
}

// 保存配置到 IndexedDB
const saveConfig = async () => {
  try {
    await userConfigStore.saveConfig(userConfig.value)
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
  () => userConfig.value,
  async () => {
    await saveConfig()
  },
  { deep: true }
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
  () => userConfig.value.shellIntegrationTimeout,
  (newValue) => {
    if (validateTimeout(String(newValue))) {
      saveConfig()
    }
  }
)
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
    color: rgba(255, 255, 255, 0.65) !important;
  }
}

// 添加选择框的特定样式
:deep(.ant-select) {
  .ant-select-selector {
    background-color: #4a4a4a !important;
    border: none;

    .ant-select-selection-placeholder {
      color: rgba(255, 255, 255, 0.65) !important;
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
</style>
