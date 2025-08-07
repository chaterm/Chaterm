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
            <span class="label-text">{{ $t('user.privacy') }}</span>
          </template>
        </a-form-item>
        <a-form-item
          :label="$t('user.telemetry')"
          class="user_my-ant-form-item"
        >
          <a-radio-group
            v-model:value="userConfig.telemetry"
            class="custom-radio-group"
            @change="updateTelemetry"
          >
            <a-radio value="enabled">{{ $t('user.telemetryEnabled') }}</a-radio>
            <a-radio value="disabled">{{ $t('user.telemetryDisabled') }}</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item
          class="description-item"
          :label-col="{ span: 0 }"
          :wrapper-col="{ span: 24 }"
        >
          <div class="description">
            {{ $t('user.telemetryDescriptionText') }}
            <a
              href="https://docs.chaterm.ai/user/privacy"
              target="_blank"
              rel="noopener noreferrer"
              class="privacy-link"
            >
              {{ $t('user.privacyPolicy') }}
            </a>
            。
          </div>
        </a-form-item>
        <a-form-item
          :label="$t('user.secretRedaction')"
          class="user_my-ant-form-item"
        >
          <a-radio-group
            v-model:value="userConfig.secretRedaction"
            class="custom-radio-group"
            @change="changeSecretRedaction"
          >
            <a-radio value="enabled">{{ $t('user.secretRedactionEnabled') }}</a-radio>
            <a-radio value="disabled">{{ $t('user.secretRedactionDisabled') }}</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item
          class="description-item"
          :label-col="{ span: 0 }"
          :wrapper-col="{ span: 24 }"
        >
          <div class="description">
            {{ $t('user.secretRedactionDescription') }}
          </div>
        </a-form-item>
        <a-form-item
          :label="$t('user.dataSync')"
          class="user_my-ant-form-item"
        >
          <a-radio-group
            v-model:value="userConfig.dataSync"
            class="custom-radio-group"
            @change="changeDataSync"
          >
            <a-radio value="enabled">{{ $t('user.dataSyncEnabled') }}</a-radio>
            <a-radio value="disabled">{{ $t('user.dataSyncDisabled') }}</a-radio>
          </a-radio-group>
        </a-form-item>

        <a-form-item
          class="description-item"
          :label-col="{ span: 0 }"
          :wrapper-col="{ span: 24 }"
        >
          <div class="description">
            {{ $t('user.dataSyncDescription') }}
          </div>
        </a-form-item>
      </a-form>
    </a-card>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { notification } from 'ant-design-vue'
import { userConfigStore } from '@/services/userConfigStoreService'

const userConfig = ref({
  secretRedaction: 'disabled',
  dataSync: 'disabled',
  telemetry: 'enabled'
})

const loadSavedConfig = async () => {
  try {
    const savedConfig = await userConfigStore.getConfig()
    if (savedConfig) {
      userConfig.value = {
        ...userConfig.value,
        ...savedConfig
      }
    }
  } catch (error) {
    console.error('Failed to load config:', error)
    notification.error({
      message: '加载配置失败',
      description: '将使用默认配置'
    })
  }
}

const saveConfig = async () => {
  try {
    const configToStore = {
      secretRedaction: userConfig.value.secretRedaction,
      dataSync: userConfig.value.dataSync,
      telemetry: userConfig.value.telemetry
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
  async () => {
    await saveConfig()
  },
  { deep: true }
)

onMounted(async () => {
  await loadSavedConfig()
})

const updateTelemetry = async () => {
  try {
    await window.api.sendToMain({
      type: 'telemetrySetting',
      telemetrySetting: userConfig.value.telemetry
    })

    await saveConfig()
  } catch (error) {
    console.error('Failed to change telemetry setting:', error)
    notification.error({
      message: '遥测设置更新失败',
      description: '请稍后重试'
    })
  }
}

const changeSecretRedaction = async () => {
  await saveConfig()
}

const changeDataSync = async () => {
  await saveConfig()
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
  background-color: var(--bg-color) !important;
  border-radius: 6px;
  overflow: hidden;
  padding: 4px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
  color: var(--text-color);
}

:deep(.ant-card) {
  height: 100%;
  background-color: var(--bg-color) !important;
}

:deep(.ant-card-body) {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-color);
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

.custom-form :deep(.ant-input),
.custom-form :deep(.ant-input-number),
.custom-form :deep(.ant-radio-wrapper) {
  color: var(--text-color);
}

.custom-form :deep(.ant-input-number) {
  background-color: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  transition: all 0.3s;
  width: 100px !important;
}

.custom-form :deep(.ant-input-number:hover) {
  border-color: #1890ff;
  background-color: var(--hover-bg-color);
}

.custom-form :deep(.ant-input-number:focus),
.custom-form :deep(.ant-input-number-focused) {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
  background-color: var(--hover-bg-color);
}

.custom-form :deep(.ant-input-number-input) {
  height: 32px;
  padding: 4px 8px;
  background-color: transparent;
  color: var(--text-color);
}

[data-theme='light'] .custom-form :deep(.ant-input-number) {
  background-color: #f5f5f5;
}

[data-theme='light'] .custom-form :deep(.ant-input-number:hover),
[data-theme='light'] .custom-form :deep(.ant-input-number:focus),
[data-theme='light'] .custom-form :deep(.ant-input-number-focused) {
  background-color: #fafafa;
}

[data-theme='dark'] .custom-form :deep(.ant-input-number) {
  background-color: #2a2a2a;
}

[data-theme='dark'] .custom-form :deep(.ant-input-number:hover),
[data-theme='dark'] .custom-form :deep(.ant-input-number:focus),
[data-theme='dark'] .custom-form :deep(.ant-input-number-focused) {
  background-color: #363636;
}

.label-text {
  font-size: 20px;
  font-weight: bold;
  line-height: 1.3;
}

.user_my-ant-form-item {
  -webkit-box-sizing: border-box;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  color: rgba(0, 0, 0, 0.65);
  font-size: 30px;
  font-variant: tabular-nums;
  line-height: 1.5;
  list-style: none;
  -webkit-font-feature-settings: 'tnum';
  font-feature-settings: 'tnum';
  margin-bottom: 14px;
  vertical-align: top;
  color: #ffffff;
}

.divider-container {
  width: calc(65%);
  margin: -10px calc(16%);
}

:deep(.right-aligned-wrapper) {
  text-align: right;
  color: #ffffff;
}

.checkbox-md :deep(.ant-checkbox-inner) {
  width: 20px;
  height: 20px;
}

.description-item {
  margin-top: -15px;
  margin-bottom: 14px;
}

.description-item :deep(.ant-form-item-control) {
  margin-left: 0 !important;
  max-width: 100% !important;
}

.description {
  font-size: 12px;
  color: var(--text-color-secondary);
  line-height: 1.4;
  opacity: 0.8;
  text-align: left;
  margin: 0;
  padding: 0;
  word-wrap: break-word;
}

.description a,
.privacy-link {
  color: #1890ff;
  text-decoration: none;
  transition: color 0.3s;
}

.description a:hover,
.privacy-link:hover {
  color: #40a9ff;
  text-decoration: underline;
}
</style>
