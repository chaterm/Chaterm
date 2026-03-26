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

class FakeClient extends EventEmitter {
  public _sock = { destroyed: false }
  public currentShellStream: FakeShellStream | null = null
  public lastConnectConfig: Record<string, unknown> | null = null

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
    createdClients
  }
}

const getCloseInfo = (sendSpy: ReturnType<typeof vi.fn>, id: string) => {
  const closeCalls = sendSpy.mock.calls.filter((call) => call[0] === `ssh:shell:close:${id}`)
  expect(closeCalls.length).toBeGreaterThan(0)
  return closeCalls[closeCalls.length - 1][1]
}

const connectAndOpenShell = async (handlers: Map<string, IpcHandler>, id: string, sendSpy: ReturnType<typeof vi.fn>) => {
  const connectHandler = handlers.get('ssh:connect')
  const shellHandler = handlers.get('ssh:shell')
  expect(connectHandler).toBeTypeOf('function')
  expect(shellHandler).toBeTypeOf('function')

  await connectHandler!({ sender: { send: vi.fn() } }, baseConnectionInfo(id))
  const shellPromise = shellHandler!({ sender: { send: sendSpy } }, { id, terminalType: 'xterm-256color' })
  await new Promise((resolve) => setTimeout(resolve, 350))
  await shellPromise
}

describe('sshHandle reconnect close classification', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('emits network close info when connection error has network code', async () => {
    const { handlers, createdClients } = await setupHandlers()
    const id = 'session-network-code'
    const sendSpy = vi.fn()
    await connectAndOpenShell(handlers, id, sendSpy)

    const client = createdClients[0]
    expect(client).toBeDefined()
    client.emit('error', { code: 'ECONNRESET', message: 'connection reset by peer' })
    client.currentShellStream?.emit('close')

    const closeInfo = getCloseInfo(sendSpy, id)
    expect(closeInfo).toMatchObject({
      reason: 'network',
      isNetworkDisconnect: true,
      errorCode: 'ECONNRESET'
    })
  })

  it('emits manual close info on explicit disconnect', async () => {
    const { handlers } = await setupHandlers()
    const id = 'session-manual'
    const sendSpy = vi.fn()
    await connectAndOpenShell(handlers, id, sendSpy)

    const disconnectHandler = handlers.get('ssh:disconnect')
    expect(disconnectHandler).toBeTypeOf('function')

    const result = await disconnectHandler!({}, { id })
    expect(result).toMatchObject({ status: 'success' })

    const closeInfo = getCloseInfo(sendSpy, id)
    expect(closeInfo).toEqual({
      reason: 'manual',
      isNetworkDisconnect: false
    })
  })

  it('emits unknown close info when transport closes without prior error', async () => {
    const { handlers, createdClients } = await setupHandlers()
    const id = 'session-unknown'
    const sendSpy = vi.fn()
    await connectAndOpenShell(handlers, id, sendSpy)

    const client = createdClients[0]
    expect(client).toBeDefined()
    client.emit('close')
    client.currentShellStream?.emit('close')

    const closeInfo = getCloseInfo(sendSpy, id)
    expect(closeInfo).toMatchObject({
      reason: 'unknown',
      isNetworkDisconnect: false,
      errorMessage: 'SSH connection closed'
    })
  })

  it('classifies network disconnect by error message pattern when code is absent', async () => {
    const { handlers, createdClients } = await setupHandlers()
    const id = 'session-network-message'
    const sendSpy = vi.fn()
    await connectAndOpenShell(handlers, id, sendSpy)

    const client = createdClients[0]
    expect(client).toBeDefined()
    client.currentShellStream?.emit('error', { message: 'socket hang up while reading from channel' })
    client.currentShellStream?.emit('close')

    const closeInfo = getCloseInfo(sendSpy, id)
    expect(closeInfo).toMatchObject({
      reason: 'network',
      isNetworkDisconnect: true,
      errorMessage: 'socket hang up while reading from channel'
    })
  })
})
