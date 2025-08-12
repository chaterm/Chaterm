import { logger } from '../utils/logger'

export interface RetryConfig {
  maxAttempts: number // 最大重试次数
  baseDelay: number // 基础延迟(ms)
  maxDelay: number // 最大延迟(ms)
  backoffMultiplier: number // 退避倍数
  jitter: boolean // 是否添加随机抖动
  retryableErrors: string[] // 可重试的错误类型
}

export interface RetryResult<T> {
  success: boolean
  result?: T
  error?: Error
  attempts: number
  totalDelay: number
}

export class RetryManager {
  private config: RetryConfig

  constructor(config?: Partial<RetryConfig>) {
    this.config = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true,
      retryableErrors: ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'NETWORK_ERROR', 'TIMEOUT_ERROR'],
      ...config
    }
  }

  /**
   * 执行带重试的操作
   */
  async executeWithRetry<T>(operation: () => Promise<T>, operationName: string = 'operation'): Promise<RetryResult<T>> {
    let lastError: Error | null = null
    let totalDelay = 0

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        logger.debug(`执行操作 ${operationName}, 尝试 ${attempt}/${this.config.maxAttempts}`)

        const result = await operation()

        if (attempt > 1) {
          logger.info(`操作 ${operationName} 在第 ${attempt} 次尝试后成功`)
        }

        return {
          success: true,
          result,
          attempts: attempt,
          totalDelay
        }
      } catch (error: any) {
        lastError = error

        logger.warn(`操作 ${operationName} 第 ${attempt} 次尝试失败: ${error?.message}`)

        // 检查是否为可重试的错误
        if (!this.isRetryableError(error)) {
          logger.error(`操作 ${operationName} 遇到不可重试错误: ${error?.message}`)
          return {
            success: false,
            error,
            attempts: attempt,
            totalDelay
          }
        }

        // 如果不是最后一次尝试，则等待后重试
        if (attempt < this.config.maxAttempts) {
          const delay = this.calculateDelay(attempt)
          totalDelay += delay

          logger.debug(`等待 ${delay}ms 后重试操作 ${operationName}`)
          await this.sleep(delay)
        }
      }
    }

    logger.error(`操作 ${operationName} 在 ${this.config.maxAttempts} 次尝试后仍然失败`)

    return {
      success: false,
      error: lastError || new Error('Unknown error'),
      attempts: this.config.maxAttempts,
      totalDelay
    }
  }

  /**
   * 检查错误是否可重试
   */
  private isRetryableError(error: any): boolean {
    if (!error) return false

    const errorCode = error.code || error.errno || ''
    const errorMessage = error.message || ''

    // 检查错误代码
    if (this.config.retryableErrors.some((code) => errorCode.includes(code))) {
      return true
    }

    // 检查HTTP状态码
    if (error.response?.status) {
      const status = error.response.status
      // 5xx服务器错误和部分4xx错误可重试
      if (status >= 500 || status === 408 || status === 429) {
        return true
      }
    }

    // 检查错误消息
    const retryableMessages = ['timeout', 'connection reset', 'connection refused', 'network error', 'socket hang up']

    return retryableMessages.some((msg) => errorMessage.toLowerCase().includes(msg))
  }

  /**
   * 计算延迟时间
   */
  private calculateDelay(attempt: number): number {
    // 指数退避
    let delay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1)

    // 限制最大延迟
    delay = Math.min(delay, this.config.maxDelay)

    // 添加随机抖动，避免惊群效应
    if (this.config.jitter) {
      const jitterRange = delay * 0.1 // 10%的抖动
      const jitter = (Math.random() - 0.5) * 2 * jitterRange
      delay += jitter
    }

    return Math.max(0, Math.round(delay))
  }

  /**
   * 睡眠指定时间
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * 获取当前配置
   */
  getConfig(): RetryConfig {
    return { ...this.config }
  }
}

// 创建默认的重试管理器实例
export const defaultRetryManager = new RetryManager()

/**
 * 便捷的重试函数
 */
export async function withRetry<T>(operation: () => Promise<T>, config?: Partial<RetryConfig>, operationName?: string): Promise<T> {
  const retryManager = config ? new RetryManager(config) : defaultRetryManager
  const result = await retryManager.executeWithRetry(operation, operationName)

  if (result.success) {
    return result.result!
  } else {
    throw result.error
  }
}
