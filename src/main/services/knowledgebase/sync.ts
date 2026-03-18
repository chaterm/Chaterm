/**
 * Knowledge base sync: incremental upload/download with file watcher and debounce.
 * Reuses data_sync ApiClient for same baseURL, auth (Bearer + X-Device-ID), and response handling.
 */

import { app } from 'electron'
import path from 'path'
import * as fs from 'fs/promises'
import { createLogger } from '../logging'
import { ApiClient } from '../../storage/data_sync/core/ApiClient'
import { getKnowledgeBaseRoot, IMAGE_EXTS } from './index'

const logger = createLogger('kb-sync')

const KB_SYNC_EXCLUDED_BASENAME = '.kb-default-seeds-meta.json'
export const KB_SYNC_DEBOUNCE_MS = 5000

export interface KbManifestEntry {
  relPath: string
  mtimeMs: number
  size: number
  hash?: string
}

interface SnapshotData {
  updatedAt: number
  entries: KbManifestEntry[]
  usedBytes?: number
}

function normalizeRelPath(relPath: string): string {
  const p = relPath.replace(/\\/g, '/')
  return p.startsWith('/') ? p.slice(1) : p
}

export function isKbSyncExcludedRelPath(relPath: string): boolean {
  const normalized = normalizeRelPath(relPath)
  const basename = path.basename(normalized)
  return basename === KB_SYNC_EXCLUDED_BASENAME || normalized === KB_SYNC_EXCLUDED_BASENAME
}

