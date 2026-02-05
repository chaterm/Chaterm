import { ipcMain, app } from 'electron'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { getSftpConnection, getUniqueRemoteName, sftpConnections } from './sshHandle'
import nodeFs from 'node:fs/promises'
import fs from 'fs'
const activeTasks = new Map<string, { read: any; write: any; localPath?: string; cancel?: () => void }>()

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
        ;(async () => {
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
      console.log('remotePath:', remotePath)
      console.log('parsedMode:', parsedMode)
      console.log('recursive:', recursive)

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

  if (!p || p === '/' || p === '\\') {
    return app.getPath('home')
  }

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

async function handleStreamTransfer(event: any, id: string, srcPath: string, destPath: string, type: 'download' | 'upload', isInternalCall = false) {
  const sftp = getSftpConnection(id)
  let finalDestPath = destPath.replace(/\\/g, '/')

  if (type === 'upload' && !isInternalCall) {
    const fileName = path.basename(srcPath)
    // Calculate unique file names
    const uniqueName = await getUniqueRemoteName(sftp, finalDestPath, fileName, false)
    finalDestPath = path.posix.join(finalDestPath, uniqueName)
  }

  const remotePathForKey = type === 'upload' ? finalDestPath : srcPath
  const taskKey = type === 'download' ? `${id}:dl:${srcPath}:${finalDestPath}` : `${id}:up:${srcPath}:${finalDestPath}`

  if (activeTasks.has(taskKey)) {
    return { status: 'skipped', message: 'Task already in progress' }
  }

  return new Promise((resolve, reject) => {
    let isCancelled = false

    const getStats = type === 'download' ? (p: string, cb: any) => sftp.stat(p, cb) : (p: string, cb: any) => cb(null, fs.statSync(p))

    getStats(srcPath, (err: any, stats: any) => {
      if (err) return reject(err)

      const readStream = type === 'download' ? sftp.createReadStream(srcPath) : fs.createReadStream(srcPath)
      const writeStream = type === 'download' ? fs.createWriteStream(finalDestPath) : sftp.createWriteStream(finalDestPath)

      activeTasks.set(taskKey, {
        read: readStream,
        write: writeStream,
        localPath: type === 'download' ? finalDestPath : srcPath,
        cancel: () => {
          isCancelled = true
          readStream.destroy()
          writeStream.destroy()
        }
      })

      let transferred = 0
      let lastEmitTime = 0

      readStream.on('data', (chunk: Buffer) => {
        transferred += chunk.length
        const now = Date.now()
        if (now - lastEmitTime > 150 || transferred === stats.size) {
          event.sender.send('ssh:sftp:transfer-progress', {
            id,
            taskKey: taskKey,
            remotePath: remotePathForKey,
            bytes: transferred,
            total: stats.size,
            type
          })
          lastEmitTime = now
        }
      })

      readStream.pipe(writeStream)

      writeStream.on('close', () => {
        activeTasks.delete(taskKey)

        if (isCancelled) {
          resolve({ status: 'cancelled', message: 'Transfer was cancelled by user' })
        } else {
          resolve({ status: 'success', remotePath: finalDestPath })
        }
      })

      const handleError = (e: any) => {
        if (isCancelled) return

        readStream.destroy()
        writeStream.destroy()
        activeTasks.delete(taskKey)
        reject(e)
      }

      readStream.on('error', handleError)
      writeStream.on('error', handleError)
    })
  })
}

async function handleDirectoryTransfer(event: any, id: string, localDir: string, remoteDir: string) {
  const sftp = getSftpConnection(id)
  const originalDirName = path.basename(localDir)

  const finalDirName = await getUniqueRemoteName(sftp, remoteDir, originalDirName, true)
  const finalRemoteBaseDir = path.posix.join(remoteDir, finalDirName).replace(/\\/g, '/')

  const allFileTasks: { local: string; remote: string }[] = []
  const allDirs = new Set<string>()
  allDirs.add(finalRemoteBaseDir)

  const scan = (currentLocal: string, currentRemote: string) => {
    const files = fs.readdirSync(currentLocal)
    for (const file of files) {
      const lPath = path.join(currentLocal, file)
      const rPath = path.posix.join(currentRemote, file)
      const stat = fs.statSync(lPath)
      if (stat.isDirectory()) {
        allDirs.add(rPath)
        scan(lPath, rPath)
      } else {
        allFileTasks.push({ local: lPath, remote: rPath })
      }
    }
  }
  scan(localDir, finalRemoteBaseDir)

  // mkdir
  const sortedDirs = Array.from(allDirs).sort((a, b) => a.length - b.length)
  for (const dir of sortedDirs) {
    await new Promise<void>((res) => sftp.mkdir(dir, { mode: 0o755 }, () => res()))
  }

  const promises = allFileTasks.map((task) =>
    handleStreamTransfer(event, id, task.local, task.remote, 'upload', true).catch((err) => console.error(`Error: ${task.remote}`, err))
  )

  await Promise.all(promises)
  return { status: 'success' }
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
  return new Promise<void>((resolve) => {
    sftp.mkdir(p, { mode: 0o755 }, () => resolve())
  })
}

// R2R
async function ensureRemoteDir(sftp: any, remoteDir: string) {
  const dir = toPosix(remoteDir)
  const parts = dir.split('/').filter(Boolean)

  let cur = dir.startsWith('/') ? '/' : ''
  for (const part of parts) {
    cur = cur === '/' ? `/${part}` : `${cur}/${part}`
    await sftpMkdir(sftp, cur)
  }
}

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

export async function transferFileR2R(event: any, args: R2RFileArgs) {
  const srcSftp = getSftpConnection(args.fromId)
  const dstSftp = getSftpConnection(args.toId)

  const fromPath = toPosix(args.fromPath)
  let toPath = toPosix(args.toPath)

  const autoRename = args.autoRename !== false
  if (autoRename) {
    const dir = path.posix.dirname(toPath)
    const base = path.posix.basename(toPath)
    const unique = await getUniqueRemoteName(dstSftp, dir, base, false)
    toPath = path.posix.join(dir, unique)
  }

  await ensureRemoteDir(dstSftp, path.posix.dirname(toPath))

  const taskKey = `${args.fromId}->${args.toId}:r2r:${fromPath}:${toPath}`
  if (activeTasks.has(taskKey)) return { status: 'skipped', message: 'Task already in progress', taskKey }

  const st = await sftpStat(srcSftp, fromPath)
  const total = st?.size ?? 0

  let transferred = 0
  let lastEmitTime = 0
  let isCancelled = false

  const rs = srcSftp.createReadStream(fromPath)
  const ws = dstSftp.createWriteStream(toPath, { flags: 'w' })

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
      event.sender.send('ssh:sftp:transfer-progress', {
        type: 'r2r',
        taskKey,
        fromId: args.fromId,
        toId: args.toId,
        remotePath: fromPath,
        destPath: toPath,
        bytes: transferred,
        total
      })
      lastEmitTime = now
    }
  })

  const cleanupPartialOnCancel = true

  try {
    await pipeline(rs, ws)
    activeTasks.delete(taskKey)
    return { status: 'success', remotePath: toPath, taskKey }
  } catch (e: any) {
    activeTasks.delete(taskKey)

    const code = e?.code
    const isPremature = code === 'ERR_STREAM_PREMATURE_CLOSE' || code === 'ERR_STREAM_DESTROYED' || code === 'ERR_STREAM_WRITE_AFTER_END'

    if (isCancelled || isPremature) {
      if (cleanupPartialOnCancel) {
        try {
          await new Promise<void>((res) => dstSftp.unlink(toPath, () => res()))
        } catch {}
      }
      return { status: 'cancelled', message: 'Transfer cancelled', taskKey }
    }

    throw e
  }
}

