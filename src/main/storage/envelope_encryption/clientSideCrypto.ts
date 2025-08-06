import CryptoUtils from './utils/crypto'
import { StorageManager } from './utils/storage'
import ApiClient from './services/apiClient'

interface EncryptionResult {
  encrypted: string
  algorithm: string
  iv?: string
  tag?: string
}

interface ClientStatus {
  initialized: boolean
  userId: string | null
  sessionId: string | null
  hasValidKey: boolean
}

/**
 * 客户端加密库 - 核心类
 *
 * 安全架构：
 * 1. 数据不离开客户端：所有敏感数据在客户端加密
 * 2. 密钥分离：主密钥在KMS，数据密钥临时下发
 * 3. 零信任：服务端无法看到用户数据
 * 4. 密钥轮换：支持定期更换数据密钥
 * 5. 安全存储：只存储加密后的数据密钥
 */
class ClientSideCrypto {
  private apiClient: any
  private storage: any
  private dataKey: Buffer | null = null
  private encryptedDataKey: string | null = null
  private userId: string | null = null
  private sessionId: string | null = null
  private authToken: string | null = null

  constructor(serverUrl: string) {
    this.apiClient = new ApiClient(serverUrl)
    this.storage = new StorageManager()
  }

  /**
   * 初始化客户端加密
   * @param userId - 用户ID
   * @param authToken - 认证令牌（可选）
   */
  async initialize(userId: string, authToken: string | null = null): Promise<void> {
    try {
      this.userId = userId
      this.authToken = authToken // 保存认证令牌

      // 首先尝试恢复会话ID
      const storedSessionId = await this.storage.getSession(userId)
      if (storedSessionId) {
        this.sessionId = storedSessionId
      } else {
        this.sessionId = CryptoUtils.generateSessionId()
      }

      // 尝试从本地存储恢复加密的数据密钥
      const storedKeyData = await this.storage.getEncryptedDataKey(userId)

      if (storedKeyData) {
        console.log('恢复已存储的数据密钥')
        // 使用存储的完整 EncryptionContext 进行解密
        await this.decryptStoredDataKey(storedKeyData.encryptedDataKey, storedKeyData.encryptionContext)
      } else {
        await this.generateNewDataKey()
      }

      // 存储会话信息
      await this.storage.storeSession(userId, this.sessionId)

      console.log('客户端加密初始化完成')
    } catch (error) {
      console.error('初始化失败:', error)
      throw new Error(`客户端加密初始化失败: ${(error as Error).message}`)
    }
  }

  /**
   * 解密存储的数据密钥
   * @param encryptedDataKey - 加密的数据密钥
   * @param encryptionContext - 加密上下文
   */
  private async decryptStoredDataKey(encryptedDataKey: string, encryptionContext: any): Promise<void> {
    try {
      console.log('开始解密存储的数据密钥...')

      // 调用KMS服务解密数据密钥
      const response = await this.apiClient.decryptDataKey({
        encryptedDataKey,
        encryptionContext,
        authToken: this.authToken
      })

      if (response.success) {
        // 将Base64编码的密钥转换为Buffer
        this.dataKey = Buffer.from(response.plaintextDataKey, 'base64')
        // 不再存储KMS相关信息，避免泄露敏感信息
        console.log('数据密钥解密成功')
      } else {
        throw new Error(`解密数据密钥失败: ${response.error}`)
      }
    } catch (error) {
      console.error('解密存储的数据密钥失败:', error)
      throw error
    }
  }

  /**
   *  生成新的数据密钥
   */
  private async generateNewDataKey(): Promise<void> {
    try {
      // 构建加密上下文
      const encryptionContext = {
        userId: this.userId,
        sessionId: this.sessionId,
        timestamp: Date.now().toString(),
        purpose: 'client-side-encryption'
      }

      // 调用KMS服务生成数据密钥
      const response = await this.apiClient.generateDataKey({
        encryptionContext,
        authToken: this.authToken
      })

      if (response.success) {
        // 将Base64编码的密钥转换为Buffer
        this.dataKey = Buffer.from(response.plaintextDataKey, 'base64')
        this.encryptedDataKey = response.encryptedDataKey
        // 不再存储KMS密钥ID，避免泄露敏感信息

        // 存储加密的数据密钥到本地
        await this.storage.storeEncryptedDataKey(this.userId!, this.encryptedDataKey, encryptionContext)
      } else {
        throw new Error(`生成数据密钥失败: ${response.error}`)
      }
    } catch (error) {
      console.error('生成新数据密钥失败:', error)
      throw error
    }
  }

  /**
   * 使用 AWS Encryption SDK 加密敏感数据
   * @param plaintext - 要加密的明文数据
   * @returns 加密结果
   */
  async encryptData(plaintext: string): Promise<EncryptionResult> {
    if (!this.dataKey || !this.userId) {
      throw new Error('客户端加密未初始化')
    }

    console.log('开始加密数据...')

    const dataKeyBase64 = this.dataKey.toString('base64')

    const result: EncryptionResult = await CryptoUtils.encryptDataWithAwsSdk(plaintext, dataKeyBase64, this.userId!)

    return result
  }

  /**
   * 使用 AWS Encryption SDK 解密敏感数据
   * @param encryptedData - 加密的数据对象
   * @returns 解密后的明文
   */
  async decryptData(encryptedData: EncryptionResult): Promise<string> {
    if (!this.dataKey || !this.userId) {
      throw new Error('客户端加密未初始化')
    }

    console.log('开始解密数据...')

    const dataKeyBase64 = this.dataKey.toString('base64')

    return await CryptoUtils.decryptDataWithAwsSdk(encryptedData, dataKeyBase64)
  }

  /**
   * 轮换数据密钥
   */
  async rotateDataKey(): Promise<void> {
    if (!this.userId) {
      throw new Error('未设置用户ID')
    }

    try {
      console.log('开始轮换数据密钥...')

      // 清理当前密钥
      this.clearDataKey()

      // 生成新的会话ID
      this.sessionId = CryptoUtils.generateSessionId()

      // 生成新的数据密钥
      await this.generateNewDataKey()

      console.log('数据密钥轮换成功')
    } catch (error) {
      console.error('数据密钥轮换失败:', error)
      throw error
    }
  }

  /**
   *  清理内存中的敏感数据
   * @param clearStorage - 是否同时清理存储的数据
   */
  cleanup(clearStorage: boolean = false): void {
    console.log(' 清理客户端加密资源...')

    // 清理内存中的敏感数据
    this.clearDataKey()
    this.encryptedDataKey = null
    this.authToken = null

    if (clearStorage && this.userId) {
      // 清理存储的数据
      this.storage.clearEncryptedDataKey(this.userId)
      this.storage.clearSession(this.userId)
      console.log(' 已清理存储的加密数据')
    }

    console.log('资源清理完成')
  }

  /**
   *  安全清理数据密钥
   */
  private clearDataKey(): void {
    if (this.dataKey) {
      // 用随机数据覆盖密钥内存
      this.dataKey.fill(0)
      this.dataKey = null
    }
  }

  /**
   * 获取客户端状态
   */
  getStatus(): ClientStatus {
    return {
      initialized: !!this.dataKey,
      userId: this.userId,
      sessionId: this.sessionId,
      hasValidKey: !!this.dataKey
    }
  }
}

export default ClientSideCrypto
export { ClientSideCrypto }
export type { EncryptionResult, ClientStatus }
