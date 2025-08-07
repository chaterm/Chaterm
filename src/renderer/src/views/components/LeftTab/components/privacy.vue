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
          <a-collapse
            v-if="userConfig.secretRedaction === 'enabled'"
            class="patterns-collapse"
            size="small"
            ghost
          >
            <a-collapse-panel
              key="patterns"
              :header="$t('user.supportedPatterns')"
            >
              <div class="patterns-list">
                <div
                  v-for="pattern in secretPatterns"
                  :key="pattern.name"
                  class="pattern-item"
                >
                  <div class="pattern-name">
                    {{ pattern.name }}: <code>{{ pattern.regex }}</code>
                  </div>
                </div>
              </div>
            </a-collapse-panel>
          </a-collapse>
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
import { ref, onMounted, watch, computed } from 'vue'
import { notification } from 'ant-design-vue'
import { userConfigStore } from '@/services/userConfigStoreService'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const userConfig = ref({
  secretRedaction: 'disabled',
  dataSync: 'disabled',
  telemetry: 'enabled'
})

const secretPatterns = computed(() => [
  {
    name: t('user.ipv4Address'),
    regex: '\\b((25[0-5]|(2[0-4]|1\\d|[1-9]|)\\d)\\.?\\b){4}\\b'
  },
  {
    name: t('user.ipv6Address'),
    regex: '\\b((([0-9A-Fa-f]{1,4}:){1,6}:)|(([0-9A-Fa-f]{1,4}:){7}))([0-9A-Fa-f]{1,4})\\b'
  },
  {
    name: t('user.slackAppToken'),
    regex: '\\bxapp-[0-9]+-[A-Za-z0-9_]+-[0-9]+-[a-f0-9]+\\b'
  },
  {
    name: t('user.phoneNumber'),
    regex: '\\b(\\+\\d{1,2}\\s)?\\(?\\d{3}\\)?[\\s.-]\\d{3}[\\s.-]\\d{4}\\b'
  },
  {
    name: t('user.awsAccessId'),
    regex: '\\b(AKIA|A3T|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{12,}\\b'
  },
  {
    name: t('user.macAddress'),
    regex: '\\b((([a-zA-z0-9]{2}[-:]){5}([a-zA-z0-9]{2}))|(([a-zA-z0-9]{2}:){5}([a-zA-z0-9]{2})))\\b'
  },
  {
    name: t('user.googleApiKey'),
    regex: '\\bAIza[0-9A-Za-z-_]{35}\\b'
  },
  {
    name: t('user.googleOAuthId'),
    regex: '\\b[0-9]+-[0-9A-Za-z_]{32}\\.apps\\.googleusercontent\\.com\\b'
  },
  {
    name: t('user.githubClassicPersonalAccessToken'),
    regex: '\\bghp_[A-Za-z0-9_]{36}\\b'
  },
  {
    name: t('user.githubFineGrainedPersonalAccessToken'),
    regex: '\\bgithub_pat_[A-Za-z0-9_]{82}\\b'
  },
  {
    name: t('user.githubOAuthAccessToken'),
    regex: '\\bgho_[A-Za-z0-9_]{36}\\b'
  },
  {
    name: t('user.githubUserToServerToken'),
    regex: '\\bghu_[A-Za-z0-9_]{36}\\b'
  },
  {
    name: t('user.githubServerToServerToken'),
    regex: '\\bghs_[A-Za-z0-9_]{36}\\b'
  },
  {
    name: t('user.stripeKey'),
    regex: '\\b(?:r|s)k_(test|live)_[0-9a-zA-Z]{24}\\b'
  },
  {
    name: t('user.firebaseAuthDomain'),
    regex: '\\b([a-z0-9-]){1,30}(\\.firebaseapp\\.com)\\b'
  },
  {
    name: t('user.jsonWebToken'),
    regex: '\\b(ey[a-zA-z0-9_\\-=]{10,}\\.){2}[a-zA-z0-9_\\-=]{10,}\\b'
  },
  {
    name: t('user.openaiApiKey'),
    regex: '\\bsk-[a-zA-Z0-9]{48}\\b'
  },
  {
    name: t('user.anthropicApiKey'),
    regex: '\\bsk-ant-api\\d{0,2}-[a-zA-Z0-9\\-]{80,120}\\b'
  },
  {
    name: t('user.fireworksApiKey'),
    regex: '\\bfw_[a-zA-Z0-9]{24}\\b'
  }
])

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
      message: t('user.loadConfigFailed'),
      description: t('user.loadConfigFailedDescription')
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
      message: t('user.telemetryUpdateFailed'),
      description: t('user.telemetryUpdateFailedDescription')
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

.patterns-collapse {
  margin-top: 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background-color: var(--bg-color-secondary);
}

.patterns-collapse :deep(.ant-collapse-header) {
  background-color: var(--bg-color-secondary);
  color: var(--text-color);
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 500;
}

.patterns-collapse :deep(.ant-collapse-content-box) {
  padding: 12px;
  background-color: var(--bg-color);
}

.patterns-list {
  max-height: 300px;
  overflow-y: auto;
}

.pattern-item {
  margin-bottom: 8px;
  padding: 8px;
  background-color: var(--bg-color-secondary);
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.pattern-item:last-child {
  margin-bottom: 0;
}

.pattern-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 4px;
}

.pattern-name code {
  background-color: var(--bg-color);
  color: var(--text-color-secondary);
  padding: 2px 4px;
  border-radius: 3px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 10px;
  word-break: break-all;
  border: 1px solid var(--border-color);
}
</style>
