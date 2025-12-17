import { logger } from '../utils/logger'

export interface RetryConfig {
  maxAttempts: number // Maximum retry attempts
  baseDelay: number // Base delay (ms)
  maxDelay: number // Maximum delay (ms)
  backoffMultiplier: number // Backoff multiplier
  jitter: boolean // Whether to add random jitter
  retryableErrors: string[] // Retryable error types
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
   * Execute operation with retry
   */
  async executeWithRetry<T>(operation: () => Promise<T>, operationName: string = 'operation'): Promise<RetryResult<T>> {
    let lastError: Error | null = null
    let totalDelay = 0

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        logger.debug(`Executing operation ${operationName}, attempt ${attempt}/${this.config.maxAttempts}`)

        const result = await operation()

        if (attempt > 1) {
          logger.info(`Operation ${operationName} succeeded after ${attempt} attempts`)
        }

        return {
          success: true,
          result,
          attempts: attempt,
          totalDelay
        }
      } catch (error: any) {
        lastError = error

        logger.warn(`Operation ${operationName} attempt ${attempt} failed: ${error?.message}`)

        // Check if error is retryable
        if (!this.isRetryableError(error)) {
          logger.error(`Operation ${operationName} encountered non-retryable error: ${error?.message}`)
          return {
            success: false,
            error,
            attempts: attempt,
            totalDelay
          }
        }

        // If not the last attempt, wait and retry
        if (attempt < this.config.maxAttempts) {
          const delay = this.calculateDelay(attempt)
          totalDelay += delay

          logger.debug(`Waiting ${delay}ms before retrying operation ${operationName}`)
          await this.sleep(delay)
        }
      }
    }

    logger.error(`Operation ${operationName} still failed after ${this.config.maxAttempts} attempts`)

    return {
      success: false,
      error: lastError || new Error('Unknown error'),
      attempts: this.config.maxAttempts,
      totalDelay
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (!error) return false

    const errorCode = error.code || error.errno || ''
    const errorMessage = error.message || ''

    // Check error code
    if (this.config.retryableErrors.some((code) => errorCode.includes(code))) {
      return true
    }

    // Check HTTP status code
    if (error.response?.status) {
      const status = error.response.status
      // 5xx server errors and some 4xx errors are retryable
      if (status >= 500 || status === 408 || status === 429) {
        return true
      }
    }

    // Check error message
    const retryableMessages = ['timeout', 'connection reset', 'connection refused', 'network error', 'socket hang up']

    return retryableMessages.some((msg) => errorMessage.toLowerCase().includes(msg))
  }

  /**
   * Calculate delay time
   */
  private calculateDelay(attempt: number): number {
    // Exponential backoff
    let delay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1)

    // Limit maximum delay
    delay = Math.min(delay, this.config.maxDelay)

    // Add random jitter to avoid thundering herd effect
    if (this.config.jitter) {
      const jitterRange = delay * 0.1 // 10% jitter
      const jitter = (Math.random() - 0.5) * 2 * jitterRange
      delay += jitter
    }

    return Math.max(0, Math.round(delay))
  }

  /**
   * Sleep for specified time
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Get current configuration
   */
  getConfig(): RetryConfig {
    return { ...this.config }
  }
}

// Create default retry manager instance
export const defaultRetryManager = new RetryManager()

/**
 * Convenient retry function
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
