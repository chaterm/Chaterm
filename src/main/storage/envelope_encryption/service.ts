/**
 * 信封加密服务
 * 提供统一的加密/解密接口，在主进程中注册使用
 */

// 在运行时动态加载模块
let ClientSideCrypto: any
let chatermAuthAdapter: any
let config: any

async function loadModules() {
  try {
    // 导入 TypeScript 模块
    const configModule = await import('./config')
    config = configModule.default

    const authModule = await import('./services/auth')
    chatermAuthAdapter = authModule.chatermAuthAdapter

    const cryptoModule = await import('./clientSideCrypto')
    ClientSideCrypto = cryptoModule.default || cryptoModule.ClientSideCrypto
  } catch (error) {
    console.error('模块加载失败:', error)
    throw new Error('无法加载加密模块')
  }
}

export interface EncryptionResult {
  encrypted: string
  algorithm: string
  keyFingerprint: string
  userId: string
  iv?: string
  tag?: string
}

export interface EncryptionServiceStatus {
  initialized: boolean
  userId: string | null
  keyFingerprint: string | null
  serverUrl: string
  authStatus: any
}

export class EnvelopeEncryptionService {
  private clientCrypto: any = null
  private isInitialized: boolean = false
  private currentUserId: string | null = null
  private initializationFailed: boolean = false
  private lastInitError: string | null = null
  private modulesLoaded: boolean = false
  private serverUrl?: string
  private isInitializing: boolean = false
  private initializationPromise: Promise<{ success: boolean; message: string }> | null = null

  constructor(serverUrl?: string) {
    // 保存服务器URL，等模块加载后再初始化
    this.serverUrl = serverUrl

    // 异步加载模块
    this.initializeModules()
  }

  private async initializeModules() {
    try {
      await loadModules()

      // 使用默认的 KMS 服务器地址，或从配置中获取
      const kmsServerUrl = this.serverUrl || config?.serverUrl
      if (!kmsServerUrl) {
        console.warn(' KMS 服务器地址未配置，加密功能将不可用')
        this.modulesLoaded = true
        this.initializationFailed = true
        this.lastInitError = 'KMS 服务器地址未配置'
        return
      }

      this.clientCrypto = new ClientSideCrypto(kmsServerUrl)
      this.modulesLoaded = true
    } catch (error) {
      console.error('加密服务模块初始化失败:', error)
      this.initializationFailed = true
      this.lastInitError = (error as Error).message
    }
  }

  /**
   * 等待模块加载完成
   */
  private async waitForModules(): Promise<void> {
    if (!this.modulesLoaded) {
      console.log('等待加密模块加载完成...')
      let attempts = 0
      const maxAttempts = 50 // 最多等待5秒

      while (!this.modulesLoaded && attempts < maxAttempts) {
        if (this.initializationFailed) {
          throw new Error(`模块加载失败: ${this.lastInitError}`)
        }
        await new Promise((resolve) => setTimeout(resolve, 100))
        attempts++
      }

      if (!this.modulesLoaded) {
        throw new Error('模块加载超时')
      }
    }
  }

