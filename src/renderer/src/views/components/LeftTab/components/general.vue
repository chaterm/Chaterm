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
          :label="$t('user.background')"
          class="user_my-ant-form-item"
        >
          <a-radio-group
            v-model:value="userConfig.background.mode"
            class="custom-radio-group"
            @change="changeBackgroundMode"
          >
            <a-radio value="none">无</a-radio>
            <a-radio value="image">开启</a-radio>
          </a-radio-group>

          <div
            v-if="userConfig.background.mode !== 'none'"
            class="bg-content"
          >
            <!-- Unified Background Grid -->
            <div class="unified-bg-grid">
              <!-- Slot 1: Custom Background -->
              <div
                class="bg-grid-item custom-item"
                :class="{ active: userConfig.background.image === customBackgroundImage && customBackgroundImage }"
                @click="handleCustomItemClick"
              >
                <template v-if="customBackgroundImage">
                  <img
                    :src="customBackgroundImage"
                    alt="Custom Background"
                  />
                  <div
                    class="delete-btn"
                    @click.stop="clearCustomBackground"
                  >
                    <delete-outlined />
                  </div>
                </template>
                <div
                  v-else
                  class="upload-placeholder"
                >
                  <plus-outlined style="font-size: 20px; margin-bottom: 4px" />
                  <span style="font-size: 10px">上传</span>
                </div>
              </div>

              <!-- Slots 2-7: System Backgrounds -->
              <div
                v-for="i in 5"
                :key="i"
                class="bg-grid-item system-item"
                :class="{ active: userConfig.background.image.includes(`wall-${i}.jpg`) }"
                @click="selectSystemBackground(i)"
              >
                <img
                  :src="getSystemBgUrl(i)"
                  loading="lazy"
                />
              </div>
            </div>

            <!-- Sliders (Global for any selected background) -->
            <div
              v-if="userConfig.background.image"
              class="bg-sliders-section mt-2"
            >
              <div class="slider-item">
                <span class="slider-label">透明度</span>
                <a-slider
                  v-model:value="userConfig.background.opacity"
                  :min="0"
                  :max="1"
                  :step="0.05"
                  @change="changeBackgroundOpacity"
                />
              </div>
              <div class="slider-item">
                <span class="slider-label">亮度</span>
                <a-slider
                  v-model:value="userConfig.background.brightness"
                  :min="0"
                  :max="1"
                  :step="0.05"
                  @change="changeBackgroundBrightness"
                />
              </div>
            </div>
          </div>
        </a-form-item>

        <a-form-item
          :label="$t('user.defaultLayout')"
          class="user_my-ant-form-item"
        >
          <a-radio-group
            v-model:value="userConfig.defaultLayout"
            class="custom-radio-group"
            @change="changeDefaultLayout"
          >
            <a-radio value="terminal">{{ $t('user.defaultLayoutTerminal') }}</a-radio>
            <a-radio value="agents">{{ $t('user.defaultLayoutAgents') }}</a-radio>
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
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons-vue'
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
  theme: 'auto',
  defaultLayout: 'terminal',
  background: {
    image: '',
    opacity: 0.15,
    brightness: 0.45,
    mode: 'none'
  }
})

const customBackgroundImage = ref('')

