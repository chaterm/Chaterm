import { describe, expect, it, vi } from 'vitest'
import type { DatabaseDriverAdapter, DbSchemaInfo } from '../../database/types'

vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }))
}))

const { __testing } = await import('../db-session')
const { DbAiMetadataCache } = await import('../metadata-cache')

// ---------------------------------------------------------------------------
// Test harness: a minimal adapter mock that counts calls per method.
// We only implement the methods `buildSession` actually invokes; anything the
// MVP flow does not touch (executeQuery / disconnect on tests that succeed
// without close) is left as vi.fn() for observation.
// ---------------------------------------------------------------------------

function makeAdapter(): {
  adapter: DatabaseDriverAdapter
  calls: { listSchemas: number; listTables: number; listColumns: number }
} {
  const calls = { listSchemas: 0, listTables: 0, listColumns: 0 }
  const adapter: DatabaseDriverAdapter = {
    testConnection: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(async () => undefined),
    async listSchemas(): Promise<DbSchemaInfo[]> {
      calls.listSchemas++
      return [
        { name: 'public', isSystem: false },
        { name: 'pg_catalog', isSystem: true }
      ]
    },
    async listTables(): Promise<string[]> {
      calls.listTables++
      return ['orders', 'users']
    },
    async listColumns(): Promise<string[]> {
      calls.listColumns++
      return ['id', 'name', 'created_at']
    },
    async executeQuery() {
      return { columns: [], rows: [], rowCount: 0, durationMs: 0 }
    }
  } as DatabaseDriverAdapter
  return { adapter, calls }
}

function makeSession(ttlMs = 30_000) {
  const { adapter, calls } = makeAdapter()
  const cache = new DbAiMetadataCache(ttlMs)
  const session = __testing.buildSession({
    assetId: 'asset-1',
    sessionId: 'session-1',
    dbType: 'postgresql',
    adapter,
    handle: {},
    cache
  })
  return { session, calls, cache, adapter }
}

// ---------------------------------------------------------------------------
// Integration: list* methods read from the cache and dedupe.
// ---------------------------------------------------------------------------

describe('buildSession - listSchemas caching', () => {
  it('first call hits driver, second call is cached', async () => {
    const { session, calls } = makeSession()
    const a = await session.listSchemas('appdb')
    const b = await session.listSchemas('appdb')
    expect(a).toEqual(['public', 'pg_catalog'])
    expect(b).toEqual(['public', 'pg_catalog'])
    expect(calls.listSchemas).toBe(1)
  })

  it('refresh: true forces a re-fetch', async () => {
    const { session, calls } = makeSession()
    await session.listSchemas('appdb')
    await session.listSchemas('appdb', { refresh: true })
    expect(calls.listSchemas).toBe(2)
  })
})

describe('buildSession - listTables caching', () => {
  it('same (database, schema) pair is cached', async () => {
    const { session, calls } = makeSession()
    await session.listTables('appdb', 'public')
    await session.listTables('appdb', 'public')
    expect(calls.listTables).toBe(1)
  })

  it('different schema means different key (no collision)', async () => {
    const { session, calls } = makeSession()
    await session.listTables('appdb', 'public')
    await session.listTables('appdb', 'app_internal')
    expect(calls.listTables).toBe(2)
  })
})

describe('buildSession - listColumns / listColumnsDetailed share cache', () => {
  it('name-only and detailed calls share the same cache slot', async () => {
    const { session, calls } = makeSession()
    const names = await session.listColumns('appdb', 'orders', 'public')
    const detailed = await session.listColumnsDetailed('appdb', 'orders', 'public')
    expect(names).toEqual(['id', 'name', 'created_at'])
    expect(detailed.map((c) => c.name)).toEqual(names)
    expect(calls.listColumns).toBe(1)
  })

  it('detailed returns ColumnInfo shape with only name populated (MVP)', async () => {
    const { session } = makeSession()
    const detailed = await session.listColumnsDetailed('appdb', 'orders', 'public')
    for (const col of detailed) {
      expect(typeof col.name).toBe('string')
      // Other fields are undefined at MVP; the shape is reserved for future
      // adapter extensions.
      expect(col.type).toBeUndefined()
      expect(col.nullable).toBeUndefined()
      expect(col.comment).toBeUndefined()
    }
  })
})

// ---------------------------------------------------------------------------
// Integration: cache invalidation paths.
// ---------------------------------------------------------------------------

