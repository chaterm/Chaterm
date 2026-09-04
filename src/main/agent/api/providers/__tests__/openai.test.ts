import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import { connect, type AddressInfo } from 'node:net'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildApiHandler } from '../../index'
import type { ApiStreamChunk } from '../../transform/stream'
import { closeAllDispatchers } from '../proxy/index'

type RecordedRequest = {
  url?: string
  headers: IncomingHttpHeaders
}

type RelayResponse = { status: number; body: string; contentType: string }

const CHAT_COMPLETION_BODY = {
  id: 'chatcmpl-openai-provider-test',
  object: 'chat.completion',
  model: 'relay-openai-model',
  choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }]
}

const openServers: Server[] = []

async function listen(server: Server): Promise<string> {
  openServers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo | null
  if (!address || typeof address === 'string') throw new Error('Test server did not expose a port')
  return `http://127.0.0.1:${address.port}`
}

/** Relay that records what actually reached the wire. */
async function startRelay(respond?: () => RelayResponse) {
  const requests: RecordedRequest[] = []
  const server = createServer((request, response) => {
    requests.push({ url: request.url, headers: request.headers })
    request.resume()
    request.on('end', () => {
      const custom = respond?.()
      response.writeHead(custom?.status ?? 200, { 'content-type': custom?.contentType ?? 'application/json' })
      response.end(custom?.body ?? JSON.stringify(CHAT_COMPLETION_BODY))
    })
  })
  return { baseUrl: await listen(server), requests }
}

/**
 * Forward proxy implementing only CONNECT tunnelling, which is what undici's
 * ProxyAgent uses. Counting tunnels makes a silently ignored dispatcher fail.
 */
async function startForwardProxy() {
  const tunnelled: string[] = []
  const server = createServer((_request, response) => {
    response.writeHead(405).end()
  })
  server.on('connect', (request, clientSocket, head) => {
    tunnelled.push(request.url ?? '')
    const [host, port] = (request.url ?? '').split(':')
    const upstream = connect(Number(port), host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head?.length) upstream.write(head)
      upstream.pipe(clientSocket)
      clientSocket.pipe(upstream)
    })
    const destroy = () => {
      upstream.destroy()
      clientSocket.destroy()
    }
    upstream.on('error', destroy)
    clientSocket.on('error', destroy)
  })
  const baseUrl = await listen(server)
  return { port: Number(new URL(baseUrl).port), tunnelled }
}

function sseBody(events: unknown[]): string {
  return `${events.map((event) => `data: ${JSON.stringify(event)}`).join('\n\n')}\n\ndata: [DONE]\n\n`
}

