import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

//  Force mock the global api before importing any code ---
vi.stubGlobal('api', {
  onTransferProgress: vi.fn()
})

describe('fileTransfer.ts Frontend Logic Tests', () => {
  let transferModule: any
  let progressCallback: any

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.clearAllMocks()

    // Capture the callback function registered by initTransferListener ---
    vi.mocked((window.api as any).onTransferProgress).mockImplementation((cb) => {
      progressCallback = cb
    })

    // Dynamically import the business module to ensure it reads the stubbed api above ---
    transferModule = await import('../fileTransfer')

    // Reset reactive data
    transferModule.transferTasks.value = {}

    // Initialize the transfer listener
    transferModule.initTransferListener()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetModules() // Clear module cache to ensure top-level variables are reloaded for the next test
  })

  it('should correctly create a download task and sanitize paths on first progress update', () => {
    // Trigger callback: simulate data sent from the backend
    progressCallback({
      id: 1,
      taskKey: 'task-1',
      remotePath: '///home/user//file.txt'.replace(/\/+/g, '/'),
      bytes: 100,
      total: 1000,
      type: 'download'
    })

    const task = transferModule.transferTasks.value['task-1']
    expect(task).toBeDefined()
    expect(task.remotePath).toBe('/home/user/file.txt') // Verify path sanitization regex
    expect(task.progress).toBe(10)
    expect(transferModule.downloadList.value.length).toBe(1)
  })

  it('should correctly calculate speed in KB/s', () => {
    progressCallback({
      id: 1,
      taskKey: 'speed-test',
      remotePath: 'test.zip',
      bytes: 0,
      total: 10000,
      type: 'upload'
    })

    // Simulate 1 second passing and 1024 bytes transferred
    vi.advanceTimersByTime(1001)
    progressCallback({
      id: 1,
      taskKey: 'speed-test',
      remotePath: 'test.zip',
      bytes: 1024,
      total: 10000,
      type: 'upload'
    })

    const task = transferModule.transferTasks.value['speed-test']
    expect(task.speed).toBe('1.00 KB/s')
  })

  it('should automatically remove the task 3 seconds after reaching 100%', () => {
    progressCallback({
      id: 1,
      taskKey: 'done',
      remotePath: 'done.txt',
      bytes: 100,
      total: 100,
      type: 'download'
    })

    expect(transferModule.transferTasks.value['done']).toBeDefined()

    // Fast-forward 3 seconds
    vi.advanceTimersByTime(3000)
    expect(transferModule.transferTasks.value['done']).toBeUndefined()
  })
})
