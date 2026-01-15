import { describe, it, expect, vi, beforeEach } from 'vitest'
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

vi.mock('../../../../ssh/agentHandle', () => ({
  remoteSshConnect: vi.fn(),
  remoteSshExecStream: vi.fn().mockResolvedValue({ success: true }),
  remoteSshDisconnect: vi.fn()
}))

const getBastionMock = vi.fn()

vi.mock('../../../../ssh/capabilityRegistry', () => ({
  capabilityRegistry: {
    getBastion: (...args: any[]) => getBastionMock(...args)
  },
  BastionErrorCode: {
    AGENT_EXEC_UNAVAILABLE: 'BASTION_AGENT_EXEC_UNAVAILABLE',
    CAPABILITY_NOT_FOUND: 'BASTION_CAPABILITY_NOT_FOUND'
  }
}))

vi.mock('../jumpserverHandle', () => ({
  handleJumpServerConnection: vi.fn(),
  jumpserverShellStreams: new Map(),
  jumpserverMarkedCommands: new Map()
}))

describe('RemoteTerminalProcess bastion execution', () => {
  beforeEach(() => {
    getBastionMock.mockReset()
  })

  it('rejects when bastion capability lacks getShellStream', async () => {
    getBastionMock.mockReturnValue({
      type: 'qizhi',
      write: vi.fn()
    })

    const { RemoteTerminalProcess } = await import('../index')
    const process = new RemoteTerminalProcess()

    await expect(process.run('session-1', 'whoami', undefined, 'qizhi')).rejects.toThrow(/BASTION_AGENT_EXEC_UNAVAILABLE/i)
  })

  it('rejects when bastion capability is missing and does not fall back to SSH', async () => {
    getBastionMock.mockReturnValue(undefined)

    const { RemoteTerminalProcess } = await import('../index')
    const process = new RemoteTerminalProcess()

    await expect(process.run('session-1', 'whoami', undefined, 'tencent')).rejects.toThrow(/BASTION_CAPABILITY_NOT_FOUND/i)

    const { remoteSshExecStream } = await import('../../../../ssh/agentHandle')
    expect(remoteSshExecStream).not.toHaveBeenCalled()
  })
})
