import { HttpsProxyAgent } from 'https-proxy-agent'
import { HttpProxyAgent } from 'http-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import type { Agent } from 'http'
import { ProxyConfig } from '@shared/Proxy'
import net from 'net'
import tls from 'tls'
import { SocksClient } from 'socks'

// Create proxy
export function createProxyAgent(config?: ProxyConfig): Agent | undefined {
  if (!config) return undefined
  const { type, host, port, enableProxyIdentity, username, password } = config
  const auth = enableProxyIdentity && username && password ? `${username}:${password}@` : ''
  const url = `${type!.toLowerCase()}://${auth}${host}:${port}`

  switch (type) {
    case 'HTTP':
      return new HttpProxyAgent(url)
    case 'HTTPS':
      return new HttpsProxyAgent(url)
    case 'SOCKS4':
    case 'SOCKS5':
      return new SocksProxyAgent(url)
    default:
      throw new Error(`Unsupported proxy type: ${type}`)
  }
}

// Validate proxy connectivity
export async function checkProxyConnectivity(config?: ProxyConfig): Promise<void> {
  if (!config) return

  const { type, host, port } = config

  switch (type) {
    case 'HTTP':
      return await checkTcpConnection(host!, port!)

    case 'HTTPS':
      return await checkTlsConnection(host!, port!)

    case 'SOCKS4':
    case 'SOCKS5':
      return await checkSocksConnection(config!)

    default:
      throw new Error(`Unsupported proxy type: ${type}`)
  }
}

function checkTcpConnection(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, host)
    socket.setTimeout(3000)

    socket.once('connect', () => {
      socket.destroy()
      resolve()
    })
    socket.once('error', reject)
    socket.once('timeout', () => {
      socket.destroy()
      reject(new Error('Connection timed out'))
    })
  })
}

function checkTlsConnection(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(port, host, { rejectUnauthorized: false })
    socket.setTimeout(3000)

    socket.once('secureConnect', () => {
      socket.end()
      resolve()
    })
    socket.once('error', reject)
    socket.once('timeout', () => {
      socket.destroy()
      reject(new Error('TLS handshake timed out'))
    })
  })
}

async function checkSocksConnection(config: ProxyConfig): Promise<void> {
  const { host, port, type, enableProxyIdentity, username, password } = config

  const proxyType = type === 'SOCKS4' ? 4 : (5 as 4 | 5)

  const options = {
    proxy: {
      host: host!,
      port: port!,
      type: proxyType, // 4 or 5
      userId: enableProxyIdentity ? username : undefined,
      password: enableProxyIdentity ? password : undefined
    },
    command: 'connect' as const,
    destination: {
      host: 'example.com',
      port: 80
    },
    timeout: 3000
  }

  try {
    const info = await SocksClient.createConnection(options)
    info.socket.end()
  } catch (err) {
    throw new Error(`SOCKS proxy connection failed: ${(err as Error).message}`)
  }
}
