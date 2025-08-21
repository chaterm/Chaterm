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
 * API客户端 - 使用axios与KMS服务端通信
 *
 * 安全原则：
 * 1. 使用axios拦截器统一处理认证Token
 * 2. 自动处理401未授权错误
 * 3. 请求超时保护
 */
class ApiClient {
  private client: AxiosInstance
  private serverUrl?: string
  private retryManager: RetryManager

  constructor(serverUrl?: string) {
    this.serverUrl = serverUrl || config.serverUrl

    // 创建axios实例
    this.client = axios.create({
      baseURL: this.serverUrl,
      timeout: config.timeout.apiRequest
    })

    // 初始化重试管理器，针对KMS服务的特殊配置
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
   * 设置请求和响应拦截器
   */
  private setupInterceptors(): void {
    // 请求拦截器：自动附加Authorization头
    this.client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        // 使用统一的认证适配器获取token
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
        console.error('KMS请求拦截器错误:', error)
        return Promise.reject(error)
      }
    )

    // 响应拦截器：处理全局错误，特别是401
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        return response.data
      },
      async (error) => {
        if (error.response && error.response.status === 401) {
          console.warn('KMS认证失败 (401)，清除认证信息')
          // 使用统一的认证适配器清除认证信息
          chatermAuthAdapter.clearAuthInfo()
        }
        const errorMessage = error.response?.data?.error || error.message
        return Promise.reject(new Error(errorMessage))
      }
    )
  }

  /**
   * 生成数据密钥
   * @param request - 生成数据密钥请求
   * @returns 生成数据密钥响应
   */
  async generateDataKey(request: GenerateDataKeyRequest): Promise<GenerateDataKeyResponse> {
    try {
      const result = await this.retryManager.executeWithRetry(async () => {
        const requestData = {
          encryptionContext: request.encryptionContext
        }
        // 如果提供了authToken，使用它覆盖默认的token
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
      // 只输出基础错误信息，避免详细堆栈
      const errorMessage = (error as Error).message
      console.warn('数据密钥生成失败:', errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * 解密数据密钥
   * @param request - 解密数据密钥请求
   * @returns 解密数据密钥响应
   */
  async decryptDataKey(request: DecryptDataKeyRequest): Promise<DecryptDataKeyResponse> {
    try {
      const result = await this.retryManager.executeWithRetry(async () => {
        const requestData = {
          encryptedDataKey: request.encryptedDataKey,
          encryptionContext: request.encryptionContext
        }

        // 如果提供了authToken，使用它覆盖默认的token
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
      // 简化错误日志输出
      const errorMessage = (error as Error).message
      console.warn('数据密钥解密失败:', errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * 健康检查
   * @returns 健康状态
   */
  async healthCheck(): Promise<any> {
    try {
      console.log('执行健康检查...')
      const result = await this.retryManager.executeWithRetry(async () => {
        return await this.client.get('/kms/health')
      }, 'healthCheck')

      if (result.success) {
        console.log('健康检查通过')
        return result.result
      } else {
        throw result.error
      }
    } catch (error) {
      console.error('健康检查失败:', error)
      throw error
    }
  }

  /**
   * 轮换主密钥
   * @returns 轮换结果
   */
  async rotateMasterKey(): Promise<any> {
    try {
      console.log('请求轮换主密钥...')
      const response = await this.client.post('/kms/rotate-master-key')
      console.log('主密钥轮换成功')
      return response
    } catch (error) {
      console.error('主密钥轮换失败:', error)
      throw error
    }
  }

  /**
   * 获取KMS统计信息
   * @returns 统计信息
   */
  async getStats(): Promise<any> {
    try {
      console.log('获取KMS统计信息...')
      const response = await this.client.get('/kms/stats')
      console.log('获取统计信息成功')
      return response
    } catch (error) {
      console.error('获取统计信息失败:', error)
      throw error
    }
  }

  /**
   * 验证数据密钥
   * @param encryptedDataKey - 加密的数据密钥
   * @param encryptionContext - 加密上下文
   * @returns 验证结果
   */
  async validateDataKey(encryptedDataKey: string, encryptionContext: any): Promise<any> {
    try {
      console.log('验证数据密钥...')
      const response = await this.client.post('/kms/validate-data-key', {
        encryptedDataKey,
        encryptionContext
      })
      console.log('数据密钥验证成功')
      return response
    } catch (error) {
      console.error('数据密钥验证失败:', error)
      throw error
    }
  }

  /**
   *  撤销数据密钥
   * @param keyFingerprint - 密钥指纹
   * @returns 撤销结果
   */
  async revokeDataKey(keyFingerprint: string): Promise<any> {
    try {
      console.log(' 撤销数据密钥...')
      const response = await this.client.post('/kms/revoke-data-key', {
        keyFingerprint
      })
      console.log('数据密钥撤销成功')
      return response
    } catch (error) {
      console.error('数据密钥撤销失败:', error)
      throw error
    }
  }

  /**
   * 记录审计日志
   * @param action - 操作类型
   * @param details - 操作详情
   * @returns 记录结果
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
      console.error('记录审计日志失败:', error)
      // 审计日志失败不应该影响主要功能
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * 更新服务器URL
   * @param newUrl - 新的服务器URL
   */
  updateServerUrl(newUrl: string): void {
    this.serverUrl = newUrl
    this.client.defaults.baseURL = newUrl
    console.log(`API服务器URL已更新为: ${newUrl}`)
  }

  /**
   * 获取客户端状态
   * @returns 客户端状态
   */
  getStatus(): any {
    return {
      serverUrl: this.serverUrl,
      timeout: config.timeout.apiRequest,
      retryConfig: this.retryManager.getConfig(),
      connected: true // 这里可以添加连接状态检查
    }
  }

  /**
   * 检查连接状态
   * @returns 连接状态
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
