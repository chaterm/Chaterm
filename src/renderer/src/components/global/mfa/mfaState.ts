import { ref } from 'vue'

// MFA dialog state
export const showOtpDialog = ref(false)
export const showOtpDialogErr = ref(false)
export const showOtpDialogCheckErr = ref(false)
export const otpPrompt = ref('')
export const otpCode = ref('')
export const currentOtpId = ref<string | null>(null)
export const otpTimeRemaining = ref(0)
export const otpAttempts = ref(0)
export const isSubmitting = ref(false)

// Constants
const OTP_TIMEOUT = 180000 // 180 seconds
const MAX_OTP_ATTEMPTS = 3

let otpTimerInterval: NodeJS.Timeout | null = null

// Start OTP timer
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

// Validate OTP code format
const validateOtpCode = (code: string): boolean => {
  return code.trim().length > 0
}

// Reset error state
const resetErrors = () => {
  showOtpDialogErr.value = false
  showOtpDialogCheckErr.value = false
}

// Reset MFA dialog state
export const resetOtpDialog = () => {
  console.log('Resetting MFA dialog state')
  showOtpDialog.value = false
  showOtpDialogErr.value = false
  showOtpDialogCheckErr.value = false
  otpPrompt.value = ''
  otpCode.value = ''
  currentOtpId.value = null
  otpAttempts.value = 0
  isSubmitting.value = false
  // Clear timer
  if (otpTimerInterval) {
    clearInterval(otpTimerInterval)
    otpTimerInterval = null
  }
}

// Handle two-factor authentication request
export const handleOtpRequest = (data: any) => {
  console.log('Received two-factor authentication request:', data.id)

  currentOtpId.value = data.id
  otpPrompt.value = data.prompts.join('\n')
  showOtpDialog.value = true
  showOtpDialogErr.value = false
  showOtpDialogCheckErr.value = false
  otpAttempts.value = 0
  startOtpTimer()
}

// Handle two-factor authentication timeout
export const handleOtpTimeout = (data: any) => {
  if (data.id === currentOtpId.value && showOtpDialog.value) {
    resetOtpDialog()
  }
}

// Handle two-factor authentication result
export const handleOtpError = (data: any) => {
  console.log('Received MFA verification result:', data, 'Current OTP ID:', currentOtpId.value)

  if (data.id === currentOtpId.value) {
    // Reset submission state
    isSubmitting.value = false

    if (data.status === 'success') {
      console.log('MFA verification successful, closing dialog')
      resetOtpDialog()
    } else {
      console.log('MFA verification failed, showing error')
      showOtpDialogErr.value = true
      otpAttempts.value += 1
      // Don't clear input immediately, allow user to modify based on existing input
      // otpCode.value = ''

      if (otpAttempts.value >= MAX_OTP_ATTEMPTS) {
        console.log('Exceeded maximum attempts, closing dialog')
        showOtpDialog.value = false
        cancelOtp()
      }
    }
  } else {
    console.log('ID mismatch, ignoring result')
  }
}

// Handle OTP input change
export const handleOtpChange = (value: string) => {
  otpCode.value = value
  // Clear error state when user inputs 3 or more characters, indicating user is seriously re-entering
  if (value.length >= 3) {
    resetErrors()
  }
  // Or clear error state when user completely clears input
  if (value.length === 0) {
    resetErrors()
  }
}

// Handle OTP input completion
export const handleOtpComplete = (value: string) => {
  otpCode.value = value
  resetErrors()

  // If verification code is valid, can auto-submit (optional)
  if (validateOtpCode(value) && currentOtpId.value && !isSubmitting.value) {
    console.log('Auto-submitting complete OTP code')
    submitOtpCode()
  }
}

// Submit two-factor authentication code
export const submitOtpCode = async () => {
  console.log('Attempting to submit OTP code:', otpCode.value)

  // Reset error state
  resetErrors()

  // Validate input
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

// Cancel two-factor authentication
export const cancelOtp = () => {
  if (currentOtpId.value) {
    const api = (window as any).api
    api.cancelKeyboardInteractive(currentOtpId.value)
    resetOtpDialog()
  }
}
