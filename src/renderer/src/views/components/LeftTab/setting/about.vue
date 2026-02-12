<template>
  <div class="about-container">
    <a-card
      :bordered="false"
      class="about-card"
    >
      <img
        class="about-logo"
        src="@/assets/logo.svg"
      />
      <div v-if="isUpdate">
        <div class="about-title">{{ editionConfig.displayName }} {{ newVersion }}</div>
        <a-progress
          class="about-progress"
          :percent="progress"
          stroke-linecap="square"
          :show-info="false"
          :size="10"
        />
        <div class="about-progress-text">{{ t('about.downloading') }} ({{ progress }}%)</div>
      </div>
      <div v-else>
        <div class="about-title">{{ editionConfig.displayName }}</div>
        <div class="about-description">{{ t('about.version') }} {{ appInfo.version }}</div>
        <div class="about-update-btn-wrapper">
          <button
            class="about-update-btn"
            :disabled="btnDisabled"
            @click="onCheckUpdate"
          >
            {{ btnText }}
          </button>
        </div>
      </div>
      <div
        class="about-description"
        style="margin-top: 32px"
        >Copyright © {{ new Date().getFullYear() }} {{ editionConfig.displayName }} All rights reserved.</div
      >
    </a-card>

    <div class="log-diagnostics">
      <div class="log-diagnostics-title">{{ t('about.logDiagnostics') }}</div>
      <div class="log-diagnostics-desc">{{ t('about.logDiagnosticsDesc') }}</div>
      <button
        class="log-diagnostics-btn"
        @click="onOpenLogDir"
      >
        <FolderOpenOutlined style="margin-right: 6px" />
        {{ t('about.openLogDir') }}
      </button>
    </div>

    <div class="feedback-section">
      <div class="feedback-title">
        <CommentOutlined style="margin-right: 6px" />
        {{ t('about.feedbackTitle') }}
      </div>
      <div class="feedback-desc">{{ t('about.feedbackDesc') }}</div>
      <button
        class="feedback-btn"
        @click="onSubmitFeedback"
      >
        <ExportOutlined style="margin-right: 6px" />
        {{ t('about.submitFeedback') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Notice } from '../../Notice'
import { FolderOpenOutlined, CommentOutlined, ExportOutlined } from '@ant-design/icons-vue'
import i18n from '@/locales'
import { getEditionConfig } from '@/utils/edition'

const { t } = i18n.global
const editionConfig = getEditionConfig()
const logger = createRendererLogger('settings.about')

const appInfo = {
  ...__APP_INFO__
}
const api = window.api as any

const onOpenLogDir = async () => {
  try {
    await api.openLogDir()
  } catch (error) {
    logger.error('Failed to open log directory', {
      error: error
    })
  }
}

const onSubmitFeedback = () => {
  logger.info('Opening feedback page', { event: 'settings.about.feedback.open' })
  window.open('https://github.com/chaterm/Chaterm/issues', '_blank')
}

const newVersion = ref()
const isUpdate = ref(false)
const progress = ref(0)
const btnText = ref(t('about.checkUpdate'))
const btnDisabled = ref(false)
const updateStatus = ref(0)
const onCheckUpdate = async () => {
  btnDisabled.value = true
  try {
    const info = await handleCheckUpdate()
    if (info?.version) {
      newVersion.value = info.version
      btnText.value =
        info.version == appInfo.version
          ? `${t('about.checkUpdate')} (${t('about.latestVersion')})`
          : `${t('about.downLoadUpdate')} ( ${info.version} )`
      updateStatus.value = info.version == appInfo.version ? 2 : 1
    }
  } catch (err) {
    logger.error('Failed to check for updates', {
      event: 'settings.about.update.check.failed',
      error: err
    })
    btnText.value = t('about.checkUpdateError')
  } finally {
    btnDisabled.value = false
  }
}

const handleCheckUpdate = async () => {
  if (updateStatus.value === 0 || updateStatus.value === 2) {
    btnText.value = t('about.checking')
    try {
      const info = await api.checkUpdate()
      logger.debug('Received update check result', {
        event: 'settings.about.update.check.result',
        hasVersionInfo: Boolean(info?.versionInfo),
        hasUpdateInfo: Boolean(info?.updateInfo)
      })

      // Handle different response structures
      if (info && info.versionInfo) {
        return info.versionInfo
      } else if (info && info.updateInfo) {
        return info.updateInfo
      } else {
        logger.warn('No update info found in response', {
          event: 'settings.about.update.check.empty'
        })
        return null
      }
    } catch (error) {
      logger.error('Update check request failed', {
        event: 'settings.about.update.check.error',
        error: error
      })
      throw error
    }
  } else {
    try {
      api.download()
      api.autoUpdate((params) => {
        logger.debug('Received update download progress', {
          event: 'settings.about.update.download.progress',
          status: params?.status,
          progress: params?.progress
        })
        if (params?.progress > 0) {
          isUpdate.value = true
          progress.value = params.progress
        }
        if (params.status == 4) {
          Notice.open({
            id: 'update-download-complete',
            type: 'success',
            duration: 1800,
            description: t('update.complete'),
            btns: [
              {
                text: t('update.install'),
                action: () => {
                  api.quitAndInstall()
                  Notice.close('update-download-complete')
                }
              },
              { text: t('update.later'), class: 'notice-btn-withe', action: () => Notice.close('update-download-complete') }
            ]
          })
          updateStatus.value = 1
          btnText.value = t('about.install')
          isUpdate.value = false
        }
      })
    } catch (error) {
      logger.error('Update download failed', {
        event: 'settings.about.update.download.failed',
        error: error
      })
      btnText.value = t('about.downloadError')
    }
  }
}
</script>

<style scoped>
.about-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.about-card {
  width: 400px;
  background-color: var(--bg-color);
  color: var(--text-color);
  border-radius: 8px;
  text-align: center;
  box-shadow: none;
}
.about-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 4px;
  color: var(--text-color);
}
.about-description {
  font-size: 12px;
  margin-bottom: 4px;
  color: var(--text-color-secondary);
}
.about-logo {
  text-align: center;
  justify-content: center;
  margin-bottom: 10px;
  width: 62px;
  height: 62px;
}
.about-progress {
  margin-top: 32px;
}
.about-progress-text {
  font-size: 14px;
}
.about-latest-version {
  font-size: 14px;
  color: var(--text-color-secondary);
  margin-top: 4px;
}
.about-update-btn-wrapper {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-top: 32px;
}
.about-update-btn {
  width: 90%;
  max-width: 260px;
  height: 40px;
  background: var(--bg-color-octonary);
  color: var(--text-color-secondary);
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}
.about-update-btn:hover:not(:disabled) {
  background: var(--bg-color-default);
  color: var(--text-color);
}
.about-update-btn:disabled {
  background: var(--bg-color-octonary);
  color: var(--text-color-secondary);
  cursor: not-allowed;
}
.log-diagnostics {
  width: 90%;
  max-width: 600px;
  margin: 32px auto 0;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}
.log-diagnostics-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 6px;
}
.log-diagnostics-desc {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-bottom: 12px;
  line-height: 1.5;
}
.log-diagnostics-btn {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  background: var(--bg-color-octonary);
  color: var(--text-color-secondary);
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}
.log-diagnostics-btn:hover {
  background: var(--bg-color-default);
  color: var(--text-color);
}
.feedback-section {
  width: 90%;
  max-width: 600px;
  margin: 16px auto 0;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}
.feedback-title {
  display: flex;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 6px;
}
.feedback-desc {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-bottom: 12px;
  line-height: 1.5;
}
.feedback-btn {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  background: transparent;
  color: #1890ff;
  border: 1px solid #1890ff;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.feedback-btn:hover {
  background: rgba(24, 144, 255, 0.1);
}
</style>
