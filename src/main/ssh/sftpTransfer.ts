import { ipcMain, app } from 'electron'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { getSftpConnection, getUniqueRemoteName, sftpConnections } from './sshHandle'
const sftpLogger = createLogger('ssh')
import nodeFs from 'node:fs/promises'
import fs from 'fs'
const activeTasks = new Map<string, { read?: any; write?: any; localPath?: string; cancel?: () => void }>()

type R2RFileArgs = {
  fromId: string
  toId: string
  fromPath: string
  toPath: string
  autoRename?: boolean
}

type R2RDirArgs = {
  fromId: string
  toId: string
  fromDir: string
  toDir: string
  autoRename?: boolean
  concurrency?: number
}

export const registerFileSystemHandlers = () => {
  ipcMain.handle('ssh:sftp:conn:list', async () => {
    return Array.from(sftpConnections.entries()).map(([key, sftpConn]) => ({
      id: key,
      isSuccess: sftpConn.isSuccess,
      error: sftpConn.error
    }))
  })
  ipcMain.handle('app:get-path', async (_e, { name }: { name: 'home' | 'documents' | 'downloads' }) => {
    return app.getPath(name)
  })

  ipcMain.handle('ssh:sftp:list', async (_e, { path: reqPath, id }) => {
    return new Promise<unknown[]>((resolve) => {
      if (isLocalId(id)) {
        ; (async () => {
          try {
            const data = await listLocalDir(reqPath)
            resolve(data)
          } catch (err: any) {
            resolve([String(err?.message || err)])
          }
        })()
        return
      }

      const sftp = getSftpConnection(id)
      if (!sftp) return resolve([''])

      sftp.readdir(reqPath, (err, list) => {
        if (err) {
          const errorCode = (err as { code?: number }).code
          switch (errorCode) {
            case 2:
              return resolve([`cannot open directory '${reqPath}': No such file or directory`])
            case 3:
              return resolve([`cannot open directory '${reqPath}': Permission denied`])
            case 4:
              return resolve([`cannot open directory '${reqPath}': Operation failed`])
            case 5:
              return resolve([`cannot open directory '${reqPath}': Bad message format`])
            case 6:
              return resolve([`cannot open directory '${reqPath}': No connection`])
            case 7:
              return resolve([`cannot open directory '${reqPath}': Connection lost`])
            case 8:
              return resolve([`cannot open directory '${reqPath}': Operation not supported`])
            default: {
              const message = (err as Error).message || `Unknown error (code: ${errorCode})`
              return resolve([`cannot open directory '${reqPath}': ${message}`])
            }
          }
        }

        const files = (list || []).map((item) => {
          const name = item.filename
          const attrs = item.attrs
          const prefix = reqPath === '/' ? '/' : reqPath + '/'
          return {
            name,
            path: prefix + name,
            isDir: attrs.isDirectory(),
            isLink: attrs.isSymbolicLink(),
            mode: '0' + (attrs.mode & 0o777).toString(8),
            modTime: new Date(attrs.mtime * 1000).toISOString().replace('T', ' ').slice(0, 19),
            size: attrs.size
          }
        })
        resolve(files)
      })
    })
  })

  ipcMain.handle('ssh:sftp:upload-file', (event, args) => handleStreamTransfer(event, args.id, args.localPath, args.remotePath, 'upload'))

  ipcMain.handle('ssh:sftp:upload-directory', (event, args) => handleDirectoryTransfer(event, args.id, args.localPath, args.remotePath))

  ipcMain.handle('ssh:sftp:download-file', (event, args) => handleStreamTransfer(event, args.id, args.remotePath, args.localPath, 'download'))

  ipcMain.handle('ssh:sftp:download-directory', (event, args) => handleDirectoryDownload(event, args.id, args.remoteDir, args.localDir))

  ipcMain.handle('ssh:sftp:delete-file', (event, { id, remotePath }) => {
    return new Promise((resolve, reject) => {
      handleDeleteFile(event, id, remotePath, resolve, reject)
    })
  })

  ipcMain.handle('ssh:sftp:rename-move', async (_e, { id, oldPath, newPath }) => {
    const sftp = getSftpConnection(id)
    if (!sftp) return { status: 'error', message: 'Sftp Not connected' }

    try {
      if (oldPath === newPath) {
        return { status: 'success' }
      }
      await new Promise<void>((res, rej) => {
        sftp.rename(oldPath, newPath, (err) => (err ? rej(err) : res()))
      })
      return { status: 'success' }
    } catch (err) {
      return { status: 'error', message: (err as Error).message }
    }
  })

  ipcMain.handle('ssh:sftp:chmod', async (_e, { id, remotePath, mode, recursive }) => {
    const sftp = getSftpConnection(id)
    if (!sftp) return { status: 'error', message: 'Sftp Not connected' }

    try {
      const parsedMode = parseInt(String(mode), 8)

      if (recursive) {
        const chmodRecursive = async (path: string): Promise<void> => {
          // Modify the permissions of the current path first
          await new Promise<void>((res, rej) => {
            sftp.chmod(path, parsedMode, (err) => (err ? rej(err) : res()))
          })

          // Retrieve directory contents
          const items = await new Promise<any[]>((res, rej) => {
            sftp.readdir(path, (err, list) => (err ? rej(err) : res(list || [])))
          })

          // Recursive processing of subdirectories and files
          for (const item of items) {
            if (item.filename === '.' || item.filename === '..') continue

            const itemPath = `${path}/${item.filename}`

            await new Promise<void>((res, rej) => {
              sftp.chmod(itemPath, parsedMode, (err) => (err ? rej(err) : res()))
            })

            if (item.attrs && item.attrs.isDirectory && item.attrs.isDirectory()) {
              await chmodRecursive(itemPath)
            }
          }
        }

        await chmodRecursive(remotePath)
      } else {
        await new Promise<void>((res, rej) => {
          sftp.chmod(remotePath, parsedMode, (err) => (err ? rej(err) : res()))
        })
      }

      return { status: 'success' }
    } catch (err) {
      return { status: 'error', message: (err as Error).message }
    }
  })

  ipcMain.handle('ssh:sftp:cancel-task', (_event, { taskKey }) => {
    const task = activeTasks.get(taskKey)

    if (task) {
      if (task.cancel) {
        task.cancel()
      } else {
        task.read.destroy()
        task.write.destroy()
      }
      activeTasks.delete(taskKey)
      return { status: 'aborted' }
    }
    return { status: 'not_found' }
  })

  ipcMain.handle('sftp:r2r:file', async (event, args: R2RFileArgs) => {
    return transferFileR2R(event, args)
  })

  ipcMain.handle('sftp:r2r:dir', async (event, args: R2RDirArgs) => {
    return transferDirR2R(event, args)
  })
}

