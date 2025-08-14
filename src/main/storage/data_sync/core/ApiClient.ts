import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { Agent as HttpAgent } from 'http'
import { Agent as HttpsAgent } from 'https'
import { syncConfig } from '../config/sync.config'
import { BackupInitResponse, GetChangesResponse, SyncRequest, SyncResponse } from '../models/SyncTypes'
import { logger } from '../utils/logger'
import { gzipSync } from 'zlib'
import { chatermAuthAdapter } from '../envelope_encryption/services/auth'

export class ApiClient {
  private client: AxiosInstance
  private httpAgent: HttpAgent
  private httpsAgent: HttpsAgent

  constructor() {
    // 创建连接池代理，启用Keep-Alive
    this.httpAgent = new HttpAgent({
      keepAlive: true,
      keepAliveMsecs: 30000, // 30秒
      maxSockets: 10, // 最大连接数
      maxFreeSockets: 5, // 最大空闲连接数
      timeout: 60000 // 连接超时
    })

    this.httpsAgent = new HttpsAgent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 10,
      maxFreeSockets: 5,
      timeout: 60000
    })

    this.client = axios.create({
      baseURL: `${syncConfig.serverUrl}/api/${syncConfig.apiVersion}`,
      timeout: 15000,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      // 启用请求压缩
      decompress: true,
      headers: {
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive'
      }
    })

    this.client.interceptors.request.use(
      async (config) => {
        // 直接就地修改，避免整体覆盖 headers
        if (!config.headers) config.headers = {} as any

        // 🔧 使用统一的认证适配器获取token
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
        logger.error('请求拦截器错误:', error)
        return Promise.reject(error)
      }
    )

    // 响应拦截器：统一处理401认证失败
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        return response
      },
      async (error) => {
        if (error.response && error.response.status === 401) {
          logger.warn('认证失败 (401)，清除认证信息')
          chatermAuthAdapter.clearAuthInfo()
          // 可以在这里触发重新登录逻辑或通知上层
        }
        const errorMessage = error.response?.data?.error || error.message
        return Promise.reject(new Error(errorMessage))
      }
    )
  }

  async backupInit(): Promise<BackupInitResponse> {
    const res = await this.client.post('/sync/backup-init', {})
    return res.data as BackupInitResponse
  }

  async fullSync(tableName: string): Promise<SyncResponse> {
    const payload: SyncRequest = { table_name: tableName }
    const res = await this.client.post('/sync/full-sync', payload)
    return res.data as SyncResponse
  }

  async incrementalSync(tableName: string, data: any[]): Promise<SyncResponse> {
    const payload: SyncRequest & { data: any[] } = { table_name: tableName, data }
    const json = JSON.stringify(payload)
    // 当请求体较大且启用压缩时启用 gzip，简单阈值 1KB
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
    const res = await this.client.get('/sync/changes', { params: { since, limit } })
    return res.data as GetChangesResponse
  }

  /**
   * 清理资源，关闭连接池
   */
  destroy(): void {
    if (this.httpAgent) {
      this.httpAgent.destroy()
    }
    if (this.httpsAgent) {
      this.httpsAgent.destroy()
    }
    logger.info('API客户端资源已清理')
  }

  /**
   * 通用 GET 请求
   */
  async get(url: string, config?: AxiosRequestConfig): Promise<any> {
    const res = await this.client.get(url, config)
    return res.data
  }

  /**
   * 通用 POST 请求
   */
  async post(url: string, data?: any, config?: AxiosRequestConfig): Promise<any> {
    const res = await this.client.post(url, data, config)
    return res.data
  }

  /**
   * 通用 DELETE 请求
   */
  async delete(url: string, config?: AxiosRequestConfig): Promise<any> {
    const res = await this.client.delete(url, config)
    return res.data
  }

  /**
   * 获取连接池状态
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
    logger.info('已清除认证信息')
  }

  getAuthStatus() {
    return chatermAuthAdapter.getAuthStatus()
  }

  /**
   * 🔧 获取当前认证令牌
   */
  async getAuthToken(): Promise<string | null> {
    return await chatermAuthAdapter.getAuthToken()
  }
}
