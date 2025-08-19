import * as crypto from 'crypto'
import { buildClient, CommitmentPolicy, RawAesKeyringNode, RawAesWrappingSuiteIdentifier, KmsKeyringNode } from '@aws-crypto/client-node'
import config from '../config'

interface EncryptionResult {
  encrypted: string
  algorithm: string
  timestamp?: number
  encryptionContext?: any
  keyName?: string
  keyNamespace?: string
  iv?: string | null
  tag?: string | null
  userId?: string
}

/**
 * 客户端加密工具类 - 使用 AWS Encryption SDK
 *
 * 安全原则：
 * 1. 所有加密操作在客户端本地进行
 * 2. 敏感数据永远不发送到服务端
 * 3. 完全使用 AWS Encryption SDK 官方实现
 * 4. 使用 Raw Keyring，无需客户端访问 KMS
 * 5. 密钥在内存中及时清理
 */
class CryptoUtils {
  private static _awsClient: any

  /**
   * 获取 AWS Encryption SDK 客户端
   * @returns AWS Encryption SDK 客户端
   * @private
   */
  static _getAwsClient(): any {
    if (!this._awsClient) {
      this._awsClient = buildClient(CommitmentPolicy.REQUIRE_ENCRYPT_REQUIRE_DECRYPT)
    }
    return this._awsClient
  }

  /**
   * 使用 AWS Encryption SDK 加密数据（使用 Raw Keyring）
   * @param plaintext - 明文数据
   * @param dataKey - Base64编码的数据密钥
   * @param userId - 用户ID（用于加密上下文）
   * @returns 加密结果
   */
  static async encryptDataWithAwsSdk(plaintext: string, dataKey: string, userId: string): Promise<EncryptionResult> {
    try {
      console.log('开始 AWS Encryption SDK 客户端本地加密...')
      console.log('原始数据长度:', plaintext.length)
      console.log(' 用户ID:', userId)

      // 创建包含用户ID的数据包
      const dataPacket = {
        data: plaintext,
        userId: userId,
        timestamp: Date.now()
      }

      const dataToEncrypt = JSON.stringify(dataPacket)

      // 将Base64编码的数据密钥转换为Buffer，并拷贝到“隔离”的 Uint8Array
      // AWS Encryption SDK 要求 unencryptedMasterKey 必须是 isolated buffer（不与其他视图共享底层内存）
      const keyBuffer = Buffer.from(dataKey, 'base64')
      const isolatedKeyBytes = new Uint8Array(keyBuffer) // 拷贝一份，确保是独立的 ArrayBuffer

      const keyName = `user-${userId}-key`
      const keyNamespace = 'client-side-encryption'

      // 创建Raw AES Keyring
      const keyring = new RawAesKeyringNode({
        keyName,
        keyNamespace,
        unencryptedMasterKey: isolatedKeyBytes,
        wrappingSuite: RawAesWrappingSuiteIdentifier.AES256_GCM_IV12_TAG16_NO_PADDING
      })

      // 获取AWS Encryption SDK客户端
      const client = this._getAwsClient()

      // 设置加密上下文
      const encryptionContext = {
        userId: userId,
        purpose: 'client-side-encryption',
        algorithm: config.encryption.algorithm
      }

      // 使用AWS Encryption SDK加密
      const { result } = await client.encrypt(keyring, dataToEncrypt, {
        encryptionContext
      })

      console.log('AWS Encryption SDK 加密完成')

      return {
        encrypted: result.toString('base64'),
        algorithm: 'aws-encryption-sdk',
        timestamp: Date.now(),
        encryptionContext: encryptionContext,
        keyName: keyName,
        keyNamespace: keyNamespace,
        // 保持与现有格式的兼容性
        iv: undefined,
        tag: undefined
      }
    } catch (error) {
      // 简化错误日志输出
      const errorMessage = (error as Error).message
      console.warn('AWS Encryption SDK 加密失败:', errorMessage)
      throw new Error(`AWS Encryption SDK 加密失败: ${errorMessage}`)
    }
  }

