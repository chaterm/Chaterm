/**
 * User-configured proxy agent creation
 */

import { HttpsProxyAgent } from 'https-proxy-agent'
import { HttpProxyAgent } from 'http-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import type { Agent } from 'http'
import { ProxyConfig } from '@shared/Proxy'

/**
 * Map proxy type to its URL scheme
 */
function proxyScheme(type?: string): string {
  switch (type) {
    case 'HTTPS':
      return 'https'
    case 'SOCKS4':
      return 'socks4'
    case 'SOCKS5':
      return 'socks5'
    case 'HTTP':
    default:
      return 'http'
  }
}

/**
 * Build proxy URL from configuration
 */
export function buildProxyUrl(config: ProxyConfig): string {
  const { host, port, enableProxyIdentity, username, password } = config
  const auth = enableProxyIdentity && username && password ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : ''
  const scheme = proxyScheme(config.type)
  return `${scheme}://${auth}${host}:${port}`
}

/**
 * Create proxy agent from user configuration
 */
export function createProxyAgent(config?: ProxyConfig): Agent | undefined {
  if (!config) return undefined

  const { type } = config
  const url = buildProxyUrl(config)

  switch (type) {
    case 'HTTP':
      return new HttpProxyAgent(url)
    case 'HTTPS':
      return new HttpsProxyAgent(url)
    case 'SOCKS4':
    case 'SOCKS5':
      return new SocksProxyAgent(url) as unknown as Agent
    default:
      throw new Error(`Unsupported proxy type: ${type}`)
  }
}
