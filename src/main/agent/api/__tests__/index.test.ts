import { createServer, type Server } from 'node:http'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildApiHandler } from '../index'

describe('buildApiHandler OpenAI provider', () => {
  let server: Server | undefined

  afterEach(async () => {
    vi.unstubAllGlobals()
    if (!server) return
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => (error ? reject(error) : resolve()))
    })
    server = undefined
  })

  it('validates the existing OpenAI provider without relying on the host global fetch', async () => {
    let requestPath: string | undefined
    server = createServer((request, response) => {
      requestPath = request.url
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          id: 'chatcmpl-openai-provider-test',
          object: 'chat.completion',
          model: 'relay-openai-model',
          choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }]
        })
      )
    })
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Test server did not expose a port')

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('host global fetch should not be used')
      })
    )

    const handler = buildApiHandler({
      apiProvider: 'openai',
      needProxy: false,
      openAiBaseUrl: `http://127.0.0.1:${address.port}`,
      openAiApiKey: 'openai-provider-test-key',
      openAiModelId: 'relay-openai-model'
    })

    await expect(handler.validateApiKey()).resolves.toEqual({ isValid: true })
    expect(requestPath).toBe('/v1/chat/completions')
  })
})
