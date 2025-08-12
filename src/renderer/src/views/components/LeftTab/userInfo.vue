<template>
  <div class="userInfo">
    <a-card
      :bordered="false"
      class="userInfo-container"
    >
      <div class="user_avatar">
        <img
          :src="userInfo.avatar"
          referrerpolicy="no-referrer"
          alt=""
        />
        <div
          v-if="userInfo.subscription && (userInfo.subscription.toLowerCase() === 'pro' || userInfo.subscription.toLowerCase() === 'ultra')"
          class="vip-badge"
        >
          VIP/{{ userInfo.subscription }}
        </div>
      </div>
      <div class="registration_type">
        {{
          userInfo.subscription && (userInfo.subscription.toLowerCase() === 'pro' || userInfo.subscription.toLowerCase() === 'ultra')
            ? t('userInfo.vip')
            : userInfo.registrationType === 1
              ? t('userInfo.enterprise')
              : t('userInfo.personal')
        }}
        <a-tag
          v-if="userInfo.expires && new Date() < new Date(userInfo.expires)"
          :key="userInfo.subscription"
          :title="t('userInfo.expirationTime') + `：${userInfo.expires}`"
          class="subscription-tag"
        >
          {{ userInfo.subscription ? userInfo.subscription.charAt(0).toUpperCase() + userInfo.subscription.slice(1) : '-' }}
        </a-tag>
        <a-tag
          v-else
          class="subscription-tag free-tag"
          >free
        </a-tag>
      </div>
      <div class="divider-container">
        <a-divider style="border-color: var(--border-color-light, #e8e8e8); margin-bottom: 20px" />
      </div>

      <a-form
        :label-col="{ span: 10, offset: 2 }"
        :wrapper-col="{ span: 12 }"
        class="custom-form"
        :model="formState"
      >
        <a-form-item
          label="UID"
          class="user_my-ant-form-item"
        >
          {{ userInfo.uid }}
        </a-form-item>
        <a-form-item
          :label="t('userInfo.name')"
          class="user_my-ant-form-item"
          name="name"
        >
          <a-input
            v-if="isEditing"
            v-model:value="formState.name"
            :placeholder="t('userInfo.pleaseInputName')"
            class="custom-input"
          />
          <span v-else>{{ userInfo.name }}</span>
        </a-form-item>
        <a-form-item
          :label="t('userInfo.username')"
          class="user_my-ant-form-item"
          name="username"
        >
          <a-input
            v-if="isEditing"
            v-model:value="formState.username"
            :placeholder="t('userInfo.pleaseInputUsername')"
            class="custom-input"
          />
          <span v-else>{{ userInfo.username }}</span>
        </a-form-item>
        <a-form-item
          :label="t('userInfo.mobile')"
          class="user_my-ant-form-item"
          name="mobile"
        >
          <a-input
            v-if="isEditing"
            v-model:value="formState.mobile"
            :placeholder="t('userInfo.pleaseInputMobile')"
            class="custom-input"
          />
          <span v-else>{{ userInfo.mobile }}</span>
        </a-form-item>
        <a-form-item
          :label="t('userInfo.password')"
          class="user_my-ant-form-item"
        >
          <template v-if="isEditingPassword">
            <a-input-password
              v-model:value="formState.newPassword"
              :placeholder="t('userInfo.pleaseInputNewPassword')"
              class="custom-input"
            />
            <a-button
              type="link"
              style="width: 40px"
              :icon="h(CheckOutlined)"
              @click="handleSave"
            />
            <a-button
              type="link"
              style="width: 40px; color: #ff4d4f"
              :icon="h(CloseOutlined)"
              @click="cancelEditing"
            ></a-button>
          </template>

          <template v-else>
            <span>****************</span>
            <a-button
              v-if="!unChange && !isEditing"
              type="link"
              style="margin-left: 8px"
              @click="startEditingPassword"
            >
              {{ t('userInfo.resetPassword') }}
            </a-button>
          </template>
        </a-form-item>
        <a-form-item
          v-if="isEditingPassword"
          :label="t('userInfo.passwordStrength')"
        >
          <span
            v-if="strength == 1"
            style="color: red"
            >{{ t('userInfo.passwordStrengthWeak') }}</span
          >
          <span
            v-if="strength == 2"
            style="color: #d46b08"
            >{{ t('userInfo.passwordStrengthMedium') }}</span
          >
          <span
            v-if="strength > 2"
            style="color: rgb(50, 100, 237)"
            >{{ t('userInfo.passwordStrengthStrong') }}</span
          >
        </a-form-item>
        <a-form-item
          :label="t('userInfo.email')"
          class="user_my-ant-form-item"
        >
          {{ userInfo.email }}
        </a-form-item>
        <a-form-item
          v-if="userInfo.secondaryOrganization"
          :label="t('userInfo.organization')"
          class="user_my-ant-form-item"
        >
          {{ userInfo.secondaryOrganization }}/{{ userInfo.tertiaryOrganization }}/{{ userInfo.team }}
        </a-form-item>
        <a-form-item
          :label="t('userInfo.ip')"
          class="user_my-ant-form-item"
        >
          {{ userInfo.localIp }}
        </a-form-item>
        <a-form-item
          :label="t('userInfo.macAddress')"
          class="user_my-ant-form-item"
        >
          {{ userInfo.macAddress }}
        </a-form-item>
      </a-form>
      <div
        v-if="!unChange && !isEditingPassword"
        class="button-container"
      >
        <template v-if="!isEditing">
          <a-button
            type="primary"
            @click="startEditing"
          >
            {{ t('userInfo.edit') }}
          </a-button>
        </template>
        <template v-else>
          <a-button
            type="primary"
            style="margin-right: 8px"
            @click="handleSave"
          >
            {{ t('userInfo.save') }}
          </a-button>
          <a-button @click="cancelEditing">
            {{ t('userInfo.cancel') }}
          </a-button>
        </template>
      </div>
    </a-card>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, reactive, computed, h } from 'vue'
