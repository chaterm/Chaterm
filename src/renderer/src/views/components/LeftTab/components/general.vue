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
            <span class="label-text">{{ $t('user.baseSetting') }}</span>
          </template>
        </a-form-item>
        <a-form-item
          :label="$t('user.theme')"
          class="user_my-ant-form-item"
        >
          <a-radio-group
            v-model:value="userConfig.theme"
            class="custom-radio-group"
            @change="changeTheme"
          >
            <a-radio value="dark">{{ $t('user.themeDark') }}</a-radio>
            <a-radio value="light">{{ $t('user.themeLight') }}</a-radio>
            <a-radio value="auto">{{ $t('user.themeAuto') }}</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item
          :label="$t('user.language')"
          class="user_my-ant-form-item"
        >
          <a-radio-group
            v-model:value="userConfig.language"
            class="custom-radio-group"
            @change="changeLanguage"
          >
            <a-radio value="zh-CN">简体中文</a-radio>
            <a-radio value="en-US">English</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item
          :label="$t('user.watermark')"
          class="user_my-ant-form-item"
        >
          <a-radio-group
            v-model:value="userConfig.watermark"
            class="custom-radio-group"
          >
            <a-radio value="open">{{ $t('user.watermarkOpen') }}</a-radio>
            <a-radio value="close">{{ $t('user.watermarkClose') }}</a-radio>
          </a-radio-group>
        </a-form-item>
      </a-form>
    </a-card>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
import { notification } from 'ant-design-vue'
import { userConfigStore } from '@/services/userConfigStoreService'
import { userConfigStore as configStore } from '@/store/userConfigStore'
import eventBus from '@/utils/eventBus'
import { getActualTheme, addSystemThemeListener } from '@/utils/themeUtils'
import { useI18n } from 'vue-i18n'

const api = window.api
const { locale, t } = useI18n()

const userConfig = ref({
  language: 'zh-CN',
  watermark: 'open',
  theme: 'auto'
})

const loadSavedConfig = async () => {
  try {
    const savedConfig = await userConfigStore.getConfig()
    if (savedConfig) {
      userConfig.value = {
        ...userConfig.value,
        ...savedConfig
      }
      const actualTheme = getActualTheme(userConfig.value.theme)
      document.documentElement.className = `theme-${actualTheme}`
      eventBus.emit('updateTheme', actualTheme)
      api.updateTheme(userConfig.value.theme)
    }
  } catch (error) {
    console.error('Failed to load config:', error)
    notification.error({
      message: t('user.loadConfigFailed'),
      description: t('user.loadConfigFailedDescription')
    })
    const actualTheme = getActualTheme('auto')
    document.documentElement.className = `theme-${actualTheme}`
    userConfig.value.theme = 'auto'
  }
}

const saveConfig = async () => {
  try {
    const configToStore = {
      language: userConfig.value.language,
      watermark: userConfig.value.watermark,
      theme: userConfig.value.theme
    }
    await userConfigStore.saveConfig(configToStore)
    eventBus.emit('updateWatermark', configToStore.watermark)
    eventBus.emit('updateTheme', configToStore.theme)
  } catch (error) {
    console.error('Failed to save config:', error)
    notification.error({
      message: t('user.error'),
      description: t('user.saveConfigFailedDescription')
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

let systemThemeListener = null

onMounted(async () => {
  await loadSavedConfig()

  // Add system theme change listener
  setupSystemThemeListener()
})

onBeforeUnmount(() => {
  eventBus.off('updateTheme')

  // Remove system theme listener
  if (systemThemeListener) {
    systemThemeListener()
    systemThemeListener = null
  }
})

onBeforeUnmount(() => {
  eventBus.off('updateTheme')
})

const changeLanguage = async () => {
  locale.value = userConfig.value.language
  localStorage.setItem('lang', userConfig.value.language)
  configStore().updateLanguage(userConfig.value.language)

  // 通知其他组件语言已更改，需要刷新数据
  eventBus.emit('languageChanged', userConfig.value.language)
}

// Setup system theme change listener
const setupSystemThemeListener = () => {
  systemThemeListener = addSystemThemeListener(async (newSystemTheme) => {
    // Only update theme if user has selected 'auto' mode
    if (userConfig.value.theme === 'auto') {
      const actualTheme = getActualTheme(userConfig.value.theme)
      const currentTheme = document.documentElement.className.replace('theme-', '')

      if (currentTheme !== actualTheme) {
        // System theme changed, update application theme
        document.documentElement.className = `theme-${actualTheme}`
        eventBus.emit('updateTheme', actualTheme)
        // Update main process window controls
        await api.updateTheme(userConfig.value.theme)
        console.log(`System theme changed to ${newSystemTheme}, updating application theme to ${actualTheme}`)
      }
    }
  })

  // Listen for system theme changes from main process (Windows)
  if (window.api && window.api.onSystemThemeChanged) {
    window.api.onSystemThemeChanged((newSystemTheme) => {
      if (userConfig.value.theme === 'auto') {
        const currentTheme = document.documentElement.className.replace('theme-', '')
        if (currentTheme !== newSystemTheme) {
          document.documentElement.className = `theme-${newSystemTheme}`
          eventBus.emit('updateTheme', newSystemTheme)
          console.log(`System theme changed to ${newSystemTheme} (from main process)`)
        }
      }
    })
  }
}

const changeTheme = async () => {
  try {
    const actualTheme = getActualTheme(userConfig.value.theme)
    document.documentElement.className = `theme-${actualTheme}`
    eventBus.emit('updateTheme', actualTheme)
    // Update main process window controls immediately
    await api.updateTheme(userConfig.value.theme)
    await saveConfig()
  } catch (error) {
    console.error('Failed to change theme:', error)
    notification.error({
      message: t('user.themeSwitchFailed'),
      description: t('user.themeSwitchFailedDescription')
    })
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
</style>
