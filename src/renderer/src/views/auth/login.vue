<template>
  <div class="term_login">
    <img
      src="@/assets/logo.svg"
      class="logo"
      alt=""
    />
    <div
      class="connetus"
      :style="{ right: platform.includes('darwin') ? '0px' : '120px' }"
    >
      <a-dropdown>
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
              >{{ item.name }}</a-menu-item
            >
          </a-menu>
        </template>
      </a-dropdown>
    </div>
    <div class="term_login_content">
      <div class="term_login_welcome">
        <span>{{ $t('login.welcome') }}</span>
        <span style="color: #2a82e4; margin-left: 8px">{{ $t('login.title') }}</span>
        <p
          style="
            color: #e0ebff;
            font-size: 12px;
            margin-top: 26px;
            text-align: center;
            font-weight: 200;
          "
        >
          <!-- {{ $t('login.loginType') }} -->
        </p>
      </div>
      <div class="term_login_input">
        <a-tabs
          v-model:activeKey="activeKey"
          centered
        >
          <a-tab-pane
            key="account"
            tab="账号密码登录"
          >
            <a-form
              :model="accountForm"
              name="account"
              :label-col="{ span: 0 }"
              :wrapper-col="{ span: 24 }"
              autocomplete="off"
              @finish="onAccountFinish"
              @finish-failed="onFinishFailed"
            >
              <a-form-item
                label=""
                name="username"
                :rules="[{ required: true, message: '请输入账号!' }]"
              >
                <a-input
                  v-model:value="accountForm.username"
                  style="width: 300px"
                  class="custom-borderless-input"
                  placeholder="请输入账号"
                >
                  <template #prefix>
                    <user-outlined type="user" />
                  </template>
                  <template #suffix>
                    <a-tooltip title="Extra information">
                      <info-circle-outlined style="color: #fff" />
                    </a-tooltip>
                  </template>
                </a-input>
              </a-form-item>

              <a-form-item
                label=""
                name="password"
                :rules="[{ required: true, message: '请输入密码' }]"
              >
                <a-input-password
                  v-model:value="accountForm.password"
                  style="width: 300px"
                  placeholder="请输入密码"
                >
                  <template #prefix>
                    <lock-outlined />
                  </template>
                  <template #suffix>
                    <a-tooltip title="Extra information">
                      <info-circle-outlined style="color: #e0ebff" />
                    </a-tooltip>
                  </template>
                </a-input-password>
              </a-form-item>
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
                  >{{ $t('login.login') }}</a-button
                >
              </a-form-item>
            </a-form>
          </a-tab-pane>
          <a-tab-pane
            key="email"
            tab="邮箱验证码登录"
          >
            <a-form
              :model="emailForm"
              name="email"
              :label-col="{ span: 0 }"
              :wrapper-col="{ span: 24 }"
              autocomplete="off"
              @finish="onEmailFinish"
              @finish-failed="onFinishFailed"
            >
              <a-form-item
                label=""
                name="email"
                :rules="[
                  { required: true, message: '请输入邮箱!' },
                  { type: 'email', message: '请输入有效的邮箱地址!' }
                ]"
              >
                <a-input
                  v-model:value="emailForm.email"
                  style="width: 300px"
                  class="custom-borderless-input"
                  placeholder="请输入邮箱"
                >
                  <template #prefix>
                    <mail-outlined />
                  </template>
                </a-input>
              </a-form-item>

              <a-form-item
                label=""
                name="code"
                :rules="[{ required: true, message: '请输入验证码' }]"
              >
                <a-input
                  v-model:value="emailForm.code"
                  style="width: 300px"
                  placeholder="请输入验证码"
                >
                  <template #prefix>
                    <safety-outlined />
                  </template>
                  <template #suffix>
                    <a-button
                      type="link"
                      :disabled="countdown > 0"
                      @click="sendCode"
                      style="color: #2a82e4; padding: 0"
                    >
                      {{ countdown > 0 ? `${countdown}秒后重试` : '获取验证码' }}
                    </a-button>
                  </template>
                </a-input>
              </a-form-item>
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
                  >{{ $t('login.login') }}</a-button
                >
              </a-form-item>
            </a-form>
          </a-tab-pane>
        </a-tabs>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { removeToken } from '@/utils/permission'