import 'xterm/css/xterm.css'
import i18n from '@/locales'
import { getUser, updateUser, changePassword } from '@api/user/user'
import { CloseOutlined, CheckOutlined } from '@ant-design/icons-vue'
import { useDeviceStore } from '@/store/useDeviceStore'
import { message } from 'ant-design-vue'
import zxcvbn from 'zxcvbn'

const { t } = i18n.global
const deviceStore = useDeviceStore()
const userInfo = ref({})
const isEditing = ref(false)
const isEditingPassword = ref(false)
const unChange = ref(true)
const formState = reactive({
  username: '',
  name: '',
  mobile: '',
  newPassword: ''
})

const getUserInfo = () => {
  getUser().then((res) => {
    userInfo.value = res.data
    userInfo.value.localIp = deviceStore.getDeviceIp
    userInfo.value.macAddress = deviceStore.getMacAddress
    if (userInfo.value.uid != 2000001) unChange.value = false
    // 初始化表单数据
    formState.username = userInfo.value.username
    formState.name = userInfo.value.name
    formState.mobile = userInfo.value.mobile
  })
}
// const strength = zxcvbn(password)
const strength = computed(() => {
  if (formState.newPassword == '') return null
  else return zxcvbn(formState.newPassword).score
})

const startEditing = () => {
  isEditing.value = true
  isEditingPassword.value = false
}

const startEditingPassword = () => {
  isEditingPassword.value = true
  isEditing.value = false
}

const cancelEditing = () => {
  isEditing.value = false
  isEditingPassword.value = false
  // 重置表单数据
  formState.name = userInfo.value.name
  formState.mobile = userInfo.value.mobile
  formState.newPassword = ''
}

const validatePassword = () => {
  if (formState.newPassword.length < 6) {
    message.error(t('userInfo.passwordLengthError'))
    return false
  }
  if (strength.value < 1) {
    message.error(t('userInfo.passwordStrengthError'))
    return false
  }
  return true
}
const validateSave = () => {
  if (!/^1[3-9]\d{9}$/.test(formState.mobile)) {
    message.error(t('userInfo.mobileInvalid'))
    return false
  }

  if (!formState.username || formState.username.length < 6 || formState.username.length > 20) {
    message.error(t('userInfo.usernameLengthError'))
    return false
  }

  if (!/^[a-zA-Z0-9_]+$/.test(formState.username)) {
    message.error(t('userInfo.usernameFormatError'))
    return false
  }

  if (!formState.name || formState.name.trim().length === 0) {
    message.error(t('userInfo.nameRequired'))
    return false
  } else if (formState.name.length > 20) {
    message.error(t('userInfo.nameTooLong'))
    return false
  }
  return true
}
const handleSave = async () => {
  try {
    if (isEditingPassword.value) {
      if (!validatePassword()) {
        return
      }
      const response = await changePassword({
        password: formState.newPassword
      })
      if (response.code == 200) {
        message.success(t('userInfo.passwordResetSuccess'))
        cancelEditing()
      } else {
        message.error(response.message || t('userInfo.passwordResetFailed'))
      }
    } else {
      if (!validateSave()) return
      const response = await updateUser({
        username: formState.username,
        name: formState.name,
        mobile: formState.mobile
      })
      console.log(response)
      if (response.code == 200) {
        message.success(t('userInfo.updateSuccess'))
        cancelEditing()
        getUserInfo()
      } else {
        message.error(response.message || t('userInfo.updateFailed'))
      }
    }
  } catch (error) {
    message.error(isEditingPassword.value ? t('userInfo.passwordResetFailed') : t('userInfo.updateFailed'))
  }
}

