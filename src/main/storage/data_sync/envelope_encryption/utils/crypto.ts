import * as crypto from 'crypto'
import { buildClient, CommitmentPolicy, RawAesKeyringNode, RawAesWrappingSuiteIdentifier } from '@aws-crypto/client-node'
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
 * Client-side encryption utility class - using AWS Encryption SDK
 *
 * Security principles:
 * 1. All encryption operations are performed locally on the client
 * 2. Sensitive data is never sent to the server
 * 3. Fully use AWS Encryption SDK official implementation
 * 4. Use Raw Keyring, no client access to KMS required
 * 5. Keys are cleaned up in memory promptly
 */
class CryptoUtils {
  private static _awsClient: any

  /**
   * Get AWS Encryption SDK client
   * @returns AWS Encryption SDK client
   * @private
   */
  static _getAwsClient(): any {
    if (!this._awsClient) {
      this._awsClient = buildClient(CommitmentPolicy.REQUIRE_ENCRYPT_REQUIRE_DECRYPT)
    }
    return this._awsClient
  }

  /**
   * Encrypt data using AWS Encryption SDK (using Raw Keyring)
   * @param plaintext - Plaintext data
   * @param dataKey - Base64 encoded data key
   * @param userId - User ID (for encryption context)
   * @returns Encryption result
   */
  static async encryptDataWithAwsSdk(plaintext: string, dataKey: string, userId: string): Promise<EncryptionResult> {
    try {
      // Create data packet containing user ID
      const dataPacket = {
        data: plaintext,
        userId: userId,
        timestamp: Date.now()
      }

      const dataToEncrypt = JSON.stringify(dataPacket)

      // Convert Base64 encoded data key to Buffer and copy to "isolated" Uint8Array
      // AWS Encryption SDK requires unencryptedMasterKey to be an isolated buffer (not sharing underlying memory with other views)
      const keyBuffer = Buffer.from(dataKey, 'base64')
      const isolatedKeyBytes = new Uint8Array(keyBuffer) // Copy to ensure independent ArrayBuffer

      const keyName = `user-${userId}-key`
      const keyNamespace = 'client-side-encryption'

      // Create Raw AES Keyring
      const keyring = new RawAesKeyringNode({
        keyName,
        keyNamespace,
        unencryptedMasterKey: isolatedKeyBytes,
        wrappingSuite: RawAesWrappingSuiteIdentifier.AES256_GCM_IV12_TAG16_NO_PADDING
      })

      // Get AWS Encryption SDK client
      const client = this._getAwsClient()

      // Set encryption context
      const encryptionContext = {
        userId: userId,
        purpose: 'client-side-encryption',
        algorithm: config.encryption.algorithm
      }

      // Encrypt using AWS Encryption SDK
      const { result } = await client.encrypt(keyring, dataToEncrypt, {
        encryptionContext
      })

      return {
        encrypted: result.toString('base64'),
        algorithm: 'aws-encryption-sdk',
        timestamp: Date.now(),
        encryptionContext: encryptionContext,
        keyName: keyName,
        keyNamespace: keyNamespace,
        // Maintain compatibility with existing format
        iv: undefined,
        tag: undefined
      }
    } catch (error) {
      // Simplify error log output
      const errorMessage = (error as Error).message
      console.warn('AWS Encryption SDK encryption failed:', errorMessage)
      throw new Error(`AWS Encryption SDK encryption failed: ${errorMessage}`)
    }
  }

