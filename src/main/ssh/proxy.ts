import { SocksClient } from 'socks'
import * as net from 'net'
import * as tls from 'tls'

export interface ProxyConfig {
  type?: 'HTTP' | 'HTTPS' | 'SOCKS4' | 'SOCKS5'
  host?: string
  port?: number
  enableProxyIdentity?: boolean
  username?: string
  password?: string
  timeout?: number
}

export class ProxyConnectionError extends Error {
  constructor(
    message: string,
    public readonly proxyType?: string
  ) {
    super(message)
    this.name = 'ProxyConnectionError'
  }
}

export const createProxySocket = async (config: ProxyConfig, targetHost: string, targetPort: number): Promise<net.Socket | tls.TLSSocket> => {
  const { type, host, port, enableProxyIdentity, username, password, timeout = 30000 } = config

  if (!type || !host || !port) {
    throw new ProxyConnectionError('Proxy configuration incomplete: type, host, and port are required')
  }

  if (type === 'SOCKS4' && enableProxyIdentity && !username) {
    throw new ProxyConnectionError('SOCKS4 proxy requires username (userId) when authentication is enabled')
  }

  if (type === 'SOCKS5' && enableProxyIdentity && (!username || !password)) {
    throw new ProxyConnectionError('SOCKS5 proxy authentication enabled but username or password is missing')
  }

  if (type === 'SOCKS4' || type === 'SOCKS5') {
    return createSocksConnection(config, targetHost, targetPort, timeout)
  }

  if (type === 'HTTP' || type === 'HTTPS') {
    return createHttpConnection(config, targetHost, targetPort, timeout)
  }

  throw new ProxyConnectionError(`Unsupported proxy type: ${type}`, type)
}

const createSocksConnection = async (config: ProxyConfig, targetHost: string, targetPort: number, timeout: number): Promise<net.Socket> => {
  const { type, host, port, enableProxyIdentity, username, password } = config

  try {
    const proxyConfig: any = {
      host: host!,
      port: port!,
      type: type === 'SOCKS4' ? 4 : 5
    }

    // 修复认证信息配置
    if (enableProxyIdentity) {
      if (type === 'SOCKS4') {
        // SOCKS4 只支持 userId，不支持密码
        if (username) {
          proxyConfig.userId = username
        }
      } else if (type === 'SOCKS5') {
        // SOCKS5 支持用户名密码认证
        if (username && password) {
          proxyConfig.userId = username
          proxyConfig.password = password
        }
      }
    }

    console.log(`[DEBUG] Creating ${type} connection to ${targetHost}:${targetPort} via ${host}:${port}`)
    console.log(`[DEBUG] Proxy config:`, { ...proxyConfig, password: proxyConfig.password ? '[REDACTED]' : undefined })

    const connectionOptions = {
      proxy: proxyConfig,
      command: 'connect' as const,
      destination: {
        host: targetHost,
        port: targetPort
      },
      timeout
    }
    const { socket } = await SocksClient.createConnection(connectionOptions)

    console.log(`[DEBUG] ${type} connection established successfully`)
    return socket
  } catch (error) {
    console.error(`[ERROR] ${type} proxy connection failed:`, error)

    // 提供更详细的错误信息
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        throw new ProxyConnectionError(`${type} proxy connection timeout - check proxy server availability`, type)
      } else if (error.message.includes('authentication')) {
        throw new ProxyConnectionError(`${type} proxy authentication failed - check credentials`, type)
      } else if (error.message.includes('ECONNREFUSED')) {
        throw new ProxyConnectionError(`${type} proxy server refused connection - check host and port`, type)
      } else if (error.message.includes('ENOTFOUND')) {
        throw new ProxyConnectionError(`${type} proxy server not found - check hostname`, type)
      }
    }

    throw new ProxyConnectionError(`${type} proxy connection failed: ${error instanceof Error ? error.message : String(error)}`, type)
  }
}

const createHttpConnection = (config: ProxyConfig, targetHost: string, targetPort: number, timeout: number): Promise<net.Socket | tls.TLSSocket> => {
  const { type, host, port, enableProxyIdentity, username, password } = config

  return new Promise<net.Socket | tls.TLSSocket>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      proxySocket.destroy()
      reject(new ProxyConnectionError(`HTTP proxy connection timeout after ${timeout}ms`, type))
    }, timeout)

    const clearTimeoutAndResolve = (socket: net.Socket | tls.TLSSocket) => {
      clearTimeout(timeoutId)
      resolve(socket)
    }

    const clearTimeoutAndReject = (error: Error) => {
      clearTimeout(timeoutId)
      reject(new ProxyConnectionError(`HTTP proxy connection failed: ${error.message}`, type))
    }

    console.log(`[DEBUG] Creating HTTP connection to ${targetHost}:${targetPort} via ${host}:${port}`)

    const proxySocket = net.connect(port!, host!, () => {
      try {
        let headers = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n`
        headers += `Host: ${targetHost}:${targetPort}\r\n`

        // 添加认证
        if (enableProxyIdentity && username && password) {
          const auth = Buffer.from(`${username}:${password}`).toString('base64')
          headers += `Proxy-Authorization: Basic ${auth}\r\n`
        }

        headers += `User-Agent: SSH-Client/1.0\r\n`
        headers += `Proxy-Connection: Keep-Alive\r\n`
        headers += '\r\n'

        console.log(`[DEBUG] Sending CONNECT request`)
        proxySocket.write(headers)
      } catch (error) {
        clearTimeoutAndReject(error as Error)
      }
    })

    proxySocket.once('data', (chunk) => {
      try {
        const response = chunk.toString()
        console.log(`[DEBUG] Received proxy response: ${response.split('\r\n')[0]}`)

        if (/HTTP\/1\.[01] 200 Connection established/i.test(response)) {
          if (type === 'HTTPS') {
            const tlsSocket = tls.connect({
              socket: proxySocket,
              servername: targetHost,
              rejectUnauthorized: false
            })

            tlsSocket.on('secureConnect', () => {
              console.log(`[DEBUG] HTTPS tunnel established successfully`)
              clearTimeoutAndResolve(tlsSocket)
            })

            tlsSocket.on('error', (error) => {
              console.error(`[ERROR] TLS connection failed:`, error)
              clearTimeoutAndReject(error)
            })
          } else {
            console.log(`[DEBUG] HTTP tunnel established successfully`)
            clearTimeoutAndResolve(proxySocket)
          }
        } else {
          const statusMatch = response.match(/HTTP\/1\.[01] (\d+) (.+)/i)
          const statusCode = statusMatch ? statusMatch[1] : 'unknown'
          const statusText = statusMatch ? statusMatch[2] : 'unknown'

          proxySocket.destroy()
          clearTimeoutAndReject(new Error(`Proxy CONNECT failed with status ${statusCode}: ${statusText}`))
        }
      } catch (error) {
        clearTimeoutAndReject(error as Error)
      }
    })

    proxySocket.on('error', (error) => {
      console.error(`[ERROR] Proxy socket error:`, error)
      clearTimeoutAndReject(error)
    })

    proxySocket.on('close', () => {
      console.error(`[ERROR] Proxy socket closed unexpectedly`)
      clearTimeoutAndReject(new Error('Proxy socket closed unexpectedly'))
    })
  })
}
