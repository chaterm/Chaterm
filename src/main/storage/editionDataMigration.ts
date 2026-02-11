import { app, dialog } from 'electron'
import path from 'path'
import * as fs from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { getEdition, getUserDataPath } from '../config/edition'

import { createLogger } from '@logging'

const logger = createLogger('db')

type MigrationStatus = 'completed' | 'skipped' | 'failed' | 'blocked'

interface MigrationMarker {
  status: MigrationStatus
  timestamp: string
  reason?: string
  sourcePath?: string
  targetPath?: string
  error?: string
}

const MIGRATION_MARKER_FILE = '.cn-to-global-migration.json'
const SKIP_ENTRY_NAMES = new Set(['SingletonLock', 'SingletonSocket', 'SingletonCookie'])
const execFileAsync = promisify(execFile)

// Database directory names - must match connection.ts
const DB_DIR_NAME = 'chaterm_db'
const LEGACY_DB_DIR_NAME = 'databases'

export async function migrateCnUserDataOnFirstLaunch(): Promise<void> {
  // Migration note: CN/Global split caused Global edition to miss legacy local data.
  // This one-time migration copies CN databases into the Global userData directory.
  if (getEdition() !== 'global') {
    return
  }

  const targetUserDataPath = getUserDataPath()
  if (!isGlobalUserDataPath(targetUserDataPath)) {
    logger.warn(`[Migration] Target userData is not chaterm-global (${targetUserDataPath}), skipping migration.`)
    return
  }
  const markerPath = path.join(targetUserDataPath, MIGRATION_MARKER_FILE)

  const existingMarker = await readMigrationMarker(markerPath)
  if (existingMarker && existingMarker.status !== 'failed' && existingMarker.status !== 'blocked') {
    logger.info('[Migration] CN -> Global migration marker found, skipping.')
    return
  }

  if (existingMarker?.status === 'failed' || existingMarker?.status === 'blocked') {
    logger.warn('[Migration] Previous migration was not completed, retrying on this launch.')
  }

  await ensureDir(targetUserDataPath)

  const sourceUserDataPath = await findLegacyCnUserDataPath(targetUserDataPath)
  if (!sourceUserDataPath) {
    await writeMigrationMarker(markerPath, {
      status: 'skipped',
      timestamp: new Date().toISOString(),
      reason: 'source-not-found',
      targetPath: targetUserDataPath
    })
    logger.info('[Migration] No CN userData found, skipping migration.')
    return
  }

  if (await isOtherEditionRunning()) {
    await showOtherEditionRunningDialog()
    await writeMigrationMarker(markerPath, {
      status: 'blocked',
      timestamp: new Date().toISOString(),
      reason: 'other-version-running',
      sourcePath: sourceUserDataPath,
      targetPath: targetUserDataPath
    })
    logger.warn('[Migration] Detected other edition running, please close it and retry.')
    app.quit()
    return
  }

  // Check both old and new directory names
  const targetHasOldDatabases = await hasDatabaseFiles(path.join(targetUserDataPath, LEGACY_DB_DIR_NAME))
  const targetHasNewDatabases = await hasDatabaseFiles(path.join(targetUserDataPath, DB_DIR_NAME))
  if (targetHasOldDatabases || targetHasNewDatabases) {
    logger.warn('[Migration] Target userData already has databases, overwriting with CN data.')
  }

  // Check for WAL/SHM files in both directories
  const oldWalOrShm = await hasWalOrShmFiles(path.join(sourceUserDataPath, LEGACY_DB_DIR_NAME))
  const newWalOrShm = await hasWalOrShmFiles(path.join(sourceUserDataPath, DB_DIR_NAME))
  const walOrShmDetected = oldWalOrShm || newWalOrShm
  if (walOrShmDetected) {
    logger.warn('[Migration] WAL/SHM files detected in source databases. Ensure the other edition is closed before continuing.')
  }

  logger.info('[Migration] Starting CN -> Global userData migration...')
  try {
    await copyDatabasesOnly(sourceUserDataPath, targetUserDataPath)
    await writeMigrationMarker(markerPath, {
      status: 'completed',
      timestamp: new Date().toISOString(),
      sourcePath: sourceUserDataPath,
      targetPath: targetUserDataPath
    })
    logger.info('[Migration] CN -> Global userData migration completed.')
  } catch (error) {
    await writeMigrationMarker(markerPath, {
      status: 'failed',
      timestamp: new Date().toISOString(),
      sourcePath: sourceUserDataPath,
      targetPath: targetUserDataPath,
      error: error instanceof Error ? error.message : String(error)
    })
    logger.error('[Migration] CN -> Global userData migration failed', { error: error instanceof Error ? error.message : String(error) })
  }
}

