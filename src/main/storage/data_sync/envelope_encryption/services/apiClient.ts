import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios'
import config from '../config'
import { chatermAuthAdapter } from './auth'
import { RetryManager } from '../../services/RetryManager'

interface GenerateDataKeyRequest {
  encryptionContext: any
  authToken?: string | null
}

interface GenerateDataKeyResponse {
  success: boolean
  plaintextDataKey?: string
  encryptedDataKey?: string
  keyId?: string
  expiresAt?: number
  encryptionContext?: any
  error?: string
}

interface DecryptDataKeyRequest {
  encryptedDataKey: string
  encryptionContext: any
  authToken?: string | null
}

interface DecryptDataKeyResponse {
  success: boolean
  plaintextDataKey?: string
  keyMetadata?: {
    originalUserId?: string
    originalSessionId?: string
    verified?: boolean
    foundPosition?: number
  }
  error?: string
}

/**
 * API client - communicates with KMS server using axios
 *
 * Security principles:
 * 1. Use axios interceptors to handle authentication tokens uniformly
 * 2. Automatically handle 401 unauthorized errors
 * 3. Request timeout protection
 */
class ApiClient {
  private client: AxiosInstance
  private serverUrl?: string
  private retryManager: RetryManager

  constructor(serverUrl?: string) {
    this.serverUrl = serverUrl || config.serverUrl

    // Create axios instance
    this.client = axios.create({
      baseURL: this.serverUrl,
      timeout: config.timeout.apiRequest
    })

    // Initialize retry manager with special configuration for KMS service
    this.retryManager = new RetryManager({
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      jitter: true,
      retryableErrors: ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'NETWORK_ERROR', 'TIMEOUT_ERROR', 'socket hang up']
    })

