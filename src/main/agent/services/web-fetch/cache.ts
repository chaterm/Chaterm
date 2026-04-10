// In-memory cache with TTL for web fetch results

export type CacheEntry<T> = {
  value: T
  expiresAt: number
  insertedAt: number
}

export const DEFAULT_CACHE_TTL_MS = 15 * 60_000 // 15 minutes
const DEFAULT_CACHE_MAX_ENTRIES = 100

export function normalizeCacheKey(value: string): string {
  return value.trim().toLowerCase()
}

export function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string): { value: T; cached: boolean } | null {
  const entry = cache.get(key)
  if (!entry) {
    return null
  }
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return { value: entry.value, cached: true }
}

export function writeCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number): void {
  if (ttlMs <= 0) {
    return
  }
  if (cache.size >= DEFAULT_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next()
    if (!oldest.done) {
      cache.delete(oldest.value)
    }
  }
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
    insertedAt: Date.now()
  })
}
