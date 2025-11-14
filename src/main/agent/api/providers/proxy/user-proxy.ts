/**
 * User-configured proxy agent creation
 */

import { HttpsProxyAgent } from 'https-proxy-agent'
import { HttpProxyAgent } from 'http-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import type { Agent } from 'http'
import { ProxyConfig } from '@shared/Proxy'

/**
 * Create proxy agent from user configuration
 * @param config - User proxy configuration
 * @returns HTTP/HTTPS/SOCKS proxy agent, or undefined if no config
 */
export function createProxyAgent(config?: ProxyConfig): Agent | undefined {
  if (!config) return undefined
  const { type, host, port, enableProxyIdentity, username, password } = config
  const auth = enableProxyIdentity && username && password ? `${username}:${password}@` : ''
  const url = `http://${auth}${host}:${port}`

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
