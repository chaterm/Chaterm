import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  buildForkTask: vi.fn(),
  storeForkTask: vi.fn(),
  isInitialized: vi.fn(() => true),
  initialize: vi.fn()
}))

vi.mock('electron', () => ({ app: { getPath: () => '' } }))
vi.mock('../../../../storage/database', () => ({
  ChatermDatabaseService: { getInstance: vi.fn(async () => ({ buildForkTask: mocks.buildForkTask })) }
}))
vi.mock('../../../../storage/chat_sync/core/ChatSnapshotStore', () => ({
  ChatSnapshotStore: {
    getInstance: () => ({
      isInitialized: mocks.isInitialized,
      initialize: mocks.initialize,
      forkTask: mocks.storeForkTask
    })
  }
}))
vi.mock('../../../../storage/data_sync/config/devideId', () => ({ getDeviceId: () => 'device-1' }))
vi.mock('execa', () => ({ execa: vi.fn() }))

import { forkTask } from '../disk'

const payload = { taskId: 'fork-1', title: 'Chat (Fork)', metadata: {}, messages: [], apiHistory: [], contextHistory: null }

describe('forkTask (disk)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isInitialized.mockReturnValue(true)
    mocks.buildForkTask.mockResolvedValue(payload)
    mocks.storeForkTask.mockResolvedValue(undefined)
  })

  it('builds the payload and stores it through the sync-aware store', async () => {
    const result = await forkTask('source-1', 'fork-1', 200, 'Branch')

    expect(mocks.buildForkTask).toHaveBeenCalledExactlyOnceWith('source-1', 'fork-1', 200, 'Branch')
    expect(mocks.storeForkTask).toHaveBeenCalledExactlyOnceWith(payload)
    expect(result).toEqual({ taskId: 'fork-1', title: 'Chat (Fork)' })
  })

  it('initializes the store first when it has not been used yet', async () => {
    mocks.isInitialized.mockReturnValue(false)

    await forkTask('source-1', 'fork-1')

    expect(mocks.initialize).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'device-1')
    expect(mocks.storeForkTask).toHaveBeenCalledTimes(1)
  })

  it('lets a failed build reach the caller and stores nothing', async () => {
    mocks.buildForkTask.mockRejectedValue(new Error('Fork boundary was not found'))

    await expect(forkTask('source-1', 'fork-1', 5)).rejects.toThrow('Fork boundary was not found')
    expect(mocks.storeForkTask).not.toHaveBeenCalled()
  })

  it('lets a failed write reach the caller instead of reporting a fork', async () => {
    mocks.storeForkTask.mockRejectedValue(new Error('disk full'))

    await expect(forkTask('source-1', 'fork-1')).rejects.toThrow('disk full')
  })
})
