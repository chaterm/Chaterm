import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }))
}))

const { DbAiMetadataCache, normalizeTtlMs, TTL_DEFAULT_MS, TTL_MAX_MS } = await import('../metadata-cache')

describe('normalizeTtlMs', () => {
  it('returns default for undefined / non-finite', () => {
    expect(normalizeTtlMs(undefined)).toBe(TTL_DEFAULT_MS)
    expect(normalizeTtlMs(Number.NaN)).toBe(TTL_DEFAULT_MS)
    expect(normalizeTtlMs(Number.POSITIVE_INFINITY)).toBe(TTL_DEFAULT_MS)
  })

  it('clamps below 0 to 0', () => {
    expect(normalizeTtlMs(-1)).toBe(0)
  })

  it('clamps above 300_000 to 300_000', () => {
    expect(normalizeTtlMs(999_999)).toBe(TTL_MAX_MS)
  })

  it('passes through valid values', () => {
    expect(normalizeTtlMs(0)).toBe(0)
    expect(normalizeTtlMs(15_000)).toBe(15_000)
    expect(normalizeTtlMs(TTL_MAX_MS)).toBe(TTL_MAX_MS)
  })

  it('floors fractional values', () => {
    expect(normalizeTtlMs(10.9)).toBe(10)
  })
})

describe('DbAiMetadataCache - basic behaviour', () => {
  let cache: InstanceType<typeof DbAiMetadataCache>

  beforeEach(() => {
    cache = new DbAiMetadataCache(30_000)
  })

  it('fetcher is called once when result is fresh on second call', async () => {
    const slot = cache.getTables('appdb::public')
    let calls = 0
    const fetcher = vi.fn(async () => {
      calls++
      return ['t1', 't2']
    })
    const a = await cache.run(slot, 'appdb::public', false, 'db-ai.test', fetcher)
    const b = await cache.run(slot, 'appdb::public', false, 'db-ai.test', fetcher)
    expect(a).toEqual(['t1', 't2'])
    expect(b).toEqual(['t1', 't2'])
    expect(calls).toBe(1)
  })

  it('refresh: true forces a new fetch even when fresh', async () => {
    const slot = cache.getTables('appdb::public')
    let calls = 0
    const fetcher = vi.fn(async () => {
      calls++
      return [`call${calls}`]
    })
    await cache.run(slot, 'appdb::public', false, 'db-ai.test', fetcher)
    const second = await cache.run(slot, 'appdb::public', true, 'db-ai.test', fetcher)
    expect(second).toEqual(['call2'])
    expect(calls).toBe(2)
  })

  it('ttl=0 always misses', async () => {
    const zeroCache = new DbAiMetadataCache(0)
    const slot = zeroCache.getTables('appdb::public')
    let calls = 0
    const fetcher = async (): Promise<string[]> => {
      calls++
      return ['t']
    }
    await zeroCache.run(slot, 'appdb::public', false, 'db-ai.test', fetcher)
    await zeroCache.run(slot, 'appdb::public', false, 'db-ai.test', fetcher)
    expect(calls).toBe(2)
  })

  it('stale entries trigger refetch', async () => {
    const nowSpy = vi.spyOn(Date, 'now')
    const slot = cache.getTables('appdb::public')
    let calls = 0
    const fetcher = async (): Promise<string[]> => {
      calls++
      return [`fetch${calls}`]
    }
    nowSpy.mockReturnValue(1000)
    await cache.run(slot, 'appdb::public', false, 'db-ai.test', fetcher)
    // 30s later → still fresh
    nowSpy.mockReturnValue(1000 + 29_000)
    await cache.run(slot, 'appdb::public', false, 'db-ai.test', fetcher)
    expect(calls).toBe(1)
    // 31s later → stale, refetch
    nowSpy.mockReturnValue(1000 + 31_000)
    await cache.run(slot, 'appdb::public', false, 'db-ai.test', fetcher)
    expect(calls).toBe(2)
    nowSpy.mockRestore()
  })
})

describe('DbAiMetadataCache - concurrent fetch deduplication', () => {
  it('coalesces 10 concurrent misses into a single fetch', async () => {
    const cache = new DbAiMetadataCache(30_000)
    const slot = cache.getTables('appdb::public')
    let fetchCalls = 0
    const fetcher = async (): Promise<string[]> => {
      fetchCalls++
      // Yield to event loop so that subsequent callers enter while the
      // first fetch is in-flight.
      await new Promise((r) => setTimeout(r, 5))
      return ['t1', 't2']
    }
    const results = await Promise.all(Array.from({ length: 10 }, () => cache.run(slot, 'appdb::public', false, 'db-ai.test', fetcher)))
    expect(fetchCalls).toBe(1)
    for (const r of results) expect(r).toEqual(['t1', 't2'])
  })

  it('clears inflight after failure so the next call can retry', async () => {
    const cache = new DbAiMetadataCache(30_000)
    const slot = cache.getTables('appdb::public')
    let attempts = 0
    const fetcher = async (): Promise<string[]> => {
      attempts++
      if (attempts === 1) throw new Error('transient')
      return ['t']
    }
    await expect(cache.run(slot, 'appdb::public', false, 'db-ai.test', fetcher)).rejects.toThrow('transient')
    const ok = await cache.run(slot, 'appdb::public', false, 'db-ai.test', fetcher)
    expect(ok).toEqual(['t'])
    expect(attempts).toBe(2)
  })
})

describe('DbAiMetadataCache - invalidation', () => {
  it('invalidateAll drops every tier', async () => {
    const cache = new DbAiMetadataCache(30_000)
    const schemasSlot = cache.getSchemas('appdb')
    const tablesSlot = cache.getTables('appdb::public')
    const columnsSlot = cache.getColumns('appdb::public::orders')
    await cache.run(schemasSlot, 'appdb', false, 'db-ai.test', async () => ['public'])
    await cache.run(tablesSlot, 'appdb::public', false, 'db-ai.test', async () => ['orders'])
    await cache.run(columnsSlot, 'appdb::public::orders', false, 'db-ai.test', async () => [{ name: 'id' }])

    cache.invalidateAll()

    // After invalidate, a fresh fetch is required.
    let called = 0
    await cache.run(cache.getSchemas('appdb'), 'appdb', false, 'db-ai.test', async () => {
      called++
      return ['public']
    })
    expect(called).toBe(1)
  })
})

describe('DbAiMetadataCache - key builders', () => {
  it('tableKey distinguishes empty vs missing schema consistently', () => {
    const c = new DbAiMetadataCache(30_000)
    expect(c.tableKey('db')).toBe('db::')
    expect(c.tableKey('db', '')).toBe('db::')
    expect(c.tableKey('db', 'public')).toBe('db::public')
  })

  it('columnKey composes database::schema::table', () => {
    const c = new DbAiMetadataCache(30_000)
    expect(c.columnKey('db', 'orders')).toBe('db::::orders')
    expect(c.columnKey('db', 'orders', 'public')).toBe('db::public::orders')
  })

  it('schemaKey uses database name directly', () => {
    const c = new DbAiMetadataCache(30_000)
    expect(c.schemaKey('db')).toBe('db')
  })
})
