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
          v-if="!telemetryPolicyHidden"
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
          v-if="!telemetryPolicyHidden"
          class="description-item"
          :label-col="{ span: 0 }"
          :wrapper-col="{ span: 24 }"
        >
          <div class="description">
            {{ $t('user.telemetryDescriptionText') }}
            <a
              :href="privacyUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="privacy-link"
            >
              {{ $t('user.privacyPolicy') }}.
            </a>
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
          v-if="isUserLoggedIn && !dataSyncPolicyHidden"
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
          v-if="isUserLoggedIn && !dataSyncPolicyHidden"
          class="description-item"
          :label-col="{ span: 0 }"
          :wrapper-col="{ span: 24 }"
        >
          <div class="description">
            {{ $t('user.dataSyncDescription') }}
          </div>
        </a-form-item>
        <a-form-item
          v-if="isUserLoggedIn && deployStatus === 0"
          class="account-management-item"
          :label-col="{ span: 0 }"
          :wrapper-col="{ span: 24 }"
        >
          <div class="account-management-section">
            <div class="account-management-content">
              <div class="account-management-header">{{ $t('user.accountManagement') }}</div>
              <div class="description account-management-description">
                {{ $t('user.deactivateAccountDescription') }}
              </div>
            </div>
            <div class="account-management-action">
              <a-button
                danger
                :loading="deactivateLoading"
                class="deactivate-account-button"
                @click="openDeactivateModal"
              >
                {{ $t('user.deactivateAccount') }}
              </a-button>
            </div>
          </div>
        </a-form-item>
      </a-form>
    </a-card>

    <a-modal
      v-model:open="deactivateModalOpen"
      wrap-class-name="deactivate-account-modal"
      :title="$t('user.deactivateAccountConfirmTitle')"
      :ok-text="$t('user.deactivateAccount')"
      :cancel-text="$t('common.cancel')"
      :confirm-loading="deactivateLoading"
      :ok-button-props="{ type: 'primary', danger: true, disabled: !canConfirmDeactivation }"
      @ok="handleDeactivateAccount"
      @cancel="closeDeactivateModal"
    >
      <div class="deactivate-modal-content">
        <p class="deactivate-modal-description">
          {{ $t('user.deactivateAccountConfirmDescription') }}
        </p>
        <a-input
          v-model:value="deactivateConfirmationInput"
          :placeholder="t('user.deactivateAccountInputPlaceholder', { keyword: deactivateAccountConfirmKeyword })"
        />
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { notification } from 'ant-design-vue'
import { userConfigStore, remoteApplyGuard, getStoredUserConfigSnapshot, resolveDataSyncPreference } from '@/services/userConfigStoreService'
import { dataSyncService } from '@/services/dataSyncService'
import { chatSyncService } from '@/services/chatSyncService'
import { shortcutService } from '@/services/shortcutService'
import { useI18n } from 'vue-i18n'
import { getPrivacyPolicyUrl } from '@/utils/edition'
import { getUserInfo, removeToken } from '@/utils/permission'
import eventBus from '@/utils/eventBus'
import type { TelemetrySetting } from '@shared/TelemetrySetting'
import { deactivateAccount } from '@/api/user/user'
import { useRouter } from 'vue-router'
import { userInfoStore } from '@/store'
import { pinia } from '@/main'

const logger = createRendererLogger('settings.privacy')
const { t } = useI18n()
const router = useRouter()
const userStore = userInfoStore(pinia)

const privacyUrl = getPrivacyPolicyUrl()
const deactivateModalOpen = ref(false)
const deactivateLoading = ref(false)
const deactivateConfirmationInput = ref('')

const userConfig = ref({
  secretRedaction: 'disabled',
  dataSync: 'enabled',
  telemetry: 'enabled'
})

const deactivateAccountConfirmKeyword = computed(() => t('user.deactivateAccountConfirmKeyword'))
const canConfirmDeactivation = computed(
  () => deactivateConfirmationInput.value.trim() === deactivateAccountConfirmKeyword.value && !deactivateLoading.value
)

const isUserLoggedIn = computed(() => {
  const token = localStorage.getItem('ctm-token')
  const isSkippedLogin = localStorage.getItem('login-skipped') === 'true'
  try {
    const userInfo = getUserInfo()
    return !!(token && token !== 'guest_token' && !isSkippedLogin && userInfo?.uid)
  } catch (error) {
    logger.error('Failed to read user info', { error: error })
    return false
  }
})

