import { EventEmitter } from 'events'
import { afterEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: any, payload?: any) => any

class FakeClient extends EventEmitter {
  public _sock = { destroyed: false }

  connect(_config: Record<string, unknown>) {
    this.emit('ready')
  }

  exec(_cmd: string, _opts: any, cbArg?: any) {
    const cb = typeof _opts === 'function' ? _opts : cbArg
    if (typeof cb !== 'function') return
    const stream = new EventEmitter() as EventEmitter & { stderr: EventEmitter }
    stream.stderr = new EventEmitter()
    cb(null, stream)
    stream.emit('close', 0)
  }

  sftp(cb: (err: Error | null, sftp?: any) => void) {
    cb(null, {})
  }

  end() {
    this._sock.destroyed = true
    this.emit('close')
  }
}

const baseConnectionInfo = (id: string) => ({
  id,
  host: '127.0.0.1',
  port: 22,
  username: 'tester',
  password: 'secret',
  sshType: 'ssh',
  disablePostConnectProbe: true
})

const setupHandlers = async () => {
  vi.resetModules()

  const handlers = new Map<string, IpcHandler>()
  const createdClients: FakeClient[] = []

  const ipcMainMock = {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlers.set(channel, handler)
    }),
    on: vi.fn(),
    once: vi.fn(),
    removeAllListeners: vi.fn()
  }

  const appMock = { getAppPath: () => process.cwd() }

  vi.doMock('electron', () => ({
    app: appMock,
    ipcMain: ipcMainMock,
    BrowserWindow: {
      fromWebContents: vi.fn(() => ({}))
    },
    dialog: {
      showOpenDialog: vi.fn(),
      showSaveDialog: vi.fn()
    },
    default: {
      app: appMock,
      ipcMain: ipcMainMock
    }
  }))

  const ClientMock = vi.fn(function MockClient(this: unknown) {
    const client = new FakeClient()
    createdClients.push(client)
    return client
  })

  vi.doMock('ssh2', () => ({
    Client: ClientMock
  }))

  vi.doMock('../proxy', () => ({
    createProxySocket: vi.fn()
  }))

  vi.doMock('../jumpserver/errorUtils', () => ({
    buildErrorResponse: vi.fn((error: unknown) => ({
      status: 'error',
      message: error instanceof Error ? error.message : String(error)
    }))
  }))

  vi.doMock('../jumpserverHandle', () => ({
    jumpserverConnections: new Map(),
    handleJumpServerConnection: vi.fn(),
    jumpserverShellStreams: new Map(),
    jumpserverExecStreams: new Map(),
    jumpserverMarkedCommands: new Map(),
    jumpserverConnectionStatus: new Map(),
    jumpserverLastCommand: new Map(),
    createJumpServerExecStream: vi.fn(),
    executeCommandOnJumpServerExec: vi.fn(),
    jumpserverSessionPids: new Map()
  }))

  vi.doMock('../algorithms', () => ({
    getAlgorithmsByAssetType: vi.fn(() => undefined)
  }))

  vi.doMock('../bastionPlugin', () => ({
    connectBastionByType: vi.fn(async () => null),
    shellBastionSession: vi.fn(async () => null),
    resizeBastionSession: vi.fn(async () => null),
    writeBastionSession: vi.fn(async () => null),
    disconnectBastionSession: vi.fn(async () => null)
  }))

  vi.doMock('../postConnectProbePolicy', () => ({
    shouldSkipPostConnectProbe: vi.fn(() => true)
  }))

  vi.doMock('../sftpTransfer', () => ({
    sftpConnectionInfoMap: new Map()
  }))

  vi.doMock('../ssh-agent/ChatermSSHAgent', () => ({
    SSHAgentManager: {
      getInstance: vi.fn(() => ({
        getAgent: vi.fn(),
        enableAgent: vi.fn(),
        addKey: vi.fn(),
        removeKey: vi.fn(),
        listKeys: vi.fn(() => [])
      }))
    }
  }))

  vi.doMock('@logging/index', () => ({
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    }))
  }))

  const sshHandle = await import('../sshHandle')
  sshHandle.registerSSHHandlers()

  return {
    handlers,
    createdClients,
    sshHandle
  }
}

