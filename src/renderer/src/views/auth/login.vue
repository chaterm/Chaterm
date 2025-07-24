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
              @click="handleExternalLogin"
              >{{ $t('login.login') }}
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
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { removeToken } from '@/utils/permission'
import { useRouter } from 'vue-router'
import { ref, getCurrentInstance, onMounted, nextTick, onBeforeUnmount } from 'vue'
import { GlobalOutlined } from '@ant-design/icons-vue'
import type { MenuProps } from 'ant-design-vue'
import { setUserInfo } from '@/utils/permission'
import { message } from 'ant-design-vue'
import { captureButtonClick, LoginFunnelEvents, LoginMethods, LoginFailureReasons } from '@/utils/telemetry'
import { shortcutService } from '@/services/shortcutService'

const platform = ref<string>('')
import config from '@renderer/config'

const instance = getCurrentInstance()!
const { appContext } = instance
const configLang: MenuProps['onClick'] = ({ key }) => {
  const lang = String(key)
  appContext.config.globalProperties.$i18n.locale = lang
  localStorage.setItem('lang', lang)
}

const router = useRouter()

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

    // 等待下一个tick，确保状态已更新
    await nextTick()

    try {
      await router.replace({
        path: '/',
        replace: true
      })
    } catch (error) {
      console.error('路由跳转失败:', error)
      message.error('跳转失败，请重试')
    }
  } catch (error) {
    console.error('跳过登录处理失败:', error)
    message.error('操作失败，请重试')
    // 清除跳过登录标记，以防止卡在中间状态
    localStorage.removeItem('login-skipped')
    localStorage.removeItem('ctm-token')
    localStorage.removeItem('userInfo')
  }
}

const handleExternalLogin = async () => {
  try {
    // 调用主进程方法打开外部登录页面
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

  await captureButtonClick(LoginFunnelEvents.ENTER_LOGIN_PAGE)
  // 监听外部登录成功事件
  const ipcRenderer = (window as any).electron?.ipcRenderer
  ipcRenderer?.on('external-login-success', async (event, data) => {
    const { userInfo, method } = data
    try {
      if (userInfo) {
        // 保存token
        localStorage.setItem('ctm-token', userInfo?.token)
        setUserInfo(userInfo)
        // 初始化用户数据库
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

        await captureButtonClick(LoginFunnelEvents.LOGIN_SUCCESS, {
          method: method
        })
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
})

onBeforeUnmount(() => {
  // 移除事件监听
  const ipcRenderer = (window as any).electron?.ipcRenderer
  ipcRenderer?.removeAllListeners('external-login-success')
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
    width: 100px;
    height: 100px;
    &:hover {
      transform: scale(1.05);
      filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.3));
    }
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
    font-size: 32px;
    font-weight: bolder;
    letter-spacing: 1px;
    background: linear-gradient(135deg, #00eaff 0%, #1677ff 50%, #2a82e4 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
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

  .term_login_input {
    margin-top: 20px;
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
</style>
