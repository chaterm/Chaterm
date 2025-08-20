import { userConfigStore } from './userConfigStoreService'

/**
 * 数据同步服务 - 在渲染进程中管理数据同步的启动和停止
 */
export class DataSyncService {
  private static instance: DataSyncService | null = null
  private isInitialized = false

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {
    // Private constructor for singleton pattern
  }

  static getInstance(): DataSyncService {
    if (!DataSyncService.instance) {
      DataSyncService.instance = new DataSyncService()
    }
    return DataSyncService.instance
  }

  /**
   * 初始化数据同步服务
   * 在用户登录后调用，检查用户配置并决定是否启动数据同步
   * 只有正常登录的用户才会启用数据同步，guest用户跳过
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('数据同步服务已初始化，跳过重复初始化')
      return
    }

    try {
      console.log('初始化数据同步服务...')

      // 检查是否为guest用户
      const isSkippedLogin = localStorage.getItem('login-skipped') === 'true'
      const token = localStorage.getItem('ctm-token')

      if (isSkippedLogin || token === 'guest_token') {
        console.log('检测到guest用户，跳过数据同步初始化')
        this.isInitialized = true
        return
      }

      // 获取用户配置
      const userConfig = await userConfigStore.getConfig()

      if (!userConfig) {
        console.log('无法获取用户配置，跳过数据同步初始化')
        return
      }

      // 检查数据同步是否启用
      const isDataSyncEnabled = userConfig.dataSync === 'enabled'
      console.log(`用户数据同步配置: ${isDataSyncEnabled ? '启用' : '禁用'}`)

      if (isDataSyncEnabled) {
        await this.enableDataSync()
      } else {
        console.log('数据同步已禁用，不启动同步服务')
      }

      this.isInitialized = true
      console.log('数据同步服务初始化完成')
    } catch (error) {
      console.error('数据同步服务初始化失败:', error)
    }
  }

  /**
   * 启用数据同步
   */
  async enableDataSync(): Promise<boolean> {
    try {
      console.log('启用数据同步...')

      if (!window.api?.setDataSyncEnabled) {
        console.error('数据同步API不可用')
        return false
      }

      const result = await window.api.setDataSyncEnabled(true)

      if (result?.success) {
        console.log('数据同步已成功启用')
        return true
      } else {
        console.error('启用数据同步失败:', result?.error)
        return false
      }
    } catch (error) {
      console.error('启用数据同步时发生错误:', error)
      return false
    }
  }

  /**
   * 禁用数据同步
   */
  async disableDataSync(): Promise<boolean> {
    try {
      console.log('禁用数据同步...')

      if (!window.api?.setDataSyncEnabled) {
        console.error('数据同步API不可用')
        return false
      }

      const result = await window.api.setDataSyncEnabled(false)

      if (result?.success) {
        console.log('数据同步已成功禁用')
        return true
      } else {
        console.error('禁用数据同步失败:', result?.error)
        return false
      }
    } catch (error) {
      console.error('禁用数据同步时发生错误:', error)
      return false
    }
  }

  /**
   * 重置初始化状态（用于用户切换等场景）
   */
  reset(): void {
    this.isInitialized = false
    console.log('数据同步服务状态已重置')
  }

  /**
   * 检查是否已初始化
   */
  getInitializationStatus(): boolean {
    return this.isInitialized
  }
}

// 导出单例实例
export const dataSyncService = DataSyncService.getInstance()
