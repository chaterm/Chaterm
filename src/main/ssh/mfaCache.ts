import { app } from 'electron'
import path from 'path'
import fs from 'fs'

// MFA验证缓存接口
export interface MFACacheEntry {
  connectionId: string
  host: string
  port: number
  username: string
  mfaResponses: string[]
  timestamp: number
  expiresAt: number
  isVerified: boolean
  lastUsed: number
  failureCount: number
}

// MFA缓存管理器
export class MFACacheManager {
  private cacheFile: string
  private cache: Map<string, MFACacheEntry> = new Map()
  private readonly CACHE_DURATION = 2 * 60 * 1000 // 2分钟缓存时间

  constructor() {
    // 设置缓存文件路径
    const userDataPath = app.getPath('userData')
    this.cacheFile = path.join(userDataPath, 'mfa-cache.json')
    this.loadCache()
  }

  // 生成连接的唯一标识符
  private generateConnectionKey(host: string, port: number, username: string): string {
    return `${host}:${port}:${username}`
  }

  // 从文件加载缓存
  private loadCache(): void {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const data = fs.readFileSync(this.cacheFile, 'utf8')
        const cacheData = JSON.parse(data)

        // 检查缓存是否过期
        const now = Date.now()
        for (const [key, entry] of Object.entries(cacheData)) {
          const cacheEntry = entry as MFACacheEntry
          if (cacheEntry.expiresAt > now) {
            this.cache.set(key, cacheEntry)
          }
        }

        console.log(`[MFACache] 加载了 ${this.cache.size} 个有效的MFA缓存条目`)
      }
    } catch (error) {
      console.error('[MFACache] 加载缓存失败:', error)
    }
  }

  // 保存缓存到文件
  private saveCache(): void {
    try {
      const cacheData = Object.fromEntries(this.cache)
      fs.writeFileSync(this.cacheFile, JSON.stringify(cacheData, null, 2))
    } catch (error) {
      console.error('[MFACache] 保存缓存失败:', error)
    }
  }

  // 检查是否有有效的MFA缓存
  public hasValidMFACache(host: string, port: number, username: string): boolean {
    const key = this.generateConnectionKey(host, port, username)
    const entry = this.cache.get(key)

    if (!entry) {
      return false
    }

    // 检查是否过期
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      this.saveCache()
      return false
    }

    // 检查失败次数，如果失败次数过多则不使用缓存
    if (entry.failureCount >= 2) {
      console.log(`[MFACache] 缓存失败次数过多，不使用缓存: ${key}`)
      return false
    }

    return entry.isVerified
  }

  // 获取MFA响应缓存
  public getMFAResponses(host: string, port: number, username: string): string[] | null {
    const key = this.generateConnectionKey(host, port, username)
    const entry = this.cache.get(key)

    if (!entry || Date.now() > entry.expiresAt) {
      return null
    }

    return entry.mfaResponses
  }

  // 保存MFA验证结果
  public saveMFAResults(connectionId: string, host: string, port: number, username: string, mfaResponses: string[], isVerified: boolean): void {
    const key = this.generateConnectionKey(host, port, username)
    const now = Date.now()

    const entry: MFACacheEntry = {
      connectionId,
      host,
      port,
      username,
      mfaResponses,
      timestamp: now,
      expiresAt: now + this.CACHE_DURATION,
      isVerified,
      lastUsed: now,
      failureCount: 0
    }

    this.cache.set(key, entry)
    this.saveCache()

    console.log(`[MFACache] 保存MFA验证结果: ${key}, 验证状态: ${isVerified}`)
  }

  // 记录MFA验证失败
  public recordMFAFailure(host: string, port: number, username: string): void {
    const key = this.generateConnectionKey(host, port, username)
    const entry = this.cache.get(key)

    if (entry) {
      entry.failureCount++
      entry.lastUsed = Date.now()

      // 如果失败次数超过3次，清除缓存
      if (entry.failureCount >= 3) {
        console.log(`[MFACache] MFA验证失败次数过多，清除缓存: ${key}`)
        this.cache.delete(key)
      } else {
        console.log(`[MFACache] 记录MFA验证失败: ${key}, 失败次数: ${entry.failureCount}`)
        this.cache.set(key, entry)
      }

      this.saveCache()
    }
  }

  // 清除特定连接的MFA缓存
  public clearMFACache(host: string, port: number, username: string): void {
    const key = this.generateConnectionKey(host, port, username)
    this.cache.delete(key)
    this.saveCache()
    console.log(`[MFACache] 清除MFA缓存: ${key}`)
  }

  // 清除所有过期的缓存
  public clearExpiredCache(): void {
    const now = Date.now()
    let clearedCount = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
        clearedCount++
      }
    }

    if (clearedCount > 0) {
      this.saveCache()
      console.log(`[MFACache] 清除了 ${clearedCount} 个过期的MFA缓存条目`)
    }
  }

  // 获取缓存统计信息
  public getCacheStats(): { total: number; valid: number; expired: number } {
    const now = Date.now()
    let valid = 0
    let expired = 0

    for (const entry of this.cache.values()) {
      if (now > entry.expiresAt) {
        expired++
      } else {
        valid++
      }
    }

    return {
      total: this.cache.size,
      valid,
      expired
    }
  }
}

// 全局MFA缓存管理器实例
export const mfaCacheManager = new MFACacheManager()

// 定期清理过期缓存
setInterval(
  () => {
    mfaCacheManager.clearExpiredCache()
  },
  5 * 60 * 1000
) // 每5分钟清理一次
