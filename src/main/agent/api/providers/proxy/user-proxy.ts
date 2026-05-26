/**
 * User-configured proxy agent creation
 */

import { HttpsProxyAgent } from 'https-proxy-agent'
import { HttpProxyAgent } from 'http-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import type { Agent } from 'http'
import { ProxyConfig } from '@shared/Proxy'

/**
 * Build proxy URL from configuration
 */
export function buildProxyUrl(config: ProxyConfig): string {
  const { host, port, enableProxyIdentity, username, password } = config
  const auth = enableProxyIdentity && username && password ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : ''
  return `http://${auth}${host}:${port}`
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