describe('sshHandle wakeup reuse policy', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('does not reuse pooled connection when disablePoolReuse is true', async () => {
    const { handlers, createdClients } = await setupHandlers()
    const connectHandler = handlers.get('ssh:connect')
    expect(connectHandler).toBeTypeOf('function')

    const event = { sender: { send: vi.fn() } }

    const first = await connectHandler!(event as any, {
      ...baseConnectionInfo('wakeup-1'),
      wakeupSource: 'xshell-direct',
      disablePoolReuse: true
    })
    expect(first).toMatchObject({ status: 'connected' })
    expect(createdClients.length).toBe(1)

    const second = await connectHandler!(event as any, {
      ...baseConnectionInfo('wakeup-2'),
      wakeupSource: 'xshell-direct',
      disablePoolReuse: true
    })
    expect(second).toMatchObject({ status: 'connected', message: 'Connection successful' })
    expect(createdClients.length).toBe(2)
  })

  it('selects reusable wakeup connection by wakeupTabId', async () => {
    const { sshHandle } = await setupHandlers()
    const { sshConnectionPool, getReusableSshConnection, findWakeupConnectionInfoByHost } = sshHandle

    sshConnectionPool.clear()

    const connA = { _sock: { destroyed: false } }
    const connB = { _sock: { destroyed: false } }

    sshConnectionPool.set('127.0.0.1:22:tester:xshell-a', {
      conn: connA,
      sessions: new Set<string>(),
      host: '127.0.0.1',
      port: 22,
      username: 'tester',
      hasMfaAuth: true,
      isWakeupConnection: true,
      wakeupTabId: 'xshell-a',
      createdAt: Date.now() - 1000
    })

    sshConnectionPool.set('127.0.0.1:22:tester:xshell-b', {
      conn: connB,
      sessions: new Set<string>(),
      host: '127.0.0.1',
      port: 22,
      username: 'tester',
      hasMfaAuth: true,
      isWakeupConnection: true,
      wakeupTabId: 'xshell-b',
      createdAt: Date.now()
    })

    const reusable = (getReusableSshConnection as any)('127.0.0.1', 22, 'tester', { wakeupTabId: 'xshell-b' })
    expect(reusable?.conn).toBe(connB)

    const wakeupInfo = (findWakeupConnectionInfoByHost as any)('127.0.0.1', { wakeupTabId: 'xshell-b' })
    expect(wakeupInfo).toMatchObject({
      host: '127.0.0.1',
      port: 22,
      username: 'tester',
      wakeupTabId: 'xshell-b'
    })
  })

  it('does not let non-wakeup requests hit wakeup pool entries', async () => {
    const { sshHandle } = await setupHandlers()
    const { sshConnectionPool, getReusableSshConnection } = sshHandle
    sshConnectionPool.clear()

    const wakeupConn = { _sock: { destroyed: false } }
    const normalConn = { _sock: { destroyed: false } }

    sshConnectionPool.set('127.0.0.1:22:tester:wakeup-only', {
      conn: wakeupConn,
      sessions: new Set<string>(),
      host: '127.0.0.1',
      port: 22,
      username: 'tester',
      hasMfaAuth: true,
      isWakeupConnection: true,
      wakeupTabId: 'xshell-1',
      createdAt: Date.now() - 1000
    })

    sshConnectionPool.set('127.0.0.1:22:tester', {
      conn: normalConn,
      sessions: new Set<string>(),
      host: '127.0.0.1',
      port: 22,
      username: 'tester',
      hasMfaAuth: true,
      isWakeupConnection: false,
      createdAt: Date.now()
    })

    const normalReusable = (getReusableSshConnection as any)('127.0.0.1', 22, 'tester')
    expect(normalReusable?.conn).toBe(normalConn)

    sshConnectionPool.delete('127.0.0.1:22:tester')
    const noFallbackToWakeup = (getReusableSshConnection as any)('127.0.0.1', 22, 'tester')
    expect(noFallbackToWakeup).toBeNull()
  })
})
