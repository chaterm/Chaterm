import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { capabilityRegistry } from '../capabilityRegistry'
import { connectBastionByType, deleteBastionSessionType, disconnectBastionSession, getBastionSessionType } from '../bastionPlugin'

const { loggerInfo, loggerWarn } = vi.hoisted(() => ({
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn()
}))

vi.mock('@logging/index', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: loggerInfo,
    warn: loggerWarn,
    error: vi.fn()
  })
}))

describe('plugin bastion connection lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capabilityRegistry.clearBastions()
  })

  afterEach(() => {
    deleteBastionSessionType('pending-session')
    capabilityRegistry.clearBastions()
  })

  it('routes disconnect while the bastion connection is still pending', async () => {
    let resolveConnect!: (result: { status: 'error'; message: string }) => void
    const connect = vi.fn(
      () =>
        new Promise<{ status: 'error'; message: string }>((resolve) => {
          resolveConnect = resolve
        })
    )
    const disconnect = vi.fn().mockResolvedValue(undefined)

    capabilityRegistry.registerBastionDefinition({
      type: 'qizhi',
      version: 1,
      displayNameKey: 'personal.qizhi',
      assetTypePrefix: 'organization-qizhi',
      authPolicy: ['password'],
      supportsRefresh: false,
      supportsShellStream: false,
      agentExec: 'stream'
    })
    capabilityRegistry.registerBastion({
      type: 'qizhi',
      connect,
      shell: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      disconnect
    })

    const connectPromise = connectBastionByType('qizhi', { id: 'pending-session' }, {} as Electron.IpcMainInvokeEvent)
    await Promise.resolve()

    expect(loggerInfo).toHaveBeenCalledWith('Registered pending bastion session', {
      event: 'ssh.bastion.session.pending',
      sshType: 'qizhi',
      sessionId: 'pending-session'
    })

    const result = await disconnectBastionSession('pending-session')

    expect(result).toMatchObject({ status: 'success' })
    expect(disconnect).toHaveBeenCalledWith({ id: 'pending-session' })
    expect(loggerInfo).toHaveBeenCalledWith('Bastion disconnect completed', {
      event: 'ssh.bastion.disconnect.success',
      sshType: 'qizhi',
      sessionId: 'pending-session'
    })

    resolveConnect({ status: 'error', message: 'cancelled' })
    await connectPromise
  })

  it('does not revive a bastion session that completes after cancellation', async () => {
    let resolveConnect!: (result: { status: 'connected'; sessionId: string }) => void
    const connect = vi.fn(
      () =>
        new Promise<{ status: 'connected'; sessionId: string }>((resolve) => {
          resolveConnect = resolve
        })
    )
    const disconnect = vi.fn().mockResolvedValue(undefined)

    capabilityRegistry.registerBastionDefinition({
      type: 'qizhi',
      version: 1,
      displayNameKey: 'personal.qizhi',
      assetTypePrefix: 'organization-qizhi',
      authPolicy: ['password'],
      supportsRefresh: false,
      supportsShellStream: false,
      agentExec: 'stream'
    })
    capabilityRegistry.registerBastion({
      type: 'qizhi',
      connect,
      shell: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      disconnect
    })

    const connectPromise = connectBastionByType('qizhi', { id: 'pending-session' }, {} as Electron.IpcMainInvokeEvent)
    await Promise.resolve()
    await disconnectBastionSession('pending-session')

    resolveConnect({ status: 'connected', sessionId: 'pending-session' })
    const result = await connectPromise

    expect(result).toMatchObject({ status: 'error', code: 'BASTION_CONNECT_FAILED' })
    expect(disconnect).toHaveBeenCalledTimes(2)
    expect(getBastionSessionType('pending-session')).toBeUndefined()
  })

  it('marks cancellation before asynchronous plugin cleanup completes', async () => {
    let resolveConnect!: (result: { status: 'connected'; sessionId: string }) => void
    const disconnectResolvers: Array<() => void> = []
    const connect = vi.fn(
      () =>
        new Promise<{ status: 'connected'; sessionId: string }>((resolve) => {
          resolveConnect = resolve
        })
    )
    const disconnect = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          disconnectResolvers.push(resolve)
        })
    )

    capabilityRegistry.registerBastionDefinition({
      type: 'qizhi',
      version: 1,
      displayNameKey: 'personal.qizhi',
      assetTypePrefix: 'organization-qizhi',
      authPolicy: ['password'],
      supportsRefresh: false,
      supportsShellStream: false,
      agentExec: 'stream'
    })
    capabilityRegistry.registerBastion({
      type: 'qizhi',
      connect,
      shell: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      disconnect
    })

    const connectPromise = connectBastionByType('qizhi', { id: 'pending-session' }, {} as Electron.IpcMainInvokeEvent)
    await Promise.resolve()
    const disconnectPromise = disconnectBastionSession('pending-session')

    resolveConnect({ status: 'connected', sessionId: 'pending-session' })
    await Promise.resolve()

    expect(disconnect).toHaveBeenCalledTimes(2)
    disconnectResolvers.forEach((resolve) => resolve())

    await expect(connectPromise).resolves.toMatchObject({ status: 'error', code: 'BASTION_CONNECT_FAILED' })
    await expect(disconnectPromise).resolves.toMatchObject({ status: 'success' })
  })

  it('keeps disconnect routing while a plugin reports MFA is required', async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined)

    capabilityRegistry.registerBastionDefinition({
      type: 'qizhi',
      version: 1,
      displayNameKey: 'personal.qizhi',
      assetTypePrefix: 'organization-qizhi',
      authPolicy: ['password'],
      supportsRefresh: false,
      supportsShellStream: false,
      agentExec: 'stream'
    })
    capabilityRegistry.registerBastion({
      type: 'qizhi',
      connect: vi.fn().mockResolvedValue({ status: 'mfa_required', sessionId: 'pending-session' }),
      shell: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      disconnect
    })

    await expect(connectBastionByType('qizhi', { id: 'pending-session' }, {} as Electron.IpcMainInvokeEvent)).resolves.toMatchObject({
      status: 'mfa_required'
    })

    expect(getBastionSessionType('pending-session')).toBe('qizhi')
    await expect(disconnectBastionSession('pending-session')).resolves.toMatchObject({ status: 'success' })
    expect(disconnect).toHaveBeenCalledWith({ id: 'pending-session' })
  })

  it('keeps a session cancelled when plugin cleanup rejects', async () => {
    let resolveConnect!: (result: { status: 'connected'; sessionId: string }) => void
    const connect = vi.fn(
      () =>
        new Promise<{ status: 'connected'; sessionId: string }>((resolve) => {
          resolveConnect = resolve
        })
    )
    const disconnect = vi.fn().mockRejectedValue(new Error('cleanup failed'))

    capabilityRegistry.registerBastionDefinition({
      type: 'qizhi',
      version: 1,
      displayNameKey: 'personal.qizhi',
      assetTypePrefix: 'organization-qizhi',
      authPolicy: ['password'],
      supportsRefresh: false,
      supportsShellStream: false,
      agentExec: 'stream'
    })
    capabilityRegistry.registerBastion({
      type: 'qizhi',
      connect,
      shell: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      disconnect
    })

    const connectPromise = connectBastionByType('qizhi', { id: 'pending-session' }, {} as Electron.IpcMainInvokeEvent)
    await Promise.resolve()
    await expect(disconnectBastionSession('pending-session')).resolves.toMatchObject({ status: 'error', message: 'cleanup failed' })
    expect(getBastionSessionType('pending-session')).toBeUndefined()

    resolveConnect({ status: 'connected', sessionId: 'pending-session' })
    await expect(connectPromise).resolves.toMatchObject({ status: 'error', code: 'BASTION_CONNECT_FAILED' })
    expect(disconnect).toHaveBeenCalledTimes(2)
  })
})
