// fileTransfer.spec.ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('fileTransfer.ts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const setup = async () => {
    let progressCb: ((payload: any) => void) | undefined
    ;(window as any).api = {
      onTransferProgress: (cb: any) => {
        progressCb = cb
      }
    }

    vi.resetModules()
    const mod = await import('../fileTransfer')
    mod.transferTasks.value = {}

    mod.ensureTransferListener()
    expect(progressCb).toBeTypeOf('function')

    return { mod, progressCb: progressCb! }
  }

  it('creates task on first progress payload and normalizes path', async () => {
    const { mod, progressCb } = await setup()

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    progressCb({
      taskKey: 'k1',
      type: 'download',
      bytes: 0,
      total: 100,
      remotePath: 'C:\\\\foo\\\\bar.txt'
    })

    const task = mod.transferTasks.value['k1']
    expect(task).toBeTruthy()
    expect(task.name).toBe('bar.txt')
    expect(task.remotePath).toBe('C:/foo/bar.txt') // \\+ => /
    expect(task.progress).toBe(0)
    expect(mod.downloadList.value.map((t: any) => t.taskKey)).toEqual(['k1'])
  })

  it('sets speed to scanning when stage=scanning', async () => {
    const { mod, progressCb } = await setup()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    progressCb({
      taskKey: 'k2',
      type: 'upload',
      bytes: 10,
      total: 100,
      remotePath: '/a/b.bin',
      stage: 'scanning'
    })

    expect(mod.transferTasks.value['k2'].speed).toBe('scanning')
    expect(mod.uploadList.value.length).toBe(1)
  })

  it('updates speed only when >= 1s passed (KB/s or MB/s branch) and progress calc', async () => {
    const { mod, progressCb } = await setup()

    // t0
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    progressCb({
      taskKey: 'k3',
      type: 'download',
      bytes: 0,
      total: 4096,
      remotePath: '/x/y.dat'
    })

    vi.setSystemTime(new Date('2026-01-01T00:00:00.500Z'))
    progressCb({
      taskKey: 'k3',
      type: 'download',
      bytes: 1024,
      total: 4096,
      remotePath: '/x/y.dat'
    })
    const s1 = mod.transferTasks.value['k3'].speed

    vi.setSystemTime(new Date('2026-01-01T00:00:02.000Z'))
    progressCb({
      taskKey: 'k3',
      type: 'download',
      bytes: 3072,
      total: 4096,
      remotePath: '/x/y.dat'
    })

    const task = mod.transferTasks.value['k3']
    expect(task.progress).toBe(Math.round((3072 / 4096) * 100))
    expect(task.speed).not.toBe(s1)
    expect(task.speed.includes('KB/s') || task.speed.includes('MB/s')).toBe(true)
  })

  it('auto marks success when progress=100 and status=running; then deletes after 2500ms', async () => {
    const { mod, progressCb } = await setup()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    progressCb({
      taskKey: 'k4',
      type: 'download',
      bytes: 100,
      total: 100,
      remotePath: '/done.txt',
      status: 'running'
    })

    expect(mod.transferTasks.value['k4'].status).toBe('success')

    vi.advanceTimersByTime(2499)
    expect(mod.transferTasks.value['k4']).toBeTruthy()

    vi.advanceTimersByTime(2)
    expect(mod.transferTasks.value['k4']).toBeUndefined()
  })

  it('deletes on explicit success after 2500ms; deletes on failed/error after 8000ms', async () => {
    const { mod, progressCb } = await setup()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    progressCb({ taskKey: 'k5', type: 'upload', bytes: 1, total: 10, remotePath: '/a.txt' })
    progressCb({ taskKey: 'k5', type: 'upload', bytes: 10, total: 10, remotePath: '/a.txt', status: 'success' })

    vi.advanceTimersByTime(2500)
    expect(mod.transferTasks.value['k5']).toBeUndefined()

    progressCb({ taskKey: 'k6', type: 'download', bytes: 1, total: 10, remotePath: '/b.txt' })
    progressCb({ taskKey: 'k6', type: 'download', bytes: 2, total: 10, remotePath: '/b.txt', status: 'failed' })

    vi.advanceTimersByTime(7999)
    expect(mod.transferTasks.value['k6']).toBeTruthy()
    vi.advanceTimersByTime(2)
    expect(mod.transferTasks.value['k6']).toBeUndefined()

    progressCb({ taskKey: 'k7', type: 'download', bytes: 1, total: 10, remotePath: '/c.txt' })
    progressCb({ taskKey: 'k7', type: 'download', bytes: 2, total: 10, remotePath: '/c.txt', status: 'error' })

    vi.advanceTimersByTime(8000)
    expect(mod.transferTasks.value['k7']).toBeUndefined()
  })
})
