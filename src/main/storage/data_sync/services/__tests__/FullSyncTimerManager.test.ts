import { FullSyncTimerManager } from '../FullSyncTimerManager'

describe('FullSyncTimerManager', () => {
  let timerManager: FullSyncTimerManager
  let mockCallback: jest.Mock

  beforeEach(() => {
    mockCallback = jest.fn().mockResolvedValue(undefined)
    timerManager = new FullSyncTimerManager(
      {
        intervalHours: 0.001, // 3.6 seconds for testing
        enableOnStart: false
      },
      mockCallback
    )
  })

  afterEach(async () => {
    await timerManager.destroy()
    jest.clearAllMocks()
  })

  describe('Constructor and Initial State', () => {
    test('should initialize with correct default config', () => {
      const status = timerManager.getStatus()
      expect(status.isEnabled).toBe(false)
      expect(status.isRunning).toBe(false)
      expect(status.intervalMs).toBe(3.6) // 0.001 hours * 60 * 60 * 1000
      expect(status.totalFullSyncs).toBe(0)
      expect(status.successfulFullSyncs).toBe(0)
    })

    test('should throw error when starting without callback', async () => {
      const timerWithoutCallback = new FullSyncTimerManager()
      await expect(timerWithoutCallback.start()).rejects.toThrow('全量同步回调函数未设置，无法启动定时器')
      await timerWithoutCallback.destroy()
    })
  })

  describe('Timer Management', () => {
    test('should start and stop timer correctly', async () => {
      // Start timer
      await timerManager.start()
      let status = timerManager.getStatus()
      expect(status.isEnabled).toBe(true)
      expect(status.nextFullSyncTime).toBeTruthy()

      // Stop timer
      await timerManager.stop()
      status = timerManager.getStatus()
      expect(status.isEnabled).toBe(false)
      expect(status.nextFullSyncTime).toBeNull()
    })

    test('should not start twice', async () => {
      await timerManager.start()
      await timerManager.start() // Should not throw or cause issues

      const status = timerManager.getStatus()
      expect(status.isEnabled).toBe(true)
    })

    test('should handle stop when not running', async () => {
      await timerManager.stop() // Should not throw
      const status = timerManager.getStatus()
      expect(status.isEnabled).toBe(false)
    })
  })

  describe('Full Sync Execution', () => {
    test('should execute callback when timer fires', async () => {
      await timerManager.start()

      // Wait for timer to fire (slightly longer than interval)
      await new Promise((resolve) => setTimeout(resolve, 5000))

      expect(mockCallback).toHaveBeenCalledTimes(1)

      const status = timerManager.getStatus()
      expect(status.totalFullSyncs).toBe(1)
      expect(status.successfulFullSyncs).toBe(1)
      expect(status.lastFullSyncTime).toBeTruthy()
    }, 10000)

    test('should handle callback errors gracefully', async () => {
      const errorCallback = jest.fn().mockRejectedValue(new Error('Sync failed'))
      const errorTimer = new FullSyncTimerManager({ intervalHours: 0.001 }, errorCallback)

      await errorTimer.start()
      await new Promise((resolve) => setTimeout(resolve, 5000))

      const status = errorTimer.getStatus()
      expect(status.totalFullSyncs).toBe(1)
      expect(status.successfulFullSyncs).toBe(0) // Failed sync

      await errorTimer.destroy()
    }, 10000)

    test('should execute manual sync immediately', async () => {
      const result = await timerManager.syncNow()
      expect(result).toBe(true)
      expect(mockCallback).toHaveBeenCalledTimes(1)

      const status = timerManager.getStatus()
      expect(status.totalFullSyncs).toBe(1)
      expect(status.successfulFullSyncs).toBe(1)
    })

    test('should prevent concurrent sync execution', async () => {
      // Make callback slow
      mockCallback.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 1000)))

      const promise1 = timerManager.syncNow()
      const promise2 = timerManager.syncNow()

      const [result1, result2] = await Promise.all([promise1, promise2])

      expect(result1).toBe(true)
      expect(result2).toBe(false) // Should be rejected due to concurrent execution
      expect(mockCallback).toHaveBeenCalledTimes(1)
    })
  })

  describe('Configuration Updates', () => {
    test('should update interval correctly', async () => {
      timerManager.updateInterval(2)
      const status = timerManager.getStatus()
      expect(status.intervalMs).toBe(2 * 60 * 60 * 1000) // 2 hours in ms
    })

    test('should throw error for invalid interval', () => {
      expect(() => timerManager.updateInterval(0)).toThrow('定时器间隔必须大于0小时')
      expect(() => timerManager.updateInterval(-1)).toThrow('定时器间隔必须大于0小时')
    })

    test('should reschedule when interval is updated during running', async () => {
      await timerManager.start()
      const oldNextTime = timerManager.getStatus().nextFullSyncTime

      timerManager.updateInterval(0.002) // Change interval

      const newNextTime = timerManager.getStatus().nextFullSyncTime
      expect(newNextTime).not.toEqual(oldNextTime)
    })
  })

  describe('Callback Management', () => {
    test('should set callback after construction', () => {
      const newTimer = new FullSyncTimerManager()
      const newCallback = jest.fn().mockResolvedValue(undefined)

      newTimer.setFullSyncCallback(newCallback)

      // Should not throw when starting now
      expect(async () => await newTimer.start()).not.toThrow()

      newTimer.destroy()
    })
  })

  describe('Resource Cleanup', () => {
    test('should clean up resources on destroy', async () => {
      await timerManager.start()
      expect(timerManager.getStatus().isEnabled).toBe(true)

      await timerManager.destroy()

      const status = timerManager.getStatus()
      expect(status.isEnabled).toBe(false)
    })

    test('should wait for current sync to complete before destroying', async () => {
      // Make callback slow
      mockCallback.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 2000)))

      // Start manual sync
      const syncPromise = timerManager.syncNow()

      // Destroy while sync is running
      const destroyPromise = timerManager.destroy()

      // Both should complete without issues
      await Promise.all([syncPromise, destroyPromise])

      expect(mockCallback).toHaveBeenCalledTimes(1)
    })
  })
})
