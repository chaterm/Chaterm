<template>
  <div class="userInfo">
    <a-card
      :bordered="false"
      class="userInfo-container"
    >
      <div
        class="user_avatar"
        :title="!unChange ? t('userInfo.clickToUploadAvatar') : ''"
        @click="handleAvatarClick"
      >
        <img
          :src="userInfo.avatar"
          referrerpolicy="no-referrer"
          alt=""
        />
        <div
          v-if="!unChange"
          class="avatar-upload-overlay"
        >
          <CameraOutlined class="camera-icon" />
        </div>
        <div
          v-if="userInfo.subscription && (userInfo.subscription.toLowerCase() === 'pro' || userInfo.subscription.toLowerCase() === 'ultra')"
          class="vip-badge"
        >
          VIP/{{ userInfo.subscription }}
        </div>
        <input
          ref="avatarInput"
          type="file"
          accept="image/*"
          style="display: none"
          @change="handleAvatarChange"
        />
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
        <div
          v-if="!unChange"
          class="action-buttons-container"
        >
          <a-button
            v-if="!isEditing"
            type="text"
            size="small"
            class="edit-icon-btn"
            :title="t('userInfo.edit')"
            @click="startEditing"
          >
            <FormOutlined />
          </a-button>
          <template v-else>
            <a-button
              type="text"
              size="small"
              class="edit-icon-btn"
              :title="t('userInfo.save')"
              @click="handleSave"
            >
              <CheckOutlined />
            </a-button>
            <a-button
              type="text"
              size="small"
              class="edit-icon-btn"
              :title="t('userInfo.cancel')"
              @click="cancelEditing"
            >
              <CloseOutlined />
            </a-button>
          </template>
        </div>
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
          :label="t('userInfo.password')"
          class="user_my-ant-form-item"
        >
          <span>****************</span>
          <a-button
            v-if="!unChange && !isEditing"
            type="text"
            size="small"
            class="edit-icon-btn"
            :title="t('userInfo.resetPassword')"
            @click="showPasswordModal = true"
          >
            <EditOutlined />
          </a-button>
        </a-form-item>
        <a-form-item
          v-if="isChineseEdition()"
          :label="t('userInfo.mobile')"
          class="user_my-ant-form-item"
          name="mobile"
        >
          <span>{{ userInfo.mobile || '-' }}</span>
          <a-button
            v-if="!unChange && !isEditing && canEditMobile"
            type="text"
            size="small"
            class="edit-icon-btn"
            :title="userInfo.mobile ? t('userInfo.modifyMobile') : t('userInfo.bindMobile')"
            @click="handleOpenMobileModal"
          >
            <EditOutlined />
          </a-button>
        </a-form-item>
        <a-form-item
          :label="t('userInfo.email')"
          class="user_my-ant-form-item"
        >
          <span>{{ userInfo.email || '-' }}</span>
          <a-button
            v-if="!unChange && !isEditing && canEditEmail"
            type="text"
            size="small"
            class="edit-icon-btn"
            :title="userInfo.email ? t('userInfo.modifyEmail') : t('userInfo.bindEmail')"
            @click="handleOpenEmailModal"
          >
            <EditOutlined />
          </a-button>
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
    </a-card>

    <a-modal
      v-if="isChineseEdition()"
      v-model:open="showMobileModal"
      :title="userInfo.mobile ? t('userInfo.modifyMobile') : t('userInfo.bindMobile')"
      :width="420"
      class="compact-modal"
      centered
      :ok-text="t('common.confirm')"
      :cancel-text="t('common.cancel')"
      @ok="handleVerifyAndBindMobile"
      @cancel="cancelBindingMobile"
    >
      <div class="modal-form-container">
        <a-form
          :label-col="{ span: 7 }"
          :wrapper-col="{ span: 17 }"
        >
          <a-form-item
            :label="t('userInfo.mobile')"
            class="compact-form-item"
          >
            <a-input
              v-model:value="mobileBindForm.mobile"
              :placeholder="t('userInfo.pleaseInputMobile')"
              size="small"
            />
          </a-form-item>
          <a-form-item
            :label="t('userInfo.verificationCode')"
            class="compact-form-item"
          >
            <div class="code-input-row">
              <a-input
                v-model:value="mobileBindForm.code"
                :placeholder="t('userInfo.pleaseInputMobileCode')"
                size="small"
                style="flex: 1"
              />
              <a-button
                type="primary"
                size="small"
                :disabled="mobileCodeSending || mobileCodeCountdown > 0"
                @click="handleSendMobileBindCode"
              >
                {{ mobileCodeCountdown > 0 ? `${mobileCodeCountdown}s` : t('userInfo.sendMobileCode') }}
              </a-button>
            </div>
          </a-form-item>
        </a-form>
      </div>
    </a-modal>

    <a-modal
      v-model:open="showPasswordModal"
      :title="t('userInfo.resetPassword')"
      :width="420"
      class="compact-modal"
      centered
      :ok-text="t('common.confirm')"
      :cancel-text="t('common.cancel')"
      @ok="handleResetPassword"
      @cancel="cancelResetPassword"
    >
      <div class="modal-form-container">
        <a-form
          :label-col="{ span: 8 }"
          :wrapper-col="{ span: 16 }"
        >
          <a-form-item
            :label="t('userInfo.password')"
            class="compact-form-item"
          >
            <a-input-password
              v-model:value="formState.newPassword"
              :placeholder="t('userInfo.pleaseInputNewPassword')"
              size="small"
            />
          </a-form-item>
          <a-form-item
            :label="t('userInfo.confirmPassword')"
            class="compact-form-item"
            :validate-status="formState.confirmPassword && !passwordMatch ? 'error' : ''"
            :help="formState.confirmPassword && !passwordMatch ? t('userInfo.passwordMismatch') : ''"
          >
            <a-input-password
              v-model:value="formState.confirmPassword"
              :placeholder="t('userInfo.pleaseInputConfirmPassword')"
              size="small"
            />
          </a-form-item>
          <a-form-item
            v-if="formState.newPassword"
            :label="t('userInfo.passwordStrength')"
            class="compact-form-item"
          >
            <span
              v-if="strength === 0 || strength === 1"
              style="color: red; font-size: 12px"
              >{{ t('userInfo.passwordStrengthWeak') }}</span
            >
            <span
              v-else-if="strength === 2"
              style="color: #d46b08; font-size: 12px"
              >{{ t('userInfo.passwordStrengthMedium') }}</span
            >
            <span
              v-else-if="strength === 3 || strength === 4"
              style="color: rgb(50, 100, 237); font-size: 12px"
              >{{ t('userInfo.passwordStrengthStrong') }}</span
            >
          </a-form-item>
        </a-form>
      </div>
    </a-modal>

    <a-modal
      v-model:open="showEmailModal"
      :title="userInfo.email ? t('userInfo.modifyEmail') : t('userInfo.bindEmail')"
      :width="420"
      class="compact-modal"
      centered
      :ok-text="t('common.confirm')"
      :cancel-text="t('common.cancel')"
      @ok="handleVerifyAndBindEmail"
      @cancel="cancelBindingEmail"
    >
      <div class="modal-form-container">
        <a-form
          :label-col="{ span: 7 }"
          :wrapper-col="{ span: 17 }"
        >
          <a-form-item
            :label="t('userInfo.email')"
            class="compact-form-item"
          >
            <a-input
              v-model:value="emailBindForm.email"
              :placeholder="t('userInfo.pleaseInputEmail')"
              size="small"
            />
          </a-form-item>
          <a-form-item
            :label="t('userInfo.verificationCode')"
            class="compact-form-item"
          >
            <div class="code-input-row">
              <a-input
                v-model:value="emailBindForm.code"
                :placeholder="t('userInfo.pleaseInputEmailCode')"
                size="small"
                style="flex: 1"
              />
              <a-button
                type="primary"
                size="small"
                :disabled="emailCodeSending || emailCodeCountdown > 0"
                @click="handleSendEmailBindCode"
              >
                {{ emailCodeCountdown > 0 ? `${emailCodeCountdown}s` : t('userInfo.sendEmailCode') }}
              </a-button>
            </div>
          </a-form-item>
        </a-form>
      </div>
    </a-modal>

    <!-- Avatar Settings Modal -->
    <a-modal
      v-model:open="showAvatarModal"
      :title="t('userInfo.avatarSettings')"
      :width="300"
      class="avatar-settings-modal"
      centered
      :footer="null"
      @cancel="cancelAvatarSettings"
    >
      <div class="avatar-settings-content">
        <!-- Image Preview Area -->
        <div class="avatar-preview-container">
          <div
            ref="previewWrapper"
            class="avatar-preview-wrapper"
            @mousedown="handlePreviewMouseDown"
            @click="handlePreviewClick"
          >
            <img
              v-if="previewImageSrc"
              ref="previewImage"
              :src="previewImageSrc"
              class="avatar-preview-image"
              :style="previewImageStyle"
              draggable="false"
              @load="handleImageLoad"
            />
            <div
              v-else
              class="avatar-preview-placeholder"
            >
              <CameraOutlined class="placeholder-icon" />
              <p>{{ t('userInfo.clickToUploadAvatar') }}</p>
            </div>
          </div>
        </div>

        <!-- Zoom Slider -->
        <div
          v-if="previewImageSrc"
          class="avatar-zoom-control"
        >
          <span class="zoom-label">-</span>
          <a-slider
            v-model:value="zoomValue"
            :min="1"
            :max="2"
            :step="0.1"
            class="zoom-slider"
            @change="handleZoomChange"
          />
          <span class="zoom-label">+</span>
        </div>

        <!-- Action Buttons -->
        <div class="avatar-actions">
          <a-button
            type="default"
            class="upload-btn"
            @click="handleLocalUpload"
          >
            {{ t('userInfo.localUpload') }}
          </a-button>
          <a-button
            type="default"
            @click="cancelAvatarSettings"
          >
            {{ t('common.cancel') }}
          </a-button>
          <a-button
            type="primary"
            :loading="avatarUploading"
            :disabled="!previewImageSrc"
            @click="handleSaveAvatar"
          >
            {{ t('common.save') }}
          </a-button>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, reactive, computed } from 'vue'
