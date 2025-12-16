<template>
  <div class="term_login">
    <div
      class="connetus"
      :style="{ right: platform.includes('darwin') ? '0px' : '120px' }"
    >
      <a-dropdown overlay-class-name="app-region-no-drag">
        <a
          class="ant-dropdown-link"
          @click.prevent
        >
          <GlobalOutlined />
        </a>
        <template #overlay>
          <a-menu @click="configLang">
            <a-menu-item
              v-for="item in config.LANG"
              :key="item.value"
              >{{ item.name }}
            </a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
    </div>
    <div class="term_login_content">
      <div>
        <img
          src="@/assets/logo.svg"
          class="logo"
          alt=""
        />
      </div>
      <div class="term_login_welcome">
        <span>{{ $t('login.welcome') }}</span>
        <span style="color: #2a82e4; margin-left: 12px">{{ $t('login.title') }}</span>
      </div>
      <div class="term_login_input">
        <template v-if="isDev">
          <!-- 登录方式切换 -->
          <div class="login-tabs">
            <div
              class="tab-item"
              :class="{ active: activeTab === 'account' }"
              @click="activeTab = 'account'"
            >
              {{ $t('login.accountLogin') }}
            </div>
            <div
              class="tab-item"
              :class="{ active: activeTab === 'email' }"
              @click="activeTab = 'email'"
            >
              {{ $t('login.emailLogin') }}
            </div>
          </div>

          <!-- 登录表单 -->
          <div class="login-form">
            <!-- 账号密码登录 -->
            <div
              v-if="activeTab === 'account'"
              class="form-content"
            >
              <div class="input-group">
                <div class="input-field">
                  <span class="input-icon">
                    <UserOutlined />
                  </span>
                  <input
                    v-model="accountForm.username"
                    type="text"
                    :placeholder="$t('login.pleaseInputUsername')"
                    class="form-input"
                  />
                </div>
                <div class="input-divider"></div>
                <div class="input-field">
                  <span class="input-icon">
                    <LockOutlined />
                  </span>
                  <input
                    v-model="accountForm.password"
                    type="password"
                    :placeholder="$t('login.pleaseInputPassword')"
                    class="form-input"
                  />
                </div>
                <div class="input-divider"></div>
              </div>

              <button
                class="login-btn primary"
                :disabled="loading"
                @click="onAccountLogin"
              >
                <span
                  v-if="loading"
                  class="loading-spinner"
                ></span>
                {{ loading ? $t('login.loggingIn') : $t('login.login') }}
              </button>
            </div>

            <!-- 邮箱验证码登录 -->
            <div
              v-if="activeTab === 'email'"
              class="form-content"
            >
              <div class="input-group">
                <div class="input-field">
                  <span class="input-icon">
                    <MailOutlined />
                  </span>
                  <input
                    v-model="emailForm.email"
                    type="email"
                    :placeholder="$t('login.pleaseInputEmail')"
                    class="form-input"
                  />
                </div>
                <div class="input-divider"></div>
                <div class="input-field">
                  <span class="input-icon">
                    <SafetyOutlined />
                  </span>
                  <input
                    v-model="emailForm.code"
                    type="text"
                    :placeholder="$t('login.pleaseInputCode')"
                    class="form-input"
                  />
                  <button
                    class="code-btn"
                    :disabled="codeSending || countdown > 0"
                    @click="sendCode"
                  >
                    {{ countdown > 0 ? `${countdown}s` : $t('login.getCode') }}
                  </button>
                </div>
                <div class="input-divider"></div>
              </div>

              <button
                class="login-btn primary"
                :disabled="loading"
                @click="onEmailLogin"
              >
                <span
                  v-if="loading"
                  class="loading-spinner"
                ></span>
                {{ loading ? $t('login.loggingIn') : $t('login.login') }}
              </button>
            </div>

            <div class="skip-login">
              {{ $t('login.skip') }}
              <a
                class="skip-link"
                @click="skipLogin"
                >{{ $t('login.skipLogin') }}</a
              >
            </div>
          </div>
        </template>
        <template v-else>
          <a-form
            name="login"
            :label-col="{ span: 0 }"
            :wrapper-col="{ span: 24 }"
            autocomplete="off"
          >
            <a-form-item>
              <a-button
                class="login-button"
                type="primary"
                html-type="submit"
                :loading="externalLoginLoading"
                @click="handleExternalLogin"
              >
                {{ $t('login.login') }}
              </a-button>
            </a-form-item>
            <div class="skip-login">
              {{ $t('login.skip') }}
              <a
                class="skip-link"
                @click="skipLogin"
                >{{ $t('login.skipLogin') }}</a
              >
            </div>
          </a-form>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { removeToken } from '@/utils/permission'
