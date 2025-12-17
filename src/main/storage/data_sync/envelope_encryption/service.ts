/**
 * Envelope Encryption Service
 * Provides unified encryption/decryption interface, registered for use in main process
 */

import type { EncryptionResult } from './clientSideCrypto'

// Dynamically load modules at runtime
let ClientSideCrypto: any
let chatermAuthAdapter: any
let config: any

async function loadModules() {
  try {
    // Import TypeScript modules
    const configModule = await import('./config')
    config = configModule.default

    const authModule = await import('./services/auth')
    chatermAuthAdapter = authModule.chatermAuthAdapter

    const cryptoModule = await import('./clientSideCrypto')
    ClientSideCrypto = cryptoModule.default || cryptoModule.ClientSideCrypto
  } catch (error) {
    console.error('Failed to load modules:', error)
    throw new Error('Unable to load encryption modules')
  }
}

export interface EncryptionServiceStatus {
  initialized: boolean
  userId: string | null
  keyFingerprint: string | null
  serverUrl: string
  authStatus: any
}

export class EnvelopeEncryptionService {
  private _clientCrypto: any = null
  private isInitialized: boolean = false
  private currentUserId: string | null = null
  private initializationFailed: boolean = false
  private lastInitError: string | null = null
  private modulesLoaded: boolean = false
  private serverUrl?: string
  private isInitializing: boolean = false
  private initializationPromise: Promise<{ success: boolean; message: string }> | null = null

  constructor(serverUrl?: string) {
    // Save server URL, initialize after modules are loaded
    this.serverUrl = serverUrl

    // Load modules asynchronously
    this.initializeModules()
  }

  private async initializeModules() {
    try {
      await loadModules()

      // Use default KMS server URL or get from config
      const kmsServerUrl = this.serverUrl || config?.serverUrl
      if (!kmsServerUrl) {
        console.warn('KMS server URL not configured, encryption will be unavailable')
        this.modulesLoaded = true
        this.initializationFailed = true
        this.lastInitError = 'KMS server URL not configured'
        return
      }

      this._clientCrypto = new ClientSideCrypto(kmsServerUrl)
      this.modulesLoaded = true
    } catch (error) {
      console.error('Failed to initialize encryption service modules:', error)
      this.initializationFailed = true
      this.lastInitError = (error as Error).message
    }
  }

  /**
   * Wait for modules to finish loading
   */
  private async waitForModules(): Promise<void> {
    if (!this.modulesLoaded) {
      console.log('Waiting for encryption modules to finish loading...')
      let attempts = 0
      const maxAttempts = 50 // Wait up to 5 seconds

      while (!this.modulesLoaded && attempts < maxAttempts) {
        if (this.initializationFailed) {
          throw new Error(`Module loading failed: ${this.lastInitError}`)
        }
        await new Promise((resolve) => setTimeout(resolve, 100))
        attempts++
      }

      if (!this.modulesLoaded) {
        throw new Error('Module loading timeout')
      }
    }
  }

  /**
   * Simplified initialization of encryption service
   * @param userId User ID, if not provided will be obtained from auth adapter
   * @param silent Whether to initialize silently (without throwing errors)
   */
  async initialize(userId?: string, silent: boolean = false): Promise<{ success: boolean; message: string }> {
    try {
      // Wait for modules to finish loading
      await this.waitForModules()

      // Check if client encryption is available
      if (!this._clientCrypto) {
        throw new Error('Encryption client unavailable, please check KMS server configuration')
      }

      // Get user ID
      const targetUserId = userId || (await chatermAuthAdapter.getCurrentUserId())
      if (!targetUserId) {
        throw new Error('Unable to get user ID')
      }

      // Get authentication token
      const authToken = await chatermAuthAdapter.getAuthToken()

      // Force key rotation: clear old key data on each startup
      await this.clearStoredKeys(targetUserId)

      // Initialize client encryption
      await this._clientCrypto.initialize(targetUserId, authToken)

      // Initialization successful
      this.isInitialized = true
      this.currentUserId = targetUserId
      this.initializationFailed = false
      this.lastInitError = null

      return { success: true, message: 'Encryption service initialized successfully' }
    } catch (error) {
      const errorMessage = (error as Error).message

      // Get user ID (save even if initialization fails, for retry purposes)
      const targetUserId = userId || (await chatermAuthAdapter.getCurrentUserId().catch(() => null))

      // Record failure status
      this.isInitialized = false
      this.initializationFailed = true
      this.lastInitError = errorMessage
      this.currentUserId = targetUserId // Save user ID for retry

      if (silent) {
        // Silent mode: only log brief information
        console.warn('Encryption service initialization failed:', errorMessage)
        return { success: false, message: errorMessage }
      } else {
        // Non-silent mode: throw error, but don't duplicate detailed logs
        throw new Error(`Initialization failed: ${errorMessage}`)
      }
    }
  }