import 'xterm/css/xterm.css'
import i18n from '@/locales'
import {
  getUser,
  updateUser,
  changePassword,
  sendEmailBindCode,
  verifyAndBindEmail,
  sendMobileBindCode,
  verifyAndBindMobile,
  updateAvatar
} from '@api/user/user'
import { EditOutlined, CheckOutlined, CloseOutlined, FormOutlined, CameraOutlined } from '@ant-design/icons-vue'
import { useDeviceStore } from '@/store/useDeviceStore'
import { message } from 'ant-design-vue'
import zxcvbn from 'zxcvbn'
import { isChineseEdition } from '@/utils/edition'

interface ApiResponse {
  code: number
  message?: string
  data?: any
}

interface UserInfo {
  avatar?: string
  subscription?: string
  registrationType?: number
  expires?: string
  uid?: number
  name?: string
  username?: string
  mobile?: string
  email?: string
  secondaryOrganization?: string
  tertiaryOrganization?: string
  team?: string
  localIp?: string
  macAddress?: string
  isOfficeDevice?: boolean
  needDeviceVerification?: boolean
  response?: any
}

const { t } = i18n.global
const deviceStore = useDeviceStore()
const userInfo = ref<UserInfo>({})
const isEditing = ref(false)
const unChange = ref(true)
const showMobileModal = ref(false)
const showPasswordModal = ref(false)
const showEmailModal = ref(false)
const showAvatarModal = ref(false)

