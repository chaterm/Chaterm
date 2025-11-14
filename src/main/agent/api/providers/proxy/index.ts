/**
 * Proxy module - Unified export entry point
 *
 * This module provides proxy agent creation and validation for both
 * system-detected proxies and user-configured proxies.
 */

// System proxy detection (Electron-based)
export { resolveSystemProxy, createProxyAgentFromString } from './system-proxy'

// User-configured proxy
export { createProxyAgent } from './user-proxy'

// Proxy connectivity validation
export { checkProxyConnectivity } from './connectivity'

// Shared types
export type { ProxyCache } from './types'
export { CACHE_TTL } from './types'
