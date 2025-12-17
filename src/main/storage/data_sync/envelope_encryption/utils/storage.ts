import config from '../config'
import TempFileStorageProvider from './tempFileStorage'

/**
 * Client-side storage manager
 *
 * Security principles:
 * 1. Only store encrypted data keys
 * 2. Support multiple storage backends
 * 3. Automatic expiration cleanup
 * 4. Secure deletion
 * 5. Securely store authentication tokens
 */
class StorageManager {
  private provider: any

  constructor() {
    this.provider = this.initializeProvider()
  }

  /**
   * Initialize storage provider
   */
  private initializeProvider(): any {
    return new TempFileStorageProvider()
  }

  async storeAuthToken(token: string): Promise<void> {
    const key = `${config.storage.keyPrefix}auth_token`
    await this.provider.setItem(key, token)
    console.log('Auth token stored')
  }

  async getAuthToken(): Promise<string | null> {
    const key = `${config.storage.keyPrefix}auth_token`
    return await this.provider.getItem(key)
  }

  async clearAuthToken(): Promise<void> {
    const key = `${config.storage.keyPrefix}auth_token`
    await this.provider.removeItem(key)
    console.log('Auth token cleared')
  }

  async storeSession(userId: string, sessionId: string): Promise<void> {
    const key = `${config.storage.sessionPrefix}${userId}`
    await this.provider.setItem(key, sessionId)
  }

  async getSession(userId: string): Promise<string | null> {
    const key = `${config.storage.sessionPrefix}${userId}`
    return await this.provider.getItem(key)
  }

  async clearSession(userId: string): Promise<void> {
    const key = `${config.storage.sessionPrefix}${userId}`
    await this.provider.removeItem(key)
  }

  async clearAll(): Promise<void> {
    await this.provider.clear()
  }

  async getStats(): Promise<any> {
    return await this.provider.getStats()
  }

  async listUsers(): Promise<string[]> {
    try {
      const stats = await this.getStats()
      const keys = stats.keys || []
      const users: string[] = []

      // Simplified logic: only list users from session info
      for (const key of keys) {
        if (key.startsWith(config.storage.sessionPrefix)) {
          const userId = key.replace(config.storage.sessionPrefix, '')
          if (userId) {
            users.push(userId)
          }
        }
      }

      return users
    } catch (error) {
      console.error('Failed to list users:', error)
      return []
    }
  }

  async cleanup(userId: string): Promise<void> {
    try {
      // Simplified cleanup logic: only clear session info
      // Data keys now only exist in memory, managed by ClientSideCrypto
      await this.clearSession(userId)
    } catch (error) {
      console.error(`Failed to cleanup storage data for user ${userId}:`, error)
      throw error
    }
  }
}

// Export convenience functions
async function storeAuthToken(token: string): Promise<void> {
  const storage = new StorageManager()
  await storage.storeAuthToken(token)
}

async function getAuthToken(): Promise<string | null> {
  const storage = new StorageManager()
  return await storage.getAuthToken()
}

async function clearAuthToken(): Promise<void> {
  const storage = new StorageManager()
  await storage.clearAuthToken()
}

export default StorageManager
export { StorageManager, storeAuthToken, getAuthToken, clearAuthToken }