const formState = reactive({
  username: '',
  name: '',
  mobile: '',
  newPassword: '',
  confirmPassword: ''
})

const emailBindForm = reactive({
  email: '',
  code: ''
})

const mobileBindForm = reactive({
  mobile: '',
  code: ''
})

const emailCodeCountdown = ref(0)
const mobileCodeCountdown = ref(0)
const emailCodeSending = ref(false)
const mobileCodeSending = ref(false)
const avatarInput = ref<HTMLInputElement | null>(null)
const avatarUploading = ref(false)

// Avatar preview and adjustment state
const previewImageSrc = ref<string>('')
const previewImage = ref<HTMLImageElement | null>(null)
const previewWrapper = ref<HTMLDivElement | null>(null)
const zoomValue = ref<number>(1.0)
const imagePosition = reactive({ x: 0, y: 0 })
const isDragging = ref(false)
const dragStart = reactive({ x: 0, y: 0 })
const originalImageSize = reactive({ width: 0, height: 0 })
const previewSize = 200 // Preview container size in pixels

// Preview image style computed property
const previewImageStyle = computed(() => {
  return {
    transform: `scale(${zoomValue.value}) translate(${imagePosition.x / zoomValue.value}px, ${imagePosition.y / zoomValue.value}px)`,
    transformOrigin: '0 0',
    position: 'absolute' as const,
    top: '0',
    left: '0'
  }
})

const getUserInfo = () => {
  getUser({}).then((res: any) => {
    userInfo.value = res.data as UserInfo
    userInfo.value.localIp = deviceStore.getDeviceIp
    userInfo.value.macAddress = deviceStore.getMacAddress
    if (userInfo.value.uid !== 2000001) unChange.value = false
    formState.username = userInfo.value.username || ''
    formState.name = userInfo.value.name || ''
    formState.mobile = userInfo.value.mobile || ''
  })
}
const strength = computed(() => {
  if (formState.newPassword === '') return null
  else return zxcvbn(formState.newPassword).score
})

const passwordMatch = computed(() => {
  if (formState.confirmPassword === '') return true
  return formState.newPassword === formState.confirmPassword
})

const canEditMobile = computed(() => {
  return userInfo.value.registrationType !== 7
})

