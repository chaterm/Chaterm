/**
 * System proxy detection using Electron's session API
 */

import { session } from 'electron'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import type { Agent } from 'http'
import type { ProxyCache } from './types'
import { CACHE_TTL } from './types'

// Proxy cache to reduce resolveProxy calls
let proxyCache: ProxyCache | null = null

/**
 * Resolve system proxy using Electron's session API
 * @param targetUrl - The URL to resolve proxy for
 * @returns Proxy string (e.g., "PROXY 127.0.0.1:7890") or undefined if direct connection
 */
export async function resolveSystemProxy(targetUrl: string): Promise<string | undefined> {
  try {
    // Check cache first
    if (proxyCache && proxyCache.url === targetUrl && Date.now() - proxyCache.time < CACHE_TTL) {
      return proxyCache.proxy === 'DIRECT' ? undefined : proxyCache.proxy
    }

    // Resolve proxy from system settings
    const proxyString = await session.defaultSession.resolveProxy(targetUrl)

    // Update cache
    proxyCache = { url: targetUrl, proxy: proxyString, time: Date.now() }

    // Handle various "no proxy" cases
    if (!proxyString || proxyString.trim() === '' || proxyString === 'DIRECT') {
      console.log('[Proxy] No system proxy detected, using direct connection')
      return undefined
    }

    console.log(`[Proxy] System proxy detected: ${proxyString}`)
    return proxyString
  } catch (error) {
    console.error('[Proxy] Failed to resolve system proxy:', error)
    return undefined
  }
}

/**
 * Create proxy agent from Electron's proxy string
 * @param proxyString - Proxy string from session.resolveProxy() (e.g., "PROXY 127.0.0.1:7890")
 * @returns HTTP/HTTPS/SOCKS proxy agent, or undefined if parsing fails
 */
export function createProxyAgentFromString(proxyString: string): Agent | undefined {
  try {
    // Parse proxy string format: "PROXY host:port" or "SOCKS5 host:port"
    const match = proxyString.match(/^(PROXY|SOCKS4|SOCKS5|HTTPS)\s+(.+):(\d+)/)
    if (!match) {
      console.error(`[Proxy] Invalid proxy string format: ${proxyString}`)
      return undefined
    }

    const [, type, host, port] = match
    console.log(`[Proxy] Creating ${type} agent: ${host}:${port}`)

    switch (type) {
      case 'PROXY':
      case 'HTTPS':
        return new HttpsProxyAgent(`http://${host}:${port}`) as Agent
      case 'SOCKS4':
        return new SocksProxyAgent(`socks4://${host}:${port}`) as unknown as Agent
      case 'SOCKS5':
        return new SocksProxyAgent(`socks5://${host}:${port}`) as unknown as Agent
      default:
        console.error(`[Proxy] Unsupported proxy type: ${type}`)
        return undefined
    }
  } catch (error) {
    console.error('[Proxy] Failed to create proxy agent:', error)
    return undefined
  }
}