  /**
   * 简化的初始化加密服务
   * @param userId 用户ID，如果不提供则从认证适配器获取
   * @param silent 是否静默初始化（不抛出错误）
   */
  async initialize(userId?: string, silent: boolean = false): Promise<{ success: boolean; message: string }> {
    try {
      // 等待模块加载完成
      await this.waitForModules()

      // 检查客户端加密是否可用
      if (!this.clientCrypto) {
        throw new Error('加密客户端不可用，请检查 KMS 服务器配置')
      }

      // 获取用户ID
      const targetUserId = userId || (await chatermAuthAdapter.getCurrentUserId())
      if (!targetUserId) {
        throw new Error('无法获取用户ID')
      }

      // 获取认证令牌
      const authToken = await chatermAuthAdapter.getAuthToken()

      // 强制密钥轮换：每次启动时清理旧的密钥数据
      await this.clearStoredKeys(targetUserId)

      // 初始化客户端加密
      await this.clientCrypto.initialize(targetUserId, authToken)

      // 初始化成功
      this.isInitialized = true
      this.currentUserId = targetUserId
      this.initializationFailed = false
      this.lastInitError = null

      return { success: true, message: '加密服务初始化成功' }
    } catch (error) {
      const errorMessage = (error as Error).message

      // 获取用户ID（即使初始化失败也要保存，用于后续重试）
      const targetUserId = userId || (await chatermAuthAdapter.getCurrentUserId().catch(() => null))

      // 记录失败状态
      this.isInitialized = false
      this.initializationFailed = true
      this.lastInitError = errorMessage
      this.currentUserId = targetUserId // 保存用户ID用于重试

      if (silent) {
        // 静默模式：只记录简要信息
        console.warn('加密服务初始化失败:', errorMessage)
        return { success: false, message: errorMessage }
      } else {
        // 非静默模式：抛出错误，但不重复记录详细日志
        throw new Error(`初始化失败: ${errorMessage}`)
      }
    }
  }

  /**
   * 智能加密数据方法（支持等待后台初始化）
   * @param plaintext 要加密的明文数据
   * @returns 加密结果
   */
  async encrypt(plaintext: string): Promise<EncryptionResult> {
    // 检查数据有效性
    if (!plaintext || typeof plaintext !== 'string') {
      throw new Error('无效的明文数据')
    }

    // 等待模块加载完成
    await this.waitForModules()

    // 检查服务是否已初始化
    if (!this.isInitialized) {
      // 如果正在后台初始化，等待一下
      if (this.isInitializing) {
        console.log('⏳ 等待后台初始化完成...')
        const waitResult = await this.waitForBackgroundInit(3000) // 最多等3秒
        if (!waitResult) {
          console.warn('等待后台初始化超时，尝试快速重新初始化')
        }
      }

      // 如果还是未初始化，尝试快速重新初始化
      if (!this.isInitialized && this.currentUserId) {
        console.log('🔄 尝试快速重新初始化加密服务...')
        try {
          const result = await this.initialize(this.currentUserId, true)
          if (!result.success) {
            throw new Error(`重新初始化失败: ${result.message}`)
          }
        } catch (error) {
          throw new Error(`加密服务不可用: ${(error as Error).message}`)
        }
      } else if (!this.isInitialized) {
        throw new Error(`加密服务未初始化: ${this.lastInitError || '请先初始化加密服务'}`)
      }
    }

    const result = await this.clientCrypto.encryptData(plaintext)
    return result as EncryptionResult
  }

  /**
   * 智能解密数据方法（支持等待后台初始化）
   * @param encryptedData 加密的数据对象
   * @returns 解密后的明文
   */
  async decrypt(encryptedData: any): Promise<string> {
    // 检查数据有效性
    if (!encryptedData || typeof encryptedData !== 'object') {
      throw new Error('无效的加密数据')
    }

    // 检查服务是否已初始化
    if (!this.isInitialized) {
      // 如果正在后台初始化，等待一下
      if (this.isInitializing) {
        console.log('⏳ 等待后台初始化完成...')
        const waitResult = await this.waitForBackgroundInit(3000) // 最多等3秒
        if (!waitResult) {
          console.warn('等待后台初始化超时，尝试快速重新初始化')
        }
      }

      // 如果还是未初始化，尝试快速重新初始化
      if (!this.isInitialized && this.currentUserId) {
        console.log('🔄 尝试快速重新初始化加密服务...')
        try {
          const result = await this.initialize(this.currentUserId, true)
          if (!result.success) {
            throw new Error(`重新初始化失败: ${result.message}`)
          }
        } catch (error) {
          throw new Error(`加密服务不可用: ${(error as Error).message}`)
        }
      } else if (!this.isInitialized) {
        throw new Error(`加密服务未初始化: ${this.lastInitError || '请先初始化加密服务'}`)
      }
    }

    return await this.clientCrypto.decryptData(encryptedData)
  }