  /**
   * Decrypt data using AWS Encryption SDK
   * @param encryptedData - Encrypted data object
   * @param dataKey - Base64 encoded data key
   * @returns Decrypted plaintext
   */
  static async decryptDataWithAwsSdk(encryptedData: any, dataKey: string, userId?: string): Promise<string> {
    try {
      // Convert Base64 encoded data key to Buffer and copy to "isolated" Uint8Array
      const keyBuffer = Buffer.from(dataKey, 'base64')
      const isolatedKeyBytes = new Uint8Array(keyBuffer)

      // Critical fix: Follow original project logic exactly, prioritize userId from encryptionContext
      const keyName = encryptedData.keyName || `user-${encryptedData.encryptionContext?.userId || userId || 'unknown'}-key`
      const keyNamespace = encryptedData.keyNamespace || 'client-side-encryption'
      // Create Raw AES Keyring
      const keyring = new RawAesKeyringNode({
        keyName: keyName,
        keyNamespace: keyNamespace,
        unencryptedMasterKey: isolatedKeyBytes,
        wrappingSuite: RawAesWrappingSuiteIdentifier.AES256_GCM_IV12_TAG16_NO_PADDING
      })

      // Get AWS Encryption SDK client
      const client = this._getAwsClient()

      // Critical fix: AWS Encryption SDK ciphertext should be complete binary data
      // encryptedData.encrypted is Base64 encoded AWS SDK ciphertext
      const encryptedBuffer = Buffer.from(encryptedData.encrypted, 'base64')

      // 🔍 Try to parse AWS Encryption SDK ciphertext header
      try {
        // Try to read encryption context length
        if (encryptedBuffer.length > 10) {
        }
      } catch (e) {
        console.log('  Ciphertext structure analysis failed:', (e as Error).message)
      }

      // Decrypt using AWS Encryption SDK
      const { plaintext } = await client.decrypt(keyring, encryptedBuffer)

      // Parse data packet
      const dataPacket = JSON.parse(plaintext.toString())
      return dataPacket.data
    } catch (error) {
      // Simplify error log output
      const errorMessage = (error as Error).message
      console.warn('AWS Encryption SDK decryption failed:', errorMessage)
      console.error('Decryption exception details:', {
        error,
        message: errorMessage,
        stack: (error as Error).stack
      })
      throw new Error(`AWS Encryption SDK decryption failed: ${errorMessage}`)
    }
  }

  /**
   * Simplified encryption method (backward compatible)
   * @param plaintext - Plaintext data
   * @param dataKey - Data key Buffer
   * @param userId - User ID
   * @returns Encryption result
   */
  static async encryptData(plaintext: string, dataKey: Buffer, userId: string): Promise<EncryptionResult> {
    const dataKeyBase64 = dataKey.toString('base64')
    return await this.encryptDataWithAwsSdk(plaintext, dataKeyBase64, userId)
  }

  /**
   * Simplified decryption method (backward compatible)
   * @param encryptedData - Encrypted data object
   * @param dataKey - Data key Buffer
   * @returns Decrypted plaintext
   */
  static async decryptData(encryptedData: any, dataKey: Buffer, userId?: string): Promise<string> {
    const dataKeyBase64 = dataKey.toString('base64')
    return await this.decryptDataWithAwsSdk(encryptedData, dataKeyBase64, userId)
  }

  /**
   * Decryption method with automatic data key resolution
   * @param encryptedData - Encrypted data object
   * @param encryptionContext - Encryption context
   * @param apiClient - API client
   * @param authToken - Authentication token
   * @returns Decrypted plaintext
   */
  static async decryptDataWithAutoKeyResolution(
    _encryptedData: any,
    _encryptionContext: any,
    _apiClient: any,
    _authToken: string | null
  ): Promise<string> {
    try {
      console.log('Starting automatic data key resolution decryption...')

      // AWS Encryption SDK ciphertext contains encrypted data key
      // We need to let SDK automatically decrypt data key, but this requires correct Keyring configuration

      // Temporary solution: try using a generic data key
      // In actual scenarios, should extract encrypted data key from ciphertext, then call KMS to decrypt

      console.log('⚠️ Automatic key resolution feature not fully implemented, falling back to error handling')
      throw new Error('Unable to automatically resolve data key, please ensure client encryption is properly initialized')
    } catch (error) {
      console.error('Automatic key resolution failed:', (error as Error).message)
      throw error
    }
  }

  /**
   * Generate session ID (fixed value based on user ID)
   * @param userId - User ID
   * @returns Session ID
   */
  static generateSessionId(userId?: string): string {
    if (userId) {
      // Fix: Use last two digits of user ID as sessionId to ensure consistency during encryption and decryption
      const lastTwoDigits = userId.slice(-2).padStart(2, '0')
      return lastTwoDigits
    }
    // Fallback to random generation (for compatibility)
    return crypto.randomBytes(16).toString('hex')
  }

  /**
   * Generate random key
   * @param length - Key length (bytes)
   * @returns Key Buffer
   */
  static generateKey(length: number = 32): Buffer {
    return crypto.randomBytes(length)
  }

  /**
   * Calculate data hash value
   * @param data - Data to calculate hash
   * @param algorithm - Hash algorithm (default sha256)
   * @returns Hash value (hex format)
   */
  static hash(data: string | Buffer, algorithm: string = 'sha256'): string {
    const hash = crypto.createHash(algorithm)
    hash.update(data)
    return hash.digest('hex')
  }

  /**
   * Calculate key fingerprint
   * @param key - Key Buffer
   * @returns Key fingerprint
   */
  static getKeyFingerprint(key: Buffer): string {
    return this.hash(key).substring(0, 16)
  }

  /**
   * Securely wipe Buffer
   * @param buffer - Buffer to wipe
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