const parsePolicyEnabled = (raw: unknown): boolean | null => {
  if (typeof raw !== 'string') return null
  const normalized = raw.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return null
}
const telemetryPolicyEnabled = parsePolicyEnabled(import.meta.env.RENDERER_TELEMETRY_ENABLED)
const dataSyncPolicyEnabled = parsePolicyEnabled(import.meta.env.RENDERER_DATA_SYNC_ENABLED)
const telemetryPolicyHidden = computed(() => telemetryPolicyEnabled === false)
const dataSyncPolicyHidden = computed(() => dataSyncPolicyEnabled === false)
const parseDeployStatus = (raw: unknown): number => {
  if (typeof raw !== 'string') return 0
  const normalized = raw.trim()
  if (!normalized) return 0
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return 0
  return parsed
}
const deployStatus = computed(() => parseDeployStatus(import.meta.env.RENDERER_DEPLOY_STATUS))

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
    regex: '\\b((([a-zA-Z0-9]{2}[-:]){5}([a-zA-Z0-9]{2}))|(([a-zA-Z0-9]{2}:){5}([a-zA-Z0-9]{2})))\\b'
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
    regex: '\\b(ey[a-zA-Z0-9_\\-=]{10,}\\.){2}[a-zA-Z0-9_\\-=]{10,}\\b'
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
    const rawConfig = await getStoredUserConfigSnapshot()
    const savedConfig = await userConfigStore.getConfig()
    if (savedConfig) {
      const resolvedDataSync = resolveDataSyncPreference(rawConfig, isUserLoggedIn.value)

      if (!rawConfig?.dataSync && isUserLoggedIn.value) {
        await userConfigStore.saveConfig({
          ...savedConfig,
          dataSync: 'enabled'
        } as any)
      }

      userConfig.value = {
        ...userConfig.value,
        ...savedConfig,
        secretRedaction: (savedConfig.secretRedaction || 'enabled') as 'enabled' | 'disabled',
        dataSync: resolvedDataSync,
        telemetry: ((savedConfig as any).telemetry || 'unset') as 'unset' | 'enabled' | 'disabled'
      } as any
      if (telemetryPolicyEnabled === false) {
        userConfig.value.telemetry = 'disabled'
      }
      if (dataSyncPolicyEnabled === false) {
        userConfig.value.dataSync = 'disabled'
      }
      await saveConfig()
    }
  } catch (error) {
    logger.error('Failed to load config', { error: error })
    notification.error({
      message: t('user.loadConfigFailed'),
      description: t('user.loadConfigFailedDescription')
    })
  }
}

const saveConfig = async () => {
  try {
    const configToStore = {
      secretRedaction: (userConfig.value.secretRedaction || 'enabled') as 'enabled' | 'disabled',
      dataSync: (userConfig.value.dataSync || 'enabled') as 'enabled' | 'disabled',
      telemetry: ((userConfig.value as any).telemetry || 'unset') as 'unset' | 'enabled' | 'disabled'
    }
    await userConfigStore.saveConfig(configToStore as any)
  } catch (error) {
    logger.error('Failed to save config', { error: error })
    notification.error({
      message: t('user.error'),
      description: t('user.saveConfigFailedDescription')
    })
  }
}

watch(
  () => userConfig.value,
  async () => {
    if (remoteApplyGuard.isApplying) return
    await saveConfig()
  },
  { deep: true }
)

const reloadConfigOnSync = async () => {
  await loadSavedConfig()
}

onMounted(async () => {
  await loadSavedConfig()
  eventBus.on('userConfigSyncApplied', reloadConfigOnSync)
})

onBeforeUnmount(() => {
  eventBus.off('userConfigSyncApplied', reloadConfigOnSync)
})