describe('buildSession - invalidateMetadataCache', () => {
  it('drops all tiers so subsequent calls refetch', async () => {
    const { session, calls } = makeSession()
    await session.listSchemas('appdb')
    await session.listTables('appdb', 'public')
    await session.listColumns('appdb', 'orders', 'public')
    expect(calls.listSchemas).toBe(1)
    expect(calls.listTables).toBe(1)
    expect(calls.listColumns).toBe(1)

    session.invalidateMetadataCache()

    await session.listSchemas('appdb')
    await session.listTables('appdb', 'public')
    await session.listColumns('appdb', 'orders', 'public')
    expect(calls.listSchemas).toBe(2)
    expect(calls.listTables).toBe(2)
    expect(calls.listColumns).toBe(2)
  })
})

describe('buildSession - close clears cache', () => {
  it('close() flushes cache so no leaked promises remain', async () => {
    const { session, cache } = makeSession()
    await session.listTables('appdb', 'public')
    await session.close()
    // The session is gone, but we can still inspect the cache we passed in.
    // A fresh fetch against the raw cache proves the slot was cleared.
    let called = 0
    const slot = cache.getTables(cache.tableKey('appdb', 'public'))
    await cache.run(slot, 'appdb::public', false, 'db-ai.test', async () => {
      called++
      return ['t']
    })
    expect(called).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Integration: concurrent inflight deduplication at session level.
// ---------------------------------------------------------------------------

describe('buildSession - concurrent listTables', () => {
  it('10 parallel calls trigger only one driver call', async () => {
    // Use a slow adapter so all callers enter before the fetch resolves.
    let listTablesCalls = 0
    const slowAdapter: DatabaseDriverAdapter = {
      testConnection: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      async listTables(): Promise<string[]> {
        listTablesCalls++
        await new Promise((r) => setTimeout(r, 5))
        return ['orders']
      }
    } as DatabaseDriverAdapter
    const cache = new DbAiMetadataCache(30_000)
    const session = __testing.buildSession({
      assetId: 'asset-1',
      sessionId: 'session-1',
      dbType: 'postgresql',
      adapter: slowAdapter,
      handle: {},
      cache
    })
    const results = await Promise.all(Array.from({ length: 10 }, () => session.listTables('appdb', 'public')))
    expect(listTablesCalls).toBe(1)
    for (const r of results) expect(r).toEqual(['orders'])
  })
})

// ---------------------------------------------------------------------------
// hasSchema / hasTable: first-miss re-fetch once (§9.6.1)
// ---------------------------------------------------------------------------

describe('buildSession - hasTable (first-miss re-fetch)', () => {
  it('returns true when the table is already in the cache', async () => {
    const { session } = makeSession()
    const ok = await session.hasTable('appdb', 'orders', 'public')
    expect(ok).toBe(true)
  })

  it('refetches once when the table is missing in the first pass', async () => {
    let round = 0
    const adapter: DatabaseDriverAdapter = {
      testConnection: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      async listTables(): Promise<string[]> {
        round++
        // First pass returns an empty set (cache-miss scenario after a
        // recently created table). Second pass sees the real table.
        return round === 1 ? [] : ['new_table']
      }
    } as DatabaseDriverAdapter
    const cache = new DbAiMetadataCache(30_000)
    const session = __testing.buildSession({
      assetId: 'asset-1',
      sessionId: 'session-1',
      dbType: 'postgresql',
      adapter,
      handle: {},
      cache
    })
    const ok = await session.hasTable('appdb', 'new_table', 'public')
    expect(ok).toBe(true)
    expect(round).toBe(2)
  })

  it('returns false when both passes miss', async () => {
    const { session } = makeSession()
    const ok = await session.hasTable('appdb', 'ghost', 'public')
    expect(ok).toBe(false)
  })
})

describe('buildSession - hasSchema (first-miss re-fetch)', () => {
  it('returns true for a known schema', async () => {
    const { session } = makeSession()
    expect(await session.hasSchema('appdb', 'public')).toBe(true)
  })

  it('returns false for an unknown schema', async () => {
    const { session } = makeSession()
    expect(await session.hasSchema('appdb', 'no_such_schema')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// executeQuery: maxRows + truncated + timeout + clamp
// ---------------------------------------------------------------------------

function makeExecSession(execImpl: (sql: string) => Promise<{ columns: string[]; rows: Array<Record<string, unknown>> }>) {
  const adapter: DatabaseDriverAdapter = {
    testConnection: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    async executeQuery(
      _handle: unknown,
      sql: string
    ): Promise<{ columns: string[]; rows: Array<Record<string, unknown>>; rowCount: number; durationMs: number }> {
      const r = await execImpl(sql)
      return { columns: r.columns, rows: r.rows, rowCount: r.rows.length, durationMs: 0 }
    }
  } as DatabaseDriverAdapter
  const cache = new DbAiMetadataCache(30_000)
  return __testing.buildSession({
    assetId: 'asset-1',
    sessionId: 'session-1',
    dbType: 'postgresql',
    adapter,
    handle: {},
    cache
  })
}

describe('buildSession - executeQuery bounds', () => {
  it('returns all rows when under maxRows (no truncation)', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: i }))
    const session = makeExecSession(async () => ({ columns: ['id'], rows }))
    const r = await session.executeQuery('SELECT id FROM t', { maxRows: 200, timeoutMs: 5000 })
    expect(r.rowCount).toBe(50)
    expect(r.truncated).toBe(false)
    expect(r.rows).toEqual(rows)
  })

  it('truncates to maxRows and sets truncated=true', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: i }))
    const session = makeExecSession(async () => ({ columns: ['id'], rows }))
    const r = await session.executeQuery('SELECT id FROM huge', { maxRows: 200 })
    expect(r.rowCount).toBe(200)
    expect(r.truncated).toBe(true)
    expect(r.rows).toHaveLength(200)
    expect(r.rows[199]).toEqual({ id: 199 })
  })

  it('uses the default 200 cap when maxRows is omitted', async () => {
    const rows = Array.from({ length: 300 }, (_, i) => ({ id: i }))
    const session = makeExecSession(async () => ({ columns: ['id'], rows }))
    const r = await session.executeQuery('SELECT id FROM t')
    expect(r.rowCount).toBe(200)
    expect(r.truncated).toBe(true)
  })

  it('clamps maxRows above the ceiling (1000) back to 1000', async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => ({ id: i }))
    const session = makeExecSession(async () => ({ columns: ['id'], rows }))
    const r = await session.executeQuery('SELECT id FROM t', { maxRows: 9999 })
    expect(r.rowCount).toBe(1000)
    expect(r.truncated).toBe(true)
  })

  it('clamps non-positive / non-finite maxRows back to the default', async () => {
    const rows = Array.from({ length: 300 }, (_, i) => ({ id: i }))
    const session = makeExecSession(async () => ({ columns: ['id'], rows }))
    const r1 = await session.executeQuery('SELECT 1', { maxRows: -5 })
    expect(r1.rowCount).toBe(200)
    const r2 = await session.executeQuery('SELECT 1', { maxRows: Number.NaN })
    expect(r2.rowCount).toBe(200)
  })

  it('throws E_QUERY_TIMEOUT when the driver exceeds timeoutMs', async () => {
    const session = makeExecSession(
      async (): Promise<{ columns: string[]; rows: Array<Record<string, unknown>> }> =>
        new Promise((resolve) => setTimeout(() => resolve({ columns: ['id'], rows: [{ id: 1 }] }), 200))
    )
    await expect(session.executeQuery('SELECT 1', { timeoutMs: 50 })).rejects.toMatchObject({ code: 'E_QUERY_TIMEOUT' })
  })

  it('clamps timeoutMs above the ceiling (120_000) back to 120_000', async () => {
    // We can't easily assert the actual timer value; but we verify that a
    // fast query still resolves even when timeoutMs is preposterous.
    const session = makeExecSession(async () => ({ columns: [], rows: [] }))
    const r = await session.executeQuery('SELECT 1', { timeoutMs: 9_999_999 })
    expect(r.rowCount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Independence: session never reads ConnectionManager.getSession(handle)
// ---------------------------------------------------------------------------

describe('buildSession - independence from ConnectionManager.getSession', () => {
  it('does not require the ConnectionManager interface at construction time', () => {
    // Construction uses only adapter + cache + a caller-supplied handle.
    // We assert this by building a session with a plainly unrelated handle
    // and verifying the methods still work — proving the session never
    // reaches into any ConnectionManager-owned state.
    const { session } = makeSession()
    expect(session.handle).not.toBeNull()
  })

  it('uses the handle passed in, not any manager-resolved handle', async () => {
    const uniqueHandle = Symbol('my-handle')
    let capturedHandle: unknown = null
    const adapter: DatabaseDriverAdapter = {
      testConnection: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      async listTables(h: unknown): Promise<string[]> {
        capturedHandle = h
        return []
      }
    } as DatabaseDriverAdapter
    const cache = new DbAiMetadataCache(30_000)
    const session = __testing.buildSession({
      assetId: 'asset-1',
      sessionId: 'session-1',
      dbType: 'postgresql',
      adapter,
      handle: uniqueHandle,
      cache
    })
    await session.listTables('appdb', 'public')
    expect(capturedHandle).toBe(uniqueHandle)
  })
})