const isLocalId = (id: string) => id.includes('localhost@127.0.0.1:local:')
const toPosix = (p: string) => String(p || '').replace(/\\/g, '/')

const pad2 = (n: number) => String(n).padStart(2, '0')
const fmtTime = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`

function normalizeWindowsDrive(p: string) {
  const s = String(p || '').trim()

  // "C:" / "c:" => "C:\"
  if (/^[a-zA-Z]:$/.test(s)) return s + '\\'

  // "C:/" => "C:\"
  if (/^[a-zA-Z]:\/$/.test(s)) return s.replace('/', '\\')

  return s
}

function ensureAbsLocalPath(reqPath: string) {
  let p = String(reqPath || '').trim()

  if (process.platform === 'win32') {
    p = normalizeWindowsDrive(p)
    p = p.replace(/\//g, '\\')
  }

  return path.isAbsolute(p) ? p : path.resolve(p)
}

async function listLocalDir(reqPath: string) {
  const abs = ensureAbsLocalPath(reqPath)

  let ents: import('fs').Dirent[]
  try {
    ents = await nodeFs.readdir(abs, { withFileTypes: true })
  } catch (err: any) {
    return [String(err?.message || err)]
  }

  const items: any[] = []

  for (const ent of ents) {
    const full = path.join(abs, ent.name)

    // Compatible with Windows files without permission
    let mode = '---'
    let modTime = ''
    let size = 0
    let isLink = ent.isSymbolicLink()

    try {
      const st = await nodeFs.lstat(full)
      mode = ((st.mode ?? 0) & 0o777).toString(8).padStart(3, '0')
      modTime = fmtTime(st.mtime ?? new Date(0))
      size = ent.isDirectory() ? 0 : Number(st.size || 0)
      isLink = st.isSymbolicLink?.() ? true : isLink
    } catch (err: any) {
      const code = String(err?.code || '')
      if (code === 'EPERM' || code === 'EACCES' || code === 'ENOENT') {
        continue
      }
      continue
    }

    items.push({
      name: ent.name,
      path: toPosix(full),
      isDir: ent.isDirectory(),
      isLink,
      mode,
      modTime,
      size
    })
  }

  return items
}

// Delete file
const handleDeleteFile = (_event, id, remotePath, resolve, reject) => {
  const sftp = getSftpConnection(id)
  if (!sftp) {
    return reject('Sftp Not connected')
  }

  if (!remotePath || remotePath.trim() === '' || remotePath.trim() === '*' || remotePath === '/') {
    return reject('Illegal path, cannot be deleted')
  }

  new Promise<void>((res, rej) => {
    sftp.unlink(remotePath, (err) => {
      if (err) return rej(err)
      res()
    })
  })
    .then(() => {
      resolve({
        status: 'success',
        message: 'File deleted successfully',
        deletedPath: remotePath
      })
    })
    .catch((err) => {
      const errorMessage = err instanceof Error ? err.message : String(err)
      reject(`Delete failed: ${errorMessage}`)
    })
}

function sftpStat(sftp: any, p: string) {
  return new Promise<any>((resolve, reject) => {
    sftp.stat(p, (err: any, st: any) => (err ? reject(err) : resolve(st)))
  })
}

function sftpReaddir(sftp: any, p: string) {
  return new Promise<any[]>((resolve, reject) => {
    sftp.readdir(p, (err: any, list: any[]) => (err ? reject(err) : resolve(list || [])))
  })
}

function sftpMkdir(sftp: any, p: string) {
  return new Promise<void>((resolve, reject) => {
    sftp.mkdir(p, (err: any) => {
      if (!err) return resolve()
      reject(err)
    })
  })
}

// R2R
function isDirEntry(ent: any) {
  if (ent?.attrs?.isDirectory) return !!ent.attrs.isDirectory()
  if (typeof ent?.longname === 'string') return ent.longname.startsWith('d')
  return false
}

function entryName(ent: any) {
  return ent?.filename ?? ent?.name
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>) {
  const res: R[] = []
  let idx = 0
  const workers = new Array(Math.max(1, limit)).fill(0).map(async () => {
    while (idx < items.length) {
      const cur = idx++
      res[cur] = await fn(items[cur])
    }
  })
  await Promise.all(workers)
  return res
}

export type TaskStatus = 'running' | 'success' | 'failed' | 'error'
export type ErrorSide = 'from' | 'to' | 'remote' | 'local'
export type TransferStatus = 'success' | 'cancelled' | 'skipped' | 'error'

export interface TransferResult {
  status: TransferStatus
  message?: string
  code?: string
  taskKey?: string

  // host/ip labels for UI
  host?: string
  fromHost?: string
  toHost?: string

  // which side errored
  errorSide?: ErrorSide

  // common data
  remotePath?: string
  localPath?: string
  totalFiles?: number
}

const errToMessage = (e: any) => (e as Error)?.message || e?.message || String(e)

const isPrematureStreamError = (e: any) => {
  const code = e?.code
  return code === 'ERR_STREAM_PREMATURE_CLOSE' || code === 'ERR_STREAM_DESTROYED' || code === 'ERR_STREAM_WRITE_AFTER_END'
}

const getTotalUi = (total: number) => (Number.isFinite(total) && total > 0 ? total : 1)

const terminalBytes = (total: number) => getTotalUi(total)

function hookStartOnce(rs: any, ws: any, startOnce: () => void) {
  rs?.once?.('open', startOnce)
  ws?.once?.('open', startOnce)
  rs?.once?.('error', startOnce)
  ws?.once?.('error', startOnce)
}

const getSftpHostLabel = (id: string, sftp?: any) => {
  if (id.includes('local-team')) {
    const [, rest = ''] = String(id || '').split('@')
    const parts = rest.split(':')
    return (parts[2] ? Buffer.from(parts[2], 'base64').toString('utf-8') : '') || sftp?.host || id
  }
  return sftp?.host || id
}

// ssh2 attrs.mode dir check
const isRemoteDir = (st: any) => {
  const mode = st?.mode
  return typeof mode === 'number' && (mode & 0o170000) === 0o040000
}

// After the mkdir fails, check with stat. If it's already a directory, treat it as a success
async function sftpMkdirSafe(sftp: any, dir: string) {
  try {
    await sftpMkdir(sftp, dir)
    return
  } catch (e: any) {
    try {
      const st = await sftpStat(sftp, dir)
      if (isRemoteDir(st)) return
    } catch { }
    throw e
  }
}

// mkdirp for real transfer output
const sftpMkdirRaw = (sftp: any, p: string) =>
  new Promise<void>((resolve, reject) => {
    sftp.mkdir(p, (err: any) => (err ? reject(err) : resolve()))
  })

const sftpMkdirpForTransfer = async (sftp: any, dir: string) => {
  const d = toPosix(dir)
  if (!d || d === '/' || d === '.') return
  const parts = d.split('/').filter(Boolean)
  let cur = d.startsWith('/') ? '/' : ''
  for (const part of parts) {
    cur = cur === '/' ? `/${part}` : cur ? `${cur}/${part}` : part
    try {
      await sftpMkdirSafe(sftp, cur)
    } catch (e: any) {
      // fallback raw mkdir, then stat-if-exists
      try {
        await sftpMkdirRaw(sftp, cur)
      } catch (e2: any) {
        try {
          const st = await sftpStat(sftp, cur)
          if (isRemoteDir(st)) continue
        } catch { }
        throw e2
      }
    }
  }
}

const sendProgress = (event: any, payload: any) => {
  const wc = event?.sender
  if (!wc || wc.isDestroyed?.()) {
    console.warn('[sendProgress] webContents missing/destroyed', payload?.taskKey)
    return
  }
  try {
    wc.send('ssh:sftp:transfer-progress', payload)
  } catch (err) {
    console.error('[sendProgress] send failed', payload?.taskKey, err)
  }
}

function waitStreamOpen(stream: any) {
  return new Promise<void>((resolve, reject) => {
    let done = false
    const ok = () => {
      if (done) return
      done = true
      cleanup()
      resolve()
    }
    const bad = (e: any) => {
      if (done) return
      done = true
      cleanup()
      reject(e)
    }
    const cleanup = () => {
      stream?.off?.('open', ok)
      stream?.off?.('error', bad)
    }
    stream?.once?.('open', ok)
    stream?.once?.('error', bad)
  })
}

// remote -> remote (single file)
export async function transferFileR2R(event: any, args: R2RFileArgs): Promise<TransferResult> {
  const srcSftp = getSftpConnection(args.fromId)
  const dstSftp = getSftpConnection(args.toId)

  const fromHost = getSftpHostLabel(args.fromId, srcSftp)
  const toHost = getSftpHostLabel(args.toId, dstSftp)

  const fromPath = toPosix(args.fromPath)
  let toPath = toPosix(args.toPath)

  const taskKeyBase = `${args.fromId}->${args.toId}:r2r:${fromPath}:${toPath}`

  if (!srcSftp) {
    sendProgress(event, { type: 'r2r', taskKey: taskKeyBase, fromHost, toHost, status: 'error', message: 'Sftp Not connected', errorSide: 'from' })
    return { status: 'error', message: 'Sftp Not connected', fromHost, toHost, errorSide: 'from', taskKey: taskKeyBase }
  }
  if (!dstSftp) {
    sendProgress(event, { type: 'r2r', taskKey: taskKeyBase, fromHost, toHost, status: 'error', message: 'Sftp Not connected', errorSide: 'to' })
    return { status: 'error', message: 'Sftp Not connected', fromHost, toHost, errorSide: 'to', taskKey: taskKeyBase }
  }

  const autoRename = args.autoRename !== false

  // src size
  let total = 0
  try {
    const st = await sftpStat(srcSftp, fromPath)
    total = st?.size ?? 0
  } catch (e: any) {
    const msg = errToMessage(e)
    sendProgress(event, {
      type: 'r2r',
      taskKey: taskKeyBase,
      fromId: args.fromId,
      toId: args.toId,
      fromHost,
      toHost,
      remotePath: fromPath,
      destPath: toPath,
      bytes: 1,
      total: 1,
      status: 'error',
      message: msg,
      errorSide: 'from'
    })
    return { status: 'error', message: msg, taskKey: taskKeyBase, fromHost, toHost, errorSide: 'from' }
  }

  // autoRename uses destination listing/stat
  if (autoRename) {
    try {
      const dir = path.posix.dirname(toPath)
      const base = path.posix.basename(toPath)
      const unique = await getUniqueRemoteName(dstSftp, dir, base, false)
      toPath = path.posix.join(dir, unique)
    } catch (e: any) {
      const msg = errToMessage(e)
      const taskKey = `${args.fromId}->${args.toId}:r2r:${fromPath}:${toPath}`
      sendProgress(event, {
        type: 'r2r',
        taskKey,
        fromId: args.fromId,
        toId: args.toId,
        fromHost,
        toHost,
        remotePath: fromPath,
        destPath: toPath,
        bytes: 1,
        total: 1,
        status: 'error',
        message: msg,
        errorSide: 'to'
      })
      return { status: 'error', message: msg, taskKey, fromHost, toHost, errorSide: 'to' }
    }
  }

  const taskKey = `${args.fromId}->${args.toId}:r2r:${fromPath}:${toPath}`
  if (activeTasks.has(taskKey)) {
    sftpLogger.debug('Skipped duplicated remote-to-remote file transfer', {
      event: 'ssh.sftp.r2r.file.skipped',
      taskKey
    })
    return { status: 'skipped', message: 'Task already in progress', taskKey, fromHost, toHost }
  }
  const totalUi = getTotalUi(total)

  // Send immediately "running(init)" to create a line
  let created = false
  const ensureCreated = () => {
    if (created) return
    created = true
    sendProgress(event, {
      type: 'r2r',
      taskKey,
      fromId: args.fromId,
      toId: args.toId,
      fromHost,
      toHost,
      remotePath: fromPath,
      destPath: toPath,
      bytes: 0,
      total: totalUi,
      status: 'running' as TaskStatus,
      stage: 'init'
    })
  }
  ensureCreated()

  let transferred = 0
  let lastEmitTime = 0
  let isCancelled = false

  let rs: any
  let ws: any

  let firstErr: any = null
  let firstSide: ErrorSide | null = null
  const markFirst = (side: ErrorSide, e: any) => {
    if (!firstErr) {
      firstErr = e
      firstSide = side
    }
  }

  try {
    rs = srcSftp.createReadStream(fromPath)
    rs.once('error', (e: any) => markFirst('from', e))

    await waitStreamOpen(rs)

    ws = dstSftp.createWriteStream(toPath, { flags: 'w' })
    ws.once('error', (e: any) => markFirst('to', e))

    activeTasks.set(taskKey, {
      read: rs,
      write: ws,
      cancel: () => {
        isCancelled = true
        rs.destroy()
        ws.destroy()
      }
    })

    rs.on('data', (chunk: Buffer) => {
      transferred += chunk.length
      const now = Date.now()
      if (now - lastEmitTime > 150 || (total > 0 && transferred >= total)) {
        sendProgress(event, {
          type: 'r2r',
          taskKey,
          fromId: args.fromId,
          toId: args.toId,
          fromHost,
          toHost,
          remotePath: fromPath,
          destPath: toPath,
          bytes: transferred,
          total: totalUi,
          status: 'running' as TaskStatus
        })
        lastEmitTime = now
      }
    })

    await pipeline(rs, ws)
    activeTasks.delete(taskKey)

    sendProgress(event, {
      type: 'r2r',
      taskKey,
      fromId: args.fromId,
      toId: args.toId,
      fromHost,
      toHost,
      remotePath: fromPath,
      destPath: toPath,
      bytes: terminalBytes(total),
      total: totalUi,
      status: 'success' as TaskStatus
    })

    return { status: 'success', remotePath: toPath, taskKey, fromHost, toHost }
  } catch (e: any) {
    activeTasks.delete(taskKey)

    if (isCancelled || isPrematureStreamError(e)) {
      sendProgress(event, {
        type: 'r2r',
        taskKey,
        fromId: args.fromId,
        toId: args.toId,
        fromHost,
        toHost,
        remotePath: fromPath,
        destPath: toPath,
        bytes: terminalBytes(total),
        total: totalUi,
        status: 'error' as TaskStatus,
        message: 'Transfer cancelled',
        errorSide: 'local'
      })
      return { status: 'cancelled', message: 'Transfer cancelled', taskKey, fromHost, toHost, errorSide: 'local' }
    }

    const primaryErr = firstErr || e
    const msg = errToMessage(primaryErr)
    const errorSide: ErrorSide = firstSide || 'from'

    sendProgress(event, {
      type: 'r2r',
      taskKey,
      fromId: args.fromId,
      toId: args.toId,
      fromHost,
      toHost,
      remotePath: fromPath,
      destPath: toPath,
      bytes: terminalBytes(total),
      total: totalUi,
      status: 'error' as TaskStatus,
      message: msg,
      errorSide
    })

    return { status: 'error', message: msg, code: primaryErr?.code, taskKey, fromHost, toHost, errorSide }
  }
}

// remote -> remote (directory)
export async function transferDirR2R(event: any, args: R2RDirArgs): Promise<TransferResult> {
  const srcSftp = getSftpConnection(args.fromId)
  const dstSftp = getSftpConnection(args.toId)

  const fromHost = getSftpHostLabel(args.fromId, srcSftp)
  const toHost = getSftpHostLabel(args.toId, dstSftp)

  const fromDir = toPosix(args.fromDir)
  const toParent = toPosix(args.toDir)

  const nonce = `${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`
  const dirTaskKey = `${args.fromId}->${args.toId}:r2r-dir:${fromDir}:${toParent}:${nonce}`

  const sendDir = (p: any) =>
    sendProgress(event, {
      type: 'r2r',
      taskKey: dirTaskKey,
      fromId: args.fromId,
      toId: args.toId,
      fromHost,
      toHost,
      remotePath: fromDir,
      destPath: toParent,
      bytes: 0,
      total: 1,
      status: 'running' as TaskStatus,
      stage: 'scanning',
      ...p
    })

  sendDir({})

  if (!srcSftp || !dstSftp) {
    const errorSide: ErrorSide = !srcSftp ? 'from' : 'to'
    const msg = 'Sftp Not connected'
    sendDir({ status: 'error', message: msg, bytes: 1, total: 1, stage: undefined, errorSide })
    return { status: 'error', message: msg, fromHost, toHost, errorSide }
  }

  let cancelled = false
  activeTasks.set(dirTaskKey, {
    cancel: () => {
      cancelled = true
    }
  })

  const autoRename = args.autoRename !== false
  const concurrency = args.concurrency ?? 3

  const originalDirName = path.posix.basename(fromDir)
  let finalDirName = originalDirName
  try {
    finalDirName = autoRename ? await getUniqueRemoteName(dstSftp, toParent, originalDirName, true) : originalDirName
  } catch (e: any) {
    const msg = errToMessage(e)
    sendDir({ status: 'error', message: msg, bytes: 1, total: 1, stage: undefined, errorSide: 'to' })
    activeTasks.delete(dirTaskKey)
    return { status: 'error', message: msg, fromHost, toHost, errorSide: 'to' }
  }

  const finalToBaseDir = path.posix.join(toParent, finalDirName)
  sendDir({ destPath: finalToBaseDir })

  try {
    await sftpMkdirSafe(dstSftp, finalToBaseDir)
  } catch (e: any) {
    const msg = errToMessage(e)
    sendDir({ status: 'error', message: msg, bytes: 1, total: 1, stage: undefined, errorSide: 'to' })
    activeTasks.delete(dirTaskKey)
    return { status: 'error', message: msg, fromHost, toHost, remotePath: finalToBaseDir, errorSide: 'to' }
  }

  const allDirs = new Set<string>()
  const allFiles: { from: string; to: string }[] = []
  allDirs.add(finalToBaseDir)

  const yieldNow = () => new Promise<void>((r) => setImmediate(r))
  let scanCounter = 0

  const scan = async (curFrom: string, curTo: string) => {
    if (cancelled) throw Object.assign(new Error('Transfer cancelled'), { __cancelled: true })
    const list = await sftpReaddir(srcSftp, curFrom)
    for (const ent of list) {
      if (cancelled) throw Object.assign(new Error('Transfer cancelled'), { __cancelled: true })

      scanCounter++
      if (scanCounter % 300 === 0) await yieldNow()

      const name = entryName(ent)
      if (!name) continue
      const s = path.posix.join(curFrom, name)
      const d = path.posix.join(curTo, name)
      if (isDirEntry(ent)) {
        allDirs.add(d)
        await scan(s, d)
      } else {
        allFiles.push({ from: s, to: d })
      }
    }
  }

  try {
    await scan(fromDir, finalToBaseDir)
  } catch (e: any) {
    const msg = errToMessage(e)
    const isCancel = !!e?.__cancelled
    sendDir({ status: isCancel ? 'failed' : 'error', message: msg, bytes: 1, total: 1, stage: undefined, errorSide: isCancel ? 'local' : 'from' })
    activeTasks.delete(dirTaskKey)
    return isCancel
      ? { status: 'cancelled', message: msg, fromHost, toHost, errorSide: 'local' }
      : { status: 'error', message: msg, fromHost, toHost, errorSide: 'from' }
  }

  // switch to transferring
  sendDir({ stage: 'transferring', totalFiles: allFiles.length })

  try {
    const sortedDirs = Array.from(allDirs).sort((a, b) => a.length - b.length)
    for (const dir of sortedDirs) {
      if (cancelled) throw Object.assign(new Error('Transfer cancelled'), { __cancelled: true })
      await sftpMkdirSafe(dstSftp, dir)
    }
  } catch (e: any) {
    const msg = errToMessage(e)
    const isCancel = !!e?.__cancelled
    sendDir({ status: isCancel ? 'failed' : 'error', message: msg, bytes: 1, total: 1, stage: undefined, errorSide: isCancel ? 'local' : 'to' })
    activeTasks.delete(dirTaskKey)
    return isCancel
      ? { status: 'cancelled', message: msg, fromHost, toHost, errorSide: 'local' }
      : { status: 'error', message: msg, fromHost, toHost, errorSide: 'to' }
  }

  try {
    await mapLimit(allFiles, concurrency, async (f) => {
      if (cancelled) throw Object.assign(new Error('Transfer cancelled'), { __cancelled: true })
      const r = await transferFileR2R(event, { fromId: args.fromId, toId: args.toId, fromPath: f.from, toPath: f.to, autoRename: false })
      if (r?.status !== 'success') throw r
      return r
    })
  } catch (e: any) {
    const isCancel = !!e?.__cancelled
    const tr = e?.status ? (e as TransferResult) : null
    const msg = tr?.message || errToMessage(e)
    sendDir({
      status: isCancel ? 'failed' : 'error',
      message: msg,
      bytes: 1,
      total: 1,
      stage: undefined,
      errorSide: tr?.errorSide || (isCancel ? 'local' : 'to')
    })
    activeTasks.delete(dirTaskKey)
    return isCancel
      ? { status: 'cancelled', message: msg, fromHost, toHost, errorSide: 'local' }
      : tr || { status: 'error', message: msg, fromHost, toHost, errorSide: 'to' }
  }

  sendDir({ status: 'success', bytes: 1, total: 1, stage: undefined })
  activeTasks.delete(dirTaskKey)
  return { status: 'success', remotePath: finalToBaseDir, totalFiles: allFiles.length, fromHost, toHost }
}

// upload/download single file (remote<->local)
export async function handleStreamTransfer(
  event: any,
  id: string,
  srcPath: string,
  destPath: string,
  type: 'download' | 'upload',
  isInternalCall = false
): Promise<TransferResult> {
  const sftp = getSftpConnection(id)
  const host = getSftpHostLabel(id, sftp)
  const fallbackTaskKey = type === 'download' ? `${id}:dl:${toPosix(srcPath)}:${path.resolve(destPath)}` : `${id}:up:${srcPath}:${toPosix(destPath)}`

  if (!sftp) {
    sendProgress(event, {
      id,
      host,
      taskKey: fallbackTaskKey,
      type,
      remotePath: toPosix(srcPath),
      destPath,
      bytes: 1,
      total: 1,
      status: 'error',
      message: 'Sftp Not connected',
      errorSide: 'remote'
    })
    return { status: 'error', message: 'Sftp Not connected', host, errorSide: 'remote', taskKey: fallbackTaskKey }
  }

  let finalRemotePath = destPath
  let finalLocalPath = destPath
  let total = 0

  // prechecks
  if (type === 'download') {
    // remote stat
    try {
      const st = await sftpStat(sftp, toPosix(srcPath))
      total = st?.size ?? 0
    } catch (e: any) {
      const msg = errToMessage(e)
      sendProgress(event, {
        id,
        host,
        taskKey: fallbackTaskKey,
        type,
        remotePath: toPosix(srcPath),
        destPath: path.resolve(destPath),
        bytes: 1,
        total: 1,
        status: 'error',
        message: msg,
        errorSide: 'remote'
      })
      return { status: 'error', message: msg, code: e?.code, taskKey: fallbackTaskKey, host, errorSide: 'remote' }
    }

    // local mkdir
    try {
      finalLocalPath = path.resolve(destPath)
      await fs.promises.mkdir(path.dirname(finalLocalPath), { recursive: true })
    } catch (e: any) {
      const msg = errToMessage(e)
      sendProgress(event, {
        id,
        host,
        taskKey: fallbackTaskKey,
        type,
        remotePath: toPosix(srcPath),
        destPath: finalLocalPath,
        bytes: 1,
        total: 1,
        status: 'error',
        message: msg,
        errorSide: 'local'
      })
      return { status: 'error', message: msg, code: e?.code, taskKey: fallbackTaskKey, host, errorSide: 'local' }
    }
  } else {
    // local stat
    try {
      const st = await fs.promises.stat(srcPath)
      total = st?.size ?? 0
    } catch (e: any) {
      const msg = errToMessage(e)
      sendProgress(event, {
        id,
        host,
        taskKey: fallbackTaskKey,
        type,
        remotePath: toPosix(destPath),
        bytes: 1,
        total: 1,
        status: 'error',
        message: msg,
        errorSide: 'local'
      })
      return { status: 'error', message: msg, code: e?.code, taskKey: fallbackTaskKey, host, errorSide: 'local' }
    }

    // remote autoRename
    if (!isInternalCall) {
      try {
        const remoteDir = toPosix(destPath)
        const fileName = path.basename(srcPath)
        const uniqueName = await getUniqueRemoteName(sftp, remoteDir, fileName, false)
        finalRemotePath = path.posix.join(remoteDir, uniqueName)
      } catch (e: any) {
        const msg = errToMessage(e)
        sendProgress(event, {
          id,
          host,
          taskKey: fallbackTaskKey,
          type,
          remotePath: toPosix(destPath),
          bytes: 1,
          total: 1,
          status: 'error',
          message: msg,
          errorSide: 'remote'
        })
        return { status: 'error', message: msg, code: e?.code, taskKey: fallbackTaskKey, host, errorSide: 'remote' }
      }
    } else {
      finalRemotePath = toPosix(destPath)
    }
  }

  const taskKey = type === 'download' ? `${id}:dl:${toPosix(srcPath)}:${finalLocalPath}` : `${id}:up:${srcPath}:${finalRemotePath}`

  if (activeTasks.has(taskKey)) return { status: 'skipped', message: 'Task already in progress', taskKey, host }

  const totalUi = getTotalUi(total)

  // ensure UI row exists immediately
  let created = false
  const ensureCreated = () => {
    if (created) return
    created = true
    sendProgress(event, {
      id,
      host,
      taskKey,
      type,
      remotePath: type === 'upload' ? finalRemotePath : toPosix(srcPath),
      destPath: type === 'download' ? finalLocalPath : undefined,
      bytes: 0,
      total: totalUi,
      status: 'running' as TaskStatus,
      stage: 'init'
    })
  }
  ensureCreated()

  let isCancelled = false
  let transferred = 0
  let lastEmitTime = 0

  const remotePathForUI = type === 'upload' ? finalRemotePath : toPosix(srcPath)
  const destPathForUI = type === 'download' ? finalLocalPath : undefined

  let readStream: any
  let writeStream: any

  let firstErr: any = null
  let firstErrSide: ErrorSide | null = null
  const markFirstErr = (side: ErrorSide, e: any) => {
    if (firstErr) return
    firstErr = e
    firstErrSide = side
  }

  try {
    if (type === 'download') {
      // remote read first
      readStream = sftp.createReadStream(toPosix(srcPath))
      readStream.once?.('error', (e: any) => markFirstErr('remote', e))
    } else {
      // upload local read first
      readStream = fs.createReadStream(srcPath)
      readStream.once?.('error', (e: any) => markFirstErr('local', e))
    }
  } catch (e: any) {
    const msg = errToMessage(e)
    const errorSide: ErrorSide = type === 'download' ? 'remote' : 'local'
    sendProgress(event, {
      id,
      host,
      taskKey,
      type,
      remotePath: remotePathForUI,
      destPath: destPathForUI,
      bytes: terminalBytes(total),
      total: totalUi,
      status: 'error' as TaskStatus,
      message: msg,
      errorSide
    })
    return { status: 'error', message: msg, code: e?.code, taskKey, host, errorSide }
  }

  try {
    if (type === 'download') {
      // local write second
      writeStream = fs.createWriteStream(finalLocalPath)
      writeStream.once?.('error', (e: any) => markFirstErr('local', e))
    } else {
      // upload remote write second
      writeStream = sftp.createWriteStream(finalRemotePath)
      writeStream.once?.('error', (e: any) => markFirstErr('remote', e))
    }
  } catch (e: any) {
    const msg = errToMessage(e)
    const errorSide: ErrorSide = type === 'download' ? 'local' : 'remote'
    sendProgress(event, {
      id,
      host,
      taskKey,
      type,
      remotePath: remotePathForUI,
      destPath: destPathForUI,
      bytes: terminalBytes(total),
      total: totalUi,
      status: 'error' as TaskStatus,
      message: msg,
      errorSide
    })
    return { status: 'error', message: msg, code: e?.code, taskKey, host, errorSide }
  }

  let readErr: any = null
  let writeErr: any = null
  readStream.on('error', (e: any) => {
    readErr ??= e
    if (!firstErr) {
      // fallback
      markFirstErr(type === 'download' ? 'remote' : 'local', e)
    }
  })
  writeStream.on('error', (e: any) => {
    writeErr ??= e
    if (!firstErr) {
      markFirstErr(type === 'download' ? 'local' : 'remote', e)
    }
  })

  activeTasks.set(taskKey, {
    read: readStream,
    write: writeStream,
    localPath: type === 'download' ? finalLocalPath : srcPath,
    cancel: () => {
      isCancelled = true
      readStream.destroy()
      writeStream.destroy()
    }
  })

  hookStartOnce(readStream, writeStream, ensureCreated)

  readStream.on('data', (chunk: Buffer) => {
    transferred += chunk.length
    const now = Date.now()
    if (now - lastEmitTime > 150 || (total > 0 && transferred >= total)) {
      sendProgress(event, {
        id,
        host,
        taskKey,
        type,
        remotePath: remotePathForUI,
        destPath: destPathForUI,
        bytes: transferred,
        total: totalUi,
        status: 'running' as TaskStatus
      })
      lastEmitTime = now
    }
  })

  try {
    await pipeline(readStream, writeStream)
    activeTasks.delete(taskKey)

    sendProgress(event, {
      id,
      host,
      taskKey,
      type,
      remotePath: remotePathForUI,
      destPath: destPathForUI,
      bytes: total > 0 ? total || transferred : 1,
      total: totalUi,
      status: 'success' as TaskStatus
    })

    return { status: 'success', remotePath: remotePathForUI, taskKey, host }
  } catch (e: any) {
    activeTasks.delete(taskKey)

    if (isCancelled || isPrematureStreamError(e)) {
      sendProgress(event, {
        id,
        host,
        taskKey,
        type,
        remotePath: remotePathForUI,
        destPath: destPathForUI,
        bytes: terminalBytes(total),
        total: totalUi,
        status: 'failed' as TaskStatus,
        message: 'Transfer was cancelled by user',
        errorSide: 'local'
      })
      return { status: 'cancelled', message: 'Transfer was cancelled by user', taskKey, host, errorSide: 'local' }
    }

    const primaryErr = firstErr || readErr || writeErr || e
    const msg = errToMessage(primaryErr)

    let errorSide: ErrorSide
    if (firstErrSide) {
      errorSide = firstErrSide
    } else {
      // fallback
      if (type === 'download') errorSide = writeErr ? 'local' : 'remote'
      else errorSide = readErr ? 'local' : 'remote'
    }

    sendProgress(event, {
      id,
      host,
      taskKey,
      type,
      remotePath: remotePathForUI,
      destPath: destPathForUI,
      bytes: terminalBytes(total),
      total: totalUi,
      status: 'error' as TaskStatus,
      message: msg,
      errorSide
    })

    return { status: 'error', message: msg, code: primaryErr?.code, taskKey, host, errorSide }
  }
}

// remote directory -> local directory
export async function handleDirectoryDownload(event: any, id: string, remoteDir: string, localDir: string): Promise<TransferResult> {
  const sftp = getSftpConnection(id)
  const host = getSftpHostLabel(id, sftp)

  const fromDir = toPosix(remoteDir)
  const toParent = path.resolve(localDir)
  const dirName = path.posix.basename(fromDir)
  const finalLocalBase = path.join(toParent, dirName)

  const nonce = `${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`
  const dirTaskKey = `${id}:dl-dir:${fromDir}:${finalLocalBase}:${nonce}`

  sendProgress(event, {
    id,
    host,
    taskKey: dirTaskKey,
    type: 'download',
    remotePath: fromDir,
    destPath: finalLocalBase,
    bytes: 0,
    total: 1,
    status: 'running',
    stage: 'scanning'
  })

  if (!sftp) {
    sendProgress(event, {
      id,
      host,
      taskKey: dirTaskKey,
      type: 'download',
      remotePath: fromDir,
      destPath: finalLocalBase,
      bytes: 1,
      total: 1,
      status: 'error',
      message: 'Sftp Not connected',
      errorSide: 'remote'
    })
    return { status: 'error', message: 'Sftp Not connected', host, errorSide: 'remote' }
  }

  let cancelled = false
  activeTasks.set(dirTaskKey, {
    cancel: () => {
      cancelled = true
    }
  })

  try {
    await fs.promises.mkdir(finalLocalBase, { recursive: true })
  } catch (e: any) {
    const msg = errToMessage(e)
    sendProgress(event, {
      id,
      host,
      taskKey: dirTaskKey,
      type: 'download',
      remotePath: fromDir,
      destPath: finalLocalBase,
      bytes: 1,
      total: 1,
      status: 'error',
      message: msg,
      errorSide: 'local'
    })
    activeTasks.delete(dirTaskKey)
    return { status: 'error', message: msg, host, errorSide: 'local' }
  }

  const tasks: { r: string; l: string }[] = []
  const yieldNow = () => new Promise<void>((r) => setImmediate(r))
  let scanCounter = 0

  const scan = async (curFrom: string, curTo: string) => {
    if (cancelled) throw Object.assign(new Error('Transfer cancelled'), { __cancelled: true })
    const list = await sftpReaddir(sftp, curFrom)
    for (const ent of list) {
      if (cancelled) throw Object.assign(new Error('Transfer cancelled'), { __cancelled: true })

      scanCounter++
      if (scanCounter % 300 === 0) await yieldNow()

      const name = entryName(ent)
      if (!name) continue
      const rPath = path.posix.join(curFrom, name)
      const lPath = path.join(curTo, name)
      if (isDirEntry(ent)) {
        await fs.promises.mkdir(lPath, { recursive: true })
        await scan(rPath, lPath)
      } else {
        tasks.push({ r: rPath, l: lPath })
      }
    }
  }

  try {
    await scan(fromDir, finalLocalBase)
  } catch (e: any) {
    const msg = errToMessage(e)
    const isCancel = !!e?.__cancelled
    sendProgress(event, {
      id,
      host,
      taskKey: dirTaskKey,
      type: 'download',
      remotePath: fromDir,
      destPath: finalLocalBase,
      bytes: 1,
      total: 1,
      status: isCancel ? 'failed' : 'error',
      message: msg,
      stage: undefined,
      errorSide: isCancel ? 'local' : 'remote'
    })
    activeTasks.delete(dirTaskKey)
    return isCancel ? { status: 'cancelled', message: msg, host, errorSide: 'local' } : { status: 'error', message: msg, host, errorSide: 'remote' }
  }

  // switch to transferring
  sendProgress(event, {
    id,
    host,
    taskKey: dirTaskKey,
    type: 'download',
    remotePath: fromDir,
    destPath: finalLocalBase,
    bytes: 0,
    total: 1,
    status: 'running',
    stage: 'transferring',
    totalFiles: tasks.length
  })

  try {
    await mapLimit(tasks, 5, async (t) => {
      if (cancelled) throw Object.assign(new Error('Transfer cancelled'), { __cancelled: true })
      const r = await handleStreamTransfer(event, id, t.r, t.l, 'download', true)
      if (r?.status !== 'success') throw r
      return r
    })
  } catch (e: any) {
    const isCancel = !!e?.__cancelled
    const tr = e?.status ? (e as TransferResult) : null
    const msg = tr?.message || errToMessage(e)
    sendProgress(event, {
      id,
      host,
      taskKey: dirTaskKey,
      type: 'download',
      remotePath: fromDir,
      destPath: finalLocalBase,
      bytes: 1,
      total: 1,
      status: isCancel ? 'failed' : 'error',
      message: msg,
      stage: undefined,
      errorSide: tr?.errorSide || (isCancel ? 'local' : 'local')
    })
    activeTasks.delete(dirTaskKey)
    return isCancel
      ? { status: 'cancelled', message: msg, host, errorSide: 'local' }
      : tr || { status: 'error', message: msg, host, errorSide: 'local' }
  }

  sendProgress(event, {
    id,
    host,
    taskKey: dirTaskKey,
    type: 'download',
    remotePath: fromDir,
    destPath: finalLocalBase,
    bytes: 1,
    total: 1,
    status: 'success',
    stage: undefined
  })
  activeTasks.delete(dirTaskKey)
  return { status: 'success', localPath: finalLocalBase, host }
}

// local directory -> remote directory
export async function handleDirectoryTransfer(event: any, id: string, localDir: string, remoteDir: string): Promise<TransferResult> {
  const sftp = getSftpConnection(id)
  const host = getSftpHostLabel(id, sftp)

  const absLocal = path.resolve(localDir)
  const remoteParent = toPosix(remoteDir)
  const originalDirName = path.basename(absLocal)

  const nonce = `${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`
  const dirTaskKey = `${id}:up-dir:${absLocal}:${remoteParent}:${nonce}`

  sendProgress(event, {
    id,
    host,
    taskKey: dirTaskKey,
    type: 'upload',
    remotePath: remoteParent,
    bytes: 0,
    total: 1,
    status: 'running',
    stage: 'scanning'
  })

  if (!sftp) {
    sendProgress(event, {
      id,
      host,
      taskKey: dirTaskKey,
      type: 'upload',
      remotePath: remoteParent,
      bytes: 1,
      total: 1,
      status: 'error',
      message: 'Sftp Not connected',
      errorSide: 'remote',
      stage: undefined
    })
    return { status: 'error', message: 'Sftp Not connected', host, errorSide: 'remote' }
  }

  let cancelled = false
  activeTasks.set(dirTaskKey, {
    cancel: () => {
      cancelled = true
    }
  })

  // local scan
  try {
    const st = await fs.promises.stat(absLocal)
    if (!st.isDirectory()) throw Object.assign(new Error(`Not a directory: ${absLocal}`), { code: 'ENOTDIR' })
    await fs.promises.readdir(absLocal)
  } catch (e: any) {
    const msg = errToMessage(e)
    sendProgress(event, {
      id,
      host,
      taskKey: dirTaskKey,
      type: 'upload',
      remotePath: remoteParent,
      bytes: 1,
      total: 1,
      status: 'error',
      message: msg,
      errorSide: 'local',
      stage: undefined
    })
    activeTasks.delete(dirTaskKey)
    return { status: 'error', message: msg, host, errorSide: 'local', localPath: absLocal }
  }

  // remote autoRename
  let finalDirName = originalDirName
  try {
    finalDirName = await getUniqueRemoteName(sftp, remoteParent, originalDirName, true)
  } catch (e: any) {
    const msg = errToMessage(e)
    sendProgress(event, {
      id,
      host,
      taskKey: dirTaskKey,
      type: 'upload',
      remotePath: remoteParent,
      bytes: 1,
      total: 1,
      status: 'error',
      message: msg,
      errorSide: 'remote',
      stage: undefined
    })
    activeTasks.delete(dirTaskKey)
    return { status: 'error', message: msg, host, errorSide: 'remote' }
  }

  const finalRemoteBaseDir = path.posix.join(remoteParent, finalDirName)

  sendProgress(event, {
    id,
    host,
    taskKey: dirTaskKey,
    type: 'upload',
    remotePath: finalRemoteBaseDir,
    bytes: 0,
    total: 1,
    status: 'running',
    stage: 'scanning'
  })

  const allFileTasks: { local: string; remote: string }[] = []
  const allDirs = new Set<string>()
  allDirs.add(finalRemoteBaseDir)

  const yieldNow = () => new Promise<void>((r) => setImmediate(r))
  let scanCounter = 0

  const scan = async (currentLocal: string, currentRemote: string) => {
    if (cancelled) throw Object.assign(new Error('Transfer cancelled'), { __cancelled: true })
    const files = await fs.promises.readdir(currentLocal)
    for (const file of files) {
      if (cancelled) throw Object.assign(new Error('Transfer cancelled'), { __cancelled: true })

      scanCounter++
      if (scanCounter % 300 === 0) await yieldNow()

      const lPath = path.join(currentLocal, file)
      const rPath = path.posix.join(currentRemote, file)
      const st = await fs.promises.stat(lPath)
      if (st.isDirectory()) {
        allDirs.add(rPath)
        await scan(lPath, rPath)
      } else {
        allFileTasks.push({ local: lPath, remote: rPath })
      }
    }
  }

  try {
    await scan(absLocal, finalRemoteBaseDir)
  } catch (e: any) {
    const msg = errToMessage(e)
    const isCancel = !!e?.__cancelled
    sendProgress(event, {
      id,
      host,
      taskKey: dirTaskKey,
      type: 'upload',
      remotePath: finalRemoteBaseDir,
      bytes: 1,
      total: 1,
      status: isCancel ? 'failed' : 'error',
      message: msg,
      errorSide: 'local',
      stage: undefined
    })
    activeTasks.delete(dirTaskKey)
    return isCancel ? { status: 'cancelled', message: msg, host, errorSide: 'local' } : { status: 'error', message: msg, host, errorSide: 'local' }
  }

  // switch to transferring
  sendProgress(event, {
    id,
    host,
    taskKey: dirTaskKey,
    type: 'upload',
    remotePath: finalRemoteBaseDir,
    bytes: 0,
    total: 1,
    status: 'running',
    stage: 'transferring',
    totalFiles: allFileTasks.length
  })

  // create remote dirs
  try {
    const sortedDirs = Array.from(allDirs).sort((a, b) => a.length - b.length)
    for (const dir of sortedDirs) {
      if (cancelled) throw Object.assign(new Error('Transfer cancelled'), { __cancelled: true })
      await sftpMkdirpForTransfer(sftp, dir)
    }
  } catch (e: any) {
    const msg = errToMessage(e)
    const isCancel = !!e?.__cancelled
    sendProgress(event, {
      id,
      host,
      taskKey: dirTaskKey,
      type: 'upload',
      remotePath: finalRemoteBaseDir,
      bytes: 1,
      total: 1,
      status: isCancel ? 'failed' : 'error',
      message: msg,
      errorSide: isCancel ? 'local' : 'remote',
      stage: undefined
    })
    activeTasks.delete(dirTaskKey)
    return isCancel ? { status: 'cancelled', message: msg, host, errorSide: 'local' } : { status: 'error', message: msg, host, errorSide: 'remote' }
  }

  try {
    await mapLimit(allFileTasks, 3, async (task) => {
      if (cancelled) throw Object.assign(new Error('Transfer cancelled'), { __cancelled: true })
      const r = await handleStreamTransfer(event, id, task.local, task.remote, 'upload', true)
      if (r?.status !== 'success') throw r
      return r
    })
  } catch (e: any) {
    const isCancel = !!e?.__cancelled
    const tr = e?.status ? (e as TransferResult) : null
    const msg = tr?.message || errToMessage(e)
    sendProgress(event, {
      id,
      host,
      taskKey: dirTaskKey,
      type: 'upload',
      remotePath: finalRemoteBaseDir,
      bytes: 1,
      total: 1,
      status: isCancel ? 'failed' : 'error',
      message: msg,
      errorSide: tr?.errorSide || (isCancel ? 'local' : 'remote'),
      stage: undefined
    })
    activeTasks.delete(dirTaskKey)
    return isCancel
      ? { status: 'cancelled', message: msg, host, errorSide: 'local' }
      : tr || { status: 'error', message: msg, host, errorSide: 'remote' }
  }

  sendProgress(event, {
    id,
    host,
    taskKey: dirTaskKey,
    type: 'upload',
    remotePath: finalRemoteBaseDir,
    bytes: 1,
    total: 1,
    status: 'success',
    stage: undefined
  })
  activeTasks.delete(dirTaskKey)
  return { status: 'success', host }
}