async function findLegacyCnUserDataPath(targetUserDataPath: string): Promise<string | null> {
  const appDataPath = app.getPath('appData')
  const candidateNames = ['chaterm', 'Chaterm']
  const candidatePaths = candidateNames.map((name) => path.join(appDataPath, name))

  const seen = new Set<string>()
  const targetResolved = path.resolve(targetUserDataPath)

  for (const candidatePath of candidatePaths) {
    const resolved = path.resolve(candidatePath)
    if (seen.has(resolved) || resolved === targetResolved) continue
    seen.add(resolved)

    if (!(await pathExists(resolved))) continue
    // Check both old and new directory names
    if ((await hasDatabaseFiles(path.join(resolved, LEGACY_DB_DIR_NAME))) || (await hasDatabaseFiles(path.join(resolved, DB_DIR_NAME)))) {
      return resolved
    }
  }

  return null
}

async function hasDatabaseFiles(databasesPath: string): Promise<boolean> {
  if (!(await pathExists(databasesPath))) {
    return false
  }

  try {
    const entries = await fs.promises.readdir(databasesPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.db')) {
        return true
      }
      if (entry.isDirectory()) {
        const userDir = path.join(databasesPath, entry.name)
        const userEntries = await fs.promises.readdir(userDir)
        if (userEntries.some((file) => file.endsWith('.db'))) {
          return true
        }
      }
    }
  } catch (error) {
    logger.warn('[Migration] Failed to scan databases directory', { error: error instanceof Error ? error.message : String(error) })
  }

  return false
}

async function hasWalOrShmFiles(databasesPath: string): Promise<boolean> {
  if (!(await pathExists(databasesPath))) {
    return false
  }

  const entries = await fs.promises.readdir(databasesPath, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = path.join(databasesPath, entry.name)
    if (entry.isDirectory()) {
      if (await hasWalOrShmFiles(entryPath)) {
        return true
      }
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.db-wal') || entry.name.endsWith('.db-shm')) {
        return true
      }
    }
  }

  return false
}

async function copyDatabasesOnly(sourceUserDataPath: string, targetUserDataPath: string): Promise<void> {
  // Try new directory name first, then fall back to old name
  let sourceDatabasesPath = path.join(sourceUserDataPath, DB_DIR_NAME)
  if (!(await pathExists(sourceDatabasesPath))) {
    sourceDatabasesPath = path.join(sourceUserDataPath, LEGACY_DB_DIR_NAME)
  }

  // Always use new directory name for target
  const targetDatabasesPath = path.join(targetUserDataPath, DB_DIR_NAME)

  if (!(await pathExists(sourceDatabasesPath))) {
    throw new Error('Source databases directory not found')
  }
  await copyDirectory(sourceDatabasesPath, targetDatabasesPath)
}

