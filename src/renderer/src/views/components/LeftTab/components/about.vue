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
        <div class="about-title">Chaterm {{ newVersion }}</div>
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
        <div class="about-title">Chaterm</div>
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
        >Copyright © 2025 Chaterm.ai All rights reserved.</div
      >
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Notice } from '../../Notice'
import i18n from '@/locales'
const { t } = i18n.global

const appInfo = {
  ...__APP_INFO__
}
const api = window.api as any

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
    console.error(t('about.checkUpdateError'), err)
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
      console.log('Update check result:', info)

      // Handle different response structures
      if (info && info.versionInfo) {
        return info.versionInfo
      } else if (info && info.updateInfo) {
        return info.updateInfo
      } else {
        console.log('No update info found in response')
        return null
      }
    } catch (error) {
      console.error('Update check failed:', error)
      throw error
    }
  } else {
    try {
      api.download()
      api.autoUpdate((params) => {
        console.log('Update progress:', params)
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
      console.error('Download failed:', error)
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
  justify-content: center;
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
</style>