export async function transferDirR2R(event: any, args: R2RDirArgs) {
  const srcSftp = getSftpConnection(args.fromId)
  const dstSftp = getSftpConnection(args.toId)

  const fromDir = toPosix(args.fromDir)
  const toParent = toPosix(args.toDir)

  const autoRename = args.autoRename !== false
  const concurrency = args.concurrency ?? 3

  const originalDirName = path.posix.basename(fromDir)
  const finalDirName = autoRename ? await getUniqueRemoteName(dstSftp, toParent, originalDirName, true) : originalDirName

  const finalToBaseDir = path.posix.join(toParent, finalDirName)
  await ensureRemoteDir(dstSftp, finalToBaseDir)

  const allDirs = new Set<string>()
  const allFiles: { from: string; to: string }[] = []
  allDirs.add(finalToBaseDir)

  // Recursively scan the remote directory structure
  async function scan(curFrom: string, curTo: string) {
    const list = await sftpReaddir(srcSftp, curFrom)

    for (const ent of list) {
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

  await scan(fromDir, finalToBaseDir)

  // mkdir (sorted by length from short to long)
  const sortedDirs = Array.from(allDirs).sort((a, b) => a.length - b.length)
  for (const dir of sortedDirs) {
    await ensureRemoteDir(dstSftp, dir)
  }

  // Concurrent file transfer
  await mapLimit(allFiles, concurrency, async (f) => {
    return transferFileR2R(event, {
      fromId: args.fromId,
      toId: args.toId,
      fromPath: f.from,
      toPath: f.to,
      autoRename: false
    }).catch((err) => {
      console.error(`R2R file error: ${f.from} -> ${f.to}`, err)
      throw err
    })
  })

  return { status: 'success', remotePath: finalToBaseDir, totalFiles: allFiles.length }
}

async function handleDirectoryDownload(event: any, id: string, remoteDir: string, localDir: string) {
  const sftp = getSftpConnection(id)
  if (!sftp) return { status: 'error', message: 'Sftp Not connected' }

  const fromDir = toPosix(remoteDir)
  const toParent = path.resolve(localDir)

  const dirName = path.posix.basename(fromDir)
  const finalLocalBase = path.join(toParent, dirName)

  await nodeFs.mkdir(finalLocalBase, { recursive: true })

  const tasks: { r: string; l: string }[] = []

  const scan = async (curFrom: string, curTo: string) => {
    const list = await sftpReaddir(sftp, curFrom)
    for (const ent of list) {
      const name = entryName(ent)
      if (!name) continue

      const rPath = path.posix.join(curFrom, name)
      const lPath = path.join(curTo, name)

      if (isDirEntry(ent)) {
        await nodeFs.mkdir(lPath, { recursive: true })
        await scan(rPath, lPath)
      } else {
        tasks.push({ r: rPath, l: lPath })
      }
    }
  }

  await scan(fromDir, finalLocalBase)

  await Promise.all(tasks.map((t) => handleStreamTransfer(event, id, t.r, t.l, 'download', true)))

  return { status: 'success', localPath: finalLocalBase }
}
