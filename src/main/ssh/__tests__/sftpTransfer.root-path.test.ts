import { PassThrough, Writable } from 'node:stream'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sshState = vi.hoisted(() => ({
  sftpConnections: new Map<string, any>(),
  connectionStatus: new Map<string, any>(),
  ipcHandlers: new Map<string, any>()
}))

const originalTZ = process.env.TZ

const setupModule = async (localPath: typeof path = path) => {
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

  vi.doMock('node:path', () => ({ default: localPath }))

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
    vi.doUnmock('node:path')
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

  it('rejects remote traversal', async () => {
    const { registerFileSystemHandlers } = await setupModule()
    const { getSftpConnection } = await import('../sshHandle')
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'chaterm-sftp-download-'))
    const canary = path.join(parent, 'canary.txt')
    fs.writeFileSync(canary, 'ORIGINAL-CANARY')
    const sftp = { readdir: vi.fn((_p: string, cb: any) => cb(null, [{ filename: '../canary.txt', attrs: { mode: 0o100644 } }])) }
    vi.mocked(getSftpConnection).mockReturnValue(sftp)
    registerFileSystemHandlers()
    try {
      const result = await sshState.ipcHandlers.get('ssh:sftp:download-directory')({}, { id: 'remote-id', remoteDir: '/remote', localDir: parent })
      expect(result.status).toBe('error')
      expect(fs.readFileSync(canary, 'utf8')).toBe('ORIGINAL-CANARY')
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })

  describe('remote-to-remote directory transfer', () => {
    const entry = (filename: string, isDirectory = false) => ({ filename, attrs: { isDirectory: () => isDirectory } })

    const setupR2R = async (
      tree: Record<string, ReturnType<typeof entry>[]>,
      options: { fromDir?: string; toDir?: string; renamed?: string; localPath?: typeof path } = {}
    ) => {
      const { registerFileSystemHandlers } = await setupModule(options.localPath)
      const { getSftpConnection, getUniqueRemoteName } = await import('../sshHandle')
      const written: string[] = []
      const created: string[] = []
      const contents = new Map([['/dst/escaped.txt', 'ORIGINAL']])
      const src = {
        readdir: vi.fn((p: string, cb: any) => cb(null, tree[p] ?? [])),
        stat: vi.fn((_p: string, cb: any) => cb(null, { size: 4 })),
        createReadStream: vi.fn(() => {
          const stream = new PassThrough()
          process.nextTick(() => {
            stream.emit('open')
            stream.end('DATA')
          })
          return stream
        })
      }
      const dst = {
        mkdir: vi.fn((p: string, cb: any) => {
          created.push(p)
          cb(null)
        }),
        createWriteStream: vi.fn((p: string, opts: { flags: string }) => {
          written.push(p)
          const normalized = path.posix.normalize(p)
          if (opts.flags === 'w') contents.set(normalized, '')
          return new Writable({
            write(chunk, _encoding, done) {
              contents.set(normalized, (contents.get(normalized) ?? '') + chunk.toString())
              done()
            }
          })
        })
      }
      vi.mocked(getSftpConnection).mockImplementation((id: string) => (id === 'from-id' ? src : dst))
      vi.mocked(getUniqueRemoteName).mockImplementation(async (_sftp, _dir, name) => options.renamed ?? name)
      registerFileSystemHandlers()
      const event = { sender: { send: vi.fn() } }
      const result = await sshState.ipcHandlers.get('sftp:r2r:dir')(event, {
        fromId: 'from-id',
        toId: 'to-id',
        fromDir: options.fromDir ?? '/src/data',
        toDir: options.toDir ?? '/dst/parent'
      })
      return { result, written, created, contents, src, event, getUniqueRemoteName }
    }

    describe.each([false, true])('source entry isDirectory=%s', (isDirectory) => {
      it.each(['../../escaped.txt', 'a/../../../escaped.txt', String.raw`..\..\escaped.txt`, '/absolute', '.', '..', 'bad\0name', ''])(
        'rejects %j before reading file content or writing the entry',
        async (name) => {
          const { result, written, created, contents, src, event } = await setupR2R({ '/src/data': [entry(name, isDirectory)] })
          expect(result).toMatchObject({ status: 'error', message: expect.stringContaining('Unsafe remote filename rejected') })
          expect(written).toEqual([])
          expect(created).toEqual(['/dst/parent/data'])
          expect(contents.get('/dst/escaped.txt')).toBe('ORIGINAL')
          expect(src.readdir).toHaveBeenCalledTimes(1)
          expect(src.createReadStream).not.toHaveBeenCalled()
          expect(event.sender.send).toHaveBeenLastCalledWith(
            'ssh:sftp:transfer-progress',
            expect.objectContaining({ isGroup: true, status: 'error' })
          )
        }
      )
    })

    it.each(['../../../escaped.txt', String.raw`..\..\..\escaped.txt`])('rejects traversal inside a nested directory: %j', async (name) => {
      const { result, written, created, contents } = await setupR2R({
        '/src/data': [entry('nested', true)],
        '/src/data/nested': [entry(name)]
      })
      expect(result.status).toBe('error')
      expect(written).toEqual([])
      expect(created).toEqual(['/dst/parent/data', '/dst/parent/data/nested'])
      expect(contents.get('/dst/escaped.txt')).toBe('ORIGINAL')
    })

    it.each(['', '/', '/src/.', '/src/..', String.raw`/src/..\outside`, '/src/bad\0name'])(
      'rejects an unsafe transfer root %j before touching the destination',
      async (fromDir) => {
        const { result, written, created, src, getUniqueRemoteName } = await setupR2R({}, { fromDir })
        expect(result).toMatchObject({ status: 'error', message: expect.stringContaining('Unsafe remote filename rejected') })
        expect(created).toEqual([])
        expect(written).toEqual([])
        expect(src.readdir).not.toHaveBeenCalled()
        expect(getUniqueRemoteName).not.toHaveBeenCalled()
      }
    )

    it('validates the automatically renamed root before creating it', async () => {
      const { result, written, created } = await setupR2R({}, { renamed: '../outside' })
      expect(result.status).toBe('error')
      expect(created).toEqual([])
      expect(written).toEqual([])
    })

    describe.each([
      { platform: 'Windows', localPath: path.win32 },
      { platform: 'POSIX', localPath: path.posix }
    ])('remote paths on a $platform client', ({ localPath }) => {
      it.each(['/dst/parent', 'relative/parent'])('copies normal entries under %s with root auto-renaming', async (toDir) => {
        const { result, written, created, contents } = await setupR2R(
          {
            '/src/data': [entry('nested', true), entry('top.txt')],
            '/src/data/nested': [entry('报告 2026.txt')]
          },
          { localPath, toDir, renamed: 'data.1' }
        )
        const root = path.posix.join(toDir, 'data.1')
        expect(result).toMatchObject({ status: 'success', remotePath: root, totalFiles: 2 })
        expect(created).toEqual([root, `${root}/nested`])
        expect(written.sort()).toEqual([`${root}/nested/报告 2026.txt`, `${root}/top.txt`])
        for (const file of written) expect(contents.get(file)).toBe('DATA')
      })
    })
  })

  describe.each([
    { platform: 'Windows', localPath: path.win32, parent: 'C:\\downloads\\selected' },
    { platform: 'POSIX', localPath: path.posix, parent: '/downloads/selected' }
  ])('directory download root on $platform', ({ localPath, parent }) => {
    it.each([
      '',
      '/',
      '/remote/.',
      '/remote/..',
      '/remote/../',
      '/remote/bad\0name',
      String.raw`/remote/..\outside`,
      String.raw`/remote/....\something`
    ])('rejects unsafe root %j before creating directories or reading remote entries', async (remoteDir) => {
      const { registerFileSystemHandlers } = await setupModule(localPath)
      const { getSftpConnection } = await import('../sshHandle')
      const mkdir = vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined)
      const sftp = { readdir: vi.fn((_p: string, cb: any) => cb(null, [])) }
      const event = { sender: { send: vi.fn() } }
      vi.mocked(getSftpConnection).mockReturnValue(sftp)
      registerFileSystemHandlers()

      const result = await sshState.ipcHandlers.get('ssh:sftp:download-directory')(event, {
        id: 'remote-id',
        remoteDir,
        localDir: parent
      })

      expect(result).toMatchObject({ status: 'error', message: expect.stringContaining('Unsafe remote filename rejected'), errorSide: 'local' })
      expect(mkdir).not.toHaveBeenCalled()
      expect(sftp.readdir).not.toHaveBeenCalled()
      expect(event.sender.send).toHaveBeenLastCalledWith(
        'ssh:sftp:transfer-progress',
        expect.objectContaining({ status: 'error', isGroup: true, message: result.message })
      )
    })

    it.each(['/remote/reports', '/remote/reports/'])('downloads a safe root and its subdirectories from %s', async (remoteDir) => {
      const { registerFileSystemHandlers } = await setupModule(localPath)
      const { getSftpConnection } = await import('../sshHandle')
      const mkdir = vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined)
      const sftp = {
        readdir: vi.fn((_p: string, cb: any) => cb(null, []))
      }
      sftp.readdir.mockImplementationOnce((_p: string, cb: any) => cb(null, [{ filename: 'nested', attrs: { isDirectory: () => true } }]))
      vi.mocked(getSftpConnection).mockReturnValue(sftp)
      registerFileSystemHandlers()

      const result = await sshState.ipcHandlers.get('ssh:sftp:download-directory')({}, { id: 'remote-id', remoteDir, localDir: parent })

      expect(result).toMatchObject({ status: 'success', localPath: localPath.join(parent, 'reports') })
      expect(mkdir).toHaveBeenNthCalledWith(1, localPath.join(parent, 'reports'), { recursive: true })
      expect(mkdir).toHaveBeenNthCalledWith(2, localPath.join(parent, 'reports', 'nested'), { recursive: true })
      expect(sftp.readdir).toHaveBeenNthCalledWith(1, remoteDir, expect.any(Function))
      expect(sftp.readdir).toHaveBeenNthCalledWith(2, '/remote/reports/nested', expect.any(Function))
    })
  })

  describe.each([
    { platform: 'Windows', localPath: path.win32, parent: 'C:\\downloads\\selected' },
    { platform: 'POSIX', localPath: path.posix, parent: '/downloads/selected' }
  ])('single-file download on $platform', ({ localPath, parent }) => {
    it.each([
      '../../EXISTING.txt',
      String.raw`..\..\file.txt`,
      '/outside.txt',
      String.raw`C:\outside.txt`,
      String.raw`\\server\share\file.txt`,
      '.',
      '..',
      '',
      'bad\0name'
    ])('rejects SFTP entry %j before filesystem writes or remote reads', async (fileName) => {
      const { registerFileSystemHandlers } = await setupModule(localPath)
      const { getSftpConnection } = await import('../sshHandle')
      const mkdir = vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined)
      const writeFile = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined)
      const open = vi.spyOn(fs.promises, 'open')
      const sftp = { stat: vi.fn((_p: string, cb: any) => cb(null, { size: 0 })) }
      vi.mocked(getSftpConnection).mockReturnValue(sftp)
      registerFileSystemHandlers()

      const result = await sshState.ipcHandlers.get('ssh:sftp:download-file')(
        {},
        {
          id: 'remote-id',
          remotePath: `/share/${fileName}`,
          localDir: parent,
          fileName
        }
      )

      expect(result).toMatchObject({ status: 'error', errorSide: 'local', message: expect.stringContaining('Unsafe remote filename rejected') })
      expect(mkdir).not.toHaveBeenCalled()
      expect(writeFile).not.toHaveBeenCalled()
      expect(open).not.toHaveBeenCalled()
      expect(sftp.stat).not.toHaveBeenCalled()
    })

    it('downloads an ordinary entry inside the selected directory', async () => {
      const { registerFileSystemHandlers } = await setupModule(localPath)
      const { getSftpConnection } = await import('../sshHandle')
      const mkdir = vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined)
      const writeFile = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined)
      const sftp = { stat: vi.fn((_p: string, cb: any) => cb(null, { size: 0 })) }
      vi.mocked(getSftpConnection).mockReturnValue(sftp)
      registerFileSystemHandlers()

      const result = await sshState.ipcHandlers.get('ssh:sftp:download-file')(
        {},
        {
          id: 'remote-id',
          remotePath: '/share/报告 2026.txt',
          localDir: parent,
          fileName: '报告 2026.txt'
        }
      )

      expect(result.status).toBe('success')
      expect(mkdir).toHaveBeenCalledWith(parent, { recursive: true })
      expect(writeFile).toHaveBeenCalledWith(localPath.join(parent, '报告 2026.txt'), Buffer.alloc(0))
    })
  })

  it('preserves an existing file outside the drop directory when the server supplies traversal', async () => {
    const { registerFileSystemHandlers } = await setupModule()
    const { getSftpConnection } = await import('../sshHandle')
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaterm-sftp-file-'))
    const parent = path.join(root, 'selected', 'nested')
    const canary = path.join(root, 'EXISTING.txt')
    fs.mkdirSync(parent, { recursive: true })
    fs.writeFileSync(canary, 'ORIGINAL')
    // A zero-byte download would still truncate the existing file in the vulnerable implementation.
    const sftp = { stat: vi.fn((_p: string, cb: any) => cb(null, { size: 0 })) }
    vi.mocked(getSftpConnection).mockReturnValue(sftp)
    registerFileSystemHandlers()
    try {
      const result = await sshState.ipcHandlers.get('ssh:sftp:download-file')(
        {},
        {
          id: 'remote-id',
          remotePath: '/share/../../EXISTING.txt',
          localDir: parent,
          fileName: '../../EXISTING.txt'
        }
      )
      expect(result.status).toBe('error')
      expect(fs.readFileSync(canary, 'utf8')).toBe('ORIGINAL')
      expect(fs.readdirSync(parent)).toEqual([])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it.each([{ localDir: '/selected' }, { fileName: 'file.txt' }, { localDir: '', fileName: 'file.txt' }])(
    'does not fall back to localPath for an incomplete directory download: %j',
    async (destination) => {
      const { registerFileSystemHandlers } = await setupModule()
      const { getSftpConnection } = await import('../sshHandle')
      registerFileSystemHandlers()
      const result = await sshState.ipcHandlers.get('ssh:sftp:download-file')(
        {},
        {
          id: 'remote-id',
          remotePath: '/share/file.txt',
          localPath: '/outside.txt',
          ...destination
        }
      )
      expect(result).toMatchObject({ status: 'error', errorSide: 'local' })
      expect(getSftpConnection).not.toHaveBeenCalled()
    }
  )

  it('keeps the explicit save-dialog destination independent of the remote entry name', async () => {
    const { registerFileSystemHandlers } = await setupModule()
    const { getSftpConnection } = await import('../sshHandle')
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaterm-sftp-save-'))
    const destination = path.join(root, 'renamed.txt')
    const content = Buffer.from('DOWNLOADED-CONTENT')
    const sftp = {
      stat: vi.fn((_p: string, cb: any) => cb(null, { size: content.length })),
      open: vi.fn((_p: string, _flags: string, cb: any) => cb(null, Buffer.from('handle'))),
      read: vi.fn((_handle: Buffer, buffer: Buffer, offset: number, length: number, position: number, cb: any) => {
        cb(null, content.copy(buffer, offset, position, position + length))
      }),
      close: vi.fn((_handle: Buffer, cb: any) => cb(null))
    }
    vi.mocked(getSftpConnection).mockReturnValue(sftp)
    registerFileSystemHandlers()
    try {
      const result = await sshState.ipcHandlers.get('ssh:sftp:download-file')(
        {},
        {
          id: 'remote-id',
          remotePath: '/share/../../remote.txt',
          localPath: destination
        }
      )
      expect(result.status).toBe('success')
      expect(fs.readFileSync(destination, 'utf8')).toBe('DOWNLOADED-CONTENT')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