  /**
   * 轮换数据密钥
   */
  async rotateDataKey(): Promise<{ success: boolean; message: string }> {
    if (!this.isInitialized) {
      throw new Error('加密服务未初始化')
    }

    try {
      await this.clientCrypto.rotateDataKey()
      return { success: true, message: '密钥轮换成功' }
    } catch (error) {
      console.error('密钥轮换失败:', error)
      return { success: false, message: `密钥轮换失败: ${(error as Error).message}` }
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<any> {
    try {
      const health = await this.clientCrypto.healthCheck()
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
      console.error('健康检查失败:', error)
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
   * 获取服务状态
   */
  getStatus(): EncryptionServiceStatus {
    const clientStatus = this.clientCrypto?.getStatus() || {}
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
   * 清理服务
   * @param clearStorage 是否清理存储
   */
  cleanup(clearStorage: boolean = false): { success: boolean; message: string } {
    try {
      if (this.clientCrypto) {
        this.clientCrypto.cleanup(clearStorage)
      }

      this.isInitialized = false
      this.currentUserId = null

      if (clearStorage) {
        chatermAuthAdapter.clearAuthInfo()
      }

      console.log('加密服务清理完成')
      return { success: true, message: '服务清理完成' }
    } catch (error) {
      console.error('服务清理失败:', error)
      return { success: false, message: `清理失败: ${(error as Error).message}` }
    }
  }

  /**
   * 清理存储的密钥数据
   * @param userId 用户ID
   */
  private async clearStoredKeys(userId: string): Promise<void> {
    try {
      // 导入存储管理器
      const { StorageManager } = await import('./utils/storage')
      const storage = new StorageManager()

      // 清理所有存储数据（包括加密的数据密钥和会话信息）
      await storage.cleanup(userId)
    } catch (error) {
      console.warn('清理存储密钥时出错:', error)
      // 不抛出错误，允许继续初始化
    }
  }

  /**
   * 设置认证信息（用于初始化时）
   */
  setAuthInfo(token: string, userId: string, expiry?: number): void {
    chatermAuthAdapter.setAuthInfo(token, userId, expiry)
  }

  /**
   * 后台异步初始化（不阻塞主线程）
   * @param userId 用户ID
   * @param timeout 超时时间（毫秒），默认10秒
   */
  async initializeInBackground(userId?: string, timeout: number = 10000): Promise<void> {
    // 防止重复初始化
    if (this.isInitializing) {
      console.log('加密服务正在后台初始化中，跳过重复请求')
      return
    }

    if (this.isInitialized) {
      console.log('加密服务已初始化，跳过后台初始化')
      return
    }

    this.isInitializing = true

    // 创建带超时的初始化 Promise
    this.initializationPromise = Promise.race([
      this.initialize(userId, true),
      new Promise<{ success: boolean; message: string }>((_, reject) => setTimeout(() => reject(new Error('后台初始化超时')), timeout))
    ]).finally(() => {
      this.isInitializing = false
      this.initializationPromise = null
    })

    try {
      const result = await this.initializationPromise
      if (!result.success) {
        console.warn('后台加密服务初始化失败:', result.message)
      }
    } catch (error) {
      console.warn('后台加密服务初始化超时:', (error as Error).message)
    }
  }

  /**
   * 等待后台初始化完成（如果正在进行）
   * @param maxWait 最大等待时间（毫秒），默认5秒
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
        new Promise<{ success: boolean; message: string }>((_, reject) => setTimeout(() => reject(new Error('等待超时')), maxWait))
      ])
      return result.success
    } catch (error) {
      console.warn('等待后台初始化超时:', (error as Error).message)
      return false
    }
  }
}

// 导出单例实例 - 不传入serverUrl，让服务自己从配置中获取
export const envelopeEncryptionService = new EnvelopeEncryptionService()
