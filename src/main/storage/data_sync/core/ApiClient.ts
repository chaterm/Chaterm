import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { Agent as HttpAgent } from 'http'
import { Agent as HttpsAgent } from 'https'
import { syncConfig } from '../config/sync.config'
import {
  BackupInitResponse,
  GetChangesResponse,
  SyncRequest,
  SyncResponse,
  FullSyncSessionResponse,
  FullSyncBatchResponse
} from '../models/SyncTypes'
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

    // 响应拦截器：统一处理响应格式和401认证失败
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        // 适配新的统一响应格式: {code, data: {...}, ts}
        if (response.data && typeof response.data === 'object' && 'code' in response.data && 'data' in response.data) {
          // 检查后端返回的code
          if (response.data.code >= 200 && response.data.code < 300) {
            // 成功响应，返回实际业务数据
            response.data = response.data.data
          } else {
            // 业务错误，抛出异常
            const errorMessage = response.data.data?.message || `请求失败 (${response.data.code})`
            throw new Error(errorMessage)
          }
        }
        return response
      },
      async (error) => {
        if (error.response && error.response.status === 401) {
          logger.warn('认证失败 (401)，清除认证信息')
          chatermAuthAdapter.clearAuthInfo()
          // 可以在这里触发重新登录逻辑或通知上层
        }

        // 适配新的错误响应格式
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

    // 🔍 添加详细的上传数据日志
    logger.info('==== 增量同步上传数据详情 ====')
    logger.info('表名:', tableName)
    logger.info('数据条数:', data.length)
    logger.info('设备ID:', syncConfig.deviceId)
    logger.info('📝 原始数据样本 (前3条) - 后端已支持原始格式:')
    data.slice(0, 3).forEach((item, index) => {
      logger.info(`  [${index}] 关键字段检查:`)
      logger.info(`    uuid: "${item.uuid}" (${typeof item.uuid})`)
      logger.info(`    favorite: ${item.favorite} (${typeof item.favorite}) - 后端支持int32`)
      logger.info(`    key_chain_id: ${item.key_chain_id} (${typeof item.key_chain_id}) - 后端支持null→int32`)
      logger.info(`    asset_type: "${item.asset_type}" (${typeof item.asset_type}) - 后端新增支持`)
      logger.info(`    port: ${item.port} (${typeof item.port})`)
      logger.info(`  完整数据:`, JSON.stringify(item, null, 2))
    })
    logger.info('==== 数据日志结束 ====')

    const json = JSON.stringify(payload)
    // 当请求体较大且启用压缩时启用 gzip，简单阈值 1KB
    if (syncConfig.compressionEnabled && Buffer.byteLength(json, 'utf8') > 1024) {
      const gz = gzipSync(Buffer.from(json, 'utf8'))
      logger.info('使用gzip压缩发送, 原始大小:', Buffer.byteLength(json, 'utf8'), '压缩后大小:', gz.length)
      const res = await this.client.post('/sync/incremental-sync', gz, {
        headers: { 'Content-Encoding': 'gzip', 'Content-Type': 'application/json' }
      })
      return res.data as SyncResponse
    }
    logger.info('未压缩JSON发送, 大小:', Buffer.byteLength(json, 'utf8'), '字节')
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

  // ==================== 新增分批同步接口 ====================

  /**
   * 开始全量同步会话
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
   * 获取分批数据
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
   * 完成全量同步会话
   */
  async finishFullSync(sessionId: string): Promise<{ success: boolean; message: string }> {
    const res = await this.client.delete(`/sync/full-sync/finish/${sessionId}`)
    return res.data
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
