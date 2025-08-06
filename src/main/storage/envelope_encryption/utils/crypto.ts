import * as crypto from 'crypto'
import { buildClient, CommitmentPolicy, RawAesKeyringNode, RawAesWrappingSuiteIdentifier } from '@aws-crypto/client-node'
import config from '../config'

interface EncryptionResult {
  encrypted: string
  algorithm: string
  iv?: string
  tag?: string
}

/**
 * 客户端加密工具类 - 使用 AWS Encryption SDK
 *
 * 安全原则：
 * 1. 所有加密操作在客户端本地进行
 * 2. 敏感数据永远不发送到服务端
 * 3. 完全使用 AWS Encryption SDK 官方实现
 * 4. 使用 Raw Keyring，无需客户端访问 KMS
 * 5. 获得 AWS 官方背书和支持
 * 6. 密钥在内存中及时清理
 */
class CryptoUtils {
  private static _awsClient: any

  /**
   * 🔧 获取 AWS Encryption SDK 客户端
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

      // 将Base64编码的数据密钥转换为Buffer
      const keyBuffer = Buffer.from(dataKey, 'base64')

      // 创建Raw AES Keyring
      const keyring = new RawAesKeyringNode({
        keyName: `user-${userId}`,
        keyNamespace: 'chaterm-encryption',
        unencryptedMasterKey: keyBuffer,
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
      console.log('📏 加密后长度:', result.length)

      return {
        encrypted: result.toString('base64'),
        algorithm: config.encryption.algorithm
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
  static async decryptDataWithAwsSdk(encryptedData: any, dataKey: string): Promise<string> {
    try {
      console.log('开始 AWS Encryption SDK 客户端本地解密...')
      console.log('📏 加密数据长度:', encryptedData.encrypted?.length || 0)

      // 将Base64编码的数据密钥转换为Buffer
      const keyBuffer = Buffer.from(dataKey, 'base64')

      // 创建Raw AES Keyring
      const keyring = new RawAesKeyringNode({
        keyName: `user-${encryptedData.userId || 'unknown'}`,
        keyNamespace: 'chaterm-encryption',
        unencryptedMasterKey: keyBuffer,
        wrappingSuite: RawAesWrappingSuiteIdentifier.AES256_GCM_IV12_TAG16_NO_PADDING
      })

      // 获取AWS Encryption SDK客户端
      const client = this._getAwsClient()

      // 将Base64编码的加密数据转换为Buffer
      const encryptedBuffer = Buffer.from(encryptedData.encrypted, 'base64')

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
  static async decryptData(encryptedData: any, dataKey: Buffer): Promise<string> {
    const dataKeyBase64 = dataKey.toString('base64')
    return await this.decryptDataWithAwsSdk(encryptedData, dataKeyBase64)
  }

  /**
   * 生成会话ID
   * @returns 会话ID
   */
  static generateSessionId(): string {
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

  /**
   * 使用AES-GCM加密（备用方法）
   * @param plaintext - 明文
   * @param key - 密钥
   * @returns 加密结果
   */
  static encryptAesGcm(plaintext: string, key: Buffer): EncryptionResult {
    const iv = crypto.randomBytes(config.encryption.ivLength)
    const cipher = crypto.createCipher(config.encryption.algorithm, key)
    cipher.setAAD(Buffer.from('chaterm-encryption'))

    let encrypted = cipher.update(plaintext, 'utf8', 'base64')
    encrypted += cipher.final('base64')
    const tag = cipher.getAuthTag()

    return {
      encrypted,
      algorithm: config.encryption.algorithm,
      iv: iv.toString('base64'),
      tag: tag.toString('base64')
    }
  }

  /**
   * 使用AES-GCM解密（备用方法）
   * @param encryptedData - 加密数据
   * @param key - 密钥
   * @returns 明文
   */
  static decryptAesGcm(encryptedData: EncryptionResult, key: Buffer): string {
    const iv = Buffer.from(encryptedData.iv!, 'base64')
    const tag = Buffer.from(encryptedData.tag!, 'base64')

    const decipher = crypto.createDecipher(encryptedData.algorithm, key)
    decipher.setAAD(Buffer.from('chaterm-encryption'))
    decipher.setAuthTag(tag)

    let decrypted = decipher.update(encryptedData.encrypted, 'base64', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  }
}

export default CryptoUtils
export { CryptoUtils }
export type { EncryptionResult }