const loadSavedConfig = async () => {
  try {
    const savedConfig = await userConfigStore.getConfig()
    if (savedConfig) {
      userConfig.value = {
        ...userConfig.value,
        ...savedConfig,
        ...savedConfig,
        defaultLayout: savedConfig.defaultLayout || 'terminal',
        background: savedConfig.background || {
          image: '',
          opacity: 0.8,
          brightness: 1.0,
          mode: 'none'
        }
      }

      // Initialize custom background image if current bg is not a system one
      if (userConfig.value.background.image && !userConfig.value.background.image.includes('assets/backgroup/wall-')) {
        customBackgroundImage.value = userConfig.value.background.image
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
      theme: userConfig.value.theme,
      defaultLayout: userConfig.value.defaultLayout,
      background: userConfig.value.background
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

  // Listen for default layout changes from header
  eventBus.on('defaultLayoutChanged', (mode) => {
    if (mode === 'terminal' || mode === 'agents') {
      userConfig.value.defaultLayout = mode
    }
  })
})

onBeforeUnmount(() => {
  eventBus.off('defaultLayoutChanged')

  // Remove system theme listener
  if (systemThemeListener) {
    systemThemeListener()
    systemThemeListener = null
  }
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

const changeDefaultLayout = async () => {
  // Switch to the selected layout immediately
  eventBus.emit('switch-mode', userConfig.value.defaultLayout)
  eventBus.emit('switch-mode', userConfig.value.defaultLayout)
  await saveConfig()
}

const changeBackgroundMode = async () => {
  configStore().updateBackgroundMode(userConfig.value.background.mode)
  if (userConfig.value.background.mode === 'none') {
    userConfig.value.background.image = ''
    configStore().updateBackgroundImage('')
  }
  await saveConfig()
}

// Helper to get system background URL
// Using a relative path that works in development and production (if assets are handled correctly)
// In Electron renderer, we can often use relative paths or require/import
const getSystemBgUrl = (index) => {
  // In Vite/Electron, we can use the `new URL(..., import.meta.url).href` pattern for assets
  return new URL(`../../../../assets/backgroup/wall-${index}.jpg`, import.meta.url).href
}

const selectSystemBackground = async (index) => {
  userConfig.value.background.image = getSystemBgUrl(index)
  configStore().updateBackgroundImage(userConfig.value.background.image)
  await saveConfig()
}

const handleCustomItemClick = () => {
  if (customBackgroundImage.value) {
    userConfig.value.background.image = customBackgroundImage.value
    configStore().updateBackgroundImage(userConfig.value.background.image)
    saveConfig()
  } else {
    selectBackgroundImage()
  }
}

const selectBackgroundImage = async () => {
  try {
    const result = await api.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'png', 'gif', 'jpeg', 'webp'] }]
    })

    if (!result.canceled && result.filePaths.length > 0) {
      const sourcePath = result.filePaths[0]

      // Call main process to save the file
      const saveResult = await api.saveCustomBackground(sourcePath)

      if (saveResult.success) {
        // Use the new path with cache busting
        const newPath = `file://${saveResult.path}?t=${Date.now()}`
        customBackgroundImage.value = newPath
        userConfig.value.background.image = newPath
        configStore().updateBackgroundImage(userConfig.value.background.image)
        await saveConfig()
      } else {
        notification.error({
          message: '保存背景图片失败',
          description: saveResult.error
        })
      }
    }
  } catch (error) {
    console.error('Failed to select background image:', error)
  }
}

const clearCustomBackground = async () => {
  // If currently selected, clear it
  if (userConfig.value.background.image === customBackgroundImage.value) {
    userConfig.value.background.image = ''
    configStore().updateBackgroundImage('')
  }
  customBackgroundImage.value = ''
  await saveConfig()
}

const changeBackgroundOpacity = async () => {
  configStore().updateBackgroundOpacity(userConfig.value.background.opacity)
  await saveConfig()
}

const changeBackgroundBrightness = async () => {
  configStore().updateBackgroundBrightness(userConfig.value.background.brightness)
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

.background-setting {
  display: flex;
  align-items: center;
}

/* Unified Background Grid */
.unified-bg-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 16px;
  padding: 2px; /* Prevent hover scale clipping */
}

/* Common Grid Item Styles */
.bg-grid-item {
  aspect-ratio: 16/9;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s;
  position: relative;
}

.bg-grid-item:hover {
  transform: scale(1.05);
  z-index: 1;
}

.bg-grid-item.active {
  border-color: var(--primary-color, #1890ff);
}

.bg-grid-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Upload Placeholder (Custom Item Empty State) */
.upload-placeholder {
  width: 100%;
  height: 100%;
  border: 2px dashed rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-color);
  opacity: 0.9;
  transition: all 0.2s;
}

.bg-grid-item:hover .upload-placeholder {
  border-color: var(--primary-color, #1890ff);
  background: rgba(24, 144, 255, 0.1);
  opacity: 1;
  color: var(--primary-color, #1890ff);
}

/* Delete Button for Custom Image */
.delete-btn {
  position: absolute;
  top: 0;
  right: 0;
  padding: 4px;
  color: white;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 0 0 0 4px;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.2s;
}

.bg-grid-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: rgba(255, 0, 0, 0.7);
}

/* Sliders Section */
.bg-sliders-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.slider-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.slider-label {
  font-size: 12px;
  color: var(--text-color);
  width: 45px;
  flex-shrink: 0;
}

.slider-item .ant-slider {
  flex: 1;
}

.mt-2 {
  margin-top: 8px;
}
</style>
