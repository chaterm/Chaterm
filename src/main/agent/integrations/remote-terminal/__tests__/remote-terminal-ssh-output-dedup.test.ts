import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequire, Module } from 'module'

const require = createRequire(import.meta.url)
const electronPath = require.resolve('electron')
const mockElectronModule = new Module(electronPath)
mockElectronModule.filename = electronPath
mockElectronModule.loaded = true
mockElectronModule.exports = {
  app: { getAppPath: () => process.cwd() },
  webContents: { getFocusedWebContents: vi.fn() }
}
require.cache[electronPath] = mockElectronModule

vi.mock('electron', () => ({
  app: { getAppPath: () => process.cwd() },
  webContents: { getFocusedWebContents: vi.fn() }
}))

const remoteSshExecStreamMock = vi.fn()

vi.mock('../../../../ssh/agentHandle', () => ({
  remoteSshConnect: vi.fn(),
  remoteSshExecStream: (...args: any[]) => remoteSshExecStreamMock(...args),
  remoteSshDisconnect: vi.fn(),
  handleRemoteExecInput: vi.fn().mockReturnValue({ success: true })
}))

vi.mock('../../../../ssh/capabilityRegistry', () => ({
  capabilityRegistry: { getBastion: vi.fn() },
  BastionErrorCode: {
    CAPABILITY_NOT_FOUND: 'BASTION_CAPABILITY_NOT_FOUND',
    AGENT_EXEC_UNAVAILABLE: 'BASTION_AGENT_EXEC_UNAVAILABLE'
  }
}))

vi.mock('../jumpserverHandle', () => ({
  handleJumpServerConnection: vi.fn(),
  jumpserverShellStreams: new Map(),
  jumpserverMarkedCommands: new Map()
}))

describe('RemoteTerminalProcess SSH output', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    remoteSshExecStreamMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not duplicate delayed prompt line when newline arrives', async () => {
    remoteSshExecStreamMock.mockImplementation(async (_sessionId: string, _command: string, onData: (chunk: string) => void) => {
      onData('Password: ')

      setTimeout(() => {
        onData('\nYou entered: adfaf\n')
      }, 200)

      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ success: true })
        }, 200)
      })
    })

    const { RemoteTerminalProcess } = await import('../index')
    const process = new RemoteTerminalProcess()
    const lines: string[] = []

    process.on('line', (line) => lines.push(line))

    const runPromise = process.run('session-1', 'bash -c "printf \'Password: \'"')

    await vi.advanceTimersByTimeAsync(200)
    await runPromise

    expect(lines).toEqual(['Password: ', 'You entered: adfaf'])
  })
})
