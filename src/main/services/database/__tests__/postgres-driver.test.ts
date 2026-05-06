import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }))
}))

const { PostgresDriverAdapter, fetchPostgresTableDdl } = await import('../drivers/postgres-driver')
const { PG_TABLE_DEF_FUNCTION_SQL } = await import('../ddl/pg-table-ddl')

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
    expect(calls[0].params).toEqual(['"orders"'])
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

describe('fetchPostgresTableDdl', () => {
  it('PG_TABLE_DEF_FUNCTION_SQL pins type and functions to public and drops stale overloads', () => {
    // The helper bundle must schema-qualify the TYPE and CREATE FUNCTION
    // statements so a SET search_path to a user schema cannot leak them
    // into the wrong namespace. Additionally, stale overloads with
    // different signatures must be dropped to avoid the
    // "pg_get_coldef(..., sql_identifier) does not exist" resolution
    // failure when information_schema.column_name flows in.
    expect(PG_TABLE_DEF_FUNCTION_SQL).toContain('CREATE TYPE public.tabledefs')
    expect(PG_TABLE_DEF_FUNCTION_SQL).toContain('CREATE OR REPLACE FUNCTION public.pg_get_coldef(')
    expect(PG_TABLE_DEF_FUNCTION_SQL).toContain('CREATE OR REPLACE FUNCTION public.pg_get_tabledef(')
    expect(PG_TABLE_DEF_FUNCTION_SQL).toContain('DROP FUNCTION IF EXISTS public.pg_get_coldef(text, text, text, boolean)')
    expect(PG_TABLE_DEF_FUNCTION_SQL).toContain(
      'DROP FUNCTION IF EXISTS public.pg_get_coldef(character varying, character varying, character varying, boolean)'
    )
    expect(PG_TABLE_DEF_FUNCTION_SQL).toContain('DROP FUNCTION IF EXISTS public.pg_get_coldef(text, text, text)')
    expect(PG_TABLE_DEF_FUNCTION_SQL).toContain(
      'DROP FUNCTION IF EXISTS public.pg_get_coldef(character varying, character varying, character varying)'
    )
    expect(PG_TABLE_DEF_FUNCTION_SQL).toContain('DROP FUNCTION IF EXISTS public.pg_get_tabledef(text, text, boolean, tabledefs[])')
    expect(PG_TABLE_DEF_FUNCTION_SQL).toContain(
      'DROP FUNCTION IF EXISTS public.pg_get_tabledef(character varying, character varying, boolean, tabledefs[])'
    )
  })

  it('installs helper when missing, then SETs search_path and SELECTs', async () => {
    const { client, calls } = makeFakeClient([
      { rows: [{ has_type: false, has_fn: false }] }, // probe
      { rows: [] }, // DROP TYPE IF EXISTS public.tabledefs CASCADE
      { rows: [] }, // PG_TABLE_DEF_FUNCTION_SQL
      { rows: [] }, // SET search_path
      { rows: [{ ddl: 'CREATE TABLE "public"."orders" (...);' }] }
    ])
    const ddl = await fetchPostgresTableDdl(client, 'appdb', 'public', 'orders')
    expect(ddl).toBe('CREATE TABLE "public"."orders" (...);')
    expect(calls).toHaveLength(5)
    expect(calls[0].sql).toContain('to_regtype')
    expect(calls[1].sql).toBe('DROP TYPE IF EXISTS public.tabledefs CASCADE')
    expect(calls[2].sql).toBe(PG_TABLE_DEF_FUNCTION_SQL)
    expect(calls[3].sql).toContain('SET search_path')
    expect(calls[3].sql).toContain('"public"')
    expect(calls[4].sql).toContain('public.pg_get_tabledef')
    expect(calls[4].params).toEqual(['public', 'orders'])
  })

  it('skips install when helper already present (fast path)', async () => {
    const { client, calls } = makeFakeClient([
      { rows: [{ has_type: true, has_fn: true }] }, // probe: installed
      { rows: [] }, // SET
      { rows: [{ ddl: 'A' }] }, // SELECT
      { rows: [{ has_type: true, has_fn: true }] }, // probe: installed (second call)
      { rows: [] }, // SET
      { rows: [{ ddl: 'B' }] } // SELECT
    ])
    await fetchPostgresTableDdl(client, 'appdb', 'public', 't1')
    await fetchPostgresTableDdl(client, 'appdb', 'public', 't2')
    expect(calls).toHaveLength(6)
    expect(calls[0].sql).toContain('to_regtype')
    expect(calls[1].sql).toContain('SET search_path')
    expect(calls[3].sql).toContain('to_regtype')
    expect(calls[4].sql).toContain('SET search_path')
  })

  it('quotes mixed-case / reserved-word schema names in SET search_path', async () => {
    const { client, calls } = makeFakeClient([{ rows: [{ has_type: true, has_fn: true }] }, { rows: [] }, { rows: [{ ddl: '' }] }])
    await fetchPostgresTableDdl(client, 'appdb', 'User', 't')
    expect(calls[1].sql).toBe('SET search_path = "User", public')
  })

  it('throws code=permission when DROP TYPE is denied (SQLSTATE 42501)', async () => {
    const denied = Object.assign(new Error('permission denied for schema public'), { code: '42501' })
    const { client } = makeFakeClient([{ rows: [{ has_type: false, has_fn: false }] }, denied])
    await expect(fetchPostgresTableDdl(client, 'appdb', 'public', 'orders')).rejects.toMatchObject({
      code: 'permission'
    })
  })

  it('throws code=permission when CREATE FUNCTION bundle is denied', async () => {
    const denied = Object.assign(new Error('permission denied for database appdb'), { code: '42501' })
    const { client } = makeFakeClient([
      { rows: [{ has_type: false, has_fn: false }] }, // probe
      { rows: [] }, // DROP ok
      denied // CREATE denied
    ])
    await expect(fetchPostgresTableDdl(client, 'appdb', 'public', 'orders')).rejects.toMatchObject({
      code: 'permission'
    })
  })

  it('throws code=permission when message contains "must be owner"', async () => {
    const denied = new Error('ERROR: must be owner of type tabledefs')
    const { client } = makeFakeClient([{ rows: [{ has_type: false, has_fn: false }] }, { rows: [] }, denied])
    await expect(fetchPostgresTableDdl(client, 'appdb', 'public', 'orders')).rejects.toMatchObject({
      code: 'permission'
    })
  })

  it('rethrows non-permission install errors unchanged', async () => {
    const other = Object.assign(new Error('disk full'), { code: '53100' })
    const { client } = makeFakeClient([{ rows: [{ has_type: false, has_fn: false }] }, { rows: [] }, other])
    await expect(fetchPostgresTableDdl(client, 'appdb', 'public', 'orders')).rejects.toThrow('disk full')
  })

  it('rethrows unexpected SELECT errors unchanged', async () => {
    const other = Object.assign(new Error('syntax error at or near "FOO"'), { code: '42601' })
    const { client } = makeFakeClient([
      { rows: [{ has_type: true, has_fn: true }] }, // probe
      { rows: [] }, // SET
      other // SELECT fails
    ])
    await expect(fetchPostgresTableDdl(client, 'appdb', 'public', 't')).rejects.toThrow('syntax error')
  })
})
