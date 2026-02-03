import { ipcMain } from 'electron'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { activeTasks, getSftpConnection, getUniqueRemoteName } from './sshHandle'

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

// TODO: SFTP migration
export const registerFileSystemHandlers = () => {
  ipcMain.handle('sftp:r2r:file', async (event, args: R2RFileArgs) => {
    return transferFileR2R(event, args)
  })

  ipcMain.handle('sftp:r2r:dir', async (event, args: R2RDirArgs) => {
    return transferDirR2R(event, args)
  })
}
function toPosix(p: string) {
  return p.replace(/\\/g, '/')
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
