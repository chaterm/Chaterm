// Log retention - cleans up old log files based on age and total size limits

import * as fs from 'fs/promises'
import * as path from 'path'
import { app } from 'electron'

// Use raw console for internal diagnostics to avoid recursive logging
const RAW_CONSOLE = console

interface RetentionOptions {
  retentionDays: number
  maxTotalSizeMB: number
}

/**
 * Get the base log directory: {userData}/logs/
 */
function getLogBaseDir(): string {
  return path.join(app.getPath('userData'), 'logs')
}

/**
 * Collect all chaterm log files from the log directory.
 * Matches files named chaterm_*.log
 */
async function collectLogFiles(
  baseDir: string
): Promise<{ path: string; mtimeMs: number; size: number }[]> {
  const files: { path: string; mtimeMs: number; size: number }[] = []

  try {
    const entries = await fs.readdir(baseDir)
    for (const entry of entries) {
      if (!entry.startsWith('chaterm_') || !entry.endsWith('.log')) continue
      const filePath = path.join(baseDir, entry)
      const fileStat = await fs.stat(filePath)
      if (!fileStat.isFile()) continue
      files.push({ path: filePath, mtimeMs: fileStat.mtimeMs, size: fileStat.size })
    }
  } catch {
    // Directory may not exist yet
  }

  return files.sort((a, b) => a.mtimeMs - b.mtimeMs) // oldest first
}

/**
 * Run retention cleanup: remove files older than retentionDays,
 * then remove oldest files if total exceeds maxTotalSizeMB.
 */
export async function runRetention(options: RetentionOptions): Promise<void> {
  const baseDir = getLogBaseDir()
  const files = await collectLogFiles(baseDir)

  if (files.length === 0) return

  const now = Date.now()
  const maxAgeMs = options.retentionDays * 24 * 60 * 60 * 1000
  const maxTotalBytes = options.maxTotalSizeMB * 1024 * 1024

  // Phase 1: Remove files older than retentionDays
  const remaining: typeof files = []
  for (const file of files) {
    if (now - file.mtimeMs > maxAgeMs) {
      try {
        await fs.unlink(file.path)
      } catch (err) {
        RAW_CONSOLE.error('[retention] Failed to delete expired file:', file.path, err)
      }
    } else {
      remaining.push(file)
    }
  }

  // Phase 2: Remove oldest files until total size is within limit
  let totalSize = remaining.reduce((sum, f) => sum + f.size, 0)

  for (const file of remaining) {
    if (totalSize <= maxTotalBytes) break
    try {
      await fs.unlink(file.path)
      totalSize -= file.size
    } catch (err) {
      RAW_CONSOLE.error('[retention] Failed to delete file for size limit:', file.path, err)
    }
  }
}
