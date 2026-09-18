import { readFileSync } from 'node:fs'
import { createServer as createHttpServer, get, type Agent } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { connect, type AddressInfo, type Server } from 'node:net'
import type { Duplex } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { fetch, type Dispatcher } from 'undici'
import { createProxyAgentFromString } from './system-proxy'
import { closeAllDispatchers, getSharedDispatcherFromString } from './undici-dispatcher'

vi.mock('electron', () => ({ session: { defaultSession: { resolveProxy: vi.fn() } } }))

vi.mock('@logging/index', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

vi.mock('undici', async (importOriginal) => {
  const undici = await importOriginal<typeof import('undici')>()
  const { readFileSync } = await import('node:fs')
  const ca = readFileSync(new URL('./__fixtures__/localhost-cert.pem', import.meta.url))
  return {
    ...undici,
    // Add only the fixture CA. Keep the real agent, URL mapping, TLS validation,
    // CONNECT implementation and fetch so the test exercises the wire protocol.
    ProxyAgent: class extends undici.ProxyAgent {
      constructor(options: string | import('undici').ProxyAgent.Options) {
        super({ ...(typeof options === 'string' ? { uri: options } : options), proxyTls: { ca } })
      }
    }
  }
})

const cert = readFileSync(new URL('./__fixtures__/localhost-cert.pem', import.meta.url))
const key = readFileSync(new URL('./__fixtures__/localhost-key.pem', import.meta.url))

describe('HTTPS system proxy end-to-end request', () => {
  const servers: Server[] = []
  const sockets = new Set<Duplex>()
  let agent: Agent | undefined
  let dispatcher: Dispatcher | undefined

  function trackSocket(socket: Duplex) {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  }

  async function listen(server: Server): Promise<number> {
    servers.push(server)
    server.on('connection', trackSocket)
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })
    return (server.address() as AddressInfo).port
  }

  afterEach(async () => {
    agent?.destroy()
    agent = undefined
    // Destroy pooled connections before closing listeners, including failed TLS
    // handshakes and upgraded CONNECT sockets that closeAllConnections misses.
    await dispatcher?.destroy()
    dispatcher = undefined
    for (const socket of sockets) socket.destroy()
    sockets.clear()
    await closeAllDispatchers()
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
  })

  it.each(['legacy agent', 'undici dispatcher'])('completes TLS, CONNECT and a response with the %s', async (client) => {
    const steps: string[] = []
    const requests: string[] = []
    const tunnels: string[] = []
    const origin = createHttpServer((request, response) => {
      steps.push('request')
      requests.push(`${request.method} ${request.url}`)
      response.writeHead(200, { 'content-type': 'text/plain', connection: 'close' })
      response.end('response through TLS proxy')
    })
    const originPort = await listen(origin)
    const proxy = createHttpsServer({ key, cert }, (_request, response) => {
      response.writeHead(405).end()
    })
    proxy.on('secureConnection', () => steps.push('TLS'))
    proxy.on('connect', (request, clientSocket, head) => {
      steps.push('CONNECT')
      tunnels.push(request.url ?? '')
      trackSocket(clientSocket)
      const upstream = connect(originPort, '127.0.0.1', () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length) upstream.write(head)
        upstream.pipe(clientSocket)
        clientSocket.pipe(upstream)
      })
      trackSocket(upstream)
      const destroy = () => {
        upstream.destroy()
        clientSocket.destroy()
      }
      upstream.on('error', destroy)
      clientSocket.on('error', destroy)
      upstream.on('close', () => clientSocket.destroy())
      clientSocket.on('close', () => upstream.destroy())
    })
    const proxyPort = await listen(proxy)
    const proxyString = `HTTPS 127.0.0.1:${proxyPort}`
    const url = `http://127.0.0.1:${originPort}/through-proxy?source=test`
    const signal = AbortSignal.timeout(2000)
    let result: { status: number | undefined; body: string }

    if (client === 'legacy agent') {
      agent = createProxyAgentFromString(proxyString)
      expect(agent).toBeInstanceOf(HttpsProxyAgent)
      // Trust this fixture only; certificate and hostname validation stay enabled.
      ;(agent as HttpsProxyAgent<string>).connectOpts.ca = cert
      result = await new Promise((resolve, reject) => {
        get(url, { agent, signal }, (response) => {
          let body = ''
          response.setEncoding('utf8')
          response.on('data', (chunk: string) => (body += chunk))
          response.on('end', () => resolve({ status: response.statusCode, body }))
          response.on('error', reject)
        }).on('error', reject)
      })
    } else {
      dispatcher = getSharedDispatcherFromString(proxyString)
      expect(dispatcher).toBeDefined()
      const response = await fetch(url, { dispatcher, signal })
      result = { status: response.status, body: await response.text() }
    }

    expect(result).toEqual({ status: 200, body: 'response through TLS proxy' })
    expect(steps).toEqual(['TLS', 'CONNECT', 'request'])
    expect(tunnels).toEqual([`127.0.0.1:${originPort}`])
    expect(requests).toEqual(['GET /through-proxy?source=test'])
  })
})