const updateTelemetry = async () => {
  try {
    if (telemetryPolicyEnabled === false) {
      userConfig.value.telemetry = 'disabled'
    }
    await window.api.sendToMain({
      type: 'telemetrySetting',
      telemetrySetting: userConfig.value.telemetry as TelemetrySetting
    })

    await saveConfig()
  } catch (error) {
    logger.error('Failed to change telemetry setting', { error: error })
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
  if (dataSyncPolicyEnabled === false) {
    userConfig.value.dataSync = 'disabled'
    await saveConfig()
    await dataSyncService.disableDataSync()
    return
  }
  await saveConfig()

  const isEnabled = userConfig.value.dataSync === 'enabled'

  try {
    let success = false

    if (isEnabled) {
      success = await dataSyncService.enableDataSync()
    } else {
      success = await dataSyncService.disableDataSync()
    }

    if (success) {
      notification.success({
        message: t('user.dataSyncUpdateSuccess'),
        description: isEnabled ? t('user.dataSyncEnabledSuccess') : t('user.dataSyncDisabledSuccess')
      })
    } else {
      notification.error({
        message: t('user.dataSyncUpdateFailed'),
        description: t('user.retryLater')
      })
    }
  } catch (error) {
    logger.error('Failed to change data sync setting', { error: error })
    notification.error({
      message: t('user.dataSyncUpdateFailed'),
      description: t('user.retryLater')
    })
  }
}

const openDeactivateModal = () => {
  deactivateConfirmationInput.value = ''
  deactivateModalOpen.value = true
}

const closeDeactivateModal = () => {
  if (deactivateLoading.value) return
  deactivateConfirmationInput.value = ''
  deactivateModalOpen.value = false
}

const cleanupLocalAccountState = async () => {
  try {
    if (dataSyncService.getInitializationStatus()) {
      await dataSyncService.disableDataSync()
      dataSyncService.reset()
    } else {
      await chatSyncService.disable()
      chatSyncService.reset()
    }
  } catch (error) {
    logger.error('Failed to clean sync state after account deactivation', { error })
  }

  userStore.deleteInfo()
  removeToken()
  shortcutService.init()
}

const handleDeactivateAccount = async () => {
  if (!canConfirmDeactivation.value) return

  const currentUser = getUserInfo()
  const uid = Number(currentUser?.uid)

  if (!uid) {
    notification.error({
      message: t('user.deactivateAccountFailed'),
      description: t('user.deactivateAccountUserMissing')
    })
    return
  }

  deactivateLoading.value = true

  try {
    await deactivateAccount({ uid })
    await cleanupLocalAccountState()
    deactivateConfirmationInput.value = ''
    deactivateModalOpen.value = false
    notification.success({
      message: t('user.deactivateAccountSuccess'),
      description: t('user.deactivateAccountSuccessDescription')
    })
    await router.push('/login')
  } catch (error: any) {
    logger.error('Failed to deactivate account', { error })
    notification.error({
      message: t('user.deactivateAccountFailed'),
      description: error?.message || t('user.retryLater')
    })
  } finally {
    deactivateLoading.value = false
  }
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
  background-color: var(--input-number-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  transition: all 0.3s;
  width: 100px !important;
}

.custom-form :deep(.ant-input-number:hover),
.custom-form :deep(.ant-input-number:focus),
.custom-form :deep(.ant-input-number-focused) {
  background-color: var(--input-number-hover-bg);
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
}

.custom-form :deep(.ant-input-number-input) {
  height: 32px;
  padding: 4px 8px;
  background-color: transparent;
  color: var(--text-color);
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

.account-management-item {
  margin-top: 18px;
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

.account-management-section {
  border: 1px solid var(--border-color);
  background-color: var(--bg-color-secondary);
  border-radius: 10px;
  padding: 16px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.account-management-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.account-management-header {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.account-management-description {
  margin-right: 8px;
}

.account-management-action {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
}

.deactivate-account-button {
  width: fit-content;
}

.account-management-section :deep(.ant-btn.ant-btn-dangerous) {
  color: var(--error-color);
  border-color: var(--border-color-light);
  background-color: transparent;
  box-shadow: none;
}

.account-management-section :deep(.ant-btn.ant-btn-dangerous:hover),
.account-management-section :deep(.ant-btn.ant-btn-dangerous:focus) {
  color: #fff;
  border-color: var(--error-color);
  background-color: var(--error-color);
}

.account-management-section :deep(.ant-btn.ant-btn-dangerous[disabled]),
.account-management-section :deep(.ant-btn.ant-btn-dangerous[disabled]:hover) {
  color: var(--text-color-tertiary);
  border-color: var(--border-color);
  background-color: transparent;
}

.deactivate-modal-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.deactivate-modal-description {
  margin: 0;
  color: var(--text-color-secondary);
  line-height: 1.6;
}

.deactivate-modal-content :deep(.ant-input) {
  background-color: var(--bg-color);
  color: var(--text-color);
  border: 1px solid var(--border-color);
}

.deactivate-modal-content :deep(.ant-input:hover),
.deactivate-modal-content :deep(.ant-input:focus),
.deactivate-modal-content :deep(.ant-input-focused) {
  border-color: var(--error-color);
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.12);
}

@media (max-width: 768px) {
  .account-management-section {
    align-items: flex-start;
    flex-direction: column;
  }

  .account-management-action {
    width: 100%;
    justify-content: flex-start;
  }
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

<style>
.deactivate-account-modal .ant-modal-content {
  background-color: var(--bg-color-secondary) !important;
  color: var(--text-color);
}

.deactivate-account-modal .ant-modal-header,
.deactivate-account-modal .ant-modal-body,
.deactivate-account-modal .ant-modal-footer {
  background-color: transparent !important;
  color: var(--text-color);
}

.deactivate-account-modal .ant-modal-title,
.deactivate-account-modal .ant-modal-close,
.deactivate-account-modal .ant-modal-close-x,
.deactivate-account-modal .ant-modal-close-icon {
  color: var(--text-color);
}

.deactivate-account-modal .ant-modal-body {
  color: var(--text-color);
}

.deactivate-account-modal .ant-modal-footer {
  margin: 0 !important;
  border-top: none !important;
  padding: 12px 0 !important;
  display: flex !important;
  justify-content: flex-end !important;
}

.deactivate-account-modal .ant-modal-footer .ant-btn {
  background-color: var(--bg-color);
  color: var(--text-color);
  border-color: var(--border-color-light);
  box-shadow: none;
}

.deactivate-account-modal .ant-modal-footer .ant-btn:hover,
.deactivate-account-modal .ant-modal-footer .ant-btn:focus {
  background-color: var(--hover-bg-color);
  color: var(--text-color);
  border-color: var(--border-color-light);
}

.deactivate-account-modal .ant-modal-footer .ant-btn-dangerous:not(.ant-btn-primary),
.deactivate-account-modal .ant-modal-footer .ant-btn-color-dangerous:not(.ant-btn-primary),
.deactivate-account-modal .ant-modal-footer .ant-btn-dangerous.ant-btn-variant-outlined:not(.ant-btn-primary) {
  background-color: transparent;
  color: var(--error-color);
  border-color: rgba(239, 68, 68, 0.45);
}

.deactivate-account-modal .ant-modal-footer .ant-btn-dangerous.ant-btn-primary,
.deactivate-account-modal .ant-modal-footer .ant-btn-color-dangerous.ant-btn-primary {
  background-color: var(--error-color);
  color: #ffffff;
  border-color: var(--error-color);
}

.deactivate-account-modal .ant-modal-footer .ant-btn-dangerous:hover,
.deactivate-account-modal .ant-modal-footer .ant-btn-dangerous:focus,
.deactivate-account-modal .ant-modal-footer .ant-btn-color-dangerous:hover,
.deactivate-account-modal .ant-modal-footer .ant-btn-color-dangerous:focus {
  background-color: var(--error-color);
  opacity: 0.85;
  color: #ffffff;
  border-color: var(--error-color);
}

.deactivate-account-modal .ant-modal-footer .ant-btn-dangerous:disabled,
.deactivate-account-modal .ant-modal-footer .ant-btn-dangerous[disabled],
.deactivate-account-modal .ant-modal-footer .ant-btn-color-dangerous:disabled,
.deactivate-account-modal .ant-modal-footer .ant-btn-color-dangerous[disabled] {
  background-color: transparent;
  color: var(--text-color-secondary);
  border-color: var(--border-color-light);
  opacity: 0.72;
}

.deactivate-account-modal .ant-input {
  background-color: var(--bg-color);
  color: var(--text-color);
  border-color: var(--border-color);
}

.deactivate-account-modal .ant-input::placeholder {
  color: var(--text-color-tertiary);
}

.deactivate-account-modal .ant-input:hover,
.deactivate-account-modal .ant-input:focus,
.deactivate-account-modal .ant-input-focused {
  border-color: var(--error-color);
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.12);
}
</style>