const canEditEmail = computed(() => {
  return (
    userInfo.value.registrationType !== 2 &&
    userInfo.value.registrationType !== 3 &&
    userInfo.value.registrationType !== 4 &&
    userInfo.value.registrationType !== 6
  )
})

const startEditing = () => {
  isEditing.value = true
}

const cancelEditing = () => {
  isEditing.value = false
  formState.name = userInfo.value.name || ''
  formState.username = userInfo.value.username || ''
  formState.mobile = userInfo.value.mobile || ''
  formState.newPassword = ''
  formState.confirmPassword = ''
}

const cancelBindingEmail = () => {
  showEmailModal.value = false
  emailBindForm.email = userInfo.value.email || ''
  emailBindForm.code = ''
}

const handleOpenEmailModal = () => {
  showEmailModal.value = true
  emailBindForm.email = userInfo.value.email || ''
  emailBindForm.code = ''
}

const handleSendEmailBindCode = async () => {
  if (!emailBindForm.email) {
    message.error(t('userInfo.pleaseInputEmail'))
    return
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(emailBindForm.email)) {
    message.error(t('common.invalidEmail'))
    return
  }

  try {
    emailCodeSending.value = true
    const response = (await sendEmailBindCode({ email: emailBindForm.email })) as unknown as ApiResponse
    if (response.code === 200) {
      message.success(t('userInfo.emailCodeSent'))
      emailCodeCountdown.value = 300
      const timer = setInterval(() => {
        emailCodeCountdown.value--
        if (emailCodeCountdown.value <= 0) {
          clearInterval(timer)
        }
      }, 1000)
    } else {
      message.error(response.message || t('userInfo.emailBindFailed'))
    }
  } catch (error: any) {
    const errorMessage = error?.response?.data?.message || t('userInfo.emailBindFailed')
    message.error(errorMessage)
  } finally {
    emailCodeSending.value = false
  }
}

const handleVerifyAndBindEmail = async () => {
  if (!emailBindForm.email || !emailBindForm.code) {
    message.error(t('userInfo.pleaseInputEmailCode'))
    return
  }

  try {
    const response = (await verifyAndBindEmail({ email: emailBindForm.email, code: emailBindForm.code })) as unknown as ApiResponse
    if (response.code === 200) {
      message.success(t('userInfo.emailBindSuccess'))
      showEmailModal.value = false
      getUserInfo()
    } else {
      message.error(response.message || t('userInfo.emailBindFailed'))
    }
  } catch (error: any) {
    const errorMessage = error?.response?.data?.message || t('userInfo.emailBindFailed')
    message.error(errorMessage)
  }
}

const cancelBindingMobile = () => {
  showMobileModal.value = false
  mobileBindForm.mobile = userInfo.value.mobile || ''
  mobileBindForm.code = ''
}

const handleOpenMobileModal = () => {
  showMobileModal.value = true
  mobileBindForm.mobile = userInfo.value.mobile || ''
  mobileBindForm.code = ''
}

const handleSendMobileBindCode = async () => {
  if (!mobileBindForm.mobile) {
    message.error(t('userInfo.pleaseInputMobile'))
    return
  }
  if (!/^1[3-9]\d{9}$/.test(mobileBindForm.mobile)) {
    message.error(t('userInfo.mobileInvalid'))
    return
  }

  try {
    mobileCodeSending.value = true
    const response = (await sendMobileBindCode({ mobile: mobileBindForm.mobile })) as unknown as ApiResponse
    if (response.code === 200) {
      message.success(t('userInfo.mobileCodeSent'))
      mobileCodeCountdown.value = 300
      const timer = setInterval(() => {
        mobileCodeCountdown.value--
        if (mobileCodeCountdown.value <= 0) {
          clearInterval(timer)
        }
      }, 1000)
    } else {
      message.error(response.message || t('userInfo.mobileBindFailed'))
    }
  } catch (error: any) {
    const errorMessage = error?.response?.data?.message || t('userInfo.mobileBindFailed')
    message.error(errorMessage)
  } finally {
    mobileCodeSending.value = false
  }
}

const handleVerifyAndBindMobile = async () => {
  if (!mobileBindForm.mobile || !mobileBindForm.code) {
    message.error(t('userInfo.pleaseInputMobileCode'))
    return
  }

  try {
    const response = (await verifyAndBindMobile({ mobile: mobileBindForm.mobile, code: mobileBindForm.code })) as unknown as ApiResponse
    if (response.code === 200) {
      message.success(t('userInfo.mobileBindSuccess'))
      showMobileModal.value = false
      getUserInfo()
    } else {
      message.error(response.message || t('userInfo.mobileBindFailed'))
    }
  } catch (error: any) {
    const errorMessage = error?.response?.data?.message || t('userInfo.mobileBindFailed')
    message.error(errorMessage)
  }
}

