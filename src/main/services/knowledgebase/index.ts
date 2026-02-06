import { app, ipcMain } from 'electron'
import path from 'path'
import * as fs from 'fs/promises'
import fsSync from 'fs'
import { pipeline } from 'stream/promises'
import { randomUUID } from 'crypto'
import { createHash } from 'crypto'
import { getDefaultLanguage } from '../../config/edition'
import { KB_DEFAULT_SEEDS, KB_DEFAULT_SEEDS_VERSION } from './default-seeds'

export interface KnowledgeBaseEntry {
  name: string
  relPath: string
  type: 'file' | 'dir'
  size?: number
  mtimeMs?: number
}

const ALLOWED_IMPORT_EXTS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.yaml',
  '.yml',
  '.log',
  '.csv',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.svg'
])

// Image file extensions for binary handling
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])
const MAX_IMPORT_BYTES = 10 * 1024 * 1024

function getKbRoot(): string {
  return path.join(app.getPath('userData'), 'knowledgebase')
}

const KB_DEFAULT_SEEDS_META_FILE = '.kb-default-seeds-meta.json'

interface DefaultSeedMetaEntry {
  relPath: string
  lastSeedHash: string
  deletedAt?: string
}

interface DefaultKbSeedsMeta {
  version: number
  seeds: Record<string, DefaultSeedMetaEntry>
}

function normalizeRelPath(relPath: string): string {
  const p = relPath.replace(/\\/g, '/')
  return p.startsWith('/') ? p.slice(1) : p
}

function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex')
}

function getIsChinese(): boolean {
  const lang = getDefaultLanguage() || ''
  return lang.toLowerCase().startsWith('zh')
}

async function readKbDefaultSeedsMeta(rootAbs: string): Promise<{ metaAbsPath: string; meta: DefaultKbSeedsMeta }> {
  const newAbsPath = path.join(rootAbs, KB_DEFAULT_SEEDS_META_FILE)

  const tryRead = async (absPath: string): Promise<DefaultKbSeedsMeta | null> => {
    try {
      const raw = await fs.readFile(absPath, 'utf-8')
      const parsed = JSON.parse(raw) as any
      if (!parsed || typeof parsed !== 'object') return null
      const version = typeof parsed.version === 'number' ? parsed.version : 0
      const seeds = parsed.seeds && typeof parsed.seeds === 'object' ? (parsed.seeds as DefaultKbSeedsMeta['seeds']) : {}
      return { version, seeds }
    } catch {
      return null
    }
  }

  const newMeta = await tryRead(newAbsPath)
  if (newMeta) return { metaAbsPath: newAbsPath, meta: newMeta }

  return { metaAbsPath: newAbsPath, meta: { version: 0, seeds: {} } }
}

async function writeKbDefaultSeedsMeta(metaAbsPath: string, meta: DefaultKbSeedsMeta): Promise<void> {
  const safeMeta: DefaultKbSeedsMeta = {
    version: meta.version ?? 0,
    seeds: meta.seeds ?? {}
  }
  await fs.writeFile(metaAbsPath, JSON.stringify(safeMeta, null, 2), 'utf-8')
}

function findMetaIdByRelPath(meta: DefaultKbSeedsMeta, relPath: string): string | null {
  for (const [id, entry] of Object.entries(meta.seeds)) {
    if (normalizeRelPath(entry.relPath) === relPath) return id
  }
  return null
}

function findSeedIdByDefaultRelPath(relPath: string): string | null {
  for (const seed of KB_DEFAULT_SEEDS) {
    if (normalizeRelPath(seed.defaultRelPath) === relPath) return seed.id
  }
  return null
}

function resolveDefaultSeedId(meta: DefaultKbSeedsMeta, relPath: string): string | null {
  return findMetaIdByRelPath(meta, relPath) ?? findSeedIdByDefaultRelPath(relPath)
}