// 初始化终端
onMounted(() => {
  getUserInfo()
})

// 销毁时清理资源
onBeforeUnmount(() => {})
</script>

<style scoped>
.userInfo {
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-right: none;
}

.userInfo-container {
  width: 100%;
  height: 100%;
  background-color: var(--bg-color);
  border-radius: 6px;
  overflow: hidden;
  padding: 4px;
  box-shadow: none;
  color: var(--text-color);
  border: none;
}

:deep(.ant-card) {
  height: 100%;
  background-color: var(--bg-color);
  border: none;
  box-shadow: none;
}

:deep(.ant-card-body) {
  border: none;
}

:deep(.ant-card-body) {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow-y: auto;
  border: none;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb-color, rgba(0, 0, 0, 0.2)) transparent;
}

/* 自定义滚动条样式 */
:deep(.ant-card-body)::-webkit-scrollbar {
  width: 6px;
}

:deep(.ant-card-body)::-webkit-scrollbar-track {
  background: transparent;
}

:deep(.ant-card-body)::-webkit-scrollbar-thumb {
  background-color: var(--scrollbar-thumb-color, rgba(0, 0, 0, 0.2));
  border-radius: 3px;
}

/* 表单样式 */
.custom-form {
  color: var(--text-color);
  align-content: center;
  width: 100%;
}

.custom-form :deep(.ant-form-item-label) {
  padding-right: 1px;
}

.custom-form :deep(.ant-form-item-label > label) {
  color: var(--text-color);
}

/* 输入框样式 */
.custom-input,
:deep(.ant-input-password),
:deep(.ant-input-password .ant-input) {
  background-color: var(--bg-color) !important;
  color: var(--text-color) !important;
  border-radius: 4px !important;
  width: 250px !important;

  &::placeholder {
    color: var(--text-color-secondary);
  }
}

.custom-input:hover,
.custom-input:focus,
:deep(.ant-input-password:hover),
:deep(.ant-input-password-focused) {
  border-color: #2a82e4 !important;
  box-shadow: 0 0 0 2px rgba(42, 130, 228, 0.2) !important;
}

:deep(.ant-input-password .anticon) {
  color: #f8f8f8 !important;
}

/* 错误提示样式 */
.custom-form :deep(.ant-form-item-explain-error) {
  color: #ff4d4f;
}

.custom-form :deep(.ant-form-item-required::before) {
  color: #ff4d4f;
}

/* 表单项样式 */
.user_my-ant-form-item {
  -webkit-box-sizing: border-box;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  color: var(--text-color);
  font-size: 30px;
  font-variant: tabular-nums;
  line-height: 1.5;
  list-style: none;
  -webkit-font-feature-settings: 'tnum';
  font-feature-settings: 'tnum';
  margin-bottom: 8px;
  vertical-align: top;
  width: 100%;
}

/* 密码强度表单项样式覆盖 */
.custom-form :deep(.ant-form-item) {
  margin-bottom: 8px;
}

/* 头像样式 */
.user_avatar {
  width: 18vmin;
  height: 18vmin;
  margin: 0 auto 20px;
  border-radius: 50%;
  overflow: hidden;
  position: relative;
  flex-shrink: 0;
}

.user_avatar img {
  position: absolute;
  width: 100%;
  height: 100%;
  object-fit: cover;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}

.vip-badge {
  position: absolute;
  bottom: 2%;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, #ffd700, #ff8f00);
  color: #000;
  font-size: 8px;
  font-weight: bold;
  text-transform: uppercase;
  padding: 1px 6px;
  border-radius: 8px;
  z-index: 10;
  letter-spacing: 0.8px;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.1);
}

/* 按钮容器样式 */
.button-container {
  margin-top: 20px;
  text-align: center;
}

.button-container .ant-btn {
  min-width: 80px;
}

/* 响应式样式 */
@media (max-width: 768px) {
  .user_avatar {
    width: 20vmin;
    height: 20vmin;
  }
}

.registration_type {
  text-align: center;
  font-weight: bold;
}

.divider-container {
  width: 70%;
  margin: 0 auto;
  text-align: center;
}

.divider-container :deep(.ant-divider) {
  border-color: var(--border-color-light);
}

.subscription-tag {
  background-color: rgba(42, 130, 228, 0.15);
  color: #1890ff;
  border: 1px solid rgba(42, 130, 228, 0.3);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  padding: 1px 6px;
  letter-spacing: 0.5px;
}

.free-tag {
  background-color: rgba(128, 128, 128, 0.1);
  border-color: rgba(128, 128, 128, 0.15);
  color: var(--text-color-secondary, #999);
}
</style>
