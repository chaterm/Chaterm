<template>
  <div class="userInfo">
    <a-card
      :bordered="false"
      class="userInfo-container"
    >
      <a-form
        :colon="false"
        label-align="left"
        wrapper-align="right"
        :label-col="{ span: 7, offset: 0 }"
        :wrapper-col="{ span: 17, class: 'right-aligned-wrapper' }"
        class="custom-form"
      >
        <a-form-item>
          <template #label>
            <span class="label-text">{{ $t('common.extensions') }}</span>
          </template>
        </a-form-item>
        <a-form-item
          :label="$t('user.autoCompleteStatus')"
          class="user_my-ant-form-item"
        >
          <a-switch
            :checked="userConfig.autoCompleteStatus === 1"
            class="user_my-ant-form-item-content"
            @change="handleAutoCompleteChange"
          />
        </a-form-item>
        <a-form-item>
          <template #label>
            {{ $t('user.visualVimEditor') }}
          </template>
          <a-switch
            :checked="userConfig.quickVimStatus === 1"
            @change="handleSwitchChange"
          />
        </a-form-item>

        <a-form-item
          :label="$t('user.aliasStatus')"
          class="user_my-ant-form-item"
        >
          <a-switch
            :checked="userConfig.aliasStatus === 1"
            class="user_my-ant-form-item-content"
            @change="(checked) => handleAliasStatusChange(checked)"
          />
        </a-form-item>
        <a-form-item
          :label="$t('user.highlightStatus')"
          class="user_my-ant-form-item"
        >
          <a-switch
            :checked="userConfig.highlightStatus === 1"
            class="user_my-ant-form-item-content"
            @change="handleHighlightChange"
          />
        </a-form-item>
      </a-form>
    </a-card>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import 'xterm/css/xterm.css'
import { notification } from 'ant-design-vue'
import { userConfigStore } from '@/services/userConfigStoreService'
import eventBus from '@/utils/eventBus'
import { captureExtensionUsage, ExtensionNames, ExtensionStatus } from '@/utils/telemetry'

const userConfig = ref({
  autoCompleteStatus: 1,
  vimStatus: false,
  quickVimStatus: 1,
  commonVimStatus: 2,
  aliasStatus: 2,
  highlightStatus: 2
})

const loadSavedConfig = async () => {
  try {
    const savedConfig = await userConfigStore.getConfig()
    if (savedConfig) {
      userConfig.value = {
        ...userConfig.value,
        ...savedConfig,
        vimStatus: !(savedConfig.commonVimStatus === 2 && savedConfig.quickVimStatus === 2)
      }
    }
  } catch (error) {
    console.error('Failed to load config:', error)
    notification.error({
      message: 'Error',
      description: 'Failed to load saved configuration'
    })
  }
}

const saveConfig = async () => {
  try {
    const configToStore = {
      autoCompleteStatus: userConfig.value.autoCompleteStatus,
      vimStatus: userConfig.value.vimStatus,
      quickVimStatus: userConfig.value.quickVimStatus,
      commonVimStatus: userConfig.value.commonVimStatus,
      aliasStatus: userConfig.value.aliasStatus,
      highlightStatus: userConfig.value.highlightStatus
    }

    await userConfigStore.saveConfig(configToStore)
  } catch (error) {
    console.error('Failed to save config:', error)
    notification.error({
      message: 'Error',
      description: 'Failed to save configuration'
    })
  }
}

watch(
  () => userConfig.value,
  async (newValue, oldValue) => {
    if (oldValue && newValue.aliasStatus !== oldValue.aliasStatus) {
      return
    }

    await saveConfig()
  },
  { deep: true }
)

onMounted(async () => {
  await loadSavedConfig()
})

const handleAutoCompleteChange = async (checked) => {
  const newValue = checked ? 1 : 2
  userConfig.value.autoCompleteStatus = newValue

  const status = checked ? ExtensionStatus.ENABLED : ExtensionStatus.DISABLED
  await captureExtensionUsage(ExtensionNames.AUTO_COMPLETE, status)
}

const handleSwitchChange = async (value) => {
  userConfig.value.quickVimStatus = value ? 1 : 2

  const status = value ? ExtensionStatus.ENABLED : ExtensionStatus.DISABLED
  await captureExtensionUsage(ExtensionNames.VIM_EDITOR, status)
}