async function copyDirectory(source: string, target: string): Promise<void> {
  await ensureDir(target)
  const entries = await fs.promises.readdir(source, { withFileTypes: true })

  for (const entry of entries) {
    if (SKIP_ENTRY_NAMES.has(entry.name)) {
      continue
    }

    const sourcePath = path.join(source, entry.name)
    const targetPath = path.join(target, entry.name)

    if (entry.isDirectory()) {
      const targetStat = await safeLstat(targetPath)
      if (targetStat && !targetStat.isDirectory()) {
        await removePath(targetPath, targetStat)
      }
      await copyDirectory(sourcePath, targetPath)
    } else if (entry.isFile()) {
      const targetStat = await safeLstat(targetPath)
      if (targetStat && targetStat.isDirectory()) {
        await removePath(targetPath, targetStat)
      }
      await fs.promises.copyFile(sourcePath, targetPath)
    } else if (entry.isSymbolicLink()) {
      const targetStat = await safeLstat(targetPath)
      if (targetStat) {
        await removePath(targetPath, targetStat)
      }
      const linkTarget = await fs.promises.readlink(sourcePath)
      await fs.promises.symlink(linkTarget, targetPath)
    }
  }
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true })
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function safeLstat(targetPath: string): Promise<fs.Stats | null> {
  try {
    return await fs.promises.lstat(targetPath)
  } catch {
    return null
  }
}

async function removePath(targetPath: string, stat: fs.Stats): Promise<void> {
  if (stat.isDirectory()) {
    await fs.promises.rm(targetPath, { recursive: true, force: true })
  } else {
    await fs.promises.unlink(targetPath)
  }
}

async function writeMigrationMarker(markerPath: string, marker: MigrationMarker): Promise<void> {
  await ensureDir(path.dirname(markerPath))
  await fs.promises.writeFile(markerPath, JSON.stringify(marker, null, 2), 'utf8')
}

async function readMigrationMarker(markerPath: string): Promise<MigrationMarker | null> {
  if (!(await pathExists(markerPath))) {
    return null
  }

  try {
    const content = await fs.promises.readFile(markerPath, 'utf8')
    return JSON.parse(content) as MigrationMarker
  } catch (error) {
    logger.warn('[Migration] Failed to read migration marker, proceeding with migration', {
      error: error instanceof Error ? error.message : String(error)
    })
    return null
  }
}

async function isOtherEditionRunning(): Promise<boolean> {
  const processNames = getOtherEditionProcessNames()
  const processCheck = await isProcessRunning(processNames)
  return processCheck ?? false
}

function getOtherEditionProcessNames(): string[] {
  if (process.platform === 'win32') {
    return ['Chaterm CN.exe', 'chaterm-cn.exe']
  }
  return ['Chaterm CN', 'chaterm-cn']
}

async function isProcessRunning(processNames: string[]): Promise<boolean | null> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('tasklist', ['/FO', 'CSV', '/NH'])
      const lines = stdout.split(/\r?\n/).filter(Boolean)
      const lowerNames = processNames.map((name) => name.toLowerCase())
      for (const line of lines) {
        const firstField = line.split('","')[0]?.replace(/^"|"$/g, '')
        if (!firstField) continue
        if (lowerNames.includes(firstField.toLowerCase())) {
          return true
        }
      }
      return false
    }

    const { stdout } = await execFileAsync('ps', ['-A', '-o', 'command='])
    const lowerOutput = stdout.toLowerCase()
    return processNames.some((name) => lowerOutput.includes(name.toLowerCase()))
  } catch (error) {
    logger.warn('[Migration] Failed to check process list', { error: error instanceof Error ? error.message : String(error) })
    return null
  }
}

async function showOtherEditionRunningDialog(): Promise<void> {
  try {
    await dialog.showMessageBox({
      type: 'warning',
      buttons: ['ok'],
      defaultId: 0,
      title: 'Data migration',
      message: 'Another version of Chaterm is currently running. Please close it and try again.'
    })
  } catch (error) {
    logger.warn('[Migration] Failed to show running edition dialog', { error: error instanceof Error ? error.message : String(error) })
  }
}

function isGlobalUserDataPath(userDataPath: string): boolean {
  return path.basename(userDataPath).toLowerCase() === 'chaterm-global'
}