const cancelResetPassword = () => {
  showPasswordModal.value = false
  formState.newPassword = ''
  formState.confirmPassword = ''
}

const handleResetPassword = async () => {
  if (!validatePassword()) {
    return
  }
  try {
    const response = (await changePassword({
      password: formState.newPassword
    })) as unknown as ApiResponse
    if (response.code == 200) {
      message.success(t('userInfo.passwordResetSuccess'))
      showPasswordModal.value = false
      formState.newPassword = ''
      formState.confirmPassword = ''
    } else {
      message.error(response.message || t('userInfo.passwordResetFailed'))
    }
  } catch (error: any) {
    const errorMessage = error?.response?.data?.message || t('userInfo.passwordResetFailed')
    message.error(errorMessage)
  }
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
  if (formState.newPassword !== formState.confirmPassword) {
    message.error(t('userInfo.passwordMismatch'))
    return false
  }
  return true
}
const validateSave = () => {
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
    if (!validateSave()) return
    const response = (await updateUser({
      username: formState.username,
      name: formState.name
    })) as unknown as ApiResponse
    console.log(response)
    if (response.code == 200) {
      message.success(t('userInfo.updateSuccess'))
      cancelEditing()
      getUserInfo()
    } else {
      message.error(response.message || t('userInfo.updateFailed'))
    }
  } catch (error: any) {
    const errorMessage = error?.response?.data?.message || t('userInfo.updateFailed')
    message.error(errorMessage)
  }
}

const handleAvatarClick = () => {
  if (unChange.value) return
  showAvatarModal.value = true
}

// Avatar settings modal functions
const cancelAvatarSettings = () => {
  showAvatarModal.value = false
  resetAvatarPreview()
}

const resetAvatarPreview = () => {
  previewImageSrc.value = ''
  zoomValue.value = 1.0
  imagePosition.x = 0
  imagePosition.y = 0
  isDragging.value = false
  originalImageSize.width = 0
  originalImageSize.height = 0
}

const handleLocalUpload = () => {
  avatarInput.value?.click()
}

const handleImageLoad = () => {
  if (previewImage.value) {
    // Image has already been resized in handleAvatarChange
    // So naturalWidth/Height should match the resized dimensions
    // But we need to get the actual displayed dimensions
    originalImageSize.width = previewImage.value.width || previewImage.value.naturalWidth
    originalImageSize.height = previewImage.value.height || previewImage.value.naturalHeight
    // Center the image initially
    centerImage()
  }
}

const centerImage = () => {
  if (!previewImage.value || !previewWrapper.value) return

  const wrapperRect = previewWrapper.value.getBoundingClientRect()
  const wrapperWidth = wrapperRect.width
  const wrapperHeight = wrapperRect.height

  const scaledWidth = originalImageSize.width * zoomValue.value
  const scaledHeight = originalImageSize.height * zoomValue.value

  // Center the image in the wrapper
  imagePosition.x = (wrapperWidth - scaledWidth) / 2
  imagePosition.y = (wrapperHeight - scaledHeight) / 2
}

const constrainImagePosition = () => {
  if (!previewImage.value || !previewWrapper.value) return

  const wrapperRect = previewWrapper.value.getBoundingClientRect()
  const wrapperWidth = wrapperRect.width
  const wrapperHeight = wrapperRect.height

  const scaledWidth = originalImageSize.width * zoomValue.value
  const scaledHeight = originalImageSize.height * zoomValue.value

  // Calculate min/max positions to keep image covering the preview area
  const minX = Math.min(0, wrapperWidth - scaledWidth)
  const maxX = Math.max(0, wrapperWidth - scaledWidth)
  const minY = Math.min(0, wrapperHeight - scaledHeight)
  const maxY = Math.max(0, wrapperHeight - scaledHeight)

  imagePosition.x = Math.max(minX, Math.min(maxX, imagePosition.x))
  imagePosition.y = Math.max(minY, Math.min(maxY, imagePosition.y))
}

const handleZoomChange = () => {
  constrainImagePosition()
}

const handlePreviewClick = () => {
  // If no image is loaded, trigger file upload
  if (!previewImageSrc.value) {
    handleLocalUpload()
  }
}

const handlePreviewMouseDown = (e: MouseEvent) => {
  if (!previewImageSrc.value) return
  isDragging.value = true
  dragStart.x = e.clientX - imagePosition.x
  dragStart.y = e.clientY - imagePosition.y
  e.preventDefault()
}

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return

  imagePosition.x = e.clientX - dragStart.x
  imagePosition.y = e.clientY - dragStart.y
  constrainImagePosition()
}

const handleMouseUp = () => {
  isDragging.value = false
}

const handleAvatarChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    message.error(t('userInfo.pleaseSelectImage'))
    return
  }

  // Load and compress image to fit preview area
  const reader = new FileReader()
  reader.onload = (e) => {
    const img = new Image()
    img.onload = () => {
      // Calculate scale to fit preview area (200x200)
      // Make sure image fits within preview area, maintaining aspect ratio
      const maxPreviewSize = previewSize // Max size should be 200px
      let width = img.width
      let height = img.height

      // Scale image to fit maxPreviewSize (upscale or downscale)
      // Use Math.max to ensure the SHORTEST side fits the preview area (Cover mode)
      const scale = Math.max(maxPreviewSize / width, maxPreviewSize / height)
      width = width * scale
      height = height * scale

      // Create canvas to resize image
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        message.error(t('userInfo.imageLoadFailed'))
        return
      }

      // Draw resized image
      ctx.drawImage(img, 0, 0, width, height)

      // Convert to base64
      const resizedBase64 = canvas.toDataURL('image/jpeg', 0.9)

      // Set preview image
      previewImageSrc.value = resizedBase64

      // Store original dimensions (after resizing)
      originalImageSize.width = width
      originalImageSize.height = height

      // Reset zoom and position when new image is loaded
      zoomValue.value = 1.0
      imagePosition.x = 0
      imagePosition.y = 0

      // Center image after a short delay to ensure image is loaded
      setTimeout(() => {
        centerImage()
      }, 100)
    }
    img.onerror = () => {
      message.error(t('userInfo.imageLoadFailed'))
    }
    img.src = e.target?.result as string
  }
  reader.onerror = () => {
    message.error(t('userInfo.imageReadFailed'))
  }
  reader.readAsDataURL(file)

  // Clear input
  if (avatarInput.value) {
    avatarInput.value.value = ''
  }
}

// Generate cropped and compressed image from preview
const generateAvatarImage = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!previewImage.value) {
      reject(new Error('No preview image'))
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = previewSize
    canvas.height = previewSize
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      reject(new Error('Failed to get canvas context'))
      return
    }

    // Draw white background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, previewSize, previewSize)

    // Calculate the scaled dimensions
    const scaledWidth = originalImageSize.width * zoomValue.value
    const scaledHeight = originalImageSize.height * zoomValue.value

    // Draw the image onto the canvas exactly as it appears in the preview
    // imagePosition already represents the offset of the scaled image relative to the preview area
    ctx.drawImage(previewImage.value, imagePosition.x, imagePosition.y, scaledWidth, scaledHeight)

    // Convert to base64 with compression
    let quality = 0.8
    let base64 = canvas.toDataURL('image/jpeg', quality)

    // Standard Base64 size limit (approx 10KB)
    const maxSizeKB = 10
    while (base64.length > maxSizeKB * 1024 * 1.37 && quality > 0.1) {
      quality -= 0.1
      base64 = canvas.toDataURL('image/jpeg', quality)
    }

    resolve(base64)
  })
}

const handleSaveAvatar = async () => {
  if (!previewImageSrc.value) return

  try {
    avatarUploading.value = true
    const base64 = await generateAvatarImage()

    const response = (await updateAvatar({ avatarBase64: base64 })) as unknown as ApiResponse
    if (response.code === 200) {
      message.success(t('userInfo.avatarUpdateSuccess'))
      showAvatarModal.value = false
      resetAvatarPreview()
      getUserInfo()
    } else {
      message.error(response.message || t('userInfo.avatarUpdateFailed'))
    }
  } catch (error: any) {
    const errorMessage = error?.response?.data?.message || error?.message || t('userInfo.avatarUpdateFailed')
    message.error(errorMessage)
  } finally {
    avatarUploading.value = false
  }
}

onMounted(() => {
  getUserInfo()
  // Add global mouse event listeners for dragging
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
})

onBeforeUnmount(() => {
  // Remove global mouse event listeners
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
})
</script>

<style lang="less" scoped>
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
  position: relative;
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

