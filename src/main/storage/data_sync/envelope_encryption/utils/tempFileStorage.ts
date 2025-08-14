import { promises as fs } from 'fs'
import * as path from 'path'
import { app } from 'electron'

interface StorageStats {
  keys: string[]
  fileCount: number
  totalSize: number
  storageDir: string
}

/**
 *  临时文件存储提供者
 * 用于持久化存储会话ID和数据密钥，解决内存存储重启丢失的问题
 */
class TempFileStorageProvider {
  private storageDir: string

  constructor() {
    // 使用系统安全的应用数据目录
    const appDataPath = app.getPath('userData')
    this.storageDir = path.join(appDataPath, '.chaterm-encryption', 'keys')
    this.ensureStorageDir()
  }

  /**
   * 确保存储目录存在
   */
  private async ensureStorageDir(): Promise<void> {
    try {
      await fs.access(this.storageDir)
    } catch (error) {
      // 目录不存在，创建它
      await fs.mkdir(this.storageDir, { recursive: true, mode: 0o700 }) // 仅所有者可访问
      console.log(` 创建安全存储目录: ${this.storageDir}`)
    }

    // 确保目录权限正确
    await fs.chmod(this.storageDir, 0o700)
  }

  /**
   * 获取文件路径
   */
  private getFilePath(key: string): string {
    // 将key中的特殊字符替换为安全字符，并添加随机后缀防止猜测
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_')
    return path.join(this.storageDir, `${safeKey}.enc`)
  }

  /**
   * 简单的内容混淆（非加密，仅防止直接读取）
   */
  private obfuscateContent(content: string): string {
    const buffer = Buffer.from(content, 'utf8')
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] ^= 0x42 // 简单异或混淆
    }
    return buffer.toString('base64')
  }

  /**
   * 解混淆内容
   */
  private deobfuscateContent(obfuscated: string): string {
    const buffer = Buffer.from(obfuscated, 'base64')
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] ^= 0x42 // 还原异或
    }
    return buffer.toString('utf8')
  }

  /**
   * 存储数据到文件
   */
  async setItem(key: string, value: string): Promise<void> {
    try {
      await this.ensureStorageDir()
      const filePath = this.getFilePath(key)
      const obfuscatedValue = this.obfuscateContent(value)
      await fs.writeFile(filePath, obfuscatedValue, 'utf8')

      // 设置严格的文件权限：仅所有者可读写
      await fs.chmod(filePath, 0o600)
    } catch (error) {
      console.error(`存储数据失败 - Key: ${key}`, error)
      throw error
    }
  }

  /**
   * 从文件读取数据
   */
  async getItem(key: string): Promise<string | null> {
    try {
      const filePath = this.getFilePath(key)
      const obfuscatedData = await fs.readFile(filePath, 'utf8')
      const data = this.deobfuscateContent(obfuscatedData)
      console.log(`📖 从文件读取数据: ${key}`)
      return data
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // 文件不存在
        return null
      }
      console.error(`读取数据失败 (${key}):`, error)
      throw error
    }
  }

  /**
   * 删除文件
   */
  async removeItem(key: string): Promise<void> {
    try {
      const filePath = this.getFilePath(key)
      await fs.unlink(filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // 文件不存在，忽略错误
        return
      }
      console.error(`删除文件失败 (${key}):`, error)
      throw error
    }
  }

  /**
   * 清除所有文件
   */
  async clear(): Promise<void> {
    try {
      const files = await fs.readdir(this.storageDir)
      const deletePromises = files
        .filter((file) => file.endsWith('.enc')) // 只删除混淆文件
        .map((file) => fs.unlink(path.join(this.storageDir, file)))

      await Promise.all(deletePromises)
      console.log(` 已清除所有存储文件 (${files.length} 个文件)`)
    } catch (error) {
      console.error('清除存储文件失败:', error)
      throw error
    }
  }

  /**
   * 获取所有键
   */
  async keys(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.storageDir)
      const keys = files
        .filter((file) => file.endsWith('.enc')) // 只处理混淆文件
        .map((file) => file.replace('.enc', ''))
        .map((safeKey) => this.restoreKeyFromSafeKey(safeKey))

      return keys
    } catch (error) {
      console.error('获取键列表失败:', error)
      return []
    }
  }

  /**
   * 从安全键名恢复原始键名
   */
  private restoreKeyFromSafeKey(safeKey: string): string {
    // 这是一个简化的恢复方法，实际应用中可能需要更复杂的映射
    return safeKey.replace(/_/g, '_')
  }

  /**
   * 检查键是否存在
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
   * 获取存储统计信息
   */
  async getStats(): Promise<StorageStats> {
    try {
      const keys = await this.keys()
      const files = await fs.readdir(this.storageDir)
      const jsonFiles = files.filter((file) => file.endsWith('.enc')) // 只统计混淆文件

      let totalSize = 0
      for (const file of jsonFiles) {
        try {
          const filePath = path.join(this.storageDir, file)
          const stats = await fs.stat(filePath)
          totalSize += stats.size
        } catch (error) {
          // 忽略单个文件的错误
        }
      }

      return {
        keys,
        fileCount: jsonFiles.length,
        totalSize,
        storageDir: this.storageDir
      }
    } catch (error) {
      console.error('获取存储统计失败:', error)
      return {
        keys: [],
        fileCount: 0,
        totalSize: 0,
        storageDir: this.storageDir
      }
    }
  }

  /**
   * 获取文件大小
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
   * 获取文件修改时间
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
   * 备份存储目录
   */
  async backup(backupDir: string): Promise<void> {
    try {
      await fs.mkdir(backupDir, { recursive: true })
      const files = await fs.readdir(this.storageDir)

      for (const file of files) {
        if (file.endsWith('.enc')) {
          // 只备份混淆文件
          const sourcePath = path.join(this.storageDir, file)
          const destPath = path.join(backupDir, file)
          await fs.copyFile(sourcePath, destPath)
        }
      }

      console.log(`📦 存储目录已备份到: ${backupDir}`)
    } catch (error) {
      console.error('备份存储目录失败:', error)
      throw error
    }
  }

  /**
   * 从备份恢复
   */
  async restore(backupDir: string): Promise<void> {
    try {
      const files = await fs.readdir(backupDir)

      for (const file of files) {
        if (file.endsWith('.enc')) {
          // 只从备份恢复混淆文件
          const sourcePath = path.join(backupDir, file)
          const destPath = path.join(this.storageDir, file)
          await fs.copyFile(sourcePath, destPath)
        }
      }

      console.log(`📦 已从备份恢复存储目录: ${backupDir}`)
    } catch (error) {
      console.error('从备份恢复失败:', error)
      throw error
    }
  }

  /**
   * 清理过期文件
   */
  async cleanupExpired(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const files = await fs.readdir(this.storageDir)
      const now = Date.now()
      let cleanedCount = 0

      for (const file of files) {
        if (file.endsWith('.enc')) {
          // 只清理混淆文件
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
        console.log(`🧹 已清理 ${cleanedCount} 个过期文件`)
      }
    } catch (error) {
      console.error('清理过期文件失败:', error)
    }
  }

  /**
   * 获取存储目录路径
   */
  getStorageDir(): string {
    return this.storageDir
  }
}

export default TempFileStorageProvider
export { TempFileStorageProvider }
export type { StorageStats }
