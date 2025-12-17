import CryptoUtils from './utils/crypto'
import { StorageManager } from './utils/storage'
import ApiClient from './services/apiClient'
import config from './config'

interface EncryptionResult {
  encrypted: string
  algorithm: string
  iv?: string | null
  tag?: string | null
}

interface ClientStatus {
  initialized: boolean
  userId: string | null
  sessionId: string | null
  hasValidKey: boolean
}

interface DataKeyCache {
  encryptedDataKey: string
  plaintextDataKey: Buffer
  encryptionContext: any
  timestamp: number
}

interface CacheStats {
  totalRequests: number
  cacheHits: number
  cacheMisses: number
  hitRate: number
}

/**
 * Client-side encryption library - Core class
 *
 * Security architecture:
 * 1. Data never leaves client: All sensitive data is encrypted on the client side
 * 2. Key separation: Master key in KMS, data keys are temporarily issued
 * 3. Zero trust: Server cannot see user data
 * 4. Key rotation: Supports periodic data key rotation
 * 5. Secure storage: Only stores encrypted data keys
 */
class ClientSideCrypto {
  private apiClient: any
  private storage: any
  private dataKey: Buffer | null = null
  private encryptedDataKey: string | null = null
  private userId: string | null = null
  private sessionId: string | null = null
  private authToken: string | null = null

