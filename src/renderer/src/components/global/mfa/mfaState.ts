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

// 常量
const OTP_TIMEOUT = 30000 // 30秒
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
    if (data.status === 'success') {
      console.log('MFA验证成功，关闭弹窗')
      resetOtpDialog()
    } else {
      console.log('MFA验证失败，显示错误')
      showOtpDialogErr.value = true
      otpAttempts.value += 1
      otpCode.value = ''
      if (otpAttempts.value >= MAX_OTP_ATTEMPTS) {
        showOtpDialog.value = false
        cancelOtp()
      }
    }
  } else {
    console.log('ID不匹配，忽略结果')
  }
}

// 提交二次验证码
export const submitOtpCode = () => {
  showOtpDialogCheckErr.value = false
  showOtpDialogErr.value = false

  if (otpCode.value && currentOtpId.value) {
    console.log('提交验证码:', currentOtpId.value)
    const api = (window as any).api
    api.submitKeyboardInteractiveResponse(currentOtpId.value, otpCode.value)
  } else {
    showOtpDialogCheckErr.value = true
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
