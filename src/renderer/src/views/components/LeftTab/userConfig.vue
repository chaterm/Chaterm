<template>
  <div class="userInfo">
    <a-card :bordered="false" class="userInfo-container">
      <a-form
        :colon="false"
        label-align="left"
        wrapper-align="right"
        :label-col="{ span: 7, offset: 4 }"
        :wrapper-col="{ span: 8, class: 'right-aligned-wrapper' }"
        class="custom-form"
      >
        <a-form-item>
          <template #label>
            <span class="label-text">{{ $t('user.baseSetting') }}</span>
          </template>
        </a-form-item>
        <div class="divider-container">
          <a-divider style="border-color: #4a4a4a" />
        </div>
        <a-form-item :label="$t('user.fontSize')" class="user_my-ant-form-item">
          <a-input-number
            v-model:value="userConfig.fontSize"
            :bordered="false"
            style="width: 20%"
            :min="8"
            :max="64"
            class="user_my-ant-form-item-content"
            @press-enter="updateTermCommonConfig('fontSize', userConfig.fontSize)"
            @blur="updateTermCommonConfig('fontSize', userConfig.fontSize)"
          />
        </a-form-item>
        <a-form-item :label="$t('user.scrollBack')" class="user_my-ant-form-item">
          <a-input-number
            v-model:value="userConfig.scrollBack"
            :bordered="false"
            style="width: 20%"
            :min="1"
            class="user_my-ant-form-item-content"
            @press-enter="updateTermCommonConfig('scrollBack', userConfig.scrollBack)"
            @blur="updateTermCommonConfig('scrollBack', userConfig.scrollBack)"
          />
        </a-form-item>
        <a-form-item :label="$t('user.language')" class="user_my-ant-form-item">
          <a-radio-group
            v-model:value="userConfig.language"
            class="custom-radio-group"
            @change="updateTermCommonConfig('language', userConfig.language)"
          >
            <a-radio value="zh-CN">简体中文</a-radio>
            <a-radio value="en-US">English</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item :label="$t('user.cursorStyle')" class="user_my-ant-form-item">
          <a-radio-group
            v-model:value="userConfig.cursorStyle"
            class="custom-radio-group"
            @change="updateTermCommonConfig('cursorStyle', userConfig.cursorStyle)"
          >
            <a-radio value="block">{{ $t('user.cursorStyleBlock') }}</a-radio>
            <a-radio value="bar">{{ $t('user.cursorStyleBar') }}</a-radio>
            <a-radio value="underline">{{ $t('user.cursorStyleUnderline') }}</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item>
          <template #label>
            <span class="label-text">{{ $t('user.ai') }}</span>
          </template>
        </a-form-item>
        <div class="divider-container">
          <a-divider style="border-color: #4a4a4a" />
        </div>
        <a-form-item :label="$t('user.autoCompleteStatus')" class="user_my-ant-form-item">
          <a-switch
            v-model:checked="userConfig.autoCompleteStatus"
            class="user_my-ant-form-item-content"
            @change="updateTermCommonConfig('autoCompleteStatus', userConfig.autoCompleteStatus)"
          />
        </a-form-item>
        <a-form-item :label="$t('user.textEditor')">
          <a-switch v-model:checked="userConfig.vimStatus"></a-switch>
        </a-form-item>
        <div v-if="userConfig.vimStatus">
          <a-form-item>
            <template #label>
              <span style="font-weight: 1000; margin-right: 10px; margin-left: 10px">|</span
              >{{ $t('user.commandLineOpen') }}
            </template>
            <a-switch
              :checked="userConfig.quickVimStatus === 1"
              :disabled="!userConfig.vimStatus"
              @change="handleSwitchChange"
            />
          </a-form-item>
          <a-form-item>
            <template #label>
              <span style="font-weight: 1000; margin-right: 10px; margin-left: 10px">|</span
              >{{ $t('user.fileManagerPlugin') }}
              <a-tooltip>
                <template #title>{{ $t('user.fileManagerPluginDescribe') }}</template>
                <span style="margin-left: 5px">
                  <QuestionCircleOutlined />
                </span>
              </a-tooltip>
            </template>
            <div>
              <a-badge
                :status="userConfig.commonVimStatus === 1 ? 'success' : 'error'"
                :text="
                  userConfig.commonVimStatus === 1 ? $t('user.install') : $t('user.notInstall')
                "
              />
              <a-button
                type="primary"
                size="small"
                style="margin-left: 10px"
                :danger="userConfig.commonVimStatus === 1"
                :loading="isProcessing"
                @click="handleAction"
              >
                {{
                  isProcessing
                    ? userConfig.commonVimStatus === 1
                      ? $t('user.uninstalling') + '...'
                      : $t('user.installing') + '...'
                    : userConfig.commonVimStatus === 1
                      ? $t('user.uninstall')
                      : $t('user.install')
                }}
              </a-button>
            </div>
          </a-form-item>
        </div>
        <a-form-item :label="$t('user.aliasStatus')" class="user_my-ant-form-item">
          <a-switch
            v-model:checked="userConfig.aliasStatus"
            class="user_my-ant-form-item-content"
            @change="updateTermCommonConfig('aliasStatus', userConfig.aliasStatus)"
          />
        </a-form-item>
        <a-form-item :label="$t('user.highlightStatus')" class="user_my-ant-form-item">
          <a-switch
            v-model:checked="userConfig.highlightStatus"
            class="user_my-ant-form-item-content"
            @change="updateTermCommonConfig('highlightStatus', userConfig.highlightStatus)"
          />
        </a-form-item>
      </a-form>
    </a-card>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, getCurrentInstance } from 'vue'
