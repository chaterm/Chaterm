import { beforeEach, describe, expect, it, vi } from 'vitest'

const { axiosPost, createProxyAgent, proxyAgent } = vi.hoisted(() => ({
  axiosPost: vi.fn(),
  createProxyAgent: vi.fn(),
  proxyAgent: { kind: 'mock-proxy-agent' }
}))

vi.mock('axios', () => ({
  default: { post: axiosPost }
}))

vi.mock('../../../agent/api/providers/proxy', () => ({
  createProxyAgent
}))

import { DedicatedApiReranker } from '../rerank'

describe('DedicatedApiReranker proxy wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createProxyAgent.mockReturnValue(proxyAgent)
    axiosPost.mockResolvedValue({ data: { results: [{ index: 0, score: 0.8 }] } })
  })

  it('reuses the configured application proxy for both HTTP and HTTPS requests', async () => {
    const proxyConfig = {
      type: 'SOCKS5' as const,
      host: '127.0.0.1',
      port: 1080,
      enableProxyIdentity: false
    }
    const reranker = new DedicatedApiReranker({
      baseUrl: 'https://rerank.example/v1',
      modelId: 'bge-reranker',
      needProxy: true,
      proxyConfig
    })

    await reranker.rerank('query', [{ index: 0, id: 'chunk', path: 'doc.md', startLine: 1, endLine: 1, text: 'content', retrievalScore: 0.01 }])

    expect(createProxyAgent).toHaveBeenCalledWith(proxyConfig)
    expect(axiosPost).toHaveBeenCalledWith(
      'https://rerank.example/v1/rerank',
      expect.any(Object),
      expect.objectContaining({
        proxy: false,
        httpAgent: proxyAgent,
        httpsAgent: proxyAgent,
        maxRedirects: 0
      })
    )
  })
})