.custom-form {
  position: relative;
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

.custom-input {
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

.custom-form :deep(.ant-form-item-explain-error) {
  color: #ff4d4f;
}

.custom-form :deep(.ant-form-item-required::before) {
  color: #ff4d4f;
}

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

.custom-form :deep(.ant-form-item) {
  margin-bottom: 8px;
}

.user_avatar {
  width: 18vmin;
  height: 18vmin;
  margin: 0 auto 20px;
  border-radius: 50%;
  overflow: hidden;
  position: relative;
  flex-shrink: 0;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover .avatar-upload-overlay {
    opacity: 1;
  }
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

.avatar-upload-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 5;
}

.camera-icon {
  font-size: 32px;
  color: #fff;
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

.action-buttons-container {
  position: absolute;
  top: 0;
  right: 15%;
  display: flex;
  align-items: center;
  gap: 4px;
  z-index: 10;
}

.edit-icon {
  width: 14px;
  height: 14px;
  filter: var(--icon-filter);
}

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
  position: relative;
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

.enterprise-certification-icon {
  width: 24px;
  height: 24px;
  vertical-align: middle;
}

.edit-icon-btn {
  padding: 2px;
  width: auto;
  height: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  transition: all 0.2s;
  margin-left: 8px;
  color: var(--text-color-tertiary);
  background-color: transparent;

  &:hover,
  &:focus {
    color: #1890ff;
    background-color: rgba(24, 144, 255, 0.1);
  }
}

.modal-form-container {
  padding: 8px 0;
}

.compact-form-item {
  margin-bottom: 16px !important;

  &:last-child {
    margin-bottom: 0 !important;
  }

  :deep(.ant-form-item-label) {
    padding-bottom: 6px;

    > label {
      font-size: 13px;
      height: auto;
      color: var(--text-color);
    }
  }

  :deep(.ant-form-item-control-input) {
    min-height: auto;
  }
}

.code-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Avatar settings modal styles */
.avatar-settings-content {
  padding: 20px 0;
}

.avatar-preview-container {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-bottom: 24px;
}

.avatar-preview-wrapper {
  width: 200px;
  height: 200px;
  border: 2px solid var(--border-color, #d9d9d9);
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  background-color: var(--bg-color-secondary, #f5f5f5);
  cursor: move;
  user-select: none;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.15),
    inset 0 0 0 1px rgba(0, 0, 0, 0.05);

  &:hover {
    border-color: var(--border-color-light, #bfbfbf);
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.2),
      inset 0 0 0 1px rgba(0, 0, 0, 0.08);
  }
}

.avatar-preview-image {
  position: absolute;
  top: 50%;
  left: 50%;
  max-width: none;
  max-height: none;
  pointer-events: none;
  transition: transform 0.1s ease-out;
}

.avatar-preview-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-color-secondary, #999);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    color: var(--text-color, #333);
    background-color: var(--bg-color-tertiary, rgba(0, 0, 0, 0.02));
  }

  .placeholder-icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
    transition: opacity 0.2s;
  }

  &:hover .placeholder-icon {
    opacity: 0.8;
  }

  p {
    margin: 0;
    font-size: 14px;
  }
}

.avatar-zoom-control {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  padding: 0 20px;

  .zoom-label {
    font-size: 16px;
    color: var(--text-color, #333);
    min-width: 20px;
    text-align: center;
  }

  .zoom-slider {
    flex: 1;
  }

  // Slider styles for better visibility in both light and dark themes
  :deep(.ant-slider) {
    .ant-slider-rail {
      background-color: rgba(255, 255, 255, 0.15) !important;

      &:hover {
        background-color: rgba(255, 255, 255, 0.2) !important;
      }
    }

    .ant-slider-track {
      background-color: #1890ff !important;
    }

    .ant-slider-handle {
      border-color: #1890ff !important;
      background-color: #fff !important;
      box-shadow:
        0 0 0 2px rgba(24, 144, 255, 0.2),
        0 2px 4px rgba(0, 0, 0, 0.3) !important;

      &:hover,
      &:focus {
        border-color: #40a9ff !important;
        box-shadow:
          0 0 0 4px rgba(24, 144, 255, 0.3),
          0 2px 8px rgba(0, 0, 0, 0.4) !important;
      }

      &::after {
        box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2) !important;
      }
    }

    &:hover .ant-slider-rail {
      background-color: rgba(255, 255, 255, 0.2) !important;
    }
  }
}

.avatar-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color-light, #e8e8e8);

  .upload-btn {
    margin-right: auto;
  }
}
</style>

