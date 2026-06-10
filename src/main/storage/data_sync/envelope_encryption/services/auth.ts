/**
 * Chaterm Authentication Adapter
 */
const logger = createLogger('sync')

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
   *
   * The client does not judge token expiry locally. As long as a token is
   * cached, it is returned and attached to requests; the server is the single
   * source of truth and will respond with 401 if the token is actually expired.
   * @returns JWT Token
   */
  async getAuthToken(): Promise<string | null> {
    return this.cachedToken
  }

  /**
   * Get the current user ID
   * @returns User ID
   */
  async getCurrentUserId(): Promise<string | null> {
    return this.cachedUserId || 'guest_user'
  }

  /**
   * Whether a usable token is present.
   *
   * Expiry is intentionally not evaluated here: only the server (via 401) may
   * invalidate a token. This reports presence, not server-side validity.
   * @returns Whether a token exists
   */
  private hasUsableToken(): boolean {
    return !!this.cachedToken
  }

  /**
   * Set authentication information
   * @param token JWT Token
   * @param userId User ID
   * @param expiry Optional expiry timestamp in ms, kept for status reporting only
   */
  setAuthInfo(token: string, userId: string, expiry?: number): void {
    this.cachedToken = token
    this.cachedUserId = userId
    this.tokenExpiry = expiry ?? null
  }

  /**
   * Clear authentication information
   */
  clearAuthInfo(): void {
    logger.info('Clearing cached auth info', { event: 'auth.clear', hadToken: !!this.cachedToken })
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
      isValid: this.hasUsableToken(),
      tokenType: this.cachedToken === 'guest_token' ? 'guest' : 'user',
      expiry: this.tokenExpiry
    }
  }
}

// Create singleton instance
const chatermAuthAdapter = new ChatermAuthAdapter()

export { ChatermAuthAdapter, chatermAuthAdapter }
export type { TokenData, AuthStatus }
