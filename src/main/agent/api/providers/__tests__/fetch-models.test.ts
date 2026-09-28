import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import { buildApiHandler } from '../../index'
import { bedrockModels } from '../../../shared/api'
import { closeAllDispatchers } from '../proxy/index'

type Reply = { status: number; body: unknown }

const openServers: Server[] = []

/** Local server that answers every request with a fixed reply and records the paths hit. */
async function startServer(reply: Reply) {
  const paths: string[] = []
  const server = createServer((request, response) => {
    paths.push(request.url ?? '')
    request.resume()
    request.on('end', () => {
      response.writeHead(reply.status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(reply.body))
    })
  })
  openServers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return { baseUrl: `http://127.0.0.1:${port}`, paths }
}

// 401 is not retried by the OpenAI/Anthropic SDKs, so error cases stay fast.
const UNAUTHORIZED: Reply = { status: 401, body: { error: { type: 'authentication_error', message: 'invalid key' } } }

const openAiList = (ids: string[]): Reply => ({
  status: 200,
  body: { object: 'list', data: ids.map((id) => ({ id, object: 'model', created: 0, owned_by: 'test' })) }
})

/** Replace the handler's SDK client so providers with a fixed endpoint can be tested offline. */
function stubClient(handler: unknown, client: unknown) {
  ;(handler as { client: unknown }).client = client
}

afterEach(async () => {
  await Promise.all(openServers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))))
  await closeAllDispatchers()
})

describe('fetchModels', () => {
  describe('anthropic', () => {
    it('lists model ids from /v1/models, sorted', async () => {
      const { baseUrl, paths } = await startServer({
        status: 200,
        body: {
          data: [
            { id: 'claude-sonnet-4', type: 'model', display_name: 'Sonnet', created_at: '2025-01-01T00:00:00Z' },
            { id: 'claude-haiku-4', type: 'model', display_name: 'Haiku', created_at: '2025-01-01T00:00:00Z' }
          ],
          has_more: false,
          first_id: 'claude-sonnet-4',
          last_id: 'claude-haiku-4'
        }
      })
      const handler = buildApiHandler({ apiProvider: 'anthropic', anthropicApiKey: 'k', anthropicBaseUrl: baseUrl })

      await expect(handler.fetchModels!()).resolves.toEqual({ models: ['claude-haiku-4', 'claude-sonnet-4'] })
      expect(paths[0]).toMatch(/^\/v1\/models/)
    })

    it('returns the error instead of throwing when the request fails', async () => {
      const { baseUrl } = await startServer(UNAUTHORIZED)
      const handler = buildApiHandler({ apiProvider: 'anthropic', anthropicApiKey: 'bad', anthropicBaseUrl: baseUrl })

      const result = await handler.fetchModels!()
      expect(result.models).toEqual([])
      expect(result.error).toMatch(/^Failed to fetch models: /)
    })
  })

  describe('openai', () => {
    it('lists model ids from /models, sorted', async () => {
      const { baseUrl, paths } = await startServer(openAiList(['gpt-5.5', 'gpt-5.4', 'glm-5.3-flash']))
      const handler = buildApiHandler({ apiProvider: 'openai', openAiApiKey: 'k', openAiBaseUrl: `${baseUrl}/v1` })

      await expect(handler.fetchModels!()).resolves.toEqual({ models: ['glm-5.3-flash', 'gpt-5.4', 'gpt-5.5'] })
      expect(paths[0]).toBe('/v1/models')
    })

    it('returns the error instead of throwing when the request fails', async () => {
      const { baseUrl } = await startServer(UNAUTHORIZED)
      const handler = buildApiHandler({ apiProvider: 'openai', openAiApiKey: 'bad', openAiBaseUrl: baseUrl })

      const result = await handler.fetchModels!()
      expect(result.models).toEqual([])
      expect(result.error).toMatch(/^Failed to fetch models: /)
    })
  })

  describe('litellm', () => {
    it('lists model ids from /models, sorted', async () => {
      const { baseUrl, paths } = await startServer(openAiList(['qwen', 'deepseek-v3']))
      // needProxy: false skips Electron system-proxy detection, which is unavailable under Node.
      const handler = buildApiHandler({ apiProvider: 'litellm', liteLlmApiKey: 'k', liteLlmBaseUrl: baseUrl, needProxy: false })

      await expect(handler.fetchModels!()).resolves.toEqual({ models: ['deepseek-v3', 'qwen'] })
      expect(paths[0]).toBe('/models')
    })

    it('returns the error instead of throwing when the request fails', async () => {
      const { baseUrl } = await startServer(UNAUTHORIZED)
      const handler = buildApiHandler({ apiProvider: 'litellm', liteLlmApiKey: 'bad', liteLlmBaseUrl: baseUrl, needProxy: false })

      const result = await handler.fetchModels!()
      expect(result.models).toEqual([])
      expect(result.error).toMatch(/^Failed to fetch models: /)
    })
  })

  describe('ollama', () => {
    it('lists model names from /api/tags, sorted', async () => {
      const { baseUrl, paths } = await startServer({
        status: 200,
        body: { models: [{ name: 'qwen2.5:7b' }, { name: 'llama3.1:8b' }] }
      })
      const handler = buildApiHandler({ apiProvider: 'ollama', ollamaBaseUrl: baseUrl })

      await expect(handler.fetchModels!()).resolves.toEqual({ models: ['llama3.1:8b', 'qwen2.5:7b'] })
      expect(paths[0]).toBe('/api/tags')
    })

    it('returns the error instead of throwing when the request fails', async () => {
      const { baseUrl } = await startServer({ status: 500, body: { error: 'boom' } })
      const handler = buildApiHandler({ apiProvider: 'ollama', ollamaBaseUrl: baseUrl })

      const result = await handler.fetchModels!()
      expect(result.models).toEqual([])
      expect(result.error).toMatch(/^Failed to fetch models: /)
    })
  })

  describe('deepseek', () => {
    // The DeepSeek endpoint is hardcoded, so the SDK client is stubbed.
    it('lists model ids, sorted', async () => {
      const handler = buildApiHandler({ apiProvider: 'deepseek', deepSeekApiKey: 'k' })
      stubClient(handler, { models: { list: async () => ({ data: [{ id: 'deepseek-reasoner' }, { id: 'deepseek-chat' }] }) } })

      await expect(handler.fetchModels!()).resolves.toEqual({ models: ['deepseek-chat', 'deepseek-reasoner'] })
    })

    it('stringifies non-Error rejections', async () => {
      const handler = buildApiHandler({ apiProvider: 'deepseek', deepSeekApiKey: 'k' })
      stubClient(handler, {
        models: {
          list: async () => {
            throw 'offline'
          }
        }
      })

      await expect(handler.fetchModels!()).resolves.toEqual({ models: [], error: 'Failed to fetch models: offline' })
    })
  })

  describe('bedrock', () => {
    it('returns the built-in model catalogue, sorted, without a network call', async () => {
      const handler = buildApiHandler({ apiProvider: 'bedrock', awsAccessKey: 'a', awsSecretKey: 's', awsRegion: 'us-east-1' })

      await expect(handler.fetchModels!()).resolves.toEqual({ models: Object.keys(bedrockModels).sort() })
    })
  })
})
