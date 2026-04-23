import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequire, Module } from 'module'

const require = createRequire(import.meta.url)
const electronPath = require.resolve('electron')
const mockElectronModule = new Module(electronPath)
mockElectronModule.filename = electronPath
mockElectronModule.loaded = true
mockElectronModule.exports = {
  app: { getAppPath: () => process.cwd() },
  webContents: { getFocusedWebContents: vi.fn(() => ({ executeJavaScript: vi.fn(() => Promise.resolve(null)) })) }
}
require.cache[electronPath] = mockElectronModule

vi.mock('electron', () => ({
  app: { getAppPath: () => process.cwd() },
  webContents: { getFocusedWebContents: vi.fn(() => ({ executeJavaScript: vi.fn(() => Promise.resolve(null)) })) }
}))

const remoteSshConnectMock = vi.fn()
const isRemoteConnectionAliveMock = vi.fn()

vi.mock('../../../../ssh/agentHandle', () => ({
  remoteSshConnect: remoteSshConnectMock,
  remoteSshExecStream: vi.fn().mockResolvedValue({ success: true }),
  remoteSshDisconnect: vi.fn(),
  isRemoteConnectionAlive: isRemoteConnectionAliveMock,
  isWakeupSession: vi.fn().mockReturnValue(false),
  openWakeupShell: vi.fn(),
  findWakeupConnectionInfoByHost: vi.fn().mockReturnValue(null)
}))

const getBastionMock = vi.fn()

vi.mock('../../../../ssh/capabilityRegistry', () => ({
  capabilityRegistry: {
    getBastion: (...args: any[]) => getBastionMock(...args)
  }
}))

const handleJumpServerConnectionMock = vi.fn()
const jumpserverShellStreams = new Map()

vi.mock('../jumpserverHandle', () => ({
  handleJumpServerConnection: handleJumpServerConnectionMock,
  jumpserverShellStreams,
  jumpserverMarkedCommands: new Map(),
  jumpServerDisconnect: vi.fn()
}))

describe('RemoteTerminalManager plugin bastion routing', () => {
  beforeEach(() => {
    remoteSshConnectMock.mockReset()
    isRemoteConnectionAliveMock.mockReset()
    getBastionMock.mockReset()
    handleJumpServerConnectionMock.mockReset()
    jumpserverShellStreams.clear()
  })

  it('uses bastion capability for create/disconnect when sshType is plugin-based', async () => {
    const connectMock = vi.fn(async () => ({ status: 'connected', sessionId: 'cap-session' }))
    const disconnectMock = vi.fn(async () => undefined)

    getBastionMock.mockReturnValue({
      type: 'tencent',
      connect: connectMock,
      disconnect: disconnectMock
    })

    const { RemoteTerminalManager } = await import('../index')
    const manager = new RemoteTerminalManager()

    manager.setConnectionInfo({
      sshType: 'tencent',
      asset_ip: '10.0.0.2',
      host: '172.16.0.10',
      port: 22,
      username: 'root',
      password: 'secret',
      needProxy: false
    })

    const terminal = await manager.createTerminal()

    expect(connectMock).toHaveBeenCalled()

    const { remoteSshConnect, remoteSshDisconnect } = await import('../../../../ssh/agentHandle')
    expect(remoteSshConnect).not.toHaveBeenCalled()

    await manager.disconnectTerminal(terminal.id)

    expect(disconnectMock).toHaveBeenCalledWith({ id: terminal.sessionId })
    expect(remoteSshDisconnect).not.toHaveBeenCalled()
  })

  it('prefers comment as targetAsset when provided', async () => {
    const connectMock = vi.fn(async () => ({ status: 'connected', sessionId: 'cap-session' }))

    getBastionMock.mockReturnValue({
      type: 'tencent',
      connect: connectMock
    })

    const { RemoteTerminalManager } = await import('../index')
    const manager = new RemoteTerminalManager()

    manager.setConnectionInfo({
      sshType: 'tencent',
      asset_ip: '10.0.0.2',
      host: '10.30.5.14',
      port: 22,
      username: 'root',
      password: 'secret',
      comment: 'ext-22b7275c90-1020-1(10.30.5.14:22|Linux_10.30.5.14)',
      needProxy: false
    })

    await manager.createTerminal()

    expect(connectMock).toHaveBeenCalled()
    const calls = connectMock.mock.calls as unknown as Array<[{ targetAsset?: string }]>
    const connectArgs = calls[0]?.[0]
    expect(connectArgs?.targetAsset).toBe('ext-22b7275c90-1020-1(10.30.5.14:22|Linux_10.30.5.14)')
  })

  it('reconnects instead of reusing a stale SSH terminal', async () => {
    remoteSshConnectMock.mockResolvedValueOnce({ id: 'ssh-session-1' }).mockResolvedValueOnce({ id: 'ssh-session-2' })
    isRemoteConnectionAliveMock.mockReturnValue(false)

    const { RemoteTerminalManager } = await import('../index')
    const manager = new RemoteTerminalManager()

    manager.setConnectionInfo({
      sshType: 'ssh',
      host: '172.16.0.10',
      port: 22,
      username: 'root',
      password: 'secret',
      needProxy: false
    })

    const firstTerminal = await manager.createTerminal()
    const secondTerminal = await manager.createTerminal()

    expect(firstTerminal.sessionId).toBe('ssh-session-1')
    expect(secondTerminal.sessionId).toBe('ssh-session-2')
    expect(remoteSshConnectMock).toHaveBeenCalledTimes(2)
  })

  it('reconnects instead of reusing a stale JumpServer terminal', async () => {
    handleJumpServerConnectionMock
      .mockResolvedValueOnce({ status: 'connected', message: 'ok' })
      .mockResolvedValueOnce({ status: 'connected', message: 'ok' })

    const { RemoteTerminalManager } = await import('../index')
    const manager = new RemoteTerminalManager()

    manager.setConnectionInfo({
      sshType: 'jumpserver',
      asset_ip: '10.0.0.2',
      host: '172.16.0.10',
      port: 22,
      username: 'root',
      password: 'secret',
      needProxy: false
    })

    const firstTerminal = await manager.createTerminal()
    jumpserverShellStreams.set(firstTerminal.sessionId, { writable: true })
    jumpserverShellStreams.clear()

    const secondTerminal = await manager.createTerminal()

    expect(secondTerminal.sessionId).not.toBe(firstTerminal.sessionId)
    expect(handleJumpServerConnectionMock).toHaveBeenCalledTimes(2)
  })
})
