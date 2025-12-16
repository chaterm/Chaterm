import { describe, it, expect, vi } from 'vitest'
import { RetryManager } from '../RetryManager'

describe('RetryManager', () => {
  it('should fail immediately for non-retryable errors without waiting', async () => {
    const manager = new RetryManager({ maxAttempts: 3, baseDelay: 100, backoffMultiplier: 2, jitter: false })
    const error = Object.assign(new Error('unknown'), { code: 'UNKNOWN_ERROR' })
    const op = vi.fn().mockRejectedValue(error)

    const res = await manager.executeWithRetry(op, 'test')
    expect(res.success).toBe(false)
    expect(res.attempts).toBe(1)
    expect(res.totalDelay).toBe(0)
  })

  it('should fail after max attempts for retryable network errors with cumulative delay', async () => {
    vi.useFakeTimers()
    const manager = new RetryManager({ maxAttempts: 3, baseDelay: 100, backoffMultiplier: 2, jitter: false })
    const error = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })
    const op = vi.fn().mockRejectedValue(error)

    const promise = manager.executeWithRetry(op, 'net')
    await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(200)
    const res = await promise

    expect(res.success).toBe(false)
    expect(res.attempts).toBe(3)
    expect(res.totalDelay).toBe(300)
    vi.useRealTimers()
  })

  it('should succeed with cumulative delay when operation succeeds on retry', async () => {
    vi.useFakeTimers()
    const manager = new RetryManager({ maxAttempts: 3, baseDelay: 50, backoffMultiplier: 2, jitter: false })
    const error = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })
    const op = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('ok')

    const promise = manager.executeWithRetry(op, 'net')
    await vi.advanceTimersByTimeAsync(50)
    const res = await promise

    expect(res.success).toBe(true)
    expect(res.attempts).toBe(2)
    expect(res.totalDelay).toBe(50)
    vi.useRealTimers()
  })
})