<style lang="less">
.ant-modal-wrap .ant-modal.compact-modal {
  .ant-modal-content {
    background-color: var(--bg-color-senary) !important;
  }

  .ant-modal-body {
    background-color: var(--bg-color-senary) !important;
  }

  .ant-modal-header {
    background-color: var(--bg-color-senary) !important;
  }

  .ant-modal-title {
    color: var(--text-color) !important;
  }

  .ant-modal-close {
    color: var(--text-color-secondary) !important;

    &:hover {
      color: var(--text-color) !important;
    }
  }

  .ant-modal-footer {
    background-color: var(--bg-color-senary) !important;
  }

  .ant-input {
    background-color: var(--bg-color-quinary) !important;
    border-color: var(--border-color) !important;
    color: var(--text-color) !important;
    width: 100% !important;
    height: 28px !important;
    line-height: 28px !important;

    &::placeholder {
      color: var(--text-color-tertiary) !important;
    }

    &:hover {
      border-color: var(--text-color-secondary) !important;
    }

    &:focus,
    &.ant-input-focused {
      border-color: #1890ff !important;
      box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2) !important;
    }
  }

  .code-input-row .ant-input {
    &:focus,
    &.ant-input-focused {
      border-color: var(--border-color) !important;
      box-shadow: none !important;
    }

    &:hover {
      border-color: var(--border-color) !important;
    }
  }

  .code-input-row .ant-btn-primary[disabled] {
    color: var(--text-color) !important;
    background-color: var(--bg-color-secondary) !important;
    border-color: var(--border-color) !important;
    opacity: 1 !important;
    cursor: not-allowed !important;

    &:hover {
      color: var(--text-color) !important;
      background-color: var(--bg-color-secondary) !important;
      border-color: var(--border-color) !important;
    }
  }

  .ant-input-password {
    background-color: var(--bg-color-quinary) !important;
    border-color: var(--border-color) !important;
    color: var(--text-color) !important;
    width: 100% !important;
    min-height: 28px !important;
    height: auto !important;

    .ant-input {
      background-color: var(--bg-color-quinary) !important;
      border-color: transparent !important;
      color: var(--text-color) !important;
      width: 100% !important;
      height: 28px !important;
      line-height: 28px !important;
      padding: 0 30px 0 0 !important;

      &::placeholder {
        color: var(--text-color-tertiary) !important;
      }

      &:focus,
      &.ant-input-focused {
        border-color: transparent !important;
        box-shadow: none !important;
      }
    }

    &:hover {
      border-color: var(--text-color-secondary) !important;
    }

    &:focus-within,
    &.ant-input-affix-wrapper-focused {
      border-color: #1890ff !important;
      box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2) !important;
    }

    .anticon {
      color: var(--text-color-tertiary) !important;

      &:hover {
        color: var(--text-color-secondary) !important;
      }
    }
  }
}

.ant-modal-wrap .ant-modal.avatar-settings-modal {
  .ant-modal-content {
    background-color: var(--bg-color-senary) !important;
  }

  .ant-modal-body {
    background-color: var(--bg-color-senary) !important;
  }

  .ant-modal-header {
    background-color: var(--bg-color-senary) !important;
    border-bottom: 1px solid var(--border-color-light) !important;
  }

  .ant-modal-title {
    color: var(--text-color) !important;
  }

  .ant-modal-close {
    color: var(--text-color-secondary) !important;

    &:hover {
      color: var(--text-color) !important;
    }
  }

  .ant-btn {
    background-color: var(--bg-color-quinary) !important;
    border-color: var(--border-color) !important;
    color: var(--text-color) !important;

    &:hover {
      border-color: var(--text-color-secondary) !important;
      color: var(--text-color) !important;
    }

    &:focus {
      border-color: var(--text-color-secondary) !important;
      color: var(--text-color) !important;
    }
  }

  .ant-btn-primary {
    background-color: #1890ff !important;
    border-color: #1890ff !important;
    color: #fff !important;

    &:hover {
      background-color: #40a9ff !important;
      border-color: #40a9ff !important;
      color: #fff !important;
    }

    &:focus {
      background-color: #40a9ff !important;
      border-color: #40a9ff !important;
      color: #fff !important;
    }

    &[disabled] {
      background-color: var(--bg-color-secondary) !important;
      border-color: var(--border-color) !important;
      color: var(--text-color-tertiary) !important;
      opacity: 0.6 !important;
      cursor: not-allowed !important;

      &:hover {
        background-color: var(--bg-color-secondary) !important;
        border-color: var(--border-color) !important;
        color: var(--text-color-tertiary) !important;
      }
    }
  }

  // Slider styles for better visibility in dark theme
  .ant-slider {
    .ant-slider-rail {
      background-color: rgba(255, 255, 255, 0.15) !important;

      &:hover {
        background-color: rgba(255, 255, 255, 0.2) !important;
      }
    }

    .ant-slider-track {
      background-color: #1890ff !important;
    }

    .ant-slider-handle {
      border-color: #1890ff !important;
      background-color: #fff !important;
      box-shadow:
        0 0 0 2px rgba(24, 144, 255, 0.2),
        0 2px 4px rgba(0, 0, 0, 0.3) !important;

      &:hover,
      &:focus {
        border-color: #40a9ff !important;
        box-shadow:
          0 0 0 4px rgba(24, 144, 255, 0.3),
          0 2px 8px rgba(0, 0, 0, 0.4) !important;
      }

      &::after {
        box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2) !important;
      }
    }

    &:hover .ant-slider-rail {
      background-color: rgba(255, 255, 255, 0.2) !important;
    }
  }
}
</style>
