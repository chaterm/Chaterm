export { default as MfaDialog } from './MfaDialog.vue'

export {
  showOtpDialog,
  showOtpDialogErr,
  showOtpDialogCheckErr,
  otpPrompt,
  otpCode,
  currentOtpId,
  otpTimeRemaining,
  otpAttempts,
  handleOtpRequest,
  handleOtpTimeout,
  handleOtpError,
  submitOtpCode,
  cancelOtp,
  resetOtpDialog
} from './mfaState'

export const setupGlobalMfaListeners = () => {
  const api = (window as any).api
  if (api) {
    console.log('Setting up global MFA listeners')
    api.onKeyboardInteractiveRequest(handleOtpRequest)
    api.onKeyboardInteractiveTimeout(handleOtpTimeout)
    api.onKeyboardInteractiveResult(handleOtpError)
  }
}

import { handleOtpRequest, handleOtpTimeout, handleOtpError } from './mfaState'
