import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as os from 'os'

const ipcHandleMock = vi.hoisted(() => vi.fn())
const spawnMock = vi.hoisted(() => vi.fn())
const originalEnv = { ...process.env }

vi.mock('electron', () => ({
  ipcMain: { handle: ipcHandleMock },
  BrowserWindow: { getAllWindows: vi.fn(() => []) }
}))

vi.mock('node-pty', () => ({
  spawn: spawnMock
}))

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os')
  return {
    ...actual,
    platform: vi.fn(() => 'darwin'),
    homedir: vi.fn(() => '/Users/test')
  }
})

vi.mock('../../../agent/core/storage/state', () => ({
  getUserConfig: vi.fn().mockResolvedValue({ language: 'zh-CN' })
}))

describe('localSSHHandle - local shell startup', () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
    ipcHandleMock.mockClear()
    spawnMock.mockReset()
    vi.mocked(os.platform).mockReturnValue('darwin')
    vi.mocked(os.homedir).mockReturnValue('/Users/test')
    spawnMock.mockReturnValue({
      onData: vi.fn(),
      onExit: vi.fn(),
      kill: vi.fn(),
      resize: vi.fn(),
      write: vi.fn()
    })
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('starts local zsh without forcing login shell args by default', async () => {
    const { registerLocalSSHHandlers } = await import('../localSSHHandle')
    registerLocalSSHHandlers()

    const connectHandler = ipcHandleMock.mock.calls.find(([channel]) => channel === 'local:connect')?.[1]
    expect(connectHandler).toBeTypeOf('function')

    await connectHandler(null, {
      id: 'local-test',
      shell: '/bin/zsh',
      termType: 'xterm-256color'
    })

    expect(spawnMock).toHaveBeenCalledWith(
      '/bin/zsh',
      [],
      expect.objectContaining({
        name: 'xterm-256color',
        cols: 80,
        rows: 24
      })
    )
  })

  it('starts local zsh with fast startup args when requested', async () => {
    const { registerLocalSSHHandlers } = await import('../localSSHHandle')
    registerLocalSSHHandlers()

    const connectHandler = ipcHandleMock.mock.calls.find(([channel]) => channel === 'local:connect')?.[1]
    expect(connectHandler).toBeTypeOf('function')

    await connectHandler(null, {
      id: 'local-test',
      shell: '/bin/zsh',
      termType: 'xterm-256color',
      startupMode: 'fast'
    })

    expect(spawnMock).toHaveBeenCalledWith(
      '/bin/zsh',
      ['-f'],
      expect.objectContaining({
        name: 'xterm-256color',
        cols: 80,
        rows: 24
      })
    )
  })

  it('does not pass Unix fast startup args on Windows', async () => {
    vi.mocked(os.platform).mockReturnValue('win32')

    const { registerLocalSSHHandlers } = await import('../localSSHHandle')
    registerLocalSSHHandlers()

    const connectHandler = ipcHandleMock.mock.calls.find(([channel]) => channel === 'local:connect')?.[1]
    expect(connectHandler).toBeTypeOf('function')

    await connectHandler(null, {
      id: 'local-test',
      shell: '/bin/zsh',
      termType: 'xterm-256color',
      startupMode: 'fast'
    })

    expect(spawnMock).toHaveBeenCalledWith(
      '/bin/zsh',
      [],
      expect.objectContaining({
        name: 'xterm-256color',
        cols: 80,
        rows: 24
      })
    )
  })

  it('does not inherit IDE terminal identity into local shells', async () => {
    process.env.TERM_PROGRAM = 'vscode'
    process.env.VSCODE_GIT_ASKPASS_NODE = '/Applications/Cursor.app/Contents/Frameworks/Cursor'
    process.env.CURSOR_WORKSPACE_LABEL = 'Chaterm'

    const { registerLocalSSHHandlers } = await import('../localSSHHandle')
    registerLocalSSHHandlers()

    const connectHandler = ipcHandleMock.mock.calls.find(([channel]) => channel === 'local:connect')?.[1]
    expect(connectHandler).toBeTypeOf('function')

    await connectHandler(null, {
      id: 'local-test',
      shell: '/bin/zsh',
      termType: 'xterm-256color'
    })

    const spawnOptions = spawnMock.mock.calls[0]?.[2]
    expect(spawnOptions.env.TERM_PROGRAM).toBe('Chaterm')
    expect(spawnOptions.env.VSCODE_GIT_ASKPASS_NODE).toBeUndefined()
    expect(spawnOptions.env.CURSOR_WORKSPACE_LABEL).toBeUndefined()
  })
})