import { useRouter } from 'vue-router'
import { ref, onMounted, nextTick, onBeforeUnmount, reactive } from 'vue'
import { GlobalOutlined, MailOutlined, SafetyOutlined, UserOutlined, LockOutlined } from '@ant-design/icons-vue'
import type { MenuProps } from 'ant-design-vue'
import { setUserInfo } from '@/utils/permission'
import { message } from 'ant-design-vue'
import { captureButtonClick, LoginFunnelEvents, LoginMethods, LoginFailureReasons } from '@/utils/telemetry'
import { shortcutService } from '@/services/shortcutService'
import config from '@renderer/config'
import { sendEmailCode, emailLogin, userLogin } from '@/api/user/user'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/store/useDeviceStore'

const { t, locale } = useI18n()
const platform = ref<string>('')
const isDev = ref(false)
const loading = ref(false)
const externalLoginLoading = ref(false)
const codeSending = ref(false)
const countdown = ref(0)
const activeTab = ref('account') // default
const deviceStore = useDeviceStore()
const emailForm = reactive({
  email: '',
  code: ''
})
const accountForm = reactive({
  username: '',
  password: ''
})

const checkUrlForAuthCallback = () => {
  const url = window.location.href
  const urlObj = new URL(url)
  if (urlObj.pathname.includes('auth/callback')) {
    console.log(t('login.authCallbackDetected'), url)
    const userInfo = urlObj.searchParams.get('userInfo')
    const method = urlObj.searchParams.get('method')

    if (userInfo) {
      const chatermUrl = `chaterm://auth/callback?userInfo=${userInfo}&method=${method || ''}&state=${urlObj.searchParams.get('state') || ''}`
      const api = window.api as any
      if (platform.value === 'linux') {
        console.log(t('login.linuxPlatformHandleAuth'))
        api.handleProtocolUrl(chatermUrl).catch((error: any) => {
          console.error(t('login.handleProtocolUrlFailed'), error)
        })
      }
    }
  }
}

const configLang: MenuProps['onClick'] = ({ key }) => {
  const lang = String(key)
  locale.value = lang
  localStorage.setItem('lang', lang)
}
const router = useRouter()
const sendCode = async () => {
  if (!emailForm.email) {
    message.error(t('login.pleaseInputEmail'))
    return
  }
  try {
    codeSending.value = true
    await sendEmailCode({ email: emailForm.email })
    message.success(t('login.codeSent'))
    countdown.value = 300
    const timer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) {
        clearInterval(timer)
      }
    }, 1000)
  } catch (err) {
    message.error(t('login.codeSendFailed'))
  } finally {
    codeSending.value = false
  }
}

const onAccountLogin = async () => {
  if (!accountForm.username || !accountForm.password) {
    message.error(t('login.pleaseInputUsernameAndPassword'))
    return
  }
  try {
    loading.value = true
    const api = window.api as any
    const localPlugins = await api.getPluginsVersion()
    const res = await userLogin({
      username: accountForm.username,
      password: accountForm.password,
      macAddress: deviceStore.getMacAddress,
      localPlugins: localPlugins
    })
    if (res && (res as any).code === 200 && (res as any).data && (res as any).data.token) {
      localStorage.setItem('ctm-token', (res as any).data.token)
      localStorage.setItem('jms-token', (res as any).data.jmsToken)
      setUserInfo((res as any).data)
      const api = window.api as any
      const dbResult = await api.initUserDatabase({ uid: (res as any).data.uid })
      if (!dbResult.success) {
        message.error(t('login.databaseInitFailed'))
        return
      }

      shortcutService.init()
      await nextTick()
      await router.replace({ path: '/', replace: true })
    } else {
      message.error(res && (res as any).Message ? (res as any).Message : t('login.loginFailed'))
    }
  } catch (err: any) {
    message.error(err?.response?.data?.message || err?.message || t('login.loginFailed'))
  } finally {
    loading.value = false
  }
}

