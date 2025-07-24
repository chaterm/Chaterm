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
        <!-- In the Windows development environment, only the email verification code login is displayed -->
        <template v-if="isDevWin">
          <div class="login-form">
            <div class="form-content">
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
                {{ $t('login.login') }}
              </button>
            </div>
          </div>
        </template>
        <!-- Other situations display the original external login and skip login options -->
        <template v-else>
          <a-form
            name="login"
            :label-col="{ span: 0 }"
            :wrapper-col="{ span: 24 }"
            autocomplete="off"
          >
            <a-form-item>
              <a-button
                style="
                  margin-top: 20px;
                  margin-left: 50%;
                  transform: translateX(-50%);
                  border-radius: 6px;
                  width: 200px;
                  height: 36px;
                  font-size: 16px;
                  background-color: #2a82e4;
                "
                type="primary"
                html-type="submit"
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
import { ref, getCurrentInstance, onMounted, nextTick, onBeforeUnmount, reactive } from 'vue'
import { GlobalOutlined, MailOutlined, SafetyOutlined } from '@ant-design/icons-vue'
import type { MenuProps } from 'ant-design-vue'
import { setUserInfo } from '@/utils/permission'
import { message } from 'ant-design-vue'
import { captureButtonClick, LoginFunnelEvents, LoginMethods, LoginFailureReasons } from '@/utils/telemetry'
import { shortcutService } from '@/services/shortcutService'
import config from '@renderer/config'
import { sendEmailCode, emailLogin } from '@/api/user/user'

const platform = ref<string>('')
const isDevWin = ref(false)
const loading = ref(false)
const codeSending = ref(false)
const countdown = ref(0)
const emailForm = reactive({
  email: '',
  code: ''
})

const instance = getCurrentInstance()!
const { appContext } = instance
const configLang: MenuProps['onClick'] = ({ key }) => {
  const lang = String(key)
  appContext.config.globalProperties.$i18n.locale = lang
  localStorage.setItem('lang', lang)
}

const router = useRouter()

// 邮箱验证码登录逻辑
const sendCode = async () => {
  if (!emailForm.email) {
    message.error('请输入邮箱')
    return
  }
  try {
    codeSending.value = true
    await sendEmailCode({ email: emailForm.email })
    message.success('验证码已发送')
    countdown.value = 60
    const timer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) {
        clearInterval(timer)
      }
    }, 1000)
  } catch (err) {
    message.error('验证码发送失败')
  } finally {
    codeSending.value = false
  }
}

const onEmailLogin = async () => {
  if (!emailForm.email || !emailForm.code) {
    message.error('请输入邮箱和验证码')
    return
  }
  try {
    loading.value = true
    const res = await emailLogin({ email: emailForm.email, code: emailForm.code })
    if (res && res.code === 200 && res.data && res.data.token) {
      localStorage.setItem('ctm-token', res.data.token)
      setUserInfo(res.data)
      // 初始化用户数据库
      const api = window.api as any
      const dbResult = await api.initUserDatabase({ uid: res.data.uid })
      if (!dbResult.success) {
        message.error('数据库初始化失败')
        return
      }
      shortcutService.init()
      await nextTick()
      await router.replace({ path: '/', replace: true })
    } else {
      message.error(res && res.Message ? res.Message : '登录失败')
    }
  } catch (err: any) {
    message.error(err?.response?.data?.message || err?.message || '登录失败')
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
      console.error('访客数据库初始化失败:', dbResult.error)
      message.error('初始化失败，请重试')
      // 清除状态
      localStorage.removeItem('login-skipped')
      localStorage.removeItem('ctm-token')
      localStorage.removeItem('userInfo')
      return
    }
    shortcutService.init()
    await nextTick()
    try {
      await router.replace({ path: '/', replace: true })
    } catch (error) {
      console.error('路由跳转失败:', error)
      message.error('跳转失败，请重试')
    }
  } catch (error) {
    console.error('跳过登录处理失败:', error)
    message.error('操作失败，请重试')
    localStorage.removeItem('login-skipped')
    localStorage.removeItem('ctm-token')
    localStorage.removeItem('userInfo')
  }
}

const handleExternalLogin = async () => {
  try {
    const api = window.api as any
    await api.openExternalLogin()
  } catch (err) {
    console.error('启动外部登录失败:', err)
    message.error('启动外部登录失败')
  }
}

onMounted(async () => {
  const api = window.api as any
  platform.value = await api.getPlatform()
  isDevWin.value = import.meta.env.MODE === 'development' && platform.value.includes('win')
  await captureButtonClick(LoginFunnelEvents.ENTER_LOGIN_PAGE)
  if (!isDevWin.value) {
    // 监听外部登录成功事件
    const ipcRenderer = (window as any).electron?.ipcRenderer
    ipcRenderer?.on('external-login-success', async (event, data) => {
      const { userInfo, method } = data
      try {
        if (userInfo) {
          localStorage.setItem('ctm-token', userInfo?.token)
          setUserInfo(userInfo)
          const api = window.api as any
          const dbResult = await api.initUserDatabase({ uid: userInfo.uid })
          if (!dbResult.success) {
            console.error('数据库初始化失败:', dbResult.error)
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
      } catch (error) {
        console.error('登录处理失败:', error)
        message.error('登录处理失败')
        await captureButtonClick(LoginFunnelEvents.LOGIN_FAILED, {
          method: method,
          failure_reason: LoginFailureReasons.UNKNOWN_ERROR,
          error_message: (error as any)?.message || 'Unknown error'
        })
        return false
      }
    })
  }
})

onBeforeUnmount(() => {
  if (!isDevWin.value) {
    const ipcRenderer = (window as any).electron?.ipcRenderer
    ipcRenderer?.removeAllListeners('external-login-success')
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
    align-items: center; // 水平居中
    justify-content: center; // 垂直居中
    -webkit-app-region: no-drag;
  }

  .logo {
    width: 150px;
    height: 150px;
    margin-bottom: 2px;
  }

  .connetus {
    position: absolute;
    width: 60px;
    top: 5px;
    height: 20px;
    // background-color: #fff;
    color: #dddddd;
    font-size: 12px;
    -webkit-app-region: no-drag;
  }

  .term_login_type {
    margin-top: 8px;
  }

  .term_login_welcome {
    text-align: center;
    margin-top: 20px;
    font-size: 36px;
    color: #fff;
    font-weight: 500;
    letter-spacing: 2px;
    white-space: nowrap;
  }

  .term_login_input {
    margin-top: 20px;
    width: 100%;
  }

  // 邮箱验证码登录表单样式
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

      // 去除默认阴影和轮廓
      &:focus {
        border-bottom: 1px solid #1890ff; // 聚焦时的颜色
        box-shadow: none;
        outline: none;
      }

      // 悬停状态
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

  // 禁用状态
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

// Add the style related to chaterm_login email verification code login
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
</style>
