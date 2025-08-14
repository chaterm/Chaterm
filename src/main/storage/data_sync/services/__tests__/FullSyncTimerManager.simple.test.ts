import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { FullSyncTimerManager } from '../FullSyncTimerManager'

describe('FullSyncTimerManager Basic Tests', () => {
  let timerManager: FullSyncTimerManager
  let mockCallback: ReturnType<typeof vi.fn>
  let mockConflictCheck: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockCallback = vi.fn().mockResolvedValue(undefined)
    mockConflictCheck = vi.fn().mockResolvedValue(false) // 默认无冲突
    timerManager = new FullSyncTimerManager(
      {
        intervalHours: 1,
        enableOnStart: false
      },
      mockCallback,
      mockConflictCheck
    )
  })

  afterEach(async () => {
    await timerManager.destroy()
    vi.clearAllMocks()
  })

  it('should initialize with correct default state', () => {
    const status = timerManager.getStatus()
    expect(status.isEnabled).toBe(false)
    expect(status.isRunning).toBe(false)
    expect(status.intervalMs).toBe(3600000) // 1 hour in ms
    expect(status.totalFullSyncs).toBe(0)
    expect(status.successfulFullSyncs).toBe(0)
    expect(status.lastFullSyncTime).toBeNull()
    expect(status.nextFullSyncTime).toBeNull()
  })

  it('should start and stop correctly', async () => {
    // Initially not enabled
    expect(timerManager.getStatus().isEnabled).toBe(false)

    // Start timer
    await timerManager.start()
    let status = timerManager.getStatus()
    expect(status.isEnabled).toBe(true)
    expect(status.nextFullSyncTime).not.toBeNull()

    // Stop timer
    await timerManager.stop()
    status = timerManager.getStatus()
    expect(status.isEnabled).toBe(false)
    expect(status.nextFullSyncTime).toBeNull()
  })

  it('should execute manual sync immediately', async () => {
    const result = await timerManager.syncNow()
    expect(result).toBe(true)
    expect(mockCallback).toHaveBeenCalledTimes(1)

    const status = timerManager.getStatus()
    expect(status.totalFullSyncs).toBe(1)
    expect(status.successfulFullSyncs).toBe(1)
    expect(status.lastFullSyncTime).not.toBeNull()
  })

  it('should handle callback errors gracefully', async () => {
    const errorCallback = vi.fn().mockRejectedValue(new Error('Sync failed'))
    const errorTimer = new FullSyncTimerManager({ intervalHours: 1 }, errorCallback)

    const result = await errorTimer.syncNow()
    expect(result).toBe(false) // Should return false on error

    const status = errorTimer.getStatus()
    expect(status.totalFullSyncs).toBe(1)
    expect(status.successfulFullSyncs).toBe(0) // Failed sync

    await errorTimer.destroy()
  })

  it('should update interval correctly', () => {
    timerManager.updateInterval(2)
    const status = timerManager.getStatus()
    expect(status.intervalMs).toBe(7200000) // 2 hours in ms
  })

  it('should throw error for invalid interval', () => {
    expect(() => timerManager.updateInterval(0)).toThrow('定时器间隔必须大于0小时')
    expect(() => timerManager.updateInterval(-1)).toThrow('定时器间隔必须大于0小时')
  })

  it('should set callback after construction', () => {
    const newTimer = new FullSyncTimerManager()
    const newCallback = vi.fn().mockResolvedValue(undefined)

    newTimer.setFullSyncCallback(newCallback)

    // Should not throw when starting now
    expect(async () => await newTimer.start()).not.toThrow()

    newTimer.destroy()
  })

  it('should throw error when starting without callback', async () => {
    const timerWithoutCallback = new FullSyncTimerManager()
    await expect(timerWithoutCallback.start()).rejects.toThrow('全量同步回调函数未设置，无法启动定时器')
    await timerWithoutCallback.destroy()
  })

  it('should prevent concurrent sync execution', async () => {
    // Make callback slow
    const slowCallback = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)))
    const slowTimer = new FullSyncTimerManager({ intervalHours: 1 }, slowCallback)

    const promise1 = slowTimer.syncNow()
    const promise2 = slowTimer.syncNow()

    const [result1, result2] = await Promise.all([promise1, promise2])

    expect(result1).toBe(true)
    expect(result2).toBe(false) // Should be rejected due to concurrent execution
    expect(slowCallback).toHaveBeenCalledTimes(1)

    await slowTimer.destroy()
  })

  it('should clean up resources on destroy', async () => {
    await timerManager.start()
    expect(timerManager.getStatus().isEnabled).toBe(true)

    await timerManager.destroy()

    const status = timerManager.getStatus()
    expect(status.isEnabled).toBe(false)
  })

  it('should skip full sync when incremental sync is in progress', async () => {
    // 模拟增量同步正在进行
    mockConflictCheck.mockResolvedValueOnce(true)

    const result = await timerManager.syncNow()
    expect(result).toBe(false) // 应该跳过同步
    expect(mockCallback).not.toHaveBeenCalled() // 不应该执行全量同步
    expect(mockConflictCheck).toHaveBeenCalledTimes(1) // 应该检查冲突

    const status = timerManager.getStatus()
    expect(status.totalFullSyncs).toBe(1) // 计数器应该增加
    expect(status.successfulFullSyncs).toBe(0) // 但成功次数不增加
  })

  it('should proceed with full sync when no incremental sync is in progress', async () => {
    // 模拟无增量同步冲突
    mockConflictCheck.mockResolvedValueOnce(false)

    const result = await timerManager.syncNow()
    expect(result).toBe(true) // 应该执行同步
    expect(mockCallback).toHaveBeenCalledTimes(1) // 应该执行全量同步
    expect(mockConflictCheck).toHaveBeenCalledTimes(1) // 应该检查冲突

    const status = timerManager.getStatus()
    expect(status.totalFullSyncs).toBe(1)
    expect(status.successfulFullSyncs).toBe(1) // 成功次数应该增加
  })

  it('should set conflict check callback after construction', () => {
    const newTimer = new FullSyncTimerManager()
    const newConflictCheck = vi.fn().mockResolvedValue(false)

    newTimer.setConflictCheckCallback(newConflictCheck)

    // 应该不会抛出异常
    expect(() => newTimer.setConflictCheckCallback(newConflictCheck)).not.toThrow()

    newTimer.destroy()
  })
})