const onEmailLogin = async () => {
  if (!emailForm.email || !emailForm.code) {
    message.error(t('login.pleaseInputEmailAndCode'))
    return
  }
  try {
    loading.value = true
    const api = window.api as any
    const localPlugins = await api.getPluginsVersion()
    const res = await emailLogin({
      email: emailForm.email,
      code: emailForm.code,
      macAddress: deviceStore.getMacAddress,
      localPlugins: localPlugins
    })
    if (res && (res as any).code === 200 && (res as any).data && (res as any).data.token) {
      localStorage.setItem('ctm-token', (res as any).data.token)
      localStorage.setItem('jms-token', (res as any).data.jmsToken)
      setUserInfo((res as any).data)
      const api = window.api as any
      const dbResult = await api.initUserDatabase({ uid: (res as any).data.uid })
      if (!dbResult.success) {
        message.error(t('login.databaseInitFailed'))
        return
      }

      shortcutService.init()
      await nextTick()
      await router.replace({ path: '/', replace: true })
    } else {
      message.error(res && (res as any).Message ? (res as any).Message : t('login.loginFailed'))
    }
  } catch (err: any) {
    message.error(err?.response?.data?.message || err?.message || t('login.loginFailed'))
  } finally {
    loading.value = false
  }
}

const skipLogin = async () => {
  try {
    await captureButtonClick(LoginFunnelEvents.SKIP_LOGIN, {
      method: LoginMethods.GUEST
    })
    localStorage.removeItem('ctm-token')
    localStorage.removeItem('jms-token')
    localStorage.removeItem('userInfo')
    localStorage.removeItem('login-skipped')
    removeToken()
    localStorage.setItem('login-skipped', 'true')
    localStorage.setItem('ctm-token', 'guest_token')
    const guestUserInfo = {
      uid: 999999999,
      username: 'guest',
      name: 'Guest',
      email: 'guest@chaterm.ai',
      token: 'guest_token'
    }
    setUserInfo(guestUserInfo)
    const api = window.api as any
    const dbResult = await api.initUserDatabase({ uid: 999999999 })
    if (!dbResult.success) {
      console.error(t('login.guestDatabaseInitFailed'), dbResult.error)
      message.error(t('login.initializationFailed'))
      localStorage.removeItem('login-skipped')
      localStorage.removeItem('ctm-token')
      localStorage.removeItem('jms-token')
      localStorage.removeItem('userInfo')
      return
    }
    shortcutService.init()
    await nextTick()
    try {
      await router.replace({ path: '/', replace: true })
    } catch (error) {
      console.error(t('login.routeJumpFailed'), error)
      message.error(t('login.routeNavigationFailed'))
    }
  } catch (error) {
    console.error(t('login.skipLoginHandleFailed'), error)
    message.error(t('login.operationFailed'))
    localStorage.removeItem('login-skipped')
    localStorage.removeItem('ctm-token')
    localStorage.removeItem('jms-token')
    localStorage.removeItem('userInfo')
  }
}

const handleExternalLogin = async () => {
  try {
    externalLoginLoading.value = true
    const api = window.api as any
    try {
      await api.detectIpLocation()
    } catch (error) {
      console.error(t('login.externalLoginIPDetectionError'), error)
    }
    await api.openExternalLogin()
  } catch (err) {
    console.error(t('login.startExternalLoginFailed'), err)
    message.error(t('login.externalLoginFailed'))
  } finally {
    externalLoginLoading.value = false
  }
}

