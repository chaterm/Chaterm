// 导出 MFA 组件
export { default as MfaDialog } from './MfaDialog.vue'

// 导出 MFA 状态和处理函数
export {
  // 状态
  showOtpDialog,
  showOtpDialogErr,
  showOtpDialogCheckErr,
  otpPrompt,
  otpCode,
  currentOtpId,
  otpTimeRemaining,
  otpAttempts,

  // 处理函数
  handleOtpRequest,
  handleOtpTimeout,
  handleOtpError,
  submitOtpCode,
  cancelOtp,
  resetOtpDialog
} from './mfaState'

// 设置全局 MFA 监听器的函数
export const setupGlobalMfaListeners = () => {
  const api = (window as any).api
  if (api) {
    console.log('设置全局 MFA 监听器')
    api.onKeyboardInteractiveRequest(handleOtpRequest)
    api.onKeyboardInteractiveTimeout(handleOtpTimeout)
    api.onKeyboardInteractiveResult(handleOtpError)
  }
}

// 导入处理函数以便在 setupGlobalMfaListeners 中使用
import { handleOtpRequest, handleOtpTimeout, handleOtpError } from './mfaState'