import 'xterm/css/xterm.css'
import { getUserTermConfig, updateUserTermConfig, aliasUpdate } from '@api/user/user'
import { QuestionCircleOutlined } from '@ant-design/icons-vue'
import { userConfigStore } from '@/store/userConfigStore'
import { cloneDeep } from 'lodash'
import { encrypt } from '@/utils/util'
import { notification } from 'ant-design-vue'

const configStore = userConfigStore()
const instance = getCurrentInstance()
const { appContext } = instance
const userConfig = ref({})
const isProcessing = ref(false)
let userConfigTmp = {}
const getUserConfig = () => {
  getUserTermConfig()
    .then((res) => {
      userConfigTmp = cloneDeep(res.data)
      if (res.code === 200) {
        userConfig.value = res.data
        userConfig.value.vimStatus = !(
          userConfig.value.commonVimStatus === 2 && userConfig.value.quickVimStatus === 2
        )
        userConfig.value.aliasStatus = userConfig.value.aliasStatus === 1
        userConfig.value.autoCompleteStatus = userConfig.value.autoCompleteStatus === 1
        userConfig.value.highlightStatus = userConfig.value.highlightStatus === 1
      }
      configStore.setUserConfig(userConfigTmp)
    })
    .catch((err) => {
      const errorMessage = err.response?.data?.message || err.message || '网络请求异常'
      notification.error({
        message: '请求失败',
        description: `${errorMessage}`,
        placement: 'topRight',
        duration: 1
      })
    })
}

// 初始化终端
onMounted(() => {
  getUserConfig()
})

// 销毁时清理资源
onBeforeUnmount(() => {})

const handleSwitchChange = (value) => {
  userConfig.value.quickVimStatus = value ? 1 : 2
  updateTermCommonConfig('quickVimStatus', userConfig.value.quickVimStatus)
}

const handleAction = () => {
  if (isProcessing.value) return
  isProcessing.value = true
  setTimeout(() => {
    if (userConfig.value.commonVimStatus === 1) {
      uninstall()
    } else {
      install()
    }
    isProcessing.value = false
  }, 1000)
}
const install = () => {
  userConfig.value.commonVimStatus = 1
  updateTermCommonConfig('commonVimStatus', 1)
}
const uninstall = () => {
  userConfig.value.commonVimStatus = 2
  updateTermCommonConfig('commonVimStatus', 2)
}
const updateTermCommonConfig = (name, data) => {
  const requestParameters = Object.assign({}, userConfig.value)
  requestParameters.aliasStatus = userConfig.value.aliasStatus ? 1 : 2
  requestParameters.autoCompleteStatus = userConfig.value.autoCompleteStatus ? 1 : 2
  requestParameters.highlightStatus = userConfig.value.highlightStatus ? 1 : 2
  switch (name) {
    case 'autoCompleteStatus':
    case 'aliasStatus':
    case 'highlightStatus':
      if (data) {
        requestParameters[name] = 1
      } else {
        requestParameters[name] = 2
      }
      break
    case 'language':
      appContext.config.globalProperties.$i18n.locale = data
    // eslint-disable-next-line no-fallthrough
    default:
      requestParameters[name] = data
  }
  updateUserTermConfig(requestParameters)
    .then((res) => {
      if (res.code === 200) {
        getUserConfig()
        if (userConfigTmp.aliasStatus !== requestParameters.aliasStatus) {
          aliasConfigUpdate()
        }
      }
    })
    .catch((err) => {
      const errorMessage = err.response?.data?.message || err.message || '网络请求异常'
      notification.error({
        message: '更新失败',
        description: `${errorMessage}`,
        placement: 'topRight',
        duration: 1
      })
    })
}

const aliasConfigUpdate = () => {
  const authData = {
    uid: userConfigStore()?.getUserConfig.uid
  }
  const auth = decodeURIComponent(encrypt(authData))
  aliasUpdate({ data: auth })
    .then((response) => {
      if (response) {
        // console.log(response)
      }
    })
    .catch((err) => {
      console.log(err)
    })
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
  font-size: 18px;
  /* 设置字体大小 */
  font-weight: bold;
  line-height: 1.5;
}

.checkbox-md :deep(.ant-checkbox-inner) {
  width: 20px;
  height: 20px;
}
</style>
