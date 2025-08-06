import config from '../config'
import TempFileStorageProvider from './tempFileStorage'

interface EncryptedKeyData {
  encryptedDataKey: string
  encryptionContext: any
  timestamp: number
}

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

  async storeEncryptedDataKey(userId: string, encryptedDataKey: string, encryptionContext: any): Promise<void> {
    const key = `${config.storage.keyPrefix}${userId}`
    const data: EncryptedKeyData = {
      encryptedDataKey,
      encryptionContext,
      timestamp: Date.now()
    }

    await this.provider.setItem(key, JSON.stringify(data))
  }

  async getEncryptedDataKey(userId: string): Promise<EncryptedKeyData | null> {
    const key = `${config.storage.keyPrefix}${userId}`
    const data = await this.provider.getItem(key)

    if (!data) {
      return null
    }

    try {
      const parsedData = JSON.parse(data)

      // 检查是否过期
      if (this.isExpired(parsedData.timestamp)) {
        await this.clearEncryptedDataKey(userId)
        return null
      }

      return parsedData
    } catch (error) {
      // 简化错误日志输出
      console.warn('解析存储的数据密钥失败:', (error as Error).message)
      return null
    }
  }

  async clearEncryptedDataKey(userId: string): Promise<void> {
    const key = `${config.storage.keyPrefix}${userId}`
    await this.provider.removeItem(key)
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

  async cleanupExpired(): Promise<void> {
    try {
      const stats = await this.getStats()
      const keys = stats.keys || []

      for (const key of keys) {
        if (key.startsWith(config.storage.keyPrefix)) {
          const data = await this.provider.getItem(key)
          if (data) {
            try {
              const parsedData = JSON.parse(data)
              if (this.isExpired(parsedData.timestamp)) {
                await this.provider.removeItem(key)
                console.log(`🧹 清理过期数据: ${key}`)
              }
            } catch (error) {
              // 忽略解析错误，可能是其他格式的数据
            }
          }
        }
      }
    } catch (error) {
      console.error(' 清理过期数据失败:', error)
    }
  }

  /**
   * ⏰ 检查数据是否过期
   * @param timestamp - 时间戳
   * @returns 是否过期
   */
  private isExpired(timestamp: number): boolean {
    const now = Date.now()
    const keyExpiry = config.timeout?.keyExpiry || 24 * 60 * 60 * 1000 // 默认24小时
    const expiry = timestamp + keyExpiry
    return now > expiry
  }

  async hasEncryptedDataKey(userId: string): Promise<boolean> {
    const data = await this.getEncryptedDataKey(userId)
    return data !== null
  }

  async listUsers(): Promise<string[]> {
    try {
      const stats = await this.getStats()
      const keys = stats.keys || []
      const users: string[] = []

      for (const key of keys) {
        if (key.startsWith(config.storage.keyPrefix)) {
          const userId = key.replace(config.storage.keyPrefix, '')
          if (userId && !userId.includes('auth_token')) {
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
      // 清理加密的数据密钥
      await this.clearEncryptedDataKey(userId)

      // 清理会话信息
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
export type { EncryptedKeyData }
