import { Writable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sshState = vi.hoisted(() => ({
  sftpConnections: new Map<string, any>(),
  connectionStatus: new Map<string, any>(),
  ipcHandlers: new Map<string, any>()
}))

const originalTZ = process.env.TZ

const setupModule = async () => {
  vi.resetModules()
  sshState.sftpConnections.clear()
  sshState.connectionStatus.clear()
  sshState.ipcHandlers.clear()
  ;(globalThis as any).createLogger = vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }))

  vi.doMock('electron', () => ({
    app: { getPath: vi.fn(() => '') },
    ipcMain: {
      handle: vi.fn((channel: string, handler: any) => {
        sshState.ipcHandlers.set(channel, handler)
      })
    }
  }))

  vi.doMock('ssh2', () => ({
    Client: vi.fn()
  }))

  vi.doMock('../sshHandle', () => ({
    getSftpConnection: vi.fn(),
    getUniqueRemoteName: vi.fn(),
    pickReconnectConnectionInfo: vi.fn(),
    connectionStatus: sshState.connectionStatus,
    sftpConnections: sshState.sftpConnections,
    sshConnections: new Map(),
    sshConnectionPool: new Map(),
    KeyboardInteractiveTimeout: 1000,
    handleRequestKeyboardInteractive: vi.fn(),
    getConnectionPoolKey: vi.fn(),
    createProxyCommandSocket: vi.fn()
  }))

  vi.doMock('../jumpserverHandle', () => ({
    jumpserverConnections: new Map()
  }))

  vi.doMock('../proxy', () => ({
    createProxySocket: vi.fn()
  }))

  vi.doMock('../algorithms', () => ({
    getAlgorithmsByAssetType: vi.fn()
  }))

  vi.doMock('../jumpserver/connectionManager', () => ({
    getPackageInfo: vi.fn(() => ({ name: 'chaterm', version: 'test' }))
  }))

  return await import('../sftpTransfer')
}

describe('sftpTransfer root path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as any).createLogger
    if (originalTZ === undefined) {
      delete process.env.TZ
    } else {
      process.env.TZ = originalTZ
    }
  })

  it('stores the real SFTP current directory on a successful session', async () => {
    const { initSftpOnConnection } = await setupModule()
    const connectionId = 'zhwysftp@10.0.0.8:local:aG9zdA==:files-left'
    const sftp = {
      readdir: vi.fn((_path: string, cb: (err: Error | null, list?: any[]) => void) => cb(null, [])),
      realpath: vi.fn((_path: string, cb: (err: Error | null, resolved?: string) => void) => cb(null, '/srv/chroot/upload'))
    }
    const conn = {
      sftp: vi.fn((cb: (err: Error | null, sftp?: any) => void) => cb(null, sftp))
    }

    await initSftpOnConnection(conn as any, connectionId)

    expect(sshState.sftpConnections.get(connectionId)).toMatchObject({
      isSuccess: true,
      rootPath: '/srv/chroot/upload'
    })
    expect(sshState.connectionStatus.get(connectionId)).toMatchObject({
      sftpAvailable: true,
      sftpRootPath: '/srv/chroot/upload'
    })
  })
  it('writes remote file content through an SFTP stream', async () => {
    const { registerFileSystemHandlers } = await setupModule()
    const { getSftpConnection } = await import('../sshHandle')
    const chunks: Buffer[] = []
    const writeStream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk))
        callback()
      }
    })
    const sftp = {
      stat: vi.fn((_path: string, cb: (err: Error | null, st?: any) => void) => cb(null, {})),
      createWriteStream: vi.fn(() => writeStream)
    }

    vi.mocked(getSftpConnection).mockReturnValue(sftp)
    registerFileSystemHandlers()

    const writeHandler = sshState.ipcHandlers.get('ssh:sftp:write-file')
    const content = `${'hello\n'.repeat(10000)}EOFChaterm:save`
    const result = await writeHandler({}, { id: 'remote-id', remotePath: '/tmp/a file.txt', content })

    expect(result).toEqual({ status: 'success', remotePath: '/tmp/a file.txt' })
    expect(sftp.createWriteStream).toHaveBeenCalledWith('/tmp/a file.txt', { flags: 'w' })
    expect(Buffer.concat(chunks).toString('utf8')).toBe(content)
  })
  it('formats remote SFTP modified times in local time', async () => {
    process.env.TZ = 'Asia/Shanghai'
    const { registerFileSystemHandlers } = await setupModule()
    const { getSftpConnection } = await import('../sshHandle')
    const mtime = Date.UTC(2024, 5, 1, 0, 0, 0) / 1000
    const sftp = {
      stat: vi.fn((_path: string, cb: (err: Error | null, st?: any) => void) => cb(null, {})),
      readdir: vi.fn((_path: string, cb: (err: Error | null, list?: any[]) => void) =>
        cb(null, [
          {
            filename: 'uploaded.txt',
            attrs: {
              mtime,
              size: 1,
              mode: 0o100644,
              isDirectory: () => false,
              isSymbolicLink: () => false
            }
          }
        ])
      )
    }

    vi.mocked(getSftpConnection).mockReturnValue(sftp)
    registerFileSystemHandlers()

    const listHandler = sshState.ipcHandlers.get('ssh:sftp:list')
    const result = await listHandler({}, { path: '/tmp', id: 'remote-id' })

    expect(result[0].modTime).toBe('2024-06-01 08:00:00')
  })
})
