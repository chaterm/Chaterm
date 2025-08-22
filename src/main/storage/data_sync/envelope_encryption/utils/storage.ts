import config from '../config'
import TempFileStorageProvider from './tempFileStorage'

/**
 * 💾 客户端存储管理器
 *
 * 安全原则：
 * 1. 只存储加密后的数据密钥
 * 2. 支持多种存储后端
 * 3. 自动过期清理
 * 4. 安全删除
 * 5. 安全存储认证Token
 */
class StorageManager {
  private provider: any

  constructor() {
    this.provider = this.initializeProvider()
  }

  /**
   * 初始化存储提供者
   */
  private initializeProvider(): any {
    return new TempFileStorageProvider()
  }

  async storeAuthToken(token: string): Promise<void> {
    const key = `${config.storage.keyPrefix}auth_token`
    await this.provider.setItem(key, token)
    console.log('认证Token已存储')
  }

  async getAuthToken(): Promise<string | null> {
    const key = `${config.storage.keyPrefix}auth_token`
    return await this.provider.getItem(key)
  }

  async clearAuthToken(): Promise<void> {
    const key = `${config.storage.keyPrefix}auth_token`
    await this.provider.removeItem(key)
    console.log(' 认证Token已清除')
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

      //  简化逻辑：只从会话信息中列出用户
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
      console.error('列出用户失败:', error)
      return []
    }
  }

  async cleanup(userId: string): Promise<void> {
    try {
      //  简化清理逻辑：只清理会话信息
      // 数据密钥现在只存在于内存中，由ClientSideCrypto管理
      await this.clearSession(userId)
    } catch (error) {
      console.error(` 清理用户 ${userId} 的存储数据失败:`, error)
      throw error
    }
  }
}

// 导出便捷函数
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