  /**
   * Smart encryption method (supports waiting for background initialization)
   * @param plaintext Plaintext data to encrypt
   * @returns Encryption result
   */
  async encrypt(plaintext: string): Promise<EncryptionResult> {
    // Check data validity
    if (!plaintext || typeof plaintext !== 'string') {
      throw new Error('Invalid plaintext data')
    }

    // Wait for modules to finish loading
    await this.waitForModules()

    // Check if service is initialized
    if (!this.isInitialized) {
      // If background initialization is in progress, wait a bit
      if (this.isInitializing) {
        console.log('Waiting for background initialization to complete...')
        const waitResult = await this.waitForBackgroundInit(3000) // Wait up to 3 seconds
        if (!waitResult) {
          console.warn('Background initialization timeout, attempting quick re-initialization')
        }
      }

      // If still not initialized, attempt quick re-initialization
      if (!this.isInitialized && this.currentUserId) {
        console.log('Attempting quick re-initialization of encryption service...')
        try {
          const result = await this.initialize(this.currentUserId, true)
          if (!result.success) {
            throw new Error(`Re-initialization failed: ${result.message}`)
          }
        } catch (error) {
          throw new Error(`Encryption service unavailable: ${(error as Error).message}`)
        }
      } else if (!this.isInitialized) {
        throw new Error(`Encryption service not initialized: ${this.lastInitError || 'Please initialize encryption service first'}`)
      }
    }

    const result = await this._clientCrypto.encryptData(plaintext)
    return result as EncryptionResult
  }

  /**
   * Smart decryption method (supports waiting for background initialization)
   * @param encryptedData Encrypted data object
   * @returns Decrypted plaintext
   */
  async decrypt(encryptedData: any): Promise<string> {
    // Check data validity
    if (!encryptedData || typeof encryptedData !== 'object') {
      console.error('Invalid encrypted data')
      throw new Error('Invalid encrypted data')
    }

    // Check if service is initialized
    if (!this.isInitialized) {
      console.log('Service not initialized, attempting initialization...')
      // If background initialization is in progress, wait a bit
      if (this.isInitializing) {
        console.log('Waiting for background initialization to complete...')
        const waitResult = await this.waitForBackgroundInit(3000) // Wait up to 3 seconds
        if (!waitResult) {
          console.warn('Background initialization timeout, attempting quick re-initialization')
        }
      }

      // If still not initialized, attempt quick re-initialization
      if (!this.isInitialized && this.currentUserId) {
        console.log('Attempting quick re-initialization of encryption service...')
        try {
          const result = await this.initialize(this.currentUserId, true)
          if (!result.success) {
            throw new Error(`Re-initialization failed: ${result.message}`)
          }
        } catch (error) {
          throw new Error(`Encryption service unavailable: ${(error as Error).message}`)
        }
      } else if (!this.isInitialized) {
        throw new Error(`Encryption service not initialized: ${this.lastInitError || 'Please initialize encryption service first'}`)
      }
    }

    const result = await this._clientCrypto.decryptData(encryptedData)
    return result
  }

