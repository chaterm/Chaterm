import { beforeEach, describe, expect, it, vi } from 'vitest'

const { captured, mockInitialize, mockScheduleUpload, mockReset, mockStop, mockGetGlobalState, mockEmit } = vi.hoisted(() => ({
  captured: { adapter: null as any },
  mockInitialize: vi.fn(),
  mockScheduleUpload: vi.fn(),
  mockReset: vi.fn(),
  mockStop: vi.fn(),
  mockGetGlobalState: vi.fn(),
  mockEmit: vi.fn()
}))

vi.mock('../configSyncManager', () => ({
  ConfigSyncManager: class {
    constructor(adapter: any) {
      captured.adapter = adapter
    }
    initialize = mockInitialize
    scheduleUpload = mockScheduleUpload
    reset = mockReset
    stop = mockStop
  }
}))

vi.mock('@renderer/agent/storage/state', () => ({
  getGlobalState: mockGetGlobalState
}))

vi.mock('@/utils/eventBus', () => ({
  default: {
    emit: mockEmit
  }
}))

describe('aiPreferencesSyncService', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    captured.adapter = null
    ;(globalThis as any).window = (globalThis as any).window || {}
    ;(globalThis as any).window.api = {
      kvTransaction: vi.fn(async (cb: (tx: { set: (key: string, value: string) => void }) => Promise<void> | void) => {
        const ops: Array<{ key: string; value: string }> = []
        await cb({
          set: (key: string, value: string) => {
            ops.push({ key, value })
          }
        })
        return ops
      })
    }
    await import('../aiPreferencesSyncService')
  })

  it('includes experienceExtractionEnabled in the local snapshot', async () => {
    mockGetGlobalState.mockImplementation(async (key: string) => {
      if (key === 'thinkingBudgetTokens') return 2048
      if (key === 'reasoningEffort') return 'low'
      if (key === 'experienceExtractionEnabled') return false
      return undefined
    })

    const snapshot = await captured.adapter.readLocal()

    expect(snapshot.experienceExtractionEnabled).toBe(false)
  })

  it('accepts experienceExtractionEnabled from remote payload', async () => {
    const parsed = captured.adapter.parseRemote({ experienceExtractionEnabled: true })

    expect(parsed).toEqual({ experienceExtractionEnabled: true })
  })

  it('writes experienceExtractionEnabled during applyRemote', async () => {
    const txSet = vi.fn()
    ;(globalThis as any).window.api.kvTransaction = vi.fn(async (cb: (tx: { set: typeof txSet }) => Promise<void> | void) => {
      await cb({ set: txSet })
    })

    await captured.adapter.applyRemote({ experienceExtractionEnabled: false }, { version: 1 }, 'aiPreferencesSyncMeta')

    expect(txSet).toHaveBeenCalledWith('global_experienceExtractionEnabled', 'false')
    expect(mockEmit).toHaveBeenCalledWith('aiPreferencesSyncApplied')
  })

  it('defaults experienceExtractionEnabled to true', () => {
    expect(captured.adapter.getDefault()).toEqual(
      expect.objectContaining({
        experienceExtractionEnabled: true
      })
    )
  })
})
