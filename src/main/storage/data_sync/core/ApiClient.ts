import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import { Agent as HttpAgent } from 'http'
import { Agent as HttpsAgent } from 'https'
import { syncConfig } from '../config/sync.config'
import { BackupInitResponse, GetChangesResponse, SyncRequest, SyncResponse } from '../models/SyncTypes'
import { logger } from '../utils/logger'
import { gzipSync } from 'zlib'
import { withRetry } from '../services/RetryManager'

export class ApiClient {
  private client: AxiosInstance
  private token: string | null = null
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

    this.client.interceptors.request.use((config) => {
      // 直接就地修改，避免整体覆盖 headers
      if (!config.headers) config.headers = {} as any
      if (this.token) {
        try {
          ;(config.headers as any).set?.('Authorization', `Bearer ${this.token}`)
        } catch {}
        ;(config.headers as any)['Authorization'] = `Bearer ${this.token}`
      }
      try {
        ;(config.headers as any).set?.('X-Device-ID', syncConfig.deviceId)
      } catch {}
      ;(config.headers as any)['X-Device-ID'] = syncConfig.deviceId
      return config
    })
  }

  async login(username: string, password: string): Promise<{ user_id: string; device_id: string; token: string }> {
    const res = await withRetry(
      async () => {
        return await this.client.post('/auth/login', {
          username,
          password,
          device_id: syncConfig.deviceId,
          device_name: 'Sync Client',
          platform: process.platform
        })
      },
      { maxAttempts: 3 },
      'login'
    )

    const data = res.data as { token: string; user_id: string; device_id: string }
    this.token = data.token
    logger.info('登录成功')
    return { user_id: data.user_id, device_id: data.device_id, token: data.token }
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
}