  /**
   * 使用 AWS Encryption SDK 解密数据
   * @param encryptedData - 加密的数据对象
   * @param dataKey - Base64编码的数据密钥
   * @returns 解密后的明文
   */
  static async decryptDataWithAwsSdk(encryptedData: any, dataKey: string, userId?: string): Promise<string> {
    try {
      console.log('开始 AWS Encryption SDK 客户端本地解密...')
      // 将Base64编码的数据密钥转换为Buffer，并拷贝到“隔离”的 Uint8Array
      const keyBuffer = Buffer.from(dataKey, 'base64')
      const isolatedKeyBytes = new Uint8Array(keyBuffer)

      // 关键修复：完全按照原项目的逻辑，优先使用 encryptionContext 中的 userId
      const keyName = encryptedData.keyName || `user-${encryptedData.encryptionContext?.userId || userId || 'unknown'}-key`
      const keyNamespace = encryptedData.keyNamespace || 'client-side-encryption'
      // 创建Raw AES Keyring
      const keyring = new RawAesKeyringNode({
        keyName: keyName,
        keyNamespace: keyNamespace,
        unencryptedMasterKey: isolatedKeyBytes,
        wrappingSuite: RawAesWrappingSuiteIdentifier.AES256_GCM_IV12_TAG16_NO_PADDING
      })

      // 获取AWS Encryption SDK客户端
      const client = this._getAwsClient()

      // 关键修复：AWS Encryption SDK 的密文应该是完整的二进制数据
      // encryptedData.encrypted 是 Base64 编码的 AWS SDK 密文
      const encryptedBuffer = Buffer.from(encryptedData.encrypted, 'base64')

      // 🔍 尝试解析 AWS Encryption SDK 密文头部
      try {
        // 尝试读取加密上下文长度
        if (encryptedBuffer.length > 10) {
          const contextLength = encryptedBuffer.readUInt16BE(8)
          console.log('  加密上下文长度:', contextLength)
        }
      } catch (e) {
        console.log('  密文结构分析失败:', (e as Error).message)
      }

      // 使用AWS Encryption SDK解密
      const { plaintext } = await client.decrypt(keyring, encryptedBuffer)

      // 解析数据包
      const dataPacket = JSON.parse(plaintext.toString())

      console.log('AWS Encryption SDK 解密完成')
      console.log('解密后长度:', dataPacket.data.length)

      return dataPacket.data
    } catch (error) {
      // 简化错误日志输出
      const errorMessage = (error as Error).message
      console.warn('AWS Encryption SDK 解密失败:', errorMessage)
      console.error('解密异常详情:', {
        error,
        message: errorMessage,
        stack: (error as Error).stack
      })
      throw new Error(`AWS Encryption SDK 解密失败: ${errorMessage}`)
    }
  }

  /**
   * 简化的加密方法（向后兼容）
   * @param plaintext - 明文数据
   * @param dataKey - 数据密钥Buffer
   * @param userId - 用户ID
   * @returns 加密结果
   */
  static async encryptData(plaintext: string, dataKey: Buffer, userId: string): Promise<EncryptionResult> {
    const dataKeyBase64 = dataKey.toString('base64')
    return await this.encryptDataWithAwsSdk(plaintext, dataKeyBase64, userId)
  }

  /**
   * 简化的解密方法（向后兼容）
   * @param encryptedData - 加密的数据对象
   * @param dataKey - 数据密钥Buffer
   * @returns 解密后的明文
   */
  static async decryptData(encryptedData: any, dataKey: Buffer, userId?: string): Promise<string> {
    const dataKeyBase64 = dataKey.toString('base64')
    return await this.decryptDataWithAwsSdk(encryptedData, dataKeyBase64, userId)
  }

  /**
   * 自动解析数据密钥的解密方法
   * @param encryptedData - 加密的数据对象
   * @param encryptionContext - 加密上下文
   * @param apiClient - API客户端
   * @param authToken - 认证令牌
   * @returns 解密后的明文
   */
  static async decryptDataWithAutoKeyResolution(
    encryptedData: any,
    encryptionContext: any,
    apiClient: any,
    authToken: string | null
  ): Promise<string> {
    try {
      console.log('开始自动解析数据密钥解密...')

      // AWS Encryption SDK 的密文包含了加密的数据密钥
      // 我们需要让 SDK 自动解密数据密钥，但这需要正确的 Keyring 配置

      // 临时方案：尝试使用一个通用的数据密钥
      // 在实际场景中，应该从密文中提取加密的数据密钥，然后调用 KMS 解密

      console.log('⚠️ 自动密钥解析功能尚未完全实现，回退到错误处理')
      throw new Error('无法自动解析数据密钥，请确保客户端加密已正确初始化')
    } catch (error) {
      console.error('自动密钥解析失败:', (error as Error).message)
      throw error
    }
  }

  /**
   * 生成会话ID（基于用户ID的固定值）
   * @param userId - 用户ID
   * @returns 会话ID
   */
  static generateSessionId(userId?: string): string {
    if (userId) {
      // 修复：使用用户ID的最后两位数作为 sessionId，确保加密和解密时一致
      const lastTwoDigits = userId.slice(-2).padStart(2, '0')
      return lastTwoDigits
    }
    // 回退到随机生成（用于兼容性）
    return crypto.randomBytes(16).toString('hex')
  }

  /**
   * 生成随机密钥
   * @param length - 密钥长度（字节）
   * @returns 密钥Buffer
   */
  static generateKey(length: number = 32): Buffer {
    return crypto.randomBytes(length)
  }

  /**
   * 计算数据的哈希值
   * @param data - 要计算哈希的数据
   * @param algorithm - 哈希算法（默认sha256）
   * @returns 哈希值（hex格式）
   */
  static hash(data: string | Buffer, algorithm: string = 'sha256'): string {
    const hash = crypto.createHash(algorithm)
    hash.update(data)
    return hash.digest('hex')
  }

  /**
   * 计算密钥指纹
   * @param key - 密钥Buffer
   * @returns 密钥指纹
   */
  static getKeyFingerprint(key: Buffer): string {
    return this.hash(key).substring(0, 16)
  }

  /**
   *  安全清理Buffer
   * @param buffer - 要清理的Buffer
   */
  static secureWipe(buffer: Buffer): void {
    if (buffer && Buffer.isBuffer(buffer)) {
      buffer.fill(0)
    }
  }
}

export default CryptoUtils
export { CryptoUtils }
export type { EncryptionResult }