async function trackSeedFileChange(oldRelPath: string, newRelPath?: string): Promise<void> {
  const rootAbs = path.resolve(getKbRoot())
  const { metaAbsPath, meta } = await readKbDefaultSeedsMeta(rootAbs)

  const normalized = normalizeRelPath(oldRelPath)
  const id = resolveDefaultSeedId(meta, normalized)
  if (!id) return

  // When newRelPath is provided, treat it as a relPath change (rename/move).
  if (newRelPath && newRelPath.length > 0) {
    const normalizedNew = normalizeRelPath(newRelPath)

    const entry = meta.seeds[id] ?? { relPath: normalizedNew, lastSeedHash: '' }
    meta.seeds[id] = { ...entry, relPath: normalizedNew }
    await writeKbDefaultSeedsMeta(metaAbsPath, meta)
    return
  }

  const entry = meta.seeds[id] ?? { relPath: normalized, lastSeedHash: '' }
  meta.seeds[id] = { ...entry, deletedAt: new Date().toISOString() }
  await writeKbDefaultSeedsMeta(metaAbsPath, meta)
}

/**
 * Initialize knowledge base default seed files.
 */
async function initKbDefaultSeedFiles(): Promise<void> {
  const root = getKbRoot()
  const rootAbs = path.resolve(root)
  const { metaAbsPath, meta } = await readKbDefaultSeedsMeta(rootAbs)
  if (meta.version >= KB_DEFAULT_SEEDS_VERSION) {
    return
  }

  const isChinese = getIsChinese()

  for (const seed of KB_DEFAULT_SEEDS) {
    const currentEntry = meta.seeds[seed.id]
    if (currentEntry?.deletedAt) {
      continue
    }

    const seedContent = seed.getContent(isChinese).trim()
    const seedHash = sha256Hex(seedContent)

    const targetRelPath = currentEntry?.relPath ? normalizeRelPath(currentEntry.relPath) : normalizeRelPath(seed.defaultRelPath)
    const targetAbsPath = path.join(root, targetRelPath)

    const exists = await pathExists(targetAbsPath)
    if (!exists) {
      // Only create when there is no existing binding for this seed.
      if (currentEntry?.relPath) {
        continue
      }

      await fs.mkdir(path.dirname(targetAbsPath), { recursive: true })
      await fs.writeFile(targetAbsPath, seedContent, 'utf-8')
      meta.seeds[seed.id] = {
        relPath: targetRelPath,
        lastSeedHash: seedHash
      }
      continue
    }

    // Existing file: only overwrite when file still matches last seed hash (i.e., user hasn't edited).
    try {
      const fileContent = await fs.readFile(targetAbsPath, 'utf-8')
      const fileHash = sha256Hex(fileContent)
      const lastSeedHash = currentEntry?.lastSeedHash ?? ''

      if (lastSeedHash && fileHash !== lastSeedHash) {
        // User modified; do not overwrite.
        continue
      }

      // Safe to overwrite (either unmodified seed, or first-time meta missing hash but content matches).
      await fs.writeFile(targetAbsPath, seedContent, 'utf-8')
      meta.seeds[seed.id] = {
        relPath: targetRelPath,
        lastSeedHash: seedHash
      }
    } catch {
      // Ignore read errors; do not overwrite.
      continue
    }
  }

  meta.version = KB_DEFAULT_SEEDS_VERSION
  await writeKbDefaultSeedsMeta(metaAbsPath, meta)
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

async function caseSensitiveExists(dirAbs: string, name: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dirAbs, { withFileTypes: true })
    return entries.some((entry) => entry.name === name)
  } catch (e: any) {
    if (e?.code === 'ENOENT') return false
    throw e
  }
}

function splitNameExt(fileName: string): { base: string; ext: string } {
  const ext = path.extname(fileName)
  const base = ext ? fileName.slice(0, -ext.length) : fileName
  return { base, ext }
}

