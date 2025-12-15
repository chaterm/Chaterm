import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('axios', () => {
  const calls: any[] = []
  const client = {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() }
    },
    post: vi.fn(async (url: string, data?: any, config?: any) => {
      calls.push({ url, data, config })
      return { data: { ok: true } }
    }),
    get: vi.fn(async (url: string, config?: any) => ({ data: { ok: true } })),
    delete: vi.fn(async (url: string, config?: any) => ({ data: { ok: true } }))
  }
  return {
    default: { create: () => client },
    AxiosInstance: class {},
    AxiosRequestConfig: class {},
    AxiosResponse: class {},
    __client: client,
    __calls: calls
  }
})

vi.mock('../../envelope_encryption/services/auth', () => {
  const status = { hasToken: true, isValid: true }
  let token = 'TKN'
  return {
    chatermAuthAdapter: {
      getAuthStatus: () => status,
      getAuthToken: async () => token,
      getCurrentUserId: async () => 'u1',
      clearAuthInfo: vi.fn()
    }
  }
})

import { ApiClient } from '../ApiClient'
import * as axiosModule from 'axios'

describe('ApiClient authentication and compression', () => {
  beforeEach(() => {
    ;(axiosModule as any).__client.post.mockClear()
    ;(axiosModule as any).__calls.length = 0
  })

  it('should return isAuthenticated based on adapter status', async () => {
    const api = new ApiClient()
    const ok = await api.isAuthenticated()
    expect(ok).toBe(true)
  })

  it('should use gzip for large request bodies when compression is enabled', async () => {
    const api = new ApiClient()
    const big = Array.from({ length: 2000 }).map((i, idx) => ({ id: idx, x: 'x'.repeat(10) }))
    const res = await api.incrementalSync('t_assets_sync', big as any)
    expect(res).toEqual({ ok: true })
    const call = (axiosModule as any).__calls.find((c: any) => c.url.includes('/sync/incremental-sync'))
    expect(Buffer.isBuffer(call.data)).toBe(true)
    expect(call.config?.headers?.['Content-Encoding']).toBe('gzip')
  })
})
