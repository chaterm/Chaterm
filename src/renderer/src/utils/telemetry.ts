/**
 * Telemetry event capture utility functions
 */

/**
 * Capture button click event telemetry data
 * @param eventName Event name
 * @param properties Optional event properties
 */
export const captureButtonClick = async (eventName: string, properties?: Record<string, any>): Promise<void> => {
  try {
    const api = window.api as any
    await api.captureButtonClick(eventName, properties)
  } catch (telemetryError) {
    console.warn('Failed to capture telemetry event:', telemetryError)
  }
}

/**
 * Login flow AARRR funnel model event definitions
 */
export const LoginFunnelEvents = {
  ENTER_LOGIN_PAGE: 'login_enter_page',

  CLICK_LOGIN_BUTTON: 'login_click_login',

  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',

  SKIP_LOGIN: 'login_skip',
  SEND_VERIFICATION_CODE: 'login_send_code'
} as const

/**
 * Login method enumeration
 */
export const LoginMethods = {
  ACCOUNT: 'username_password',
  EMAIL: 'email_verification',
  GUEST: 'guest_mode'
} as const

/**
 * Login failure reason enumeration
 */
export const LoginFailureReasons = {
  INVALID_CREDENTIALS: 'invalid_credentials', // Invalid credentials
  NETWORK_ERROR: 'network_error', // Network error
  SERVER_ERROR: 'server_error', // Server error
  VALIDATION_ERROR: 'validation_error', // Validation error
  DATABASE_ERROR: 'database_error', // Database error
  UNKNOWN_ERROR: 'unknown_error' // Unknown error
} as const
