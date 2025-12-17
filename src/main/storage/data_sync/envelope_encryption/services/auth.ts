/**
 * Chaterm Authentication Adapter
 */

interface TokenData {
  token: string
  userId: string
  expiry?: number
}

interface AuthStatus {
  hasToken: boolean
  hasUserId: boolean
  isValid: boolean
  tokenType: 'guest' | 'user'
  expiry: number | null
}

class ChatermAuthAdapter {
  private cachedToken: string | null = null
  private cachedUserId: string | null = null
  private tokenExpiry: number | null = null

  constructor() {
    // Keep constructor simple
  }

  /**
   * Get the current user's JWT Token
   * @returns JWT Token
   */
  async getAuthToken(): Promise<string | null> {
    // Return cached token directly, external code is responsible for setting and updating
    if (this.cachedToken && this.isTokenValid()) {
      return this.cachedToken
    }

    // Return null if token is invalid or doesn't exist
    if (this.cachedToken) {
      console.warn('Cached token has expired')
    }

    return null
  }

  /**
   * Get the current user ID
   * @returns User ID
   */
  async getCurrentUserId(): Promise<string | null> {
    return this.cachedUserId || 'guest_user'
  }

  /**
   * Check if token is valid
   * @returns Whether the token is valid
   */
  private isTokenValid(): boolean {
    if (!this.cachedToken) {
      return false
    }

    // Guest token is always valid
    if (this.cachedToken === 'guest_token') {
      return true
    }

    // Check if expired (consider expired 5 minutes early)
    if (!this.tokenExpiry) {
      return false
    }

    const fiveMinutes = 5 * 60 * 1000
    return Date.now() < this.tokenExpiry - fiveMinutes
  }

  /**
   * Set authentication information
   * @param token JWT Token
   * @param userId User ID
   * @param expiry Expiration time (optional, default 24 hours)
   */
  setAuthInfo(token: string, userId: string, expiry?: number): void {
    this.cachedToken = token
    this.cachedUserId = userId
    this.tokenExpiry = expiry || Date.now() + 24 * 60 * 60 * 1000
  }

  /**
   * Clear authentication information
   */
  clearAuthInfo(): void {
    this.cachedToken = null
    this.cachedUserId = null
    this.tokenExpiry = null
  }

  /**
   * Get authentication status (for debugging and status checking)
   * @returns Authentication status information
   */
  getAuthStatus(): AuthStatus {
    return {
      hasToken: !!this.cachedToken,
      hasUserId: !!this.cachedUserId,
      isValid: this.isTokenValid(),
      tokenType: this.cachedToken === 'guest_token' ? 'guest' : 'user',
      expiry: this.tokenExpiry
    }
  }
}

// Create singleton instance
const chatermAuthAdapter = new ChatermAuthAdapter()

export { ChatermAuthAdapter, chatermAuthAdapter }
export type { TokenData, AuthStatus }