const handleAliasStatusChange = async (checked) => {
  const newValue = checked ? 1 : 2
  userConfig.value.aliasStatus = newValue

  try {
    await saveConfig()
    eventBus.emit('aliasStatusChanged', newValue)

    const status = checked ? ExtensionStatus.ENABLED : ExtensionStatus.DISABLED
    await captureExtensionUsage(ExtensionNames.ALIAS, status)
  } catch (error) {
    console.error('保存别名状态失败:', error)
    notification.error({
      message: '错误',
      description: '保存别名状态失败'
    })
  }
}

const handleHighlightChange = async (checked) => {
  const newValue = checked ? 1 : 2
  userConfig.value.highlightStatus = newValue

  const status = checked ? ExtensionStatus.ENABLED : ExtensionStatus.DISABLED
  await captureExtensionUsage(ExtensionNames.HIGHLIGHT, status)
}
</script>

<style scoped>
.userInfo {
  width: 100%;
  height: 100%;
}

.userInfo-container {
  width: 100%;
  height: 100%;
  background-color: var(--bg-color);
  border-radius: 6px;
  overflow: hidden;
  padding: 4px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
  color: var(--text-color);
}

:deep(.ant-card) {
  height: 100%;
}

:deep(.ant-card-body) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.custom-form {
  color: var(--text-color);
  align-content: center;
}

.custom-form :deep(.ant-form-item-label) {
  padding-right: 20px;
}

.custom-form :deep(.ant-form-item-label > label) {
  color: var(--text-color);
}

.custom-form :deep(.ant-form-item) {
  margin-bottom: 14px !important;
}

.custom-form :deep(.ant-input),
.custom-form :deep(.ant-input-password input) {
  color: var(--text-color);
  border-color: var(--border-color);
  background-color: var(--bg-color-secondary);
}

.custom-form :deep(.ant-input-number-handler-wrap) {
  display: none;
}

.custom-form :deep(.ant-input-number-input) {
  padding-right: 0;
  color: var(--text-color);
  background-color: var(--bg-color-secondary);
}

.custom-form :deep(.ant-radio-wrapper) {
  color: var(--text-color);
}

.custom-form :deep(.ant-badge-status-success .ant-badge-status-dot) {
  background-color: #52c41a !important;
  box-shadow: 0 0 0 2px rgba(82, 196, 26, 0.1);
}

.custom-form :deep(.ant-badge-status-error .ant-badge-status-dot) {
  background-color: #ff4d4f !important;
  box-shadow: 0 0 0 2px rgba(255, 77, 79, 0.1);
}

.custom-form :deep(.ant-badge-status-text) {
  color: var(--text-color);
}

.custom-form :deep(.ant-switch) {
  background-color: var(--bg-color-secondary);
}

.custom-form :deep(.ant-switch.ant-switch-checked) {
  background: #1890ff !important;
}

.custom-form :deep(.ant-radio-wrapper) {
  color: var(--text-color);
}

.custom-form :deep(.ant-form-item-explain-error) {
  color: #ff4d4f;
}

.custom-form :deep(.ant-form-item-required::before) {
  color: #ff4d4f;
}

.user_my-ant-form-item {
  -webkit-box-sizing: border-box;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  color: var(--text-color);
  font-size: 30px;
  font-variant: tabular-nums;
  line-height: 1.5;
  list-style: none;
  -webkit-font-feature-settings: 'tnum';
  font-feature-settings: 'tnum';
  vertical-align: top;
}

.user_avatar {
  margin: 0 auto;
  width: 104px;
  height: 104px;
  margin-bottom: 20px;
  border-radius: 50%;
  overflow: hidden;

  img {
    height: 100%;
    width: 100%;
  }
}

.registration_type {
  text-align: center;
  font-weight: bold;
}

.divider-container {
  width: calc(65%);
  margin: -10px calc(16%);
}

:deep(.right-aligned-wrapper) {
  text-align: right;
  color: var(--text-color);
}

.label-text {
  font-size: 20px;
  font-weight: bold;
  line-height: 1.3;
}

.checkbox-md :deep(.ant-checkbox-inner) {
  width: 20px;
  height: 20px;
}
</style>