  /**
   * Rotate data key
   */
  async rotateDataKey(): Promise<{ success: boolean; message: string }> {
    if (!this.isInitialized) {
      throw new Error('Encryption service not initialized')
    }

    try {
      await this._clientCrypto.rotateDataKey()
      return { success: true, message: 'Key rotation successful' }
    } catch (error) {
      console.error('Key rotation failed:', error)
      return { success: false, message: `Key rotation failed: ${(error as Error).message}` }
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<any> {
    try {
      const health = await this._clientCrypto.healthCheck()
      const authStatus = chatermAuthAdapter.getAuthStatus()

      return {
        ...health,
        authAdapter: authStatus,
        service: {
          initialized: this.isInitialized,
          userId: this.currentUserId
        }
      }
    } catch (error) {
      console.error('Health check failed:', error)
      return {
        service: {
          status: 'error',
          error: (error as Error).message,
          initialized: this.isInitialized,
          userId: this.currentUserId
        }
      }
    }
  }

  /**
   * Get service status
   */
  getStatus(): EncryptionServiceStatus {
    const clientStatus = this._clientCrypto?.getStatus() || {}
    const authStatus = chatermAuthAdapter.getAuthStatus()

    return {
      initialized: this.isInitialized,
      userId: this.currentUserId,
      keyFingerprint: clientStatus.keyFingerprint || null,
      serverUrl: clientStatus.serverUrl || 'unknown',
      authStatus
    }
  }

  /**
   * Get client encryption instance (for accessing cache and other advanced features)
   * @returns Client encryption instance
   */
  get clientCrypto(): any {
    return this._clientCrypto
  }

  /**
   * Get cache statistics
   * @returns Cache statistics, returns null if client is not initialized
   */
  getCacheStats(): any {
    if (this._clientCrypto && typeof this._clientCrypto.getCacheStats === 'function') {
      return this._clientCrypto.getCacheStats()
    }
    return null
  }

  /**
   * Clear cache
   * @param clearStats - Whether to also clear statistics
   */
  clearCache(clearStats: boolean = false): void {
    if (this._clientCrypto && typeof this._clientCrypto.clearCache === 'function') {
      this._clientCrypto.clearCache(clearStats)
    }
  }

  /**
   * Cleanup service
   * @param clearStorage Whether to clear storage
   */
  cleanup(clearStorage: boolean = false): { success: boolean; message: string } {
    try {
      if (this._clientCrypto) {
        this._clientCrypto.cleanup(clearStorage)
      }

      this.isInitialized = false
      this.currentUserId = null

      if (clearStorage) {
        chatermAuthAdapter.clearAuthInfo()
      }

      console.log('Encryption service cleanup completed')
      return { success: true, message: 'Service cleanup completed' }
    } catch (error) {
      console.error('Service cleanup failed:', error)
      return { success: false, message: `Cleanup failed: ${(error as Error).message}` }
    }
  }

  /**
   * Clear stored key data
   * @param userId User ID
   */
  private async clearStoredKeys(userId: string): Promise<void> {
    try {
      // Import storage manager
      const { StorageManager } = await import('./utils/storage')
      const storage = new StorageManager()

      // Clear all stored data (including encrypted data keys and session information)
      await storage.cleanup(userId)
    } catch (error) {
      console.warn('Error clearing stored keys:', error)
      // Don't throw error, allow initialization to continue
    }
  }

  /**
   * Set authentication information (for initialization)
   */
  setAuthInfo(token: string, userId: string, expiry?: number): void {
    chatermAuthAdapter.setAuthInfo(token, userId, expiry)
  }

  /**
   * Background asynchronous initialization (non-blocking main thread)
   * @param userId User ID
   * @param timeout Timeout in milliseconds, default 10 seconds
   */
  async initializeInBackground(userId?: string, timeout: number = 10000): Promise<void> {
    // Prevent duplicate initialization
    if (this.isInitializing) {
      console.log('Encryption service is initializing in background, skipping duplicate request')
      return
    }

    if (this.isInitialized) {
      console.log('Encryption service already initialized, skipping background initialization')
      return
    }

    this.isInitializing = true

    // Create initialization Promise with timeout
    this.initializationPromise = Promise.race([
      this.initialize(userId, true),
      new Promise<{ success: boolean; message: string }>((_, reject) =>
        setTimeout(() => reject(new Error('Background initialization timeout')), timeout)
      )
    ]).finally(() => {
      this.isInitializing = false
      this.initializationPromise = null
    })

    try {
      const result = await this.initializationPromise
      if (!result.success) {
        console.warn('Background encryption service initialization failed:', result.message)
      }
    } catch (error) {
      console.warn('Background encryption service initialization timeout:', (error as Error).message)
    }
  }

  /**
   * Wait for background initialization to complete (if in progress)
   * @param maxWait Maximum wait time in milliseconds, default 5 seconds
   */
  async waitForBackgroundInit(maxWait: number = 5000): Promise<boolean> {
    if (this.isInitialized) {
      return true
    }

    if (!this.isInitializing || !this.initializationPromise) {
      return false
    }

    try {
      const result = await Promise.race([
        this.initializationPromise,
        new Promise<{ success: boolean; message: string }>((_, reject) => setTimeout(() => reject(new Error('Wait timeout')), maxWait))
      ])
      return result.success
    } catch (error) {
      console.warn('Waiting for background initialization timeout:', (error as Error).message)
      return false
    }
  }
}

// Export singleton instance - don't pass serverUrl, let service get it from config
export const envelopeEncryptionService = new EnvelopeEncryptionService()
