import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatSyncScheduler } from '../ChatSyncScheduler'

vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
}))

function createDeferred() {
  let resolve: (() => void) | undefined
  const promise = new Promise<void>((res) => {
    resolve = res
  })

  return {
    promise,
    resolve: () => resolve?.()
  }
}

function createMockEngine() {
  return {
    runSyncCycle: vi.fn().mockResolvedValue(undefined),
    runRemoteDeletedCleanup: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn(() => ({
      status: 'idle' as const,
      lastSyncAt: null,
      lastError: null,
      pendingUploadCount: 0
    }))
  }
}

describe('ChatSyncScheduler', () => {
  beforeEach(() => {
    ChatSyncScheduler.getInstance()?.destroy()
  })

  it('queues exactly one follow-up sync when triggered again during an in-flight sync', async () => {
    const engine = createMockEngine()
    const scheduler = new ChatSyncScheduler(engine as any)

    await scheduler.enable()
    await Promise.resolve()
    engine.runSyncCycle.mockClear()

    const inFlight = createDeferred()
    engine.runSyncCycle.mockImplementationOnce(() => inFlight.promise).mockResolvedValueOnce(undefined)

    scheduler.triggerUploadSync()
    scheduler.triggerUploadSync()
    scheduler.triggerUploadSync()

    expect(engine.runSyncCycle).toHaveBeenCalledTimes(1)

    inFlight.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(engine.runSyncCycle).toHaveBeenCalledTimes(2)

    scheduler.destroy()
  })
})
