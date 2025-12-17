import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { Agent as HttpAgent } from 'http'
import { Agent as HttpsAgent } from 'https'
import { syncConfig } from '../config/sync.config'
import { BackupInitResponse, GetChangesResponse, SyncResponse, FullSyncSessionResponse, FullSyncBatchResponse } from '../models/SyncTypes'
import { logger } from '../utils/logger'
import { gzipSync } from 'zlib'
import { chatermAuthAdapter } from '../envelope_encryption/services/auth'

export class ApiClient {
  private client: AxiosInstance
  private httpAgent: HttpAgent
  private httpsAgent: HttpsAgent

  constructor() {
    // Create connection pool agent with Keep-Alive enabled
    this.httpAgent = new HttpAgent({
      keepAlive: true,
      keepAliveMsecs: 30000, // 30 seconds
      maxSockets: 10, // Maximum number of connections
      maxFreeSockets: 5, // Maximum number of free connections
      timeout: 60000 // Connection timeout
    })

    this.httpsAgent = new HttpsAgent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 10,
      maxFreeSockets: 5,
      timeout: 60000
    })

    this.client = axios.create({
      baseURL: `${syncConfig.serverUrl}/${syncConfig.apiVersion}`,
      timeout: 15000,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      // Enable request compression
      decompress: true,
      headers: {
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive'
      }
    })

    this.client.interceptors.request.use(
      async (config) => {
        // Modify in place to avoid overwriting headers entirely
        if (!config.headers) config.headers = {} as any

        // Get token using unified auth adapter
        const token = await chatermAuthAdapter.getAuthToken()
        if (token) {
          try {
            ;(config.headers as any).set?.('Authorization', `Bearer ${token}`)
          } catch {}
          ;(config.headers as any)['Authorization'] = `Bearer ${token}`
        }

        try {
          ;(config.headers as any).set?.('X-Device-ID', syncConfig.deviceId)
        } catch {}
        ;(config.headers as any)['X-Device-ID'] = syncConfig.deviceId

        return config
      },
      (error) => {
        logger.error('Request interceptor error:', error)
        return Promise.reject(error)
      }
    )

    // Response interceptor: unified handling of response format and 401 auth failures
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        // Adapt to new unified response format: {code, data: {...}, ts}
        if (response.data && typeof response.data === 'object' && 'code' in response.data && 'data' in response.data) {
          // Check the code returned by backend
          if (response.data.code >= 200 && response.data.code < 300) {
            // Success response, return actual business data
            response.data = response.data.data
          } else {
            // Business error, throw exception
            const errorMessage = response.data.data?.message || `Request failed (${response.data.code})`
            throw new Error(errorMessage)
          }
        }
        return response
      },
      async (error) => {
        if (error.response && error.response.status === 401) {
          logger.warn('Authentication failed (401), clearing auth info')
          chatermAuthAdapter.clearAuthInfo()
          // Can trigger re-login logic or notify upper layer here
        }

        // Check if it's a network connection error
        if (this.isNetworkError(error)) {
          // Create a special network error with identification information
          const networkError = new Error('NETWORK_UNAVAILABLE')
          ;(networkError as any).isNetworkError = true
          ;(networkError as any).originalError = error
          return Promise.reject(networkError)
        }

        // Adapt to new error response format
        let errorMessage = error.message
        if (error.response?.data) {
          const responseData = error.response.data
          if (responseData.data?.message) {
            errorMessage = responseData.data.message
          } else if (responseData.message) {
            errorMessage = responseData.message
          } else if (responseData.error) {
            errorMessage = responseData.error
          }
        }

        return Promise.reject(new Error(errorMessage))
      }
    )
  }

  /**
   * Check if it's a network connection error
   */
  private isNetworkError(error: any): boolean {
    // Check common network connection errors
    if (error.code) {
      const networkErrorCodes = [
        'ECONNREFUSED', // Connection refused
        'ENOTFOUND', // DNS lookup failed
        'ECONNRESET', // Connection reset
        'ETIMEDOUT', // Connection timeout
        'ECONNABORTED', // Connection aborted
        'ENETUNREACH', // Network unreachable
        'EHOSTUNREACH' // Host unreachable
      ]
      if (networkErrorCodes.includes(error.code)) {
        return true
      }
    }

    // Check axios-specific network errors
    if (error.message) {
      const networkMessages = ['Network Error', 'connect ECONNREFUSED', 'getaddrinfo ENOTFOUND', 'timeout', 'Request failed']
      if (networkMessages.some((msg) => error.message.includes(msg))) {
        return true
      }
    }

    // Check if there's no response (usually indicates network issue)
    if (!error.response && error.request) {
      return true
    }

    return false
  }

  async backupInit(): Promise<BackupInitResponse> {
    const payload = { device_id: syncConfig.deviceId }
    const res = await this.client.post('/sync/backup-init', payload)
    return res.data as BackupInitResponse
  }

  async fullSync(tableName: string): Promise<SyncResponse> {
    const payload = {
      table_name: tableName,
      device_id: syncConfig.deviceId
    }
    const res = await this.client.post('/sync/full-sync', payload)
    return res.data as SyncResponse
  }

  async incrementalSync(tableName: string, data: any[]): Promise<SyncResponse> {
    const payload = {
      table_name: tableName,
      data,
      device_id: syncConfig.deviceId
    }

    const json = JSON.stringify(payload)
    // Enable gzip when request body is large and compression is enabled, simple threshold 1KB
    if (syncConfig.compressionEnabled && Buffer.byteLength(json, 'utf8') > 1024) {
      const gz = gzipSync(Buffer.from(json, 'utf8'))
      const res = await this.client.post('/sync/incremental-sync', gz, {
        headers: { 'Content-Encoding': 'gzip', 'Content-Type': 'application/json' }
      })
      return res.data as SyncResponse
    }
    const res = await this.client.post('/sync/incremental-sync', payload)
    return res.data as SyncResponse
  }

  async getChanges(since: number, limit = 100): Promise<GetChangesResponse> {
    const params = {
      since,
      limit,
      device_id: syncConfig.deviceId
    }
    const res = await this.client.get('/sync/changes', { params })
    return res.data as GetChangesResponse
  }

  /**
   * Start full sync session
   */
  async startFullSync(tableName: string, pageSize = 100): Promise<FullSyncSessionResponse> {
    const payload = {
      table_name: tableName,
      page_size: pageSize
    }
    const res = await this.client.post('/sync/full-sync/start', payload)
    return res.data as FullSyncSessionResponse
  }

  /**
   * Get batch data
   */
  async getFullSyncBatch(sessionId: string, page: number): Promise<FullSyncBatchResponse> {
    const payload = {
      session_id: sessionId,
      page: page
    }
    const res = await this.client.post('/sync/full-sync/batch', payload)
    return res.data as FullSyncBatchResponse
  }

  /**
   * Finish full sync session
   */
  async finishFullSync(sessionId: string): Promise<{ success: boolean; message: string }> {
    const res = await this.client.delete(`/sync/full-sync/finish/${sessionId}`)
    return res.data
  }

  /**
   * Clean up resources, close connection pool
   */
  destroy(): void {
    if (this.httpAgent) {
      this.httpAgent.destroy()
    }
    if (this.httpsAgent) {
      this.httpsAgent.destroy()
    }
  }

  /**
   * Generic GET request
   */
  async get(url: string, config?: AxiosRequestConfig): Promise<any> {
    const res = await this.client.get(url, config)
    return res.data
  }

  /**
   * Generic POST request
   */
  async post(url: string, data?: any, config?: AxiosRequestConfig): Promise<any> {
    const res = await this.client.post(url, data, config)
    return res.data
  }

  /**
   * Generic DELETE request
   */
  async delete(url: string, config?: AxiosRequestConfig): Promise<any> {
    const res = await this.client.delete(url, config)
    return res.data
  }

  /**
   * Get connection pool status
   */
  getConnectionStats(): { http: any; https: any } {
    return {
      http: {
        sockets: Object.keys(this.httpAgent.sockets).length,
        freeSockets: Object.keys(this.httpAgent.freeSockets).length,
        requests: Object.keys(this.httpAgent.requests).length
      },
      https: {
        sockets: Object.keys(this.httpsAgent.sockets).length,
        freeSockets: Object.keys(this.httpsAgent.freeSockets).length,
        requests: Object.keys(this.httpsAgent.requests).length
      }
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const authStatus = chatermAuthAdapter.getAuthStatus()
    return authStatus.hasToken && authStatus.isValid
  }

  async getCurrentUserId(): Promise<string | null> {
    return await chatermAuthAdapter.getCurrentUserId()
  }

  clearAuthInfo(): void {
    chatermAuthAdapter.clearAuthInfo()
  }

  getAuthStatus() {
    return chatermAuthAdapter.getAuthStatus()
  }

  /**
   * Get current authentication token
   */
  async getAuthToken(): Promise<string | null> {
    return await chatermAuthAdapter.getAuthToken()
  }
}
