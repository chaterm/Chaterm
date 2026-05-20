import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const instances: any[] = []

  class MockSyncController {
    initializeAuth = vi.fn(async () => {})
    initializeEncryption = vi.fn(async () => {})
    isAuthenticated = vi.fn(async () => true)
    backupInit = vi.fn(async () => {})
    incrementalSyncAll = vi.fn(async () => {})
    fullSyncAll = vi.fn(async () => {})
    startAutoSync = vi.fn(async () => {})
    destroy = vi.fn(async () => {})
    getSystemStatus = vi.fn(() => ({
      polling: { isRunning: false },
      auth: { isValid: false },
      encryption: { initialized: false }
    }))

    constructor(_dbPath?: string, options?: { onAuthFailure?: () => void }) {
      instances.push({ controller: this, options })
    }
  }

  return { instances, MockSyncController }
})

vi.mock('../core/SyncController', () => ({
  SyncController: mocks.MockSyncController
}))

describe('startDataSync', () => {
  beforeEach(() => {
    mocks.instances.length = 0
  })

  it('does not start auto sync when auth failure is detected during startup', async () => {
    const { startDataSync } = await import('../index')
    const onAuthFailure = vi.fn()

    const startPromise = startDataSync('/tmp/chaterm-test.db', onAuthFailure)
    const instance = mocks.instances[0]
    instance.controller.backupInit.mockImplementationOnce(async () => {
      instance.options.onAuthFailure()
      throw new Error('Unauthorized')
    })

    await expect(startPromise).rejects.toMatchObject({ code: 'AUTH_EXPIRED' })
    expect(onAuthFailure).toHaveBeenCalledTimes(1)
    expect(instance.controller.startAutoSync).not.toHaveBeenCalled()
    expect(instance.controller.destroy).toHaveBeenCalledTimes(1)
  })
})
