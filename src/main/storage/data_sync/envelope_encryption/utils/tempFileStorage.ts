import { promises as fs } from 'fs'
import * as path from 'path'

interface StorageStats {
  keys: string[]
  fileCount: number
  totalSize: number
  storageDir: string
}

/**
 * Temporary file storage provider
 * Used for persisting session IDs and data keys, solving the problem of memory storage loss on restart
 */
class TempFileStorageProvider {
  private storageDir: string

  constructor() {
    // Use system secure application data directory
    let appDataPath: string
    try {
      const { app } = require('electron')
      appDataPath = app.getPath('userData')
    } catch (error) {
      // Fallback for test environment
      appDataPath = path.join(process.cwd(), 'test_data')
    }
    this.storageDir = path.join(appDataPath, '.chaterm-encryption', 'keys')
    this.ensureStorageDir()
  }

  /**
   * Ensure storage directory exists
   */
  private async ensureStorageDir(): Promise<void> {
    try {
      await fs.access(this.storageDir)
    } catch (error) {
      // Directory doesn't exist, create it
      await fs.mkdir(this.storageDir, { recursive: true, mode: 0o700 }) // Owner access only
      console.log(`Created secure storage directory: ${this.storageDir}`)
    }

    // Ensure directory permissions are correct
    await fs.chmod(this.storageDir, 0o700)
  }

  /**
   * Get file path
   */
  private getFilePath(key: string): string {
    // Replace special characters in key with safe characters to prevent guessing
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_')
    return path.join(this.storageDir, `${safeKey}.enc`)
  }

