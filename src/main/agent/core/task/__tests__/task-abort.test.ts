import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getAppPath: () => '' },
  BrowserWindow: { fromWebContents: () => null },
  ipcMain: { handle: vi.fn(), on: vi.fn(), once: vi.fn(), removeAllListeners: vi.fn() },
  dialog: { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) }
}))

vi.mock('@storage/db/chaterm.service', () => ({
  ChatermDatabaseService: { getInstance: vi.fn(async () => ({})) }
}))
vi.mock('@storage/database', () => ({ connectAssetInfo: vi.fn(async () => undefined) }))
vi.mock('@integrations/remote-terminal', () => ({
  RemoteTerminalManager: class {
    disposeAll = vi.fn()
  }
}))
vi.mock('@integrations/local-terminal', () => ({
  LocalTerminalManager: class {},
  LocalCommandProcess: class {}
}))
vi.mock('@services/telemetry/TelemetryService', () => ({ telemetryService: { captureTaskFeedback: vi.fn() } }))
vi.mock('@api/index', () => ({
  ApiHandler: class {},
  buildApiHandler: vi.fn(() => ({}))
}))

import { Task } from '../index'

describe('Task abort behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('abortTask 应设置 abort=true 并释放 remoteTerminalManager', async () => {
    const task = Object.create((Task as unknown as { prototype: object }).prototype) as any
    const disposeAll = vi.fn()
    task.remoteTerminalManager = { disposeAll }
    task.abort = false

    await task.abortTask()

    expect(task.abort).toBe(true)
    expect(disposeAll).toHaveBeenCalledTimes(1)
  })

  it('gracefulAbortTask 应设置 gracefulCancel=true，且存在当前进程时释放 remoteTerminalManager', async () => {
    const task = Object.create((Task as unknown as { prototype: object }).prototype) as any
    const disposeAll = vi.fn()
    task.remoteTerminalManager = { disposeAll }
    task.gracefulCancel = false
    task.abort = false

    task.currentRunningProcess = { id: 'p1' }
    await task.gracefulAbortTask()

    expect(task.gracefulCancel).toBe(true)
    expect(task.abort).toBe(false)
    expect(disposeAll).toHaveBeenCalledTimes(1)
  })
})
