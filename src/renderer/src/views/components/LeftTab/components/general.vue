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
          </a-radio-group>
        </a-form-item>
        <a-form-item
          :label="$t('user.fontSize')"
          class="user_my-ant-form-item"
        >
          <a-input-number
            v-model:value="userConfig.fontSize"
            :bordered="false"
            style="width: 20%"
            :min="8"
            :max="64"
            class="user_my-ant-form-item-content"
          />
        </a-form-item>
        <a-form-item
          :label="$t('user.scrollBack')"
          class="user_my-ant-form-item"
        >
          <a-input-number
            v-model:value="userConfig.scrollBack"
            :bordered="false"
            style="width: 20%"
            :min="1"
            class="user_my-ant-form-item-content"
          />
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
          :label="$t('user.cursorStyle')"
          class="user_my-ant-form-item"
        >
          <a-radio-group
            v-model:value="userConfig.cursorStyle"
            class="custom-radio-group"
          >
            <a-radio value="block">{{ $t('user.cursorStyleBlock') }}</a-radio>
            <a-radio value="bar">{{ $t('user.cursorStyleBar') }}</a-radio>
            <a-radio value="underline">{{ $t('user.cursorStyleUnderline') }}</a-radio>
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
import { ref, onMounted, watch, getCurrentInstance, onBeforeUnmount } from 'vue'
import 'xterm/css/xterm.css'
import { notification } from 'ant-design-vue'
import { userConfigStore } from '@/services/userConfigStoreService'
import { userConfigStore as configStore } from '@/store/userConfigStore'
import eventBus from '@/utils/eventBus'

const instance = getCurrentInstance()
const { appContext } = instance

const userConfig = ref({
  fontSize: 14,
  scrollBack: 1000,
  language: 'zh-CN',
  cursorStyle: 'block',
  watermark: 'open',
  theme: 'dark'
})

// 加载保存的配置
const loadSavedConfig = async () => {
  try {
    const savedConfig = await userConfigStore.getConfig()
    if (savedConfig) {
      userConfig.value = {
        ...userConfig.value,
        ...savedConfig
      }
      // 确保初始主题正确应用
      document.body.className = `theme-${userConfig.value.theme}`
      // 通知其他组件当前主题
      eventBus.emit('updateTheme', userConfig.value.theme)
    }
  } catch (error) {
    console.error('Failed to load config:', error)
    notification.error({
      message: '加载配置失败',
      description: '将使用默认配置'
    })
    // 使用默认主题
    document.body.className = 'theme-dark'
    userConfig.value.theme = 'dark'
  }
}

// 保存配置到 IndexedDB
const saveConfig = async () => {
  try {
    // Create a clean object with only the data we want to store
    const configToStore = {
      fontSize: userConfig.value.fontSize,
      scrollBack: userConfig.value.scrollBack,
      language: userConfig.value.language,
      cursorStyle: userConfig.value.cursorStyle,
      watermark: userConfig.value.watermark,
      theme: userConfig.value.theme
    }

    // Get existing config and merge with new config
    const existingConfig = (await userConfigStore.getConfig()) || {}
    const mergedConfig = {
      ...existingConfig,
      ...configToStore
    }

    await userConfigStore.saveConfig(mergedConfig)
    eventBus.emit('updateWatermark', mergedConfig.watermark)
    eventBus.emit('updateTheme', mergedConfig.theme)
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

// 组件卸载时清理
onBeforeUnmount(() => {
  // 清理所有相关的事件监听器
  eventBus.off('updateTheme')
})

const changeLanguage = async () => {
  appContext.config.globalProperties.$i18n.locale = userConfig.value.language
  configStore().updateLanguage(userConfig.value.language)
}

const changeTheme = async () => {
  try {
    // 先更新 DOM 的主题类
    document.body.className = `theme-${userConfig.value.theme}`
    // 发送主题更新事件
    eventBus.emit('updateTheme', userConfig.value.theme)
    // 保存配置到存储
    await saveConfig()
  } catch (error) {
    console.error('Failed to change theme:', error)
    notification.error({
      message: '主题切换失败',
      description: '请稍后重试'
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

/* 设置整个表单的字体颜色 */
.custom-form {
  color: var(--text-color);
  align-content: center;
}

.custom-form :deep(.ant-form-item-label) {
  padding-right: 20px;
  /* 增加右侧间距 */
}

/* 设置表单标签(label)的字体颜色 */
.custom-form :deep(.ant-form-item-label > label) {
  color: var(--text-color);
}

/* 设置表单输入框的字体颜色 */
.custom-form :deep(.ant-input),
.custom-form :deep(.ant-input-number),
.custom-form :deep(.ant-radio-wrapper) {
  color: var(--text-color);
}

/* 输入框样式 */
.custom-form :deep(.ant-input-number) {
  background-color: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  transition: all 0.3s;
  width: 100px !important;
}

.custom-form :deep(.ant-input-number:hover) {
  border-color: #1890ff;
  background-color: var(--bg-color-hover);
}

.custom-form :deep(.ant-input-number:focus),
.custom-form :deep(.ant-input-number-focused) {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
  background-color: var(--bg-color-hover);
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
  color: var(--text-color);
  font-weight: 500;
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
  margin-bottom: 14px;
  vertical-align: top;
  color: #ffffff;
}

.user_my-ant-form-item-content {
  /* //background-color: #4a4a4a; */
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
  /* 24格布局中：offset6(25%) + label4(16.66%) 的起始位置 */
  /* 与左侧对称 */
  width: calc(65%);
  /* 总宽度 = 100% - 左右margin */
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
