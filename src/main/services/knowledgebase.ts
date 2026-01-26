import { app, ipcMain } from 'electron'
import path from 'path'
import * as fs from 'fs/promises'
import fsSync from 'fs'
import { pipeline } from 'stream/promises'
import { randomUUID } from 'crypto'

export interface KnowledgeBaseEntry {
  name: string
  relPath: string
  type: 'file' | 'dir'
  size?: number
  mtimeMs?: number
}

const ALLOWED_IMPORT_EXTS = new Set(['.txt', '.md', '.markdown', '.json', '.yaml', '.yml', '.log', '.csv'])
const MAX_IMPORT_BYTES = 10 * 1024 * 1024

function getKbRoot(): string {
  return path.join(app.getPath('userData'), 'knowledgebase')
}

function isSafeBasename(name: string): boolean {
  if (!name) return false
  if (name === '.' || name === '..') return false
  // Prevent path traversal on both win/unix
  if (name.includes('/') || name.includes('\\')) return false
  return true
}

function resolveKbPath(relPath: string): { rootAbs: string; absPath: string } {
  const rootAbs = path.resolve(getKbRoot())
  if (path.isAbsolute(relPath)) {
    throw new Error('Absolute path not allowed')
  }
  const absPath = path.resolve(rootAbs, relPath)
  if (absPath !== rootAbs && !absPath.startsWith(rootAbs + path.sep)) {
    throw new Error('Path escapes knowledgebase root')
  }
  return { rootAbs, absPath }
}

async function pathExists(absPath: string): Promise<boolean> {
  try {
    await fs.access(absPath)
    return true
  } catch {
    return false
  }
}

function splitNameExt(fileName: string): { base: string; ext: string } {
  const ext = path.extname(fileName)
  const base = ext ? fileName.slice(0, -ext.length) : fileName
  return { base, ext }
}

async function ensureUniqueName(dirAbs: string, desiredName: string): Promise<string> {
  const { base, ext } = splitNameExt(desiredName)
  let candidate = desiredName
  let n = 1
  while (true) {
    const target = path.join(dirAbs, candidate)
    if (!(await pathExists(target))) return candidate
    candidate = `${base} (${n})${ext}`
    n++
  }
}

async function listDir(relDir: string): Promise<KnowledgeBaseEntry[]> {
  const { absPath: dirAbs } = resolveKbPath(relDir)

  // Check if directory exists before attempting to read
  if (!(await pathExists(dirAbs))) {
    return []
  }

  const dirents = await fs.readdir(dirAbs, { withFileTypes: true })

  const entries: KnowledgeBaseEntry[] = []
  for (const d of dirents) {
    if (d.name.startsWith('.')) continue
    const childAbs = path.join(dirAbs, d.name)
    const childRel = path.posix.join(relDir.replace(/\\/g, '/'), d.name)
    const stat = await fs.stat(childAbs)
    entries.push({
      name: d.name,
      relPath: childRel,
      type: d.isDirectory() ? 'dir' : 'file',
      size: d.isDirectory() ? undefined : stat.size,
      mtimeMs: stat.mtimeMs
    })
  }

  // folders first, stable alpha
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return entries
}

async function copyFileWithProgress(srcAbs: string, destAbs: string, onProgress: (transferred: number, total: number) => void): Promise<void> {
  const stat = await fs.stat(srcAbs)
  const total = stat.size

  const destDirAbs = path.dirname(destAbs)
  await fs.mkdir(destDirAbs, { recursive: true })

  let transferred = 0
  const rs = fsSync.createReadStream(srcAbs)
  const ws = fsSync.createWriteStream(destAbs)

  let lastEmitAt = 0
  rs.on('data', (chunk) => {
    transferred += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk)
    const now = Date.now()
    if (now - lastEmitAt > 120) {
      lastEmitAt = now
      onProgress(transferred, total)
    }
  })

  await pipeline(rs, ws)
  onProgress(total, total)
}

// Check if file is allowed for import
function isFileAllowedForImport(fileName: string, fileSize: number): boolean {
  const ext = path.extname(fileName).toLowerCase()
  if (ext && !ALLOWED_IMPORT_EXTS.has(ext)) return false
  if (fileSize > MAX_IMPORT_BYTES) return false
  return true
}

interface FileImportTask {
  srcPath: string
  destPath: string
}

// Collect all importable files in one pass (lightweight, only paths and create dirs)
async function collectImportTasks(srcDir: string, destDir: string): Promise<FileImportTask[]> {
  const tasks: FileImportTask[] = []
  const entries = await fs.readdir(srcDir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const srcPath = path.join(srcDir, entry.name)
    const destPath = path.join(destDir, entry.name)

    if (entry.isDirectory()) {
      const subTasks = await collectImportTasks(srcPath, destPath)
      tasks.push(...subTasks)
    } else if (entry.isFile()) {
      const stat = await fs.stat(srcPath)
      if (isFileAllowedForImport(entry.name, stat.size)) {
        tasks.push({ srcPath, destPath })
      }
    }
  }
  return tasks
}