onMounted(async () => {
  const api = window.api as any
  api.mainWindowShow()

  platform.value = await api.getPlatform()
  isDev.value = import.meta.env.MODE === 'development' || ((window as any).api?.isE2E?.() ?? false)
  await captureButtonClick(LoginFunnelEvents.ENTER_LOGIN_PAGE)
  try {
    await api.detectIpLocation()
  } catch (error) {
    console.error(t('login.loginPageIPDetectionError'), error)
  }
  if (!isDev.value) {
    const ipcRenderer = (window as any).electron?.ipcRenderer
    ipcRenderer?.on('external-login-success', async (_event, data) => {
      const { userInfo, method } = data
      try {
        if (userInfo) {
          localStorage.setItem('ctm-token', userInfo?.token)
          localStorage.setItem('jms-token', userInfo?.jmsToken)
          setUserInfo(userInfo)

          const api = window.api as any
          const dbResult = await api.initUserDatabase({ uid: userInfo.uid })
          if (!dbResult.success) {
            console.error(t('login.databaseInitializationFailed'), dbResult.error)
            await captureButtonClick(LoginFunnelEvents.LOGIN_FAILED, {
              method: method,
              failure_reason: LoginFailureReasons.DATABASE_ERROR,
              error_message: dbResult.error
            })
            return false
          }

          shortcutService.init()
          await captureButtonClick(LoginFunnelEvents.LOGIN_SUCCESS, { method: method })
          router.push('/')
          return true
        }
        return false
      } catch (error) {
        console.error(t('login.loginHandleFailed'), error)
        message.error(t('login.loginProcessFailed'))
        await captureButtonClick(LoginFunnelEvents.LOGIN_FAILED, {
          method: method,
          failure_reason: LoginFailureReasons.UNKNOWN_ERROR,
          error_message: (error as any)?.message || 'Unknown error'
        })
        return false
      }
    })

    if (platform.value === 'linux') {
      checkUrlForAuthCallback()
      window.addEventListener('popstate', checkUrlForAuthCallback)
      window.addEventListener('focus', checkUrlForAuthCallback)
    }
  }
})

onBeforeUnmount(() => {
  if (!isDev.value) {
    const ipcRenderer = (window as any).electron?.ipcRenderer
    ipcRenderer?.removeAllListeners('external-login-success')
    if (platform.value === 'linux') {
      window.removeEventListener('popstate', checkUrlForAuthCallback)
      window.removeEventListener('focus', checkUrlForAuthCallback)
    }
  }
})
</script>

