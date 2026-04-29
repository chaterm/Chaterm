import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }))
}))

const { PostgresDriverAdapter } = await import('../drivers/postgres-driver')

/**
 * Build a fake pg client whose `query` method returns pre-canned results
 * in order and records every invocation.
 */
function makeFakeClient(queue: Array<{ rows: unknown[]; fields?: Array<{ name: string }> } | Error>) {
  const calls: Array<{ sql: string; params?: unknown[] }> = []
  const client = {
    async connect() {
      // no-op for tests
    },
    async query(sql: string, params?: unknown[]) {
      calls.push({ sql, params })
      const next = queue.shift()
      if (!next) return { rows: [] }
      if (next instanceof Error) throw next
      return next
    },
    async end() {
      // no-op for tests
    }
  }
  return { client, calls }
}

describe('PostgresDriverAdapter - quoteIdentifier', () => {
  const a = new PostgresDriverAdapter()

  it('wraps identifier in double quotes', () => {
    expect(a.quoteIdentifier('users')).toBe('"users"')
  })

  it('escapes embedded double quotes by doubling them', () => {
    expect(a.quoteIdentifier('we"ird')).toBe('"we""ird"')
  })

  it('handles empty string safely', () => {
    expect(a.quoteIdentifier('')).toBe('""')
  })
})

describe('PostgresDriverAdapter - placeholder', () => {
  const a = new PostgresDriverAdapter()

  it('returns $1, $2, ... for 1-based index', () => {
    expect(a.placeholder(1)).toBe('$1')
    expect(a.placeholder(2)).toBe('$2')
    expect(a.placeholder(42)).toBe('$42')
  })
})

describe('PostgresDriverAdapter - detectPrimaryKey', () => {
  let adapter: InstanceType<typeof PostgresDriverAdapter>

  beforeEach(() => {
    adapter = new PostgresDriverAdapter()
  })

  it('returns ordered column names when PK exists', async () => {
    const { client, calls } = makeFakeClient([
      {
        rows: [
          { column_name: 'tenant_id', attnum: 1 },
          { column_name: 'id', attnum: 2 }
        ]
      }
    ])
    const pk = await adapter.detectPrimaryKey(client, 'ignored', 'orders')
    expect(pk).toEqual(['tenant_id', 'id'])
    expect(calls).toHaveLength(1)
    expect(calls[0].sql).toContain('pg_index')
    expect(calls[0].sql).toContain('indisprimary')
    expect(calls[0].params).toEqual(['orders'])
  })

  it('returns null when table has no primary key', async () => {
    const { client } = makeFakeClient([{ rows: [] }])
    const pk = await adapter.detectPrimaryKey(client, 'ignored', 'logs')
    expect(pk).toBeNull()
  })

  it('returns null when regclass cast fails (table does not exist)', async () => {
    const { client } = makeFakeClient([new Error('relation "nope" does not exist')])
    const pk = await adapter.detectPrimaryKey(client, 'ignored', 'nope')
    expect(pk).toBeNull()
  })
})

describe('PostgresDriverAdapter - transactions', () => {
  it('issues BEGIN / COMMIT / ROLLBACK as plain statements', async () => {
    const adapter = new PostgresDriverAdapter()
    const { client, calls } = makeFakeClient([{ rows: [] }, { rows: [] }, { rows: [] }])
    await adapter.beginTransaction(client)
    await adapter.commitTransaction(client)
    await adapter.rollbackTransaction(client)
    expect(calls.map((c) => c.sql)).toEqual(['BEGIN', 'COMMIT', 'ROLLBACK'])
  })
})
