import { ref } from 'vue'

// MFA 弹框状态
export const showOtpDialog = ref(false)
export const showOtpDialogErr = ref(false)
export const showOtpDialogCheckErr = ref(false)
export const otpPrompt = ref('')
export const otpCode = ref('')
export const currentOtpId = ref<string | null>(null)
export const otpTimeRemaining = ref(0)
export const otpAttempts = ref(0)
export const isSubmitting = ref(false)

// 常量
const OTP_TIMEOUT = 180000 // 180秒
const MAX_OTP_ATTEMPTS = 3

let otpTimerInterval: NodeJS.Timeout | null = null

// 启动 OTP 计时器
const startOtpTimer = (durationMs = OTP_TIMEOUT) => {
  if (otpTimerInterval) {
    clearInterval(otpTimerInterval)
  }
  const endTime = Date.now() + durationMs
  otpTimeRemaining.value = durationMs
  otpTimerInterval = setInterval(() => {
    const remaining = endTime - Date.now()
    if (remaining <= 0) {
      if (otpTimerInterval !== null) {
        clearInterval(otpTimerInterval)
      }
      otpTimeRemaining.value = 0
      showOtpDialog.value = false
      cancelOtp()
    } else {
      otpTimeRemaining.value = remaining
    }
  }, 1000)
}

// 验证OTP代码格式
const validateOtpCode = (code: string): boolean => {
  return code.trim().length > 0
}

// 重置错误状态
const resetErrors = () => {
  showOtpDialogErr.value = false
  showOtpDialogCheckErr.value = false
}

// 重置 MFA 弹框状态
export const resetOtpDialog = () => {
  console.log('重置MFA弹框状态')
  showOtpDialog.value = false
  showOtpDialogErr.value = false
  showOtpDialogCheckErr.value = false
  otpPrompt.value = ''
  otpCode.value = ''
  currentOtpId.value = null
  otpAttempts.value = 0
  isSubmitting.value = false
  // 清理定时器
  if (otpTimerInterval) {
    clearInterval(otpTimerInterval)
    otpTimerInterval = null
  }
}

// 处理二次验证请求
export const handleOtpRequest = (data: any) => {
  console.log('收到二次验证请求:', data.id)

  currentOtpId.value = data.id
  otpPrompt.value = data.prompts.join('\n')
  showOtpDialog.value = true
  showOtpDialogErr.value = false
  showOtpDialogCheckErr.value = false
  otpAttempts.value = 0
  startOtpTimer()
}

// 处理二次验证超时
export const handleOtpTimeout = (data: any) => {
  if (data.id === currentOtpId.value && showOtpDialog.value) {
    resetOtpDialog()
  }
}

// 处理二次验证结果
export const handleOtpError = (data: any) => {
  console.log('收到MFA验证结果:', data, '当前OTP ID:', currentOtpId.value)

  if (data.id === currentOtpId.value) {
    // 重置提交状态
    isSubmitting.value = false

    if (data.status === 'success') {
      console.log('MFA验证成功，关闭弹窗')
      resetOtpDialog()
    } else {
      console.log('MFA验证失败，显示错误')
      showOtpDialogErr.value = true
      otpAttempts.value += 1
      // 不立即清空输入，让用户可以基于现有输入进行修改
      // otpCode.value = ''

      if (otpAttempts.value >= MAX_OTP_ATTEMPTS) {
        console.log('超过最大尝试次数，关闭弹窗')
        showOtpDialog.value = false
        cancelOtp()
      }
    }
  } else {
    console.log('ID不匹配，忽略结果')
  }
}

// OTP输入变化处理
export const handleOtpChange = (value: string) => {
  otpCode.value = value
  // 当用户输入3个字符以上时清除错误状态，表示用户正在认真重新输入
  if (value.length >= 3) {
    resetErrors()
  }
  // 或者当用户完全清空输入时也清除错误状态
  if (value.length === 0) {
    resetErrors()
  }
}

// OTP输入完成处理
export const handleOtpComplete = (value: string) => {
  otpCode.value = value
  resetErrors()

  // 如果验证码有效，可以自动提交（可选）
  if (validateOtpCode(value) && currentOtpId.value && !isSubmitting.value) {
    console.log('Auto-submitting complete OTP code')
    submitOtpCode()
  }
}

// 提交二次验证码
export const submitOtpCode = async () => {
  console.log('Attempting to submit OTP code:', otpCode.value)

  // 重置错误状态
  resetErrors()

  // 验证输入
  if (!otpCode.value) {
    console.log('OTP code is empty')
    showOtpDialogCheckErr.value = true
    return
  }

  if (!validateOtpCode(otpCode.value)) {
    console.log('OTP code format invalid:', otpCode.value)
    showOtpDialogCheckErr.value = true
    return
  }

  if (!currentOtpId.value) {
    console.log('No current OTP ID')
    showOtpDialogCheckErr.value = true
    return
  }

  if (isSubmitting.value) {
    console.log('Already submitting, ignoring duplicate request')
    return
  }

  try {
    isSubmitting.value = true
    console.log('Submitting OTP code:', currentOtpId.value, otpCode.value)

    const api = (window as any).api
    await api.submitKeyboardInteractiveResponse(currentOtpId.value, otpCode.value)

    console.log('OTP code submitted successfully')
  } catch (error) {
    console.error('Failed to submit OTP code:', error)
    showOtpDialogErr.value = true
    isSubmitting.value = false
  }
}

// 取消二次验证
export const cancelOtp = () => {
  if (currentOtpId.value) {
    const api = (window as any).api
    api.cancelKeyboardInteractive(currentOtpId.value)
    resetOtpDialog()
  }
}
