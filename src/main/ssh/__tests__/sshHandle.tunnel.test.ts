import { EventEmitter } from 'events'
import { afterEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: any, payload?: any) => any

class FakeShellStream extends EventEmitter {
  public stderr = new EventEmitter()

  end() {
    this.emit('close')
  }

  write(_data: unknown, cb?: (err?: Error) => void) {
    cb?.()
  }
}

class FakeDuplexStream extends EventEmitter {
  destroy() {
    this.emit('close')
  }

  pipe(destination: any) {
    return destination
  }
}

class FakeSocket extends EventEmitter {
  public remoteAddress = '127.0.0.1'
  public remotePort = 56000

  destroy() {
    this.emit('close')
  }

  pipe(destination: any) {
    return destination
  }
}

class FakeNetServer extends EventEmitter {
  public listen = vi.fn((_options: any) => {
    this.emit('listening')
    return this
  })

  public close = vi.fn(() => {
    this.emit('close')
  })
}

class FakeClient extends EventEmitter {
  public _sock = { destroyed: false }
  public currentShellStream: FakeShellStream | null = null
  public lastConnectConfig: Record<string, unknown> | null = null
  public forwardInCalls: Array<{ host: string; port: number }> = []
  public unforwardInCalls: Array<{ host: string; port: number }> = []
  public offCalls: Array<{ event: string | symbol; listener: (...args: any[]) => void }> = []

  connect(config: Record<string, unknown>) {
    this.lastConnectConfig = config
    this.emit('ready')
  }

  shell(_opts: Record<string, unknown>, cb: (err: Error | null, stream: FakeShellStream) => void) {
    const stream = new FakeShellStream()
    this.currentShellStream = stream
    cb(null, stream)
  }

  exec(_cmd: string, _opts: any, cbArg?: any) {
    const cb = typeof _opts === 'function' ? _opts : cbArg
    if (typeof cb !== 'function') return
    const stream = new FakeShellStream()
    cb(null, stream)
    stream.emit('close', 0)
  }

  forwardOut(_srcHost: string, _srcPort: number, _dstHost: string, _dstPort: number, cb: (err?: Error | null, stream?: any) => void) {
    cb(null, new FakeDuplexStream())
  }

  forwardIn(host: string, port: number, cb: (err?: Error | null) => void) {
    this.forwardInCalls.push({ host, port })
    cb(null)
  }

  unforwardIn(host: string, port: number, cb: () => void) {
    this.unforwardInCalls.push({ host, port })
    cb()
  }