function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return IMAGE_EXTS.has(ext)
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
    await initKbDefaultSeedFiles()
    return { success: true }
  })

  ipcMain.handle('kb:get-root', async () => {
    const root = getKbRoot()
    await fs.mkdir(root, { recursive: true })
    await initKbDefaultSeedFiles()
    return { root }
  })

  ipcMain.handle('kb:list-dir', async (_evt, payload: { relDir: string }) => {
    const relDir = payload?.relDir ?? ''
    await fs.mkdir(getKbRoot(), { recursive: true })
    return await listDir(relDir)
  })

  // Read file with optional encoding: 'utf-8' (default) for text, 'base64' for binary
  ipcMain.handle('kb:read-file', async (_evt, payload: { relPath: string; encoding?: 'utf-8' | 'base64' }) => {
    const relPath = payload?.relPath ?? ''
    const encoding = payload?.encoding ?? 'utf-8'
    const { absPath } = resolveKbPath(relPath)
    const stat = await fs.stat(absPath)
    if (!stat.isFile()) throw new Error('Not a file')

    if (encoding === 'base64') {
      const buffer = await fs.readFile(absPath)
      const content = buffer.toString('base64')
      const ext = path.extname(relPath).toLowerCase()
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.svg': 'image/svg+xml'
      }
      const mimeType = mimeTypes[ext] || 'application/octet-stream'
      return { content, mimeType, mtimeMs: stat.mtimeMs, isImage: isImageFile(relPath) }
    } else {
      const content = await fs.readFile(absPath, 'utf-8')
      return { content, mtimeMs: stat.mtimeMs }
    }
  })

  // Write file with optional encoding: 'utf-8' (default) for text, 'base64' for binary
  ipcMain.handle('kb:write-file', async (_evt, payload: { relPath: string; content: string; encoding?: 'utf-8' | 'base64' }) => {
    const relPath = payload?.relPath ?? ''
    const content = payload?.content ?? ''
    const encoding = payload?.encoding ?? 'utf-8'
    const { absPath } = resolveKbPath(relPath)
    await fs.mkdir(path.dirname(absPath), { recursive: true })

    if (encoding === 'base64') {
      const buffer = Buffer.from(content, 'base64')
      await fs.writeFile(absPath, buffer)
    } else {
      await fs.writeFile(absPath, content, 'utf-8')
    }

    const stat = await fs.stat(absPath)
    return { mtimeMs: stat.mtimeMs }
  })

  // Create a new image file from base64 data
  ipcMain.handle('kb:create-image', async (_evt, payload: { relDir: string; name: string; base64: string }) => {
    const relDir = payload?.relDir ?? ''
    const name = payload?.name ?? ''
    const base64 = payload?.base64 ?? ''
    if (!isSafeBasename(name)) throw new Error('Invalid file name')
    const { absPath: dirAbs } = resolveKbPath(relDir)
    await fs.mkdir(dirAbs, { recursive: true })
    const finalName = await ensureUniqueName(dirAbs, name)
    const absPath = path.join(dirAbs, finalName)
    const buffer = Buffer.from(base64, 'base64')
    await fs.writeFile(absPath, buffer)
    return { relPath: path.posix.join(relDir.replace(/\\/g, '/'), finalName) }
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
    if (await caseSensitiveExists(parentAbs, newName)) {
      throw new Error('Target already exists')
    }
    await fs.rename(srcAbs, destAbs)
    const parentRel = path.posix.dirname(relPath.replace(/\\/g, '/'))
    const nextRel = parentRel === '.' ? newName : path.posix.join(parentRel, newName)

    // Track rename for default seeds (rename implies user intent; never recreate at default path).
    try {
      await trackSeedFileChange(relPath, nextRel)
    } catch {
      // Ignore meta tracking errors.
    }

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

    // Track deletions for default seeds (user deletes => never recreate).
    try {
      await trackSeedFileChange(relPath)
    } catch {
      // Ignore meta tracking errors.
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

    // Track moves for default seeds to keep upgrade path stable.
    try {
      await trackSeedFileChange(srcRelPath, nextRel)
    } catch {
      // Ignore meta tracking errors.
    }

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