import {
  UserOutlined,
  InfoCircleOutlined,
  LockOutlined,
  MailOutlined,
  SafetyOutlined
} from '@ant-design/icons-vue'
import { useRouter } from 'vue-router'
import { ref, reactive, getCurrentInstance, onMounted } from 'vue'
import { GlobalOutlined } from '@ant-design/icons-vue'
import type { MenuProps } from 'ant-design-vue'
import { userLogin, sendEmailCode, emailLogin } from '@/api/user/user'
import { setUserInfo } from '@/utils/permission'
import { message } from 'ant-design-vue'
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
const activeKey = ref('account')
const countdown = ref(0)

interface AccountFormState {
  username: string
  password: string
}

interface EmailFormState {
  email: string
  code: string
}

const accountForm = reactive<AccountFormState>({
  username: 'test_user',
  password: 'ctm123456'
})

const emailForm = reactive<EmailFormState>({
  email: '',
  code: ''
})

const onAccountFinish = () => {
  removeToken()
  userLogin({
    username: accountForm.username,
    password: accountForm.password
  })
    .then((res) => {
      if (res.code == 200) {
        console.log(res, 'ressss')
        setUserInfo(res.data)
        localStorage.setItem('ctm-token', res.data.token)
        router.push('/')
      }
    })
    .catch((err) => {
      console.log(err, 'err')
    })
}

const onEmailFinish = () => {
  emailLogin({
    email: emailForm.email,
    code: emailForm.code
  })
    .then((res) => {
      console.log(res, 'ressss')
      if (res.code == 200) {
        console.log(res, 'ressss')
        setUserInfo(res.data)
        localStorage.setItem('ctm-token', res.data.token)
        router.push('/')
      }
    })
    .catch((err) => {
      message.error(err.response.data.message)
    })
    .finally(() => {})
}

const onFinishFailed = (errorInfo: any) => {
  console.log('Failed:', errorInfo)
}

const sendCode = () => {
  // 校验邮箱是否已输入
  if (!emailForm.email) {
    message.error('请先输入邮箱地址')
    return
  }

  // 校验邮箱格式
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  if (!emailRegex.test(emailForm.email)) {
    message.error('请输入有效的邮箱地址')
    return
  }
  sendEmailCode({
    email: emailForm.email
  })
    .then((res) => {
      console.log(res, 'res')
      if (res.code == 200) {
        message.success('验证码发送成功')
      }
    })
    .catch((err) => {})
  // 倒数
  countdown.value = 300
  const timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(timer)
    }
  }, 1000)
}

onMounted(async () => {
  const api = window.api as any
  platform.value = await api.getPlatform()
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

  .term_login_content {
    width: 430px;
    height: 480px;
    background: transparent;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .logo {
    position: absolute;
    width: 40px;
    top: 40px;
    left: 10px;
    height: 30px;
  }

  .connetus {
    position: absolute;
    width: 60px;
    top: 5px;
    height: 20px;
    // background-color: #fff;
    color: #dddddd;
    font-size: 12px;
  }

  .term_login_type {
    margin-top: 8px;
  }

  .term_login_welcome {
    text-align: center;
    margin-top: 50px;
    font-size: 16px;
    color: #fff;
    font-weight: 500;
    letter-spacing: 2px;
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
  .ant-form-item-has-error
    :not(.ant-input-affix-wrapper-disabled):not(
      .ant-input-affix-wrapper-borderless
    ).ant-input-affix-wrapper,
  .ant-form-item-has-error
    :not(.ant-input-number-affix-wrapper-disabled):not(
      .ant-input-number-affix-wrapper-borderless
    ).ant-input-number-affix-wrapper,
  .ant-form-item-has-error :not(.ant-input-disabled):not(.ant-input-borderless).ant-input:hover,
  .ant-form-item-has-error
    :not(.ant-input-affix-wrapper-disabled):not(
      .ant-input-affix-wrapper-borderless
    ).ant-input-affix-wrapper:hover,
  .ant-form-item-has-error
    :not(.ant-input-number-affix-wrapper-disabled):not(
      .ant-input-number-affix-wrapper-borderless
    ).ant-input-number-affix-wrapper:hover {
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
