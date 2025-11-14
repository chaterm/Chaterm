/**
 * Shared types and constants for proxy module
 */

/**
 * Proxy cache interface to reduce resolveProxy calls
 */
export interface ProxyCache {
  url: string
  proxy: string
  time: number
}

/**
 * Cache TTL in milliseconds (5 seconds)
 */
export const CACHE_TTL = 5000