  // Data key cache mechanism
  private dataKeyCache: Map<string, DataKeyCache> = new Map()
  private cacheStats = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0
  }
  private readonly CACHE_EXPIRY_MS = config?.timeout?.keyExpiry
  private readonly MAX_CACHE_SIZE = 1000 // Maximum cache entries

  constructor(serverUrl: string) {
    this.apiClient = new ApiClient(serverUrl)
    this.storage = new StorageManager()
  }

  /**
   * Initialize client-side encryption
   * @param userId - User ID
   * @param authToken - Authentication token (optional)
   */
  async initialize(userId: string, authToken: string | null = null): Promise<void> {
    try {
      this.userId = userId
      this.authToken = authToken // Store authentication token

      this.sessionId = CryptoUtils.generateSessionId(userId)

      // Generate new data key directly, no longer relying on local storage
      await this.generateNewDataKey()

      // Store session information
      await this.storage.storeSession(userId, this.sessionId)

      console.log('Client-side encryption initialized successfully')
    } catch (error) {
      // Simplify error logging to avoid duplicate output
      const errorMessage = (error as Error).message
      throw new Error(`Client-side encryption initialization failed: ${errorMessage}`)
    }
  }

  /**
   * Decrypt data key (using in-memory cache mechanism)
   * @param encryptedDataKey - Encrypted data key
   * @param encryptionContext - Encryption context
   * @returns Decrypted data key
   */
  private async decryptDataKey(encryptedDataKey: string, encryptionContext: any): Promise<Buffer> {
    try {
      // Try to get data key from in-memory cache
      const cachedKey = await this.getDataKeyFromCache(encryptedDataKey, encryptionContext)
      if (cachedKey) {
        return cachedKey
      }

      const response = await this.apiClient.decryptDataKey({
        encryptedDataKey,
        encryptionContext,
        authToken: this.authToken
      })
      if (response.success) {
        // Convert Base64-encoded key to Buffer
        const plaintextDataKey = Buffer.from(response.plaintextDataKey, 'base64')
        // Add decryption result to in-memory cache
        await this.addDataKeyToCache(encryptedDataKey, encryptionContext, plaintextDataKey)

        return plaintextDataKey
      } else {
        console.error('KMS decryption failed:')
        console.error('  - Error:', response.error)
        throw new Error(`Failed to decrypt data key: ${response.error}`)
      }
    } catch (error) {
      console.error('Data key decryption failed:', (error as Error).message)
      console.error('Error stack:', (error as Error).stack)
      const errorMessage = (error as Error).message
      throw new Error(errorMessage.includes('Failed to decrypt data key') ? errorMessage : `Failed to decrypt data key: ${errorMessage}`)
    }
  }

  /**
   * Generate new data key
   */
  private async generateNewDataKey(): Promise<void> {
    try {
      // Build encryption context
      const encryptionContext = {
        userId: this.userId,
        sessionId: this.sessionId,
        purpose: 'client-side-encryption'
      }

      // Call KMS service to generate data key
      const response = await this.apiClient.generateDataKey({
        encryptionContext,
        authToken: this.authToken
      })

      if (response.success) {
        // Convert Base64-encoded key to Buffer
        this.dataKey = Buffer.from(response.plaintextDataKey, 'base64')
        this.encryptedDataKey = response.encryptedDataKey

        // Add newly generated key to in-memory cache
        if (this.encryptedDataKey && this.dataKey) {
          await this.addDataKeyToCache(this.encryptedDataKey, encryptionContext, this.dataKey)
        }

        console.log('New data key generated successfully and cached')
      } else {
        throw new Error(`Failed to generate data key: ${response.error}`)
      }
    } catch (error) {
      // Simplify error log output
      const errorMessage = (error as Error).message
      console.warn('Data key generation failed:', errorMessage)
      throw new Error(errorMessage.includes('Failed to generate data key') ? errorMessage : `Failed to generate data key: ${errorMessage}`)
    }
  }

  /**
   * Encrypt sensitive data using AWS Encryption SDK
   * @param plaintext - Plaintext data to encrypt
   * @returns Encryption result
   */
  async encryptData(plaintext: string): Promise<EncryptionResult> {
    if (!this.dataKey || !this.userId) {
      throw new Error('Client-side encryption not initialized')
    }

    const dataKeyBase64 = this.dataKey.toString('base64')

    const result: EncryptionResult = await CryptoUtils.encryptDataWithAwsSdk(plaintext, dataKeyBase64, this.userId!)

    return result
  }

  /**
   * Decrypt sensitive data using AWS Encryption SDK
   * @param encryptedData - Encrypted data object
   * @returns Decrypted plaintext
   */
  async decryptData(encryptedData: any): Promise<string> {
    if (!this.userId) {
      console.error('Client-side encryption not initialized')
      throw new Error('Client-side encryption not initialized')
    }

    // Fix: Check if this is an envelope encryption decryption request
    if (encryptedData.encryptedDataKey) {
      return await this.decryptWithKmsDataKey(encryptedData)
    }

    // Critical fix: Detect ciphertext format to determine which decryption method to use
    const encryptedBase64 = encryptedData.encrypted
    let shouldTryKmsResolution = false

    if (encryptedBase64) {
      try {
        const encryptedBuffer = Buffer.from(encryptedBase64, 'base64')
        // Check AWS Encryption SDK ciphertext format characteristics
        if (encryptedBuffer.length > 4) {
          const version = encryptedBuffer.readUInt8(0)
          const type = encryptedBuffer.readUInt8(1)
          // Typical version and type for AWS Encryption SDK
          if (version === 0x02 && type === 0x05) {
            shouldTryKmsResolution = true
          }
        }
      } catch (e) {
        console.log('Ciphertext format check failed, continuing with current session key')
      }
    }

    if (shouldTryKmsResolution) {
      try {
        const result = await this.decryptWithKmsResolution(encryptedData)
        return result
      } catch (error) {
        console.warn('KMS decryption failed, trying current session key:', (error as Error).message)
      }
    }

    // Fallback to using current session key for decryption
    if (!this.dataKey) {
      console.error('Current session key not initialized and KMS decryption failed')
      throw new Error('Current session key not initialized and KMS decryption failed')
    }

    const dataKeyBase64 = this.dataKey.toString('base64')
    const result = await CryptoUtils.decryptDataWithAwsSdk(encryptedData, dataKeyBase64, this.userId)
    return result
  }

  /**
   * Decrypt data using KMS data key decryption method (correct implementation of envelope encryption)
   * @param encryptedData - Encrypted data object containing encrypted data key
   * @returns Decrypted plaintext
   */
  private async decryptWithKmsDataKey(encryptedData: any): Promise<string> {
    try {
      // Step 1: Decrypt data key using KMS
      const plaintextDataKey = await this.decryptDataKey(encryptedData.encryptedDataKey, encryptedData.encryptionContext || {})

      // Step 2: Decrypt actual data using plaintext data key
      const dataKeyBase64 = plaintextDataKey.toString('base64')
      const result = await CryptoUtils.decryptDataWithAwsSdk(encryptedData, dataKeyBase64, this.userId || undefined)
      return result
    } catch (error) {
      console.error('Envelope decryption failed:', (error as Error).message)
      throw new Error(`Envelope decryption failed: ${(error as Error).message}`)
    }
  }

  /**
   * Decrypt data using KMS resolution method (for ciphertext containing KMS-encrypted data keys)
   * @param encryptedData - Encrypted data object
   * @returns Decrypted plaintext
   */
  private async decryptWithKmsResolution(encryptedData: any): Promise<string> {
    try {
      // Critical fix: Check if complete ENC1 format data exists
      if (encryptedData.originalCombinedString && encryptedData.parsedMeta) {
        // Get encryption context from metadata
        const encryptionContext = encryptedData.parsedMeta.encryptionContext || {}

        try {
          let sessionId = encryptionContext.sessionId
          if (!sessionId && this.userId) {
            sessionId = this.userId.slice(-2).padStart(2, '0')
          }
          const correctEncryptionContext = {
            userId: this.userId || encryptionContext.userId,
            sessionId: sessionId,
            purpose: 'client-side-encryption'
          }

          // Fix: Use existing decryption method
          if (!this.dataKey) {
            throw new Error('Current session key not initialized')
          }

          const dataKeyBase64 = this.dataKey.toString('base64')
          const result = await CryptoUtils.decryptDataWithAwsSdk(
            {
              ...encryptedData,
              encryptionContext: correctEncryptionContext
            },
            dataKeyBase64,
            this.userId || undefined
          )
          return result
        } catch (decryptError) {
          console.log('Decryption failed:', (decryptError as Error).message)
          throw new Error(`Decryption failed: ${(decryptError as Error).message}`)
        }
      } else {
        console.error('No complete ENC1 format data, cannot perform KMS resolution')
        console.log('  - originalCombinedString:', !!encryptedData.originalCombinedString)
        console.log('  - parsedMeta:', !!encryptedData.parsedMeta)
        throw new Error('Missing complete ENC1 format data')
      }
    } catch (error) {
      console.error('KMS resolution decryption failed:', (error as Error).message)
      console.error('Error stack:', (error as Error).stack)
      throw new Error(`KMS resolution decryption failed: ${(error as Error).message}`)
    }
  }

  /**
   * Rotate data key
   */
  async rotateDataKey(): Promise<void> {
    if (!this.userId) {
      throw new Error('User ID not set')
    }

    try {
      console.log('Starting data key rotation...')

      // Clear current key
      this.clearDataKey()

      // Fix: Use fixed sessionId based on user ID
      this.sessionId = CryptoUtils.generateSessionId(this.userId || undefined)

      // Generate new data key
      await this.generateNewDataKey()

      console.log('Data key rotation successful')
    } catch (error) {
      console.error('Data key rotation failed:', error)
      throw error
    }
  }

  /**
   * Clean up sensitive data in memory
   * @param clearSession - Whether to also clear session information
   */
  cleanup(clearSession: boolean = false): void {
    console.log('Cleaning up client-side encryption resources...')

    // Clear sensitive data in memory
    this.clearDataKey()
    this.encryptedDataKey = null
    this.authToken = null

    // Clear data key cache
    this.clearCache(true)

    if (clearSession && this.userId) {
      // Only clear session information, no longer managing local data key storage
      this.storage.clearSession(this.userId)
      console.log('Session information cleared')
    }

    console.log('Resource cleanup completed')
  }

  /**
   * Securely clear data key
   */
  private clearDataKey(): void {
    if (this.dataKey) {
      // Overwrite key memory with random data
      this.dataKey.fill(0)
      this.dataKey = null
    }
  }

  /**
   * Get client status
   */
  getStatus(): ClientStatus {
    return {
      initialized: !!this.dataKey,
      userId: this.userId,
      sessionId: this.sessionId,
      hasValidKey: !!this.dataKey
    }
  }

  /**
   * Get current encrypted data key (for envelope encryption)
   * @returns Encrypted data key, or null if not initialized
   */
  getEncryptedDataKey(): string | null {
    return this.encryptedDataKey
  }

  /**
   * Get current user ID
   * @returns User ID, or null if not initialized
   */
  getUserId(): string | null {
    return this.userId
  }

  /**
   * Health check
   * @returns Health status of client-side encryption service
   */
  async healthCheck(): Promise<any> {
    try {
      const status = this.getStatus()
      const cacheStats = this.getCacheStats()

      return {
        client: {
          status: 'healthy',
          initialized: status.initialized,
          hasValidKey: status.hasValidKey,
          userId: status.userId,
          sessionId: status.sessionId
        },
        cache: {
          ...cacheStats,
          size: this.dataKeyCache.size,
          maxSize: this.MAX_CACHE_SIZE
        },
        api: {
          available: !!this.apiClient,
          serverUrl: this.apiClient?.serverUrl || 'unknown'
        }
      }
    } catch (error) {
      return {
        client: {
          status: 'error',
          error: (error as Error).message,
          initialized: false
        }
      }
    }
  }

  /**
   * Get data key from cache
   * @param encryptedDataKey - Encrypted data key
   * @param encryptionContext - Encryption context
   * @returns Cached plaintext data key, or null if not found
   */
  private async getDataKeyFromCache(encryptedDataKey: string, encryptionContext: any): Promise<Buffer | null> {
    this.cacheStats.totalRequests++

    // Generate cache key
    const cacheKey = this.generateCacheKey(encryptedDataKey, encryptionContext)
    const cached = this.dataKeyCache.get(cacheKey)

    if (!cached) {
      this.cacheStats.cacheMisses++
      return null
    }

    // Check if cache is expired
    if (Date.now() - cached.timestamp > this.CACHE_EXPIRY_MS) {
      console.log('Cache expired, removing cache entry')
      this.dataKeyCache.delete(cacheKey)
      this.cacheStats.cacheMisses++
      return null
    }

    // Verify encryption context matches
    if (!this.compareEncryptionContext(cached.encryptionContext, encryptionContext)) {
      console.warn('⚠️Encryption context mismatch, skipping cache')
      this.cacheStats.cacheMisses++
      return null
    }

    this.cacheStats.cacheHits++
    return cached.plaintextDataKey
  }

  /**
   * Add data key to cache
   * @param encryptedDataKey - Encrypted data key
   * @param encryptionContext - Encryption context
   * @param plaintextDataKey - Plaintext data key
   */
  private async addDataKeyToCache(encryptedDataKey: string, encryptionContext: any, plaintextDataKey: Buffer): Promise<void> {
    try {
      // Check cache size limit
      if (this.dataKeyCache.size >= this.MAX_CACHE_SIZE) {
        this.evictOldestCacheEntry()
      }

      const cacheKey = this.generateCacheKey(encryptedDataKey, encryptionContext)

      // Create key copy to avoid modifying original key
      const keyBuffer = Buffer.alloc(plaintextDataKey.length)
      plaintextDataKey.copy(keyBuffer)

      const cacheEntry: DataKeyCache = {
        encryptedDataKey,
        plaintextDataKey: keyBuffer,
        encryptionContext: { ...encryptionContext }, // Deep copy
        timestamp: Date.now()
      }

      this.dataKeyCache.set(cacheKey, cacheEntry)
    } catch (error) {
      console.warn('Failed to add to cache:', (error as Error).message)
      // Cache failure should not affect main functionality
    }
  }

  /**
   * Generate cache key
   * @param encryptedDataKey - Encrypted data key
   * @param encryptionContext - Encryption context
   * @returns Cache key
   */
  private generateCacheKey(encryptedDataKey: string, encryptionContext: any): string {
    // Use hash of encrypted data key as primary key, encryption context as secondary key
    const crypto = require('crypto')
    const contextStr = JSON.stringify(encryptionContext, Object.keys(encryptionContext).sort())
    const combined = `${encryptedDataKey}:${contextStr}`
    return crypto.createHash('sha256').update(combined).digest('hex')
  }

  /**
   * Compare if two encryption contexts are equal
   * @param context1 - First encryption context
   * @param context2 - Second encryption context
   * @returns Whether they are equal
   */
  private compareEncryptionContext(context1: any, context2: any): boolean {
    try {
      const str1 = JSON.stringify(context1, Object.keys(context1 || {}).sort())
      const str2 = JSON.stringify(context2, Object.keys(context2 || {}).sort())
      return str1 === str2
    } catch (error) {
      console.warn('Failed to compare encryption contexts:', (error as Error).message)
      return false
    }
  }

  /**
   * Evict oldest cache entry
   */
  private evictOldestCacheEntry(): void {
    let oldestKey: string | null = null
    let oldestTimestamp = Date.now()

    // Use Array.from to convert Map iterator for compatibility with different TypeScript target versions
    const entries = Array.from(this.dataKeyCache.entries())
    for (const [key, entry] of entries) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp
        oldestKey = key
      }
    }

    if (oldestKey) {
      const entry = this.dataKeyCache.get(oldestKey)
      if (entry) {
        // Securely clear key memory
        entry.plaintextDataKey.fill(0)
      }
      this.dataKeyCache.delete(oldestKey)
      console.log('Evicted oldest cache entry')
    }
  }

  /**
   * Get cache statistics
   * @returns Cache statistics
   */
  getCacheStats(): CacheStats {
    const hitRate = this.cacheStats.totalRequests > 0 ? (this.cacheStats.cacheHits / this.cacheStats.totalRequests) * 100 : 0

    return {
      totalRequests: this.cacheStats.totalRequests,
      cacheHits: this.cacheStats.cacheHits,
      cacheMisses: this.cacheStats.cacheMisses,
      hitRate: Number(hitRate.toFixed(2))
    }
  }

  /**
   * Clear cache
   * @param clearStats - Whether to also clear statistics
   */
  clearCache(clearStats: boolean = false): void {
    // Securely clear all cached keys
    // Use Array.from to convert Map iterator for compatibility with different TypeScript target versions
    const entries = Array.from(this.dataKeyCache.values())
    for (const entry of entries) {
      entry.plaintextDataKey.fill(0)
    }

    this.dataKeyCache.clear()

    if (clearStats) {
      this.cacheStats = {
        totalRequests: 0,
        cacheHits: 0,
        cacheMisses: 0
      }
    }

    console.log('Data key cache cleared')
  }
}

export default ClientSideCrypto
export { ClientSideCrypto }
export type { EncryptionResult, ClientStatus, DataKeyCache, CacheStats }
