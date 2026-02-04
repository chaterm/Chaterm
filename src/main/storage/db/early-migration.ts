/**
 * Early database migration - MUST be executed before Electron/Chromium initializes.
 *
 * This module migrates the application database directory from 'databases' to 'chaterm_db'
 * BEFORE Chromium starts, because Chromium may clear or recreate the 'databases' directory
 * as it's a reserved name for Chromium's Web SQL storage.
 *
 * IMPORTANT: This file must only use Node.js built-in modules (fs, path) and
 * must NOT import any Electron modules, as Electron initialization triggers Chromium.
 */

import * as fs from 'fs'
import { join } from 'path'
import { getUserDataPath } from '../../config/edition'

const OLD_DB_DIR_NAME = 'databases'
const NEW_DB_DIR_NAME = 'chaterm_db'

/**
 * Check if a directory contains user database data (not Chromium Web SQL data).
 * User data is identified by:
 * - .db files (SQLite databases)
 * - Numeric subdirectories (userId directories like '12345/')
 */
function containsUserData(dirPath: string): boolean {
  try {
    const contents = fs.readdirSync(dirPath)
    return contents.some((item) => {
      // Check for .db files
      if (item.endsWith('.db')) {
        return true
      }
      // Check for numeric userId directories
      if (/^\d+$/.test(item)) {
        const itemPath = join(dirPath, item)
        return fs.statSync(itemPath).isDirectory()
      }
      return false
    })
  } catch {
    return false
  }
}

/**
 * Migrate database directory from 'databases' to 'chaterm_db'.
 * This must be called BEFORE importing any Electron modules.
 */
export function migrateDbDirBeforeChromium(): void {
  const userDataPath = getUserDataPath()
  const oldDir = join(userDataPath, OLD_DB_DIR_NAME)
  const newDir = join(userDataPath, NEW_DB_DIR_NAME)

  // Skip if old directory doesn't exist
  if (!fs.existsSync(oldDir)) {
    return
  }

  // Skip if new directory already exists (already migrated)
  if (fs.existsSync(newDir)) {
    return
  }

  // Check if old directory contains actual user data
  if (!containsUserData(oldDir)) {
    console.log('[DB Early Migration] No user data found in databases/, skipping migration')
    return
  }

  // Perform migration
  try {
    console.log(`[DB Early Migration] Migrating ${oldDir} -> ${newDir}`)
    fs.renameSync(oldDir, newDir)
    console.log('[DB Early Migration] Migration completed successfully')
  } catch (error) {
    console.error('[DB Early Migration] Failed to rename directory:', error)
    // Try copy as fallback
    try {
      fs.cpSync(oldDir, newDir, { recursive: true })
      console.log('[DB Early Migration] Migration completed via copy')
      // Optionally remove old directory after successful copy
      // fs.rmSync(oldDir, { recursive: true, force: true })
    } catch (copyError) {
      console.error('[DB Early Migration] Failed to copy directory:', copyError)
    }
  }
}