  override off(eventName: string | symbol, listener: (...args: any[]) => void): this {
    this.offCalls.push({ event: eventName, listener })
    return super.off(eventName, listener)
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
  const createdServers: FakeNetServer[] = []

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

  const createServerMock = vi.fn((_listener?: (socket: FakeSocket) => void) => {
    const server = new FakeNetServer()
    createdServers.push(server)
    return server
  })

  const connectMock = vi.fn(() => new FakeSocket())

  vi.doMock('net', () => ({
    createServer: createServerMock,
    connect: connectMock
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
    createdServers
  }
}

const connectSession = async (handlers: Map<string, IpcHandler>, id: string) => {
  const connectHandler = handlers.get('ssh:connect')
  expect(connectHandler).toBeTypeOf('function')
  const result = await connectHandler!({ sender: { send: vi.fn() } }, baseConnectionInfo(id))
  expect(result).toMatchObject({ status: 'connected' })
}

describe('sshHandle tunnel handlers', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('rejects invalid tunnel payload and missing connection', async () => {
    const { handlers } = await setupHandlers()
    const startHandler = handlers.get('ssh:tunnel:start')
    expect(startHandler).toBeTypeOf('function')

    const invalidParams = await startHandler!({}, { connectionId: '', tunnelId: 't-1', type: 'dynamic_socks', localPort: 1080 })
    expect(invalidParams).toEqual({ success: false, error: 'Invalid tunnel parameters' })

    const invalidRemote = await startHandler!(
      {},
      {
        connectionId: 'session-not-connected',
        tunnelId: 't-2',
        type: 'local_forward',
        localPort: 1080
      }
    )
    expect(invalidRemote).toEqual({ success: false, error: 'Invalid remote port' })

    const missingConnection = await startHandler!(
      {},
      {
        connectionId: 'session-not-connected',
        tunnelId: 't-3',
        type: 'dynamic_socks',
        localPort: 1080
      }
    )
    expect(missingConnection).toEqual({ success: false, error: 'SSH connection not found' })
  })

  it('starts and stops local forward tunnel via IPC handlers', async () => {
    const { handlers, createdServers } = await setupHandlers()
    const id = 'session-local'
    await connectSession(handlers, id)

    const startHandler = handlers.get('ssh:tunnel:start')
    const stopHandler = handlers.get('ssh:tunnel:stop')
    expect(startHandler).toBeTypeOf('function')
    expect(stopHandler).toBeTypeOf('function')

    const startResult = await startHandler!(
      {},
      {
        connectionId: id,
        tunnelId: 'tunnel-local',
        type: 'local_forward',
        localPort: 17890,
        remotePort: 3306
      }
    )
    expect(startResult).toEqual({ success: true })
    expect(createdServers.length).toBe(1)
    expect(createdServers[0].listen).toHaveBeenCalledTimes(1)

    const stopResult = await stopHandler!({}, { tunnelId: 'tunnel-local' })
    expect(stopResult).toEqual({ success: true })
    expect(createdServers[0].close).toHaveBeenCalledTimes(1)
  })

  it('restarting same tunnel id cleans previous tunnel resources', async () => {
    const { handlers, createdServers } = await setupHandlers()
    const id = 'session-restart'
    await connectSession(handlers, id)

    const startHandler = handlers.get('ssh:tunnel:start')
    expect(startHandler).toBeTypeOf('function')

    const firstStart = await startHandler!(
      {},
      {
        connectionId: id,
        tunnelId: 'tunnel-restart',
        type: 'dynamic_socks',
        localPort: 17891
      }
    )
    expect(firstStart).toEqual({ success: true })
    const firstServer = createdServers[0]
    expect(firstServer).toBeDefined()

    const secondStart = await startHandler!(
      {},
      {
        connectionId: id,
        tunnelId: 'tunnel-restart',
        type: 'dynamic_socks',
        localPort: 17892
      }
    )
    expect(secondStart).toEqual({ success: true })
    expect(firstServer.close).toHaveBeenCalledTimes(1)
    expect(createdServers.length).toBe(2)
  })

  it('stopping remote forward tunnel removes tcp listener and unforward mapping', async () => {
    const { handlers, createdClients } = await setupHandlers()
    const id = 'session-remote'
    await connectSession(handlers, id)

    const startHandler = handlers.get('ssh:tunnel:start')
    const stopHandler = handlers.get('ssh:tunnel:stop')
    expect(startHandler).toBeTypeOf('function')
    expect(stopHandler).toBeTypeOf('function')

    const startResult = await startHandler!(
      {},
      {
        connectionId: id,
        tunnelId: 'tunnel-remote',
        type: 'remote_forward',
        localPort: 17893,
        remotePort: 9000
      }
    )
    expect(startResult).toEqual({ success: true })

    const client = createdClients[0]
    expect(client).toBeDefined()
    expect(client.forwardInCalls).toEqual([{ host: 'localhost', port: 9000 }])

    const stopResult = await stopHandler!({}, { tunnelId: 'tunnel-remote' })
    expect(stopResult).toEqual({ success: true })
    expect(client.unforwardInCalls).toEqual([{ host: 'localhost', port: 9000 }])
    expect(client.offCalls.some((entry) => entry.event === 'tcp connection')).toBe(true)
  })

  it('disconnect cleans up started tunnels for the connection', async () => {
    const { handlers, createdServers } = await setupHandlers()
    const id = 'session-disconnect-cleanup'
    await connectSession(handlers, id)

    const startHandler = handlers.get('ssh:tunnel:start')
    const disconnectHandler = handlers.get('ssh:disconnect')
    expect(startHandler).toBeTypeOf('function')
    expect(disconnectHandler).toBeTypeOf('function')

    const startResult = await startHandler!(
      {},
      {
        connectionId: id,
        tunnelId: 'tunnel-disconnect',
        type: 'dynamic_socks',
        localPort: 17894
      }
    )
    expect(startResult).toEqual({ success: true })
    expect(createdServers.length).toBe(1)

    const disconnectResult = await disconnectHandler!({}, { id })
    expect(disconnectResult).toMatchObject({ status: 'success' })
    expect(createdServers[0].close).toHaveBeenCalledTimes(1)
  })

  it('rejects stop when tunnel id is empty', async () => {
    const { handlers } = await setupHandlers()
    const stopHandler = handlers.get('ssh:tunnel:stop')
    expect(stopHandler).toBeTypeOf('function')

    const result = await stopHandler!({}, { tunnelId: '' })
    expect(result).toEqual({ success: false, error: 'Invalid tunnelId' })
  })
})
