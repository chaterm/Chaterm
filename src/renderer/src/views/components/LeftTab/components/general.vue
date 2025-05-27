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
      </a-form>
    </a-card>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, getCurrentInstance } from 'vue'
import 'xterm/css/xterm.css'
import { notification } from 'ant-design-vue'
import { userConfigStore } from '@/services/userConfigStoreService'

const instance = getCurrentInstance()
const { appContext } = instance

const userConfig = ref({
  fontSize: 14,
  scrollBack: 1000,
  language: 'zh-CN',
  cursorStyle: 'block'
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
    // Create a clean object with only the data we want to store
    const configToStore = {
      fontSize: userConfig.value.fontSize,
      scrollBack: userConfig.value.scrollBack,
      language: userConfig.value.language,
      cursorStyle: userConfig.value.cursorStyle
    }

    // Get existing config and merge with new config
    const existingConfig = (await userConfigStore.getConfig()) || {}
    const mergedConfig = {
      ...existingConfig,
      ...configToStore
    }

    await userConfigStore.saveConfig(mergedConfig)
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

const changeLanguage = async () => {
  appContext.config.globalProperties.$i18n.locale = userConfig.value.language
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
  background-color: #1a1a1a;
  border-radius: 6px;
  overflow: hidden;
  padding: 4px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
  color: #f8f8f8;
}

:deep(.ant-card) {
  height: 100%;
}

:deep(.ant-card-body) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 设置整个表单的字体颜色 */
.custom-form {
  color: #ffffff;
  align-content: center;
}

.custom-form :deep(.ant-form-item-label) {
  padding-right: 20px;
  /* 增加右侧间距 */
}

/* 设置表单标签(label)的字体颜色 */
.custom-form :deep(.ant-form-item-label > label) {
  color: #ffffff;
}

/* 设置表单输入框的字体颜色 */
.custom-form :deep(.ant-input),
.custom-form :deep(.ant-input-password input) {
  color: #ffffff;
  border-color: #ffffff;
}

/* 隐藏数字输入框右侧的增减按钮 */
.custom-form :deep(.ant-input-number-handler-wrap) {
  display: none;
}

/* 调整输入框的padding */
.custom-form :deep(.ant-input-number-input) {
  padding-right: 0;
  color: #ffffff;
  background-color: #4a4a4a;
}

/* 调整ratio文字颜色 */
.custom-form :deep(.ant-radio-wrapper) {
  color: #ffffff;
}

/* 调整badge颜色 */
/* 成功状态 */
.custom-form :deep(.ant-badge-status-success .ant-badge-status-dot) {
  background-color: #52c41a !important;
  /* 绿色 */
  box-shadow: 0 0 0 2px rgba(82, 196, 26, 0.1);
}

.custom-form :deep(.ant-badge-status-error .ant-badge-status-dot) {
  background-color: #ff4d4f !important;
  /* 红色 */
  box-shadow: 0 0 0 2px rgba(82, 196, 26, 0.1);
}

.custom-form :deep(.ant-badge-status-text) {
  color: #ffffff;
}

.custom-form :deep(.ant-switch) {
  background-color: #4a4a4a;
}

/* 选中状态样式 */
.custom-form :deep(.ant-switch.ant-switch-checked) {
  background: #1890ff !important;
  /* Ant Design默认蓝色 */
}

/* 调整输入框的padding */
.custom-form :deep(.ant-radio-wrapper) {
  color: #ffffff;
}

/* 设置错误提示文字的颜色 */
.custom-form :deep(.ant-form-item-explain-error) {
  color: #ff4d4f;
}

/* 设置必填星号的颜色 */
.custom-form :deep(.ant-form-item-required::before) {
  color: #ff4d4f;
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

.label-text {
  font-size: 20px;
  /* 设置字体大小 */
  font-weight: bold;
  line-height: 1.3;
}

.checkbox-md :deep(.ant-checkbox-inner) {
  width: 20px;
  height: 20px;
}
</style>
