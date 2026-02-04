import { describe, it, expect, vi, beforeEach } from 'vitest'

const { ipcMainMock, webContentsMock, taskMock } = vi.hoisted(() => ({
  ipcMainMock: {
    handle: vi.fn(),
    on: vi.fn()
  },
  webContentsMock: {
    getAllWebContents: vi.fn(() => [])
  },
  taskMock: {
    getCommandContext: vi.fn()
  }
}))

vi.mock('electron', () => ({
  ipcMain: ipcMainMock,
  webContents: webContentsMock,
  default: {
    ipcMain: ipcMainMock,
    webContents: webContentsMock
  }
}))

vi.mock('../../../core/task', () => ({
  Task: taskMock
}))

describe('interaction-detector ipc-handlers', () => {
  let handlers: Map<string, (...args: any[]) => any>

  beforeEach(async () => {
    vi.clearAllMocks()
    handlers = new Map()

    ipcMainMock.handle.mockImplementation((channel: string, handler: (...args: any[]) => any) => {
      handlers.set(channel, handler)
    })

    const { setupInteractionIpcHandlers } = await import('../ipc-handlers')
    setupInteractionIpcHandlers()
  })

  it('resumes detection even when sendInput fails for non-pager interactions', async () => {
    const onResume = vi.fn()
    const sendInput = vi.fn().mockResolvedValue({ success: false, error: 'write-failed', code: 'write-failed' })

    taskMock.getCommandContext.mockReturnValue({
      commandId: 'cmd-1',
      taskId: 'task-1',
      sendInput,
      onResume
    })

    const handler = handlers.get('submit-interaction')!
    const result = await handler({}, { commandId: 'cmd-1', input: 'y', appendNewline: true, interactionType: 'confirm' })

    expect(onResume).toHaveBeenCalled()
    expect(result.success).toBe(false)
  })
})