export function registerKnowledgeBaseHandlers(): void {
  ipcMain.handle('kb:check-path', async (_evt, payload: { absPath: string }) => {
    const absPath = payload?.absPath ?? ''
    try {
      const stat = await fs.stat(absPath)
      return {
        exists: true,
        isDirectory: stat.isDirectory(),
        isFile: stat.isFile()
      }
    } catch {
      return { exists: false, isDirectory: false, isFile: false }
    }
  })

  ipcMain.handle('kb:ensure-root', async () => {
    const root = getKbRoot()
    await fs.mkdir(root, { recursive: true })
    return { success: true }
  })

  ipcMain.handle('kb:get-root', async () => {
    const root = getKbRoot()
    await fs.mkdir(root, { recursive: true })
    return { root }
  })

  ipcMain.handle('kb:list-dir', async (_evt, payload: { relDir: string }) => {
    const relDir = payload?.relDir ?? ''
    await fs.mkdir(getKbRoot(), { recursive: true })
    return await listDir(relDir)
  })

  ipcMain.handle('kb:read-file', async (_evt, payload: { relPath: string }) => {
    const relPath = payload?.relPath ?? ''
    const { absPath } = resolveKbPath(relPath)
    const stat = await fs.stat(absPath)
    if (!stat.isFile()) throw new Error('Not a file')
    const content = await fs.readFile(absPath, 'utf-8')
    return { content, mtimeMs: stat.mtimeMs }
  })

  ipcMain.handle('kb:write-file', async (_evt, payload: { relPath: string; content: string }) => {
    const relPath = payload?.relPath ?? ''
    const content = payload?.content ?? ''
    const { absPath } = resolveKbPath(relPath)
    await fs.mkdir(path.dirname(absPath), { recursive: true })
    await fs.writeFile(absPath, content, 'utf-8')
    const stat = await fs.stat(absPath)
    return { mtimeMs: stat.mtimeMs }
  })

  ipcMain.handle('kb:mkdir', async (_evt, payload: { relDir: string; name: string }) => {
    const relDir = payload?.relDir ?? ''
    const name = payload?.name ?? ''
    if (!isSafeBasename(name)) throw new Error('Invalid folder name')
    const { absPath: dirAbs } = resolveKbPath(relDir)
    const targetAbs = path.join(dirAbs, name)
    await fs.mkdir(targetAbs, { recursive: false })
    return { success: true, relPath: path.posix.join(relDir.replace(/\\/g, '/'), name) }
  })

  ipcMain.handle('kb:create-file', async (_evt, payload: { relDir: string; name: string; content?: string }) => {
    const relDir = payload?.relDir ?? ''
    const name = payload?.name ?? ''
    const content = payload?.content ?? ''
    if (!isSafeBasename(name)) throw new Error('Invalid file name')
    const { absPath: dirAbs } = resolveKbPath(relDir)
    await fs.mkdir(dirAbs, { recursive: true })
    const finalName = await ensureUniqueName(dirAbs, name)
    const absPath = path.join(dirAbs, finalName)
    await fs.writeFile(absPath, content, 'utf-8')
    return { relPath: path.posix.join(relDir.replace(/\\/g, '/'), finalName) }
  })

  ipcMain.handle('kb:rename', async (_evt, payload: { relPath: string; newName: string }) => {
    const relPath = payload?.relPath ?? ''
    const newName = payload?.newName ?? ''
    if (!isSafeBasename(newName)) throw new Error('Invalid name')

    const { absPath: srcAbs } = resolveKbPath(relPath)
    const parentAbs = path.dirname(srcAbs)
    const destAbs = path.join(parentAbs, newName)

    // If renaming to the same name, return success without doing anything
    if (srcAbs === destAbs) {
      const parentRel = path.posix.dirname(relPath.replace(/\\/g, '/'))
      const nextRel = parentRel === '.' ? newName : path.posix.join(parentRel, newName)
      return { relPath: nextRel }
    }

    // Check if target already exists (different from source)
    if (await pathExists(destAbs)) {
      throw new Error('Target already exists')
    }
    await fs.rename(srcAbs, destAbs)
    const parentRel = path.posix.dirname(relPath.replace(/\\/g, '/'))
    const nextRel = parentRel === '.' ? newName : path.posix.join(parentRel, newName)
    return { relPath: nextRel }
  })

  ipcMain.handle('kb:delete', async (_evt, payload: { relPath: string; recursive?: boolean }) => {
    const relPath = payload?.relPath ?? ''
    const recursive = !!payload?.recursive
    const { absPath } = resolveKbPath(relPath)
    const stat = await fs.stat(absPath)
    if (stat.isDirectory()) {
      await fs.rm(absPath, { recursive, force: true })
    } else {
      await fs.unlink(absPath)
    }
    return { success: true }
  })

  ipcMain.handle('kb:move', async (_evt, payload: { srcRelPath: string; dstRelDir: string }) => {
    const srcRelPath = payload?.srcRelPath ?? ''
    const dstRelDir = payload?.dstRelDir ?? ''
    const { absPath: srcAbs } = resolveKbPath(srcRelPath)
    const { absPath: dstDirAbs } = resolveKbPath(dstRelDir)
    const name = path.basename(srcAbs)
    const finalName = await ensureUniqueName(dstDirAbs, name)
    const destAbs = path.join(dstDirAbs, finalName)
    await fs.mkdir(dstDirAbs, { recursive: true })

    try {
      await fs.rename(srcAbs, destAbs)
    } catch (e: any) {
      if (e?.code === 'EXDEV') {
        // Fallback for cross-device moves
        await fs.cp(srcAbs, destAbs, { recursive: true })
        await fs.rm(srcAbs, { recursive: true, force: true })
      } else {
        throw e
      }
    }

    const nextRel = path.posix.join(dstRelDir.replace(/\\/g, '/'), finalName)
    return { relPath: nextRel }
  })

  ipcMain.handle('kb:copy', async (_evt, payload: { srcRelPath: string; dstRelDir: string }) => {
    const srcRelPath = payload?.srcRelPath ?? ''
    const dstRelDir = payload?.dstRelDir ?? ''
    const { absPath: srcAbs } = resolveKbPath(srcRelPath)
    const { absPath: dstDirAbs } = resolveKbPath(dstRelDir)
    const name = path.basename(srcAbs)
    const finalName = await ensureUniqueName(dstDirAbs, name)
    const destAbs = path.join(dstDirAbs, finalName)
    await fs.mkdir(dstDirAbs, { recursive: true })
    await fs.cp(srcAbs, destAbs, { recursive: true })
    const nextRel = path.posix.join(dstRelDir.replace(/\\/g, '/'), finalName)
    return { relPath: nextRel }
  })

  ipcMain.handle('kb:import-file', async (evt, payload: { srcAbsPath: string; dstRelDir: string }) => {
    const srcAbsPath = payload?.srcAbsPath ?? ''
    const dstRelDir = payload?.dstRelDir ?? ''
    const { absPath: dstDirAbs } = resolveKbPath(dstRelDir)

    const srcStat = await fs.stat(srcAbsPath)
    if (!srcStat.isFile()) throw new Error('Source is not a file')
    if (srcStat.size > MAX_IMPORT_BYTES) throw new Error('File too large')

    const ext = path.extname(srcAbsPath).toLowerCase()
    if (ext && !ALLOWED_IMPORT_EXTS.has(ext)) {
      throw new Error('File type not allowed')
    }

    const originalName = path.basename(srcAbsPath)
    const finalName = await ensureUniqueName(dstDirAbs, originalName)
    const destAbs = path.join(dstDirAbs, finalName)

    const jobId = randomUUID()
    const destRelPath = path.posix.join(dstRelDir.replace(/\\/g, '/'), finalName)

    await copyFileWithProgress(srcAbsPath, destAbs, (transferred, total) => {
      evt.sender.send('kb:transfer-progress', {
        jobId,
        transferred,
        total,
        destRelPath
      })
    })

    return { jobId, relPath: destRelPath }
  })

  ipcMain.handle('kb:import-folder', async (evt, payload: { srcAbsPath: string; dstRelDir: string }) => {
    const srcAbsPath = payload?.srcAbsPath ?? ''
    const dstRelDir = payload?.dstRelDir ?? ''
    const { absPath: dstDirAbs } = resolveKbPath(dstRelDir)

    const srcStat = await fs.stat(srcAbsPath)
    if (!srcStat.isDirectory()) throw new Error('Source is not a folder')

    const folderName = path.basename(srcAbsPath)
    const finalFolderName = await ensureUniqueName(dstDirAbs, folderName)
    const destFolderAbs = path.join(dstDirAbs, finalFolderName)
    const destFolderRel = path.posix.join(dstRelDir.replace(/\\/g, '/'), finalFolderName)

    const jobId = randomUUID()

    // Ensure folder exists even if empty
    await fs.mkdir(destFolderAbs, { recursive: true })

    // Collect all import tasks in one traversal (creates dirs, collects file paths)
    const tasks = await collectImportTasks(srcAbsPath, destFolderAbs)
    const totalFiles = tasks.length

    // Send initial progress
    evt.sender.send('kb:transfer-progress', {
      jobId,
      transferred: 0,
      total: totalFiles,
      destRelPath: destFolderRel
    })

    // Import all collected files with progress updates
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]
      await copyFileWithProgress(task.srcPath, task.destPath, () => {
        // Individual file progress (not sent for folder import)
      })
      evt.sender.send('kb:transfer-progress', {
        jobId,
        transferred: i + 1,
        total: totalFiles,
        destRelPath: destFolderRel
      })
    }

    return { jobId, relPath: destFolderRel }
  })
}