describe('OpenAI compatible provider', () => {
  afterEach(async () => {
    vi.unstubAllGlobals()
    await closeAllDispatchers()
    await Promise.all(
      openServers.splice(0).map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.closeAllConnections?.()
            server.close((error) => (error ? reject(error) : resolve()))
          })
      )
    )
  })

  it('validates without relying on the host global fetch', async () => {
    const { baseUrl, requests } = await startRelay()

    // The SDK captures globalThis.fetch at construction time, so a provider that
    // stopped passing undici's fetch would pick this up and fail.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('host global fetch should not be used')
      })
    )

    const handler = buildApiHandler({
      apiProvider: 'openai',
      needProxy: false,
      openAiBaseUrl: baseUrl,
      openAiApiKey: 'openai-provider-test-key',
      openAiModelId: 'relay-openai-model'
    })

    await expect(handler.validateApiKey()).resolves.toEqual({ isValid: true })
    expect(requests[0]?.url).toBe('/v1/chat/completions')
  })

  it('strips x-stainless-* telemetry headers while keeping auth and custom headers', async () => {
    const { baseUrl, requests } = await startRelay()

    const handler = buildApiHandler({
      apiProvider: 'openai',
      needProxy: false,
      openAiBaseUrl: baseUrl,
      openAiApiKey: 'openai-provider-test-key',
      openAiModelId: 'relay-openai-model',
      openAiHeaders: { 'X-Relay-Tenant': 'acme' }
    })

    await expect(handler.validateApiKey()).resolves.toEqual({ isValid: true })

    const headers = requests[0]?.headers ?? {}
    expect(Object.keys(headers).filter((name) => name.startsWith('x-stainless-'))).toEqual([])
    expect(headers.authorization).toBe('Bearer openai-provider-test-key')
    expect(headers['x-relay-tenant']).toBe('acme')
    // Stripping the UA makes undici substitute `user-agent: undici`, a worse WAF
    // signal than the SDK's own value, so it must stay on the wire.
    expect(headers['user-agent']).toMatch(/^OpenAI\/JS/)
  })

  it('sends requests through the configured proxy', async () => {
    const { baseUrl, requests } = await startRelay()
    const proxy = await startForwardProxy()

    const handler = buildApiHandler({
      apiProvider: 'openai',
      needProxy: true,
      proxyConfig: { type: 'HTTP', host: '127.0.0.1', port: proxy.port },
      openAiBaseUrl: baseUrl,
      openAiApiKey: 'openai-provider-test-key',
      openAiModelId: 'relay-openai-model'
    })

    await expect(handler.validateApiKey()).resolves.toEqual({ isValid: true })

    expect(proxy.tunnelled).toEqual([new URL(baseUrl).host])
    expect(requests).toHaveLength(1)
  })

  // SOCKS4 used to reach undici's ProxyAgent and fail with an opaque
  // "Invalid URL protocol", taking down handler construction.
  it('reports an actionable error for SOCKS4 proxies', () => {
    expect(() =>
      buildApiHandler({
        apiProvider: 'openai',
        needProxy: true,
        proxyConfig: { type: 'SOCKS4', host: '127.0.0.1', port: 1080 },
        openAiBaseUrl: 'http://127.0.0.1:1',
        openAiApiKey: 'openai-provider-test-key',
        openAiModelId: 'relay-openai-model'
      })
    ).toThrow(/SOCKS4 proxy is not supported/)
  })

  it('parses streamed chat completion chunks', async () => {
    const { baseUrl } = await startRelay(() => ({
      status: 200,
      contentType: 'text/event-stream',
      body: sseBody([
        { choices: [{ index: 0, delta: { content: 'Hel' } }] },
        { choices: [{ index: 0, delta: { content: 'lo' } }] },
        { choices: [{ index: 0, delta: { reasoning_content: 'because' } }] },
        { choices: [], usage: { prompt_tokens: 11, completion_tokens: 3 } }
      ])
    }))

    const handler = buildApiHandler({
      apiProvider: 'openai',
      needProxy: false,
      openAiBaseUrl: baseUrl,
      openAiApiKey: 'openai-provider-test-key',
      openAiModelId: 'relay-openai-model'
    })

    const chunks: ApiStreamChunk[] = []
    for await (const chunk of handler.createMessage('system', [{ role: 'user', content: 'hi' }])) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      { type: 'reasoning', reasoning: 'because' },
      { type: 'usage', inputTokens: 11, outputTokens: 3 }
    ])
  })

  it('uses the Azure client shape when an API version is configured', async () => {
    const { baseUrl, requests } = await startRelay()

    const handler = buildApiHandler({
      apiProvider: 'openai',
      needProxy: false,
      openAiBaseUrl: `${baseUrl}#`,
      openAiApiKey: 'azure-provider-test-key',
      openAiModelId: 'relay-azure-model',
      azureApiVersion: '2024-08-01-preview'
    })

    await expect(handler.validateApiKey()).resolves.toEqual({ isValid: true })

    // AzureOpenAI authenticates with api-key and pins the version via query string.
    expect(requests[0]?.url).toContain('api-version=2024-08-01-preview')
    expect(requests[0]?.headers['api-key']).toBe('azure-provider-test-key')
  })
})
