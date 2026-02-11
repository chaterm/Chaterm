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



const logger = createRendererLogger('mfa')

export const setupGlobalMfaListeners = () => {
  const api = (window as any).api
  if (api) {
    logger.info('Setting up global MFA listeners')
    api.onKeyboardInteractiveRequest(handleOtpRequest)
    api.onKeyboardInteractiveTimeout(handleOtpTimeout)
    api.onKeyboardInteractiveResult(handleOtpError)
  }
}

import { handleOtpRequest, handleOtpTimeout, handleOtpError } from './mfaState'