  /**
   * Simple content obfuscation (not encryption, only prevents direct reading)
   */
  private obfuscateContent(content: string): string {
    const buffer = Buffer.from(content, 'utf8')
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] ^= 0x42 // Simple XOR obfuscation
    }
    return buffer.toString('base64')
  }

  /**
   * Deobfuscate content
   */
  private deobfuscateContent(obfuscated: string): string {
    const buffer = Buffer.from(obfuscated, 'base64')
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] ^= 0x42 // Restore XOR
    }
    return buffer.toString('utf8')
  }

  /**
   * Store data to file
   */
  async setItem(key: string, value: string): Promise<void> {
    try {
      await this.ensureStorageDir()
      const filePath = this.getFilePath(key)
      const obfuscatedValue = this.obfuscateContent(value)
      await fs.writeFile(filePath, obfuscatedValue, 'utf8')

      // Set strict file permissions: owner read/write only
      await fs.chmod(filePath, 0o600)
    } catch (error) {
      console.error(`Failed to store data - Key: ${key}`, error)
      throw error
    }
  }

  /**
   * Read data from file
   */
  async getItem(key: string): Promise<string | null> {
    try {
      const filePath = this.getFilePath(key)
      const obfuscatedData = await fs.readFile(filePath, 'utf8')
      const data = this.deobfuscateContent(obfuscatedData)
      console.log(`Read data from file: ${key}`)
      return data
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist
        return null
      }
      console.error(`Failed to read data (${key}):`, error)
      throw error
    }
  }

  /**
   * Delete file
   */
  async removeItem(key: string): Promise<void> {
    try {
      const filePath = this.getFilePath(key)
      await fs.unlink(filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist, ignore error
        return
      }
      console.error(`Failed to delete file (${key}):`, error)
      throw error
    }
  }

  /**
   * Clear all files
   */
  async clear(): Promise<void> {
    try {
      const files = await fs.readdir(this.storageDir)
      const deletePromises = files
        .filter((file) => file.endsWith('.enc')) // Only delete obfuscated files
        .map((file) => fs.unlink(path.join(this.storageDir, file)))

      await Promise.all(deletePromises)
      console.log(`Cleared all storage files (${files.length} files)`)
    } catch (error) {
      console.error('Failed to clear storage files:', error)
      throw error
    }
  }

  /**
   * Get all keys
   */
  async keys(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.storageDir)
      const keys = files
        .filter((file) => file.endsWith('.enc')) // Only process obfuscated files
        .map((file) => file.replace('.enc', ''))
        .map((safeKey) => this.restoreKeyFromSafeKey(safeKey))

      return keys
    } catch (error) {
      console.error('Failed to get key list:', error)
      return []
    }
  }

  /**
   * Restore original key name from safe key name
   */
  private restoreKeyFromSafeKey(safeKey: string): string {
    // This is a simplified restoration method, actual applications may need more complex mapping
    return safeKey.replace(/_/g, '_')
  }

  /**
   * Check if key exists
   */
  async hasItem(key: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(key)
      await fs.access(filePath)
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    try {
      const keys = await this.keys()
      const files = await fs.readdir(this.storageDir)
      const jsonFiles = files.filter((file) => file.endsWith('.enc')) // Only count obfuscated files

      let totalSize = 0
      for (const file of jsonFiles) {
        try {
          const filePath = path.join(this.storageDir, file)
          const stats = await fs.stat(filePath)
          totalSize += stats.size
        } catch (error) {
          // Ignore errors for individual files
        }
      }

      return {
        keys,
        fileCount: jsonFiles.length,
        totalSize,
        storageDir: this.storageDir
      }
    } catch (error) {
      console.error('Failed to get storage statistics:', error)
      return {
        keys: [],
        fileCount: 0,
        totalSize: 0,
        storageDir: this.storageDir
      }
    }
  }

  /**
   * Get file size
   */
  async getItemSize(key: string): Promise<number> {
    try {
      const filePath = this.getFilePath(key)
      const stats = await fs.stat(filePath)
      return stats.size
    } catch (error) {
      return 0
    }
  }

  /**
   * Get file modification time
   */
  async getItemModifiedTime(key: string): Promise<Date | null> {
    try {
      const filePath = this.getFilePath(key)
      const stats = await fs.stat(filePath)
      return stats.mtime
    } catch (error) {
      return null
    }
  }

  /**
   * Backup storage directory
   */
  async backup(backupDir: string): Promise<void> {
    try {
      await fs.mkdir(backupDir, { recursive: true })
      const files = await fs.readdir(this.storageDir)

      for (const file of files) {
        if (file.endsWith('.enc')) {
          // Only backup obfuscated files
          const sourcePath = path.join(this.storageDir, file)
          const destPath = path.join(backupDir, file)
          await fs.copyFile(sourcePath, destPath)
        }
      }

      console.log(`Storage directory backed up to: ${backupDir}`)
    } catch (error) {
      console.error('Failed to backup storage directory:', error)
      throw error
    }
  }

  /**
   * Restore from backup
   */
  async restore(backupDir: string): Promise<void> {
    try {
      const files = await fs.readdir(backupDir)

      for (const file of files) {
        if (file.endsWith('.enc')) {
          // Only restore obfuscated files from backup
          const sourcePath = path.join(backupDir, file)
          const destPath = path.join(this.storageDir, file)
          await fs.copyFile(sourcePath, destPath)
        }
      }

      console.log(`Storage directory restored from backup: ${backupDir}`)
    } catch (error) {
      console.error('Failed to restore from backup:', error)
      throw error
    }
  }

  /**
   * Clean up expired files
   */
  async cleanupExpired(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const files = await fs.readdir(this.storageDir)
      const now = Date.now()
      let cleanedCount = 0

      for (const file of files) {
        if (file.endsWith('.enc')) {
          // Only clean up obfuscated files
          const filePath = path.join(this.storageDir, file)
          const stats = await fs.stat(filePath)
          const age = now - stats.mtime.getTime()

          if (age > maxAge) {
            await fs.unlink(filePath)
            cleanedCount++
          }
        }
      }

      if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} expired files`)
      }
    } catch (error) {
      console.error('Failed to clean up expired files:', error)
    }
  }

  /**
   * Get storage directory path
   */
  getStorageDir(): string {
    return this.storageDir
  }
}

export default TempFileStorageProvider
export { TempFileStorageProvider }
export type { StorageStats }
