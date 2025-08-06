/**
 * Chaterm 认证适配器
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
    // 构造函数保持简单
  }

  /**
   * 获取当前用户的 JWT Token
   * @returns JWT Token
   */
  async getAuthToken(): Promise<string | null> {
    // 直接返回缓存的token，由外部负责设置和更新
    if (this.cachedToken && this.isTokenValid()) {
      return this.cachedToken
    }

    // 如果token无效或不存在，返回null
    if (this.cachedToken) {
      console.warn('缓存的Token已过期')
    }

    return null
  }

  /**
   * 获取当前用户ID
   * @returns 用户ID
   */
  async getCurrentUserId(): Promise<string | null> {
    return this.cachedUserId || 'guest_user'
  }

  /**
   * 检查 token 是否有效
   * @returns token 是否有效
   */
  private isTokenValid(): boolean {
    if (!this.cachedToken) {
      return false
    }

    // guest token 永远有效
    if (this.cachedToken === 'guest_token') {
      return true
    }

    // 检查是否过期（提前5分钟认为过期）
    if (!this.tokenExpiry) {
      return false
    }

    const fiveMinutes = 5 * 60 * 1000
    return Date.now() < this.tokenExpiry - fiveMinutes
  }

  /**
   * 设置认证信息
   * @param token JWT Token
   * @param userId 用户ID
   * @param expiry 过期时间（可选，默认24小时）
   */
  setAuthInfo(token: string, userId: string, expiry?: number): void {
    this.cachedToken = token
    this.cachedUserId = userId
    this.tokenExpiry = expiry || Date.now() + 24 * 60 * 60 * 1000
  }

  /**
   * 清除认证信息
   */
  clearAuthInfo(): void {
    this.cachedToken = null
    this.cachedUserId = null
    this.tokenExpiry = null
  }

  /**
   * 获取认证状态（用于调试和状态检查）
   * @returns 认证状态信息
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

// 创建单例实例
const chatermAuthAdapter = new ChatermAuthAdapter()

export { ChatermAuthAdapter, chatermAuthAdapter }
export type { TokenData, AuthStatus }