<style lang="less" scoped>
.term_login {
  position: relative;
  width: 100%;
  height: 100%;
  background: url(@/assets/img/loginBg.png);
  background-repeat: no-repeat;
  background-position: center;
  background-attachment: fixed;
  background-size: cover;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-app-region: drag;

  .term_login_content {
    width: 430px;
    height: 480px;
    background: transparent;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    -webkit-app-region: no-drag;
  }

  .logo {
    width: 100px;
    height: 100px;

    &:hover {
      transform: scale(1.05);
      filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.3));
    }
  }

  .login-button {
    margin-top: 20px;
    margin-left: 50%;
    transform: translateX(-50%);
    border-radius: 6px;
    width: 220px;
    height: 36px;
    font-size: 16px;
    border: none;
    transition: all 0.3s ease;
    box-shadow: 0 2px 8px rgba(42, 130, 228, 0.3);

    &:hover {
      background-color: #1677ff;
      transform: translateX(-50%) translateY(-2px);
      box-shadow: 0 4px 12px rgba(42, 130, 228, 0.4);
    }

    &:active {
      transform: translateX(-50%) translateY(0);
      box-shadow: 0 2px 4px rgba(42, 130, 228, 0.3);
    }
  }

  .connetus {
    position: absolute;
    width: 60px;
    top: 5px;
    height: 20px;
    color: #dddddd;
    font-size: 16px;
    -webkit-app-region: no-drag;

    .ant-dropdown-link {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;

      .anticon {
        font-size: 18px;
        color: #dddddd;
        transition: all 0.3s ease;

        &:hover {
          color: #ffffff;
          transform: scale(1.1);
        }
      }
    }
  }

  .term_login_type {
    margin-top: 8px;
  }

  .term_login_welcome {
    font-size: 32px;
    font-weight: bolder;
    letter-spacing: 1px;
    background: linear-gradient(135deg, #00eaff 0%, #1677ff 50%, #2a82e4 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .term_login_input {
    margin-top: 20px;
    width: 100%;
  }

  .email-login-form {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .email-form-item {
    width: 100%;
    margin-bottom: 18px;
    display: flex;
    justify-content: center;
  }

  .input-row {
    width: 300px;
    border-bottom: 1px solid #6b6b6b;
    margin-bottom: 2px;
    display: flex;
    align-items: center;
  }

  .form-input {
    width: 100%;
    height: 40px;
    background: transparent;
    color: #fff;
    border: none !important;
    border-radius: 0;
    font-size: 16px;
    box-shadow: none !important;
    transition: border-color 0.3s;

    &::placeholder {
      color: #999;
      font-size: 13px;
    }
  }

  .code-row {
    display: flex;
    align-items: center;
    width: 300px;
    border-bottom: 1px solid #6b6b6b;
    margin-bottom: 2px;
  }

  .code-input {
    flex: 1;
    min-width: 0;
    border: none !important;
    box-shadow: none !important;
    background: transparent;
  }

  .code-btn {
    margin-left: 12px;
    min-width: 90px;
    height: 40px;
    font-size: 14px;
    color: #2a82e4;
    background: transparent;
    border: none;
    border-radius: 4px;
    transition: all 0.3s;
    box-shadow: none;
    align-self: stretch;
    display: flex;
    align-items: center;

    &:hover:not(:disabled) {
      color: #40a9ff;
      background: rgba(64, 156, 255, 0.08);
    }

    &:disabled {
      color: #999;
      background: transparent;
      cursor: not-allowed;
    }
  }

  .login-btn {
    width: 320px;
    height: 36px;
    font-size: 16px;
    background-color: #2a82e4;
    border-radius: 6px;
    margin-left: 50%;
    transform: translateX(-50%);
    font-weight: 500;
    letter-spacing: 1px;
  }

  // 基础样式

  :deep(.ant-input-affix-wrapper) {
    border: none !important;
    border-bottom: 1px solid #6b6b6b !important;
    border-radius: 0;
    background-color: transparent;
    transition: border-color 0.3s;
    color: #fff;

    .ant-input {
      border: none !important;
      border-bottom: 1px solid #d9d9d9;
      border-radius: 0;
      background-color: transparent;
      transition: border-color 0.3s;
      color: #fff;

      &:focus {
        border-bottom: 1px solid #1890ff;
        box-shadow: none;
        outline: none;
      }

      &:hover {
        border-bottom-color: #1890ff;
      }

      &::placeholder {
        color: #999;
      }
    }
  }

  .ant-input-affix-wrapper-focused {
    box-shadow: none !important;
  }

  &.ant-input[disabled] {
    background-color: transparent;
    border-bottom-color: #d9d9d9;
    color: rgba(0, 0, 0, 0.25);
  }

  .ant-form-item-has-error :not(.ant-input-disabled):not(.ant-input-borderless).ant-input,
  .ant-form-item-has-error :not(.ant-input-affix-wrapper-disabled):not(.ant-input-affix-wrapper-borderless).ant-input-affix-wrapper,
  .ant-form-item-has-error
    :not(.ant-input-number-affix-wrapper-disabled):not(.ant-input-number-affix-wrapper-borderless).ant-input-number-affix-wrapper,
  .ant-form-item-has-error :not(.ant-input-disabled):not(.ant-input-borderless).ant-input:hover,
  .ant-form-item-has-error :not(.ant-input-affix-wrapper-disabled):not(.ant-input-affix-wrapper-borderless).ant-input-affix-wrapper:hover,
  .ant-form-item-has-error
    :not(.ant-input-number-affix-wrapper-disabled):not(.ant-input-number-affix-wrapper-borderless).ant-input-number-affix-wrapper:hover {
    background-color: transparent !important;
  }

  :deep(input) {
    background-color: transparent !important;
    margin-left: 8px;
    letter-spacing: 1px;
  }

  :deep(.ant-input-password-icon) {
    color: #fff !important;
  }

  .term_login_type_radio {
    background-color: #40a9ff;
    border-radius: 6px;

    :deep(.ant-radio-button-wrapper) {
      width: 100px;
      text-align: center;
      border-radius: 6px;
    }
  }

  .term_login_type_radio {
    width: 200px;
    height: 36px;
    background-color: #4c5ee0;
    color: #fff;
    border-radius: 6px;
    border: 1px solid #88a5fc;
    display: flex;
    padding: 1px;

    .term_login_type_radio_type {
      display: inline-block;
      width: 50%;
      border: none;
      background-color: #4c5ee0;
      border-radius: 8px;
      text-align: center;
      line-height: 34px;
    }

    .radio_active {
      background-color: #fff;
      color: #4c5ee0;
    }
  }

  .logo_des {
    width: 20px;
    height: 15px;
    color: #fff;
  }

  .skip-login {
    text-align: center;
    margin-top: 16px;
    color: #949494;

    .skip-link {
      color: #48688e;
      text-decoration: none;
      margin-left: 4px;

      &:hover {
        text-decoration: underline;
      }
    }
  }
}

:deep(.ant-tabs) {
  .ant-tabs-nav {
    margin-bottom: 24px;

    &::before {
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    }

    .ant-tabs-tab {
      color: #e0ebff;

      &:hover {
        color: #2a82e4;
      }

      &.ant-tabs-tab-active .ant-tabs-tab-btn {
        color: #2a82e4;
      }
    }

    .ant-tabs-ink-bar {
      background: #2a82e4;
    }
  }
}

:deep(.ant-input-affix-wrapper) {
  .ant-input-suffix {
    .ant-btn-link {
      color: #2a82e4;

      &:hover {
        color: #40a9ff;
      }

      &:disabled {
        color: rgba(255, 255, 255, 0.3);
      }
    }
  }
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 320px;
  margin: 0 auto;
}

.input-field {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 8px;
  height: 44px;
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  transition: all 0.3s ease;
}

.input-field:focus-within {
  border-bottom-color: #409cff;
}

.input-icon {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.6);
  margin-right: 12px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.form-input {
  flex: 1;
  background: transparent !important;
  border: none !important;
  outline: none;
  color: #ffffff;
  font-size: 14px;
  height: 100%;
  box-shadow: none !important;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
}

.form-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.code-btn {
  background: transparent;
  border: none;
  color: #409cff;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.3s ease;
  white-space: nowrap;
}

.code-btn:hover:not(:disabled) {
  background: rgba(64, 156, 255, 0.1);
}

.code-btn:disabled {
  color: rgba(255, 255, 255, 0.3);
  cursor: not-allowed;
}

.input-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.2);
  margin: 0;
}