function getKbRoot(): string {
  return getKnowledgeBaseRoot()
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

export async function listAllKbFilesRecursive(relDir = ''): Promise<KbManifestEntry[]> {
  const { absPath: dirAbs } = resolveKbPath(relDir)
  if (!(await pathExists(dirAbs))) {
    return []
  }
  const entries: KbManifestEntry[] = []
  const dirents = await fs.readdir(dirAbs, { withFileTypes: true })
  for (const d of dirents) {
    if (d.name.startsWith('.')) continue
    const childAbs = path.join(dirAbs, d.name)
    const childRel = path.posix.join(relDir.replace(/\\/g, '/'), d.name)
    if (d.isDirectory()) {
      const sub = await listAllKbFilesRecursive(childRel)
      entries.push(...sub)
    } else if (d.isFile()) {
      if (isKbSyncExcludedRelPath(childRel)) continue
      const stat = await fs.stat(childAbs)
      entries.push({
        relPath: normalizeRelPath(childRel),
        mtimeMs: Math.floor(stat.mtimeMs), // stat.mtimeMs is float; Go int64 requires integer
        size: stat.size
      })
    }
  }
  return entries
}

function getSnapshotPath(): string {
  return path.join(app.getPath('userData'), 'kb-sync-snapshot.json')
}

export async function readLocalSnapshot(): Promise<SnapshotData | null> {
  const snapshotPath = getSnapshotPath()
  try {
    const raw = await fs.readFile(snapshotPath, 'utf-8')
    const data = JSON.parse(raw) as SnapshotData
    if (!data || !Array.isArray(data.entries)) return null
    return {
      updatedAt: data.updatedAt ?? 0,
      entries: data.entries,
      usedBytes: data.usedBytes
    }
  } catch {
    return null
  }
}

export async function writeLocalSnapshot(entries: KbManifestEntry[], usedBytes?: number): Promise<void> {
  const snapshotPath = getSnapshotPath()
  const data: SnapshotData = { updatedAt: Date.now(), entries, ...(usedBytes !== undefined && { usedBytes }) }
  await fs.writeFile(snapshotPath, JSON.stringify(data, null, 2), 'utf-8')
}

export function diffManifest(L_now: KbManifestEntry[], L_last: KbManifestEntry[] | null): { toUpload: KbManifestEntry[]; toDelete: string[] } {
  const toUpload: KbManifestEntry[] = []
  const toDelete: string[] = []
  const nowMap = new Map(L_now.map((e) => [e.relPath, e]))
  const lastMap = new Map((L_last ?? []).map((e) => [e.relPath, e]))
  for (const e of L_now) {
    const last = lastMap.get(e.relPath)
    if (!last) {
      toUpload.push(e)
    } else if (last.mtimeMs !== e.mtimeMs || last.size !== e.size) {
      toUpload.push(e)
    }
  }
  for (const relPath of lastMap.keys()) {
    if (!nowMap.has(relPath)) toDelete.push(relPath)
  }
  return { toUpload, toDelete }
}

export type KbUploadOutcomeStatus = 'ok' | 'skipped' | 'failed' | 'unspecified'
export type KbDeleteOutcomeStatus = 'ok' | 'skipped' | 'not_found' | 'failed' | 'unspecified'

// Keep numeric values aligned with backend proto enum (int32).
export enum UploadItemStatus {
  UploadStatusUnspecified = 0,
  UploadStatusOK = 1,
  UploadStatusSkipped = 2,
  UploadStatusFailed = 3
}

// Keep numeric values aligned with backend proto enum (int32).
export enum DeleteItemStatus {
  DeleteStatusUnspecified = 0,
  DeleteStatusOK = 1,
  DeleteStatusSkipped = 2,
  DeleteStatusNotFound = 3,
  DeleteStatusFailed = 4
}

export function parseKbUploadStatus(raw: unknown): KbUploadOutcomeStatus {
  if (raw === UploadItemStatus.UploadStatusOK) return 'ok'
  if (raw === UploadItemStatus.UploadStatusSkipped) return 'skipped'
  if (raw === UploadItemStatus.UploadStatusFailed) return 'failed'
  return 'unspecified'
}

export function parseKbDeleteStatus(raw: unknown): KbDeleteOutcomeStatus {
  if (raw === DeleteItemStatus.DeleteStatusOK) return 'ok'
  if (raw === DeleteItemStatus.DeleteStatusSkipped) return 'skipped'
  if (raw === DeleteItemStatus.DeleteStatusNotFound) return 'not_found'
  if (raw === DeleteItemStatus.DeleteStatusFailed) return 'failed'
  return 'unspecified'
}

/** Snapshot after upload: only OK/SKIPPED paths get L_now version; failed updates keep L_last; failed new files omitted. */
export function buildSnapshotEntriesAfterUpload(
  L_now: KbManifestEntry[],
  L_last: KbManifestEntry[] | null,
  toUpload: KbManifestEntry[],
  uploadSuccessRelPaths: Set<string>
): KbManifestEntry[] {
  const toUploadSet = new Set(toUpload.map((e) => e.relPath))
  const lastMap = new Map((L_last ?? []).map((e) => [e.relPath, e]))
  const out: KbManifestEntry[] = []
  for (const e of L_now) {
    if (!toUploadSet.has(e.relPath)) {
      out.push(e)
      continue
    }
    if (uploadSuccessRelPaths.has(e.relPath)) {
      out.push(e)
      continue
    }
    const prev = lastMap.get(e.relPath)
    if (prev) out.push(prev)
  }
  return out
}

export function adjustUsedBytesAfterUploadOk(usedBytes: number, cloudSizes: Map<string, number>, entry: KbManifestEntry): number {
  if (isKbSyncExcludedRelPath(entry.relPath)) return usedBytes
  const prev = cloudSizes.get(entry.relPath) ?? 0
  cloudSizes.set(entry.relPath, entry.size)
  return usedBytes - prev + entry.size
}

export interface KbSyncPathOutcome {
  relPath: string
  kind: 'upload' | 'delete'
  status: string
  message: string
}

export interface KbSyncLastRunResults {
  finishedAt: number
  uploads: KbSyncPathOutcome[]
  deletes: KbSyncPathOutcome[]
}

let lastKbSyncResults: KbSyncLastRunResults = { finishedAt: 0, uploads: [], deletes: [] }

export function getKbSyncLastResults(): KbSyncLastRunResults {
  return {
    finishedAt: lastKbSyncResults.finishedAt,
    uploads: [...lastKbSyncResults.uploads],
    deletes: [...lastKbSyncResults.deletes]
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let syncInProgress = false
interface KbSyncWatcher {
  on: (event: string, cb: () => void) => void
  close: () => void | Promise<void>
}
let watcher: KbSyncWatcher | null = null
let apiClient: ApiClient | null = null

function getApiClient(): ApiClient {
  if (!apiClient) {
    // Disable keepAlive to avoid ECONNRESET when reusing a connection
    // that the server has already closed between the manifest GET and upload POSTs.
    apiClient = new ApiClient({ keepAlive: false })
  }
  return apiClient
}

async function runSync(): Promise<void> {
  if (syncInProgress) return
  const client = getApiClient()
  const hasAuth = await client.isAuthenticated()
  if (!hasAuth) {
    logger.info('KB sync skipped: not authenticated')
    return
  }
  syncInProgress = true
  try {
    await fs.mkdir(getKbRoot(), { recursive: true })

    const manifestRes = (await client.get('/kb/manifest')) as { entries?: Record<string, KbManifestEntry> } | undefined
    const entriesMap = manifestRes?.entries ?? {}
    const cloudSizes = new Map<string, number>()
    for (const entry of Object.values(entriesMap)) {
      if (entry?.relPath && !isKbSyncExcludedRelPath(entry.relPath)) {
        cloudSizes.set(entry.relPath, entry.size ?? 0)
      }
    }
    let usedBytes = Array.from(cloudSizes.values()).reduce((a, b) => a + b, 0)
    for (const [_, entry] of Object.entries(entriesMap)) {
      if (isKbSyncExcludedRelPath(entry.relPath)) continue
      const { absPath } = resolveKbPath(entry.relPath)
      const exists = await pathExists(absPath)
      let shouldDownload = !exists
      if (exists) {
        const stat = await fs.stat(absPath)
        if (stat.mtimeMs < entry.mtimeMs) shouldDownload = true
      }
      if (!shouldDownload) continue
      try {
        const fileRes = (await client.get('/kb/file', {
          params: { relPath: entry.relPath }
        })) as { content?: string; encoding?: string } | undefined
        const content = fileRes?.content
        const encoding = fileRes?.encoding ?? 'utf-8'
        if (content == null) continue
        await fs.mkdir(path.dirname(absPath), { recursive: true })
        if (encoding === 'base64') {
          await fs.writeFile(absPath, Buffer.from(content, 'base64'))
        } else {
          await fs.writeFile(absPath, content, 'utf-8')
        }
        logger.info('KB sync downloaded', { relPath: entry.relPath })
      } catch (e: any) {
        logger.warn(`KB sync download failed for ${entry.relPath}`, { error: e?.message })
      }
    }

    const L_now = await listAllKbFilesRecursive()
    const L_last = await readLocalSnapshot()
    const { toUpload, toDelete } = diffManifest(L_now, L_last?.entries ?? null)
    const lastEntriesMap = new Map((L_last?.entries ?? []).map((e) => [e.relPath, e]))

    const uploadOutcomes: KbSyncPathOutcome[] = []
    const uploadSuccessRelPaths = new Set<string>()

    // Upload in batches to avoid oversized request bodies
    const UPLOAD_BATCH_SIZE = 20
    for (let batchStart = 0; batchStart < toUpload.length; batchStart += UPLOAD_BATCH_SIZE) {
      const batch = toUpload.slice(batchStart, batchStart + UPLOAD_BATCH_SIZE)
      try {
        const files = await Promise.all(
          batch.map(async (e) => {
            const { absPath } = resolveKbPath(e.relPath)
            const ext = path.extname(e.relPath).toLowerCase()
            const isBinary = IMAGE_EXTS.has(ext)
            const content = isBinary ? (await fs.readFile(absPath)).toString('base64') : await fs.readFile(absPath, 'utf-8')
            return { relPath: e.relPath, content, encoding: isBinary ? 'base64' : 'utf-8', mtimeMs: e.mtimeMs, size: e.size }
          })
        )
        const uploadReply = (await client.post('/kb/upload', { files })) as {
          results?: Record<string, { status?: unknown; message?: string }>
        }
        for (const e of batch) {
          const item = uploadReply?.results?.[e.relPath]
          const st = parseKbUploadStatus(item?.status)
          const message = typeof item?.message === 'string' ? item.message : ''
          if (st === 'ok') {
            usedBytes = adjustUsedBytesAfterUploadOk(usedBytes, cloudSizes, e)
            uploadSuccessRelPaths.add(e.relPath)
            logger.info('KB sync uploaded', { relPath: e.relPath, status: st })
          } else {
            logger.warn(`KB sync upload failed for ${e.relPath}`, { status: st, message: message || undefined })
          }
          uploadOutcomes.push({ relPath: e.relPath, kind: 'upload', status: st, message })
        }
      } catch (err: any) {
        const msg = err?.message ?? 'request failed'
        const originalMsg = (err as any)?.originalError?.message
        const statusCode = (err as any)?.originalError?.response?.status
        logger.warn(`KB sync batch upload failed (batch ${batchStart / UPLOAD_BATCH_SIZE + 1})`, {
          error: msg,
          ...(originalMsg && { originalError: originalMsg }),
          ...(statusCode && { httpStatus: statusCode })
        })
        for (const e of batch) {
          uploadOutcomes.push({ relPath: e.relPath, kind: 'upload', status: 'failed', message: msg })
        }
      }
    }

    const deleteOutcomes: KbSyncPathOutcome[] = []
    if (toDelete.length > 0) {
      try {
        const deleteReply = (await client.post('/kb/delete', { relPaths: toDelete })) as {
          results?: Record<string, { status?: unknown; message?: string }>
        }
        for (const relPath of toDelete) {
          const item = deleteReply?.results?.[relPath]
          const st = parseKbDeleteStatus(item?.status)
          const message = typeof item?.message === 'string' ? item.message : ''
          if (st === 'ok') {
            const sz =
              cloudSizes.get(relPath) ?? (entriesMap as Record<string, KbManifestEntry>)[relPath]?.size ?? lastEntriesMap.get(relPath)?.size ?? 0
            if (!isKbSyncExcludedRelPath(relPath) && sz > 0) {
              usedBytes -= sz
            }
            cloudSizes.delete(relPath)
            logger.info('KB sync deleted', { relPath, status: st })
          } else {
            logger.warn(`KB sync delete not applied for ${relPath}`, { status: st, message: message || undefined })
          }
          deleteOutcomes.push({ relPath, kind: 'delete', status: st, message })
        }
      } catch (err: any) {
        const msg = err?.message ?? 'delete request failed'
        for (const relPath of toDelete) {
          deleteOutcomes.push({ relPath, kind: 'delete', status: 'failed', message: msg })
        }
        logger.warn('KB sync delete batch failed', { error: msg })
      }
    }

    lastKbSyncResults = {
      finishedAt: Date.now(),
      uploads: uploadOutcomes,
      deletes: deleteOutcomes
    }

    const snapshotEntries = buildSnapshotEntriesAfterUpload(L_now, L_last?.entries ?? null, toUpload, uploadSuccessRelPaths)
    await writeLocalSnapshot(snapshotEntries, Math.max(0, usedBytes))
  } catch (e: any) {
    logger.warn('KB sync failed', { error: e?.message })
  } finally {
    syncInProgress = false
  }
}

function scheduleSync(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    runSync().catch(() => {})
  }, KB_SYNC_DEBOUNCE_MS)
}

export function startKbSync(): void {
  if (watcher) return
  const root = getKbRoot()
  import('chokidar').then((chokidarMod) => {
    const chokidar = chokidarMod.default
    watcher = chokidar.watch(root, {
      ignored: (p) => path.basename(p) === KB_SYNC_EXCLUDED_BASENAME,
      ignoreInitial: true
    })
    watcher.on('add', () => scheduleSync())
    watcher.on('change', () => scheduleSync())
    watcher.on('unlink', () => scheduleSync())
    watcher.on('addDir', () => scheduleSync())
    watcher.on('unlinkDir', () => scheduleSync())
    logger.info('KB sync watcher started', { root })
  })
  runSync().catch(() => {})
}

export async function stopKbSync(): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (watcher) {
    await watcher.close()
    watcher = null
  }
  if (apiClient) {
    apiClient.destroy()
    apiClient = null
  }
  logger.info('KB sync stopped')
}

export async function runKbSyncOnce(): Promise<void> {
  await runSync()
}

export function getKbSyncLastSyncTime(): Promise<number | null> {
  return readLocalSnapshot().then((s) => s?.updatedAt ?? null)
}

export function getKbSyncStatus(): { status: 'idle' | 'syncing' } {
  return { status: syncInProgress ? 'syncing' : 'idle' }
}

/** Total cloud quota in bytes for free tier (1 GB). */
export const KB_CLOUD_TOTAL_BYTES = 1024 * 1024 * 1024

export async function getKbCloudUsedBytes(): Promise<number> {
  const snapshot = await readLocalSnapshot()
  return snapshot?.usedBytes ?? 0
}