    this.setupInterceptors()
  }

  /**
   * Setup request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor: automatically attach Authorization header
    this.client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        // Use unified auth adapter to get token
        const token = await chatermAuthAdapter.getAuthToken()
        if (token) {
          if (!config.headers) {
            config.headers = {} as any
          }
          config.headers['Authorization'] = `Bearer ${token}`
        }
        return config
      },
      (error) => {
        console.error('KMS request interceptor error:', error)
        return Promise.reject(error)
      }
    )

    // Response interceptor: handle global errors, especially 401
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        return response.data
      },
      async (error) => {
        if (error.response && error.response.status === 401) {
          console.warn('KMS authentication failed (401), clearing auth info')
          // Use unified auth adapter to clear auth info
          chatermAuthAdapter.clearAuthInfo()
        }
        const errorMessage = error.response?.data?.error || error.message
        return Promise.reject(new Error(errorMessage))
      }
    )
  }

  /**
   * Generate data key
   * @param request - Generate data key request
   * @returns Generate data key response
   */
  async generateDataKey(request: GenerateDataKeyRequest): Promise<GenerateDataKeyResponse> {
    try {
      const result = await this.retryManager.executeWithRetry(async () => {
        const requestData = {
          encryptionContext: request.encryptionContext
        }
        // If authToken is provided, use it to override the default token
        const headers: any = {}
        if (request.authToken) {
          headers['Authorization'] = request.authToken.startsWith('Bearer ') ? request.authToken : `Bearer ${request.authToken}`
        }

        const response = await this.client.post('/kms/generate-data-key', requestData, {
          headers: Object.keys(headers).length > 0 ? headers : undefined
        })

        return response as unknown as GenerateDataKeyResponse
      }, 'generateDataKey')

      if (result.success) {
        return result.result!
      } else {
        return {
          success: false,
          error: result.error?.message || 'Unknown error'
        }
      }
    } catch (error) {
      // Only output basic error information, avoid detailed stack trace
      const errorMessage = (error as Error).message
      console.warn('Data key generation failed:', errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * Decrypt data key
   * @param request - Decrypt data key request
   * @returns Decrypt data key response
   */
  async decryptDataKey(request: DecryptDataKeyRequest): Promise<DecryptDataKeyResponse> {
    try {
      const result = await this.retryManager.executeWithRetry(async () => {
        const requestData = {
          encryptedDataKey: request.encryptedDataKey,
          encryptionContext: request.encryptionContext
        }

        // If authToken is provided, use it to override the default token
        const headers: any = {}
        if (request.authToken) {
          headers['Authorization'] = request.authToken.startsWith('Bearer ') ? request.authToken : `Bearer ${request.authToken}`
        }

        const response = await this.client.post('/kms/decrypt-data-key', requestData, {
          headers: Object.keys(headers).length > 0 ? headers : undefined
        })

        return response as unknown as DecryptDataKeyResponse
      }, 'decryptDataKey')

      if (result.success) {
        return result.result!
      } else {
        return {
          success: false,
          error: result.error?.message || 'Unknown error'
        }
      }
    } catch (error) {
      // Simplify error log output
      const errorMessage = (error as Error).message
      console.warn('Data key decryption failed:', errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * Health check
   * @returns Health status
   */
  async healthCheck(): Promise<any> {
    try {
      console.log('Executing health check...')
      const result = await this.retryManager.executeWithRetry(async () => {
        return await this.client.get('/kms/health')
      }, 'healthCheck')

      if (result.success) {
        console.log('Health check passed')
        return result.result
      } else {
        throw result.error
      }
    } catch (error) {
      console.error('Health check failed:', error)
      throw error
    }
  }

  /**
   * Rotate master key
   * @returns Rotation result
   */
  async rotateMasterKey(): Promise<any> {
    try {
      console.log('Requesting master key rotation...')
      const response = await this.client.post('/kms/rotate-master-key')
      console.log('Master key rotation successful')
      return response
    } catch (error) {
      console.error('Master key rotation failed:', error)
      throw error
    }
  }

  /**
   * Get KMS statistics
   * @returns Statistics information
   */
  async getStats(): Promise<any> {
    try {
      console.log('Fetching KMS statistics...')
      const response = await this.client.get('/kms/stats')
      console.log('Statistics fetched successfully')
      return response
    } catch (error) {
      console.error('Failed to fetch statistics:', error)
      throw error
    }
  }

  /**
   * Validate data key
   * @param encryptedDataKey - Encrypted data key
   * @param encryptionContext - Encryption context
   * @returns Validation result
   */
  async validateDataKey(encryptedDataKey: string, encryptionContext: any): Promise<any> {
    try {
      console.log('Validating data key...')
      const response = await this.client.post('/kms/validate-data-key', {
        encryptedDataKey,
        encryptionContext
      })
      console.log('Data key validation successful')
      return response
    } catch (error) {
      console.error('Data key validation failed:', error)
      throw error
    }
  }

  /**
   * Revoke data key
   * @param keyFingerprint - Key fingerprint
   * @returns Revocation result
   */
  async revokeDataKey(keyFingerprint: string): Promise<any> {
    try {
      console.log('Revoking data key...')
      const response = await this.client.post('/kms/revoke-data-key', {
        keyFingerprint
      })
      console.log('Data key revoked successfully')
      return response
    } catch (error) {
      console.error('Data key revocation failed:', error)
      throw error
    }
  }

  /**
   * Log audit event
   * @param action - Action type
   * @param details - Action details
   * @returns Logging result
   */
  async logAudit(action: string, details: any): Promise<any> {
    try {
      const response = await this.client.post('/kms/audit-log', {
        action,
        details,
        timestamp: Date.now()
      })
      return response
    } catch (error) {
      console.error('Failed to log audit event:', error)
      // Audit log failure should not affect main functionality
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * Update server URL
   * @param newUrl - New server URL
   */
  updateServerUrl(newUrl: string): void {
    this.serverUrl = newUrl
    this.client.defaults.baseURL = newUrl
    console.log(`API server URL updated to: ${newUrl}`)
  }

  /**
   * Get client status
   * @returns Client status
   */
  getStatus(): any {
    return {
      serverUrl: this.serverUrl,
      timeout: config.timeout.apiRequest,
      retryConfig: this.retryManager.getConfig(),
      connected: true // Connection status check can be added here
    }
  }

  /**
   * Check connection status
   * @returns Connection status
   */
  async checkConnection(): Promise<{ connected: boolean; latency?: number; error?: string }> {
    const startTime = Date.now()
    try {
      await this.healthCheck()
      const latency = Date.now() - startTime
      return { connected: true, latency }
    } catch (error) {
      return {
        connected: false,
        error: (error as Error).message
      }
    }
  }
}

export default ApiClient
export { ApiClient }
export type { GenerateDataKeyRequest, GenerateDataKeyResponse, DecryptDataKeyRequest, DecryptDataKeyResponse }