.login-btn {
  width: 320px;
  height: 38px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  border: none;
  outline: none;
  margin: 24px auto 0 auto;
  display: block;
}

.login-btn.primary {
  background: #409cff;
  color: #ffffff;
  border-radius: 6px;
}

.login-btn.primary:hover:not(:disabled) {
  background: #337ecc;
}

.login-btn.primary:disabled {
  background: rgba(64, 156, 255, 0.5);
  cursor: not-allowed;
}

// Loading spinner styles
.loading-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: #ffffff;
  animation: spin 1s ease-in-out infinite;
  margin-right: 8px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.login-btn {
  display: flex;
  align-items: center;
  justify-content: center;
}

// Tab切换样式 - 参考设计图样式
.login-tabs {
  display: flex;
  width: 320px;
  margin: 0 auto 20px auto;
  background: transparent;
  border-radius: 0;
  padding: 0;
  position: relative;
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 12px 20px;
  cursor: pointer;
  transition: all 0.3s ease;
  color: rgba(255, 255, 255, 0.6);
  font-size: 16px;
  font-weight: 400;
  user-select: none;
  position: relative;
  border-bottom: 2px solid transparent;

  &:hover {
    color: rgba(255, 255, 255, 0.8);
  }

  &.active {
    color: #409cff;
    font-weight: 500;
    border-bottom-color: #409cff;
  }
}
</style>
