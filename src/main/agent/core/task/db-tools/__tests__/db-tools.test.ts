import { describe, expect, it, vi } from 'vitest'
import type { DbAiActiveSession, BoundedQueryResult, ColumnInfo } from '../../../../../services/database-ai/types'

vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }))
}))

const { runListDatabases } = await import('../list-databases')
const { runListSchemas } = await import('../list-schemas')
const { runListTables } = await import('../list-tables')
const { runDescribeTable } = await import('../describe-table')
const { runInspectIndexes, __testing: inspectTesting } = await import('../inspect-indexes')
const { runSampleRows, __testing: sampleTesting } = await import('../sample-rows')
const { runCountRows, __testing: countTesting } = await import('../count-rows')
const { runExplainPlan } = await import('../explain-plan')
const { runExecuteReadonlyQuery } = await import('../execute-readonly-query')
const { runExecuteWriteQuery } = await import('../execute-write-query')
const { runSuggestIndexes, __testing: suggestTesting } = await import('../suggest-indexes')

// ---------------------------------------------------------------------------
// Session mock factory. Each test builds a session with only the methods it
// needs; defaults are permissive ("this table exists", "columns are id,name").
// ---------------------------------------------------------------------------

interface MockOverrides {
  dbType?: 'mysql' | 'postgresql'
  databaseName?: string
  databases?: string[]
  schemas?: string[]
  tables?: string[]
  columns?: ColumnInfo[]
  ddl?: string
  execute?: (sql: string, opts?: { params?: unknown[] }) => Promise<BoundedQueryResult>
  hasTableImpl?: (db: string, table: string, schema?: string) => Promise<boolean>
  hasSchemaImpl?: (db: string, schema: string) => Promise<boolean>
}

function makeSession(overrides: MockOverrides = {}): DbAiActiveSession {
  const dbType = overrides.dbType ?? 'postgresql'
  const schemas = overrides.schemas ?? (dbType === 'postgresql' ? ['public'] : [])
  const tables = overrides.tables ?? ['orders', 'users']
  const columns = overrides.columns ?? [{ name: 'id' }, { name: 'name' }, { name: 'user_id' }, { name: 'created_at' }]
  const ddl = overrides.ddl
  return {
    assetId: 'a-1',
    sessionId: 's-1',
    dbType,
    handle: {},
    databaseName: overrides.databaseName,
    async listDatabases() {
      return overrides.databases ?? ['appdb']
    },
    async listSchemas() {
      return schemas
    },
    async listTables() {
      return tables
    },
    async listColumns() {
      return columns.map((c) => c.name)
    },
    async listColumnsDetailed() {
      return columns
    },
    async hasSchema(_db: string, schema: string) {
      if (overrides.hasSchemaImpl) return overrides.hasSchemaImpl(_db, schema)
      return schemas.includes(schema)
    },
    async hasTable(_db: string, table: string, schema?: string) {
      if (overrides.hasTableImpl) return overrides.hasTableImpl(_db, table, schema)
      return tables.includes(table)
    },
    async getTableDdl() {
      if (ddl) return ddl
      throw new Error('no ddl mocked')
    },
    async executeQuery(sql: string, opts?: { params?: unknown[] }) {
      if (overrides.execute) return overrides.execute(sql, opts)
      return { columns: [], rows: [], rowCount: 0, truncated: false, durationMs: 0 }
    },
    invalidateMetadataCache() {
      /* mock: no-op */
    },
    isClosed: false,
    async close() {
      /* mock: no-op */
    }
  }
}

// ---------------------------------------------------------------------------
// list_databases
// ---------------------------------------------------------------------------

describe('runListDatabases', () => {
  it('returns the list from the session', async () => {
    const session = makeSession({ databases: ['appdb', 'analytics'] })
    const r = await runListDatabases(session)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.databases).toEqual(['appdb', 'analytics'])
  })

  it('surfaces an unexpected error as tool error', async () => {
    const session = makeSession()
    ;(session as { listDatabases: () => Promise<unknown> }).listDatabases = async () => {
      throw Object.assign(new Error('fail'), { code: 'ECONNREFUSED' })
    }
    const r = await runListDatabases(session)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_UNEXPECTED')
  })
})

// ---------------------------------------------------------------------------
// list_schemas
// ---------------------------------------------------------------------------

describe('runListSchemas', () => {
  it('rejects when neither input.database nor session.databaseName is set', async () => {
    const session = makeSession()
    const r = await runListSchemas(session, {})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_MISSING_PARAM')
  })

  it('falls back to session.databaseName when input.database omitted', async () => {
    const session = makeSession({ databaseName: 'appdb', schemas: ['public', 'app'] })
    const r = await runListSchemas(session, {})
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.schemas).toEqual(['public', 'app'])
  })

  it('returns an empty list with a note on MySQL', async () => {
    const session = makeSession({ dbType: 'mysql', schemas: [] })
    const r = await runListSchemas(session, { database: 'appdb' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.schemas).toEqual([])
      expect(r.data.note).toMatch(/mysql/i)
    }
  })
})

// ---------------------------------------------------------------------------
// list_tables
// ---------------------------------------------------------------------------

describe('runListTables', () => {
  it('returns tables for a valid scope', async () => {
    const session = makeSession({ tables: ['orders', 'users'] })
    const r = await runListTables(session, { database: 'appdb', schema: 'public' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.tables).toEqual(['orders', 'users'])
  })

  it('rejects unknown schema on PG', async () => {
    const session = makeSession({ schemas: ['public'] })
    const r = await runListTables(session, { database: 'appdb', schema: 'ghost' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_UNKNOWN_SCHEMA')
  })

  it('accepts omitted schema when engine has no schema layer (MySQL)', async () => {
    const session = makeSession({ dbType: 'mysql', schemas: [], tables: ['t1'] })
    const r = await runListTables(session, { database: 'appdb' })
    expect(r.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// describe_table
// ---------------------------------------------------------------------------

describe('runDescribeTable', () => {
  it('returns columns + DDL when both succeed', async () => {
    const session = makeSession({
      ddl: 'CREATE TABLE orders (id INT PRIMARY KEY)',
      columns: [{ name: 'id' }, { name: 'user_id' }]
    })
    const r = await runDescribeTable(session, { database: 'appdb', schema: 'public', table: 'orders' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.ddl).toMatch(/CREATE TABLE/)
      expect(r.data.columns.map((c) => c.name)).toEqual(['id', 'user_id'])
    }
  })

  it('still returns columns when DDL fetch fails', async () => {
    const session = makeSession()
    // ddl getter throws (default mock)
    const r = await runDescribeTable(session, { database: 'appdb', schema: 'public', table: 'orders' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.ddl).toBeUndefined()
  })

  it('returns E_UNKNOWN_TABLE when the table is unknown', async () => {
    const session = makeSession({ tables: ['orders'] })
    const r = await runDescribeTable(session, { database: 'appdb', schema: 'public', table: 'ghost' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_UNKNOWN_TABLE')
  })

  it('returns E_MISSING_PARAM when database is missing', async () => {
    const session = makeSession()
    const r = await runDescribeTable(session, { database: '', schema: 'public', table: 'orders' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_MISSING_PARAM')
  })
})

// ---------------------------------------------------------------------------
// inspect_indexes
// ---------------------------------------------------------------------------

describe('runInspectIndexes', () => {
  it('aggregates MySQL index rows into per-index column arrays', async () => {
    const session = makeSession({
      dbType: 'mysql',
      schemas: [],
      async execute() {
        return {
          columns: ['name', 'column_name', 'seq', 'non_unique', 'method'],
          rows: [
            { name: 'PRIMARY', column_name: 'id', seq: 1, non_unique: 0, method: 'BTREE' },
            { name: 'idx_user', column_name: 'user_id', seq: 1, non_unique: 1, method: 'BTREE' },
            { name: 'idx_user', column_name: 'created_at', seq: 2, non_unique: 1, method: 'BTREE' }
          ],
          rowCount: 3,
          truncated: false,
          durationMs: 0
        }
      }
    } as MockOverrides)
    const r = await runInspectIndexes(session, { database: 'appdb', table: 'orders' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.indexes).toHaveLength(2)
      const pk = r.data.indexes.find((i) => i.name === 'PRIMARY')
      expect(pk?.primary).toBe(true)
      expect(pk?.unique).toBe(true)
      const idx = r.data.indexes.find((i) => i.name === 'idx_user')
      expect(idx?.columns).toEqual(['user_id', 'created_at'])
      expect(idx?.unique).toBe(false)
    }
  })

  it('aggregator handles PG uniqueness flags', () => {
    const rows = [{ name: 'orders_pkey', column_name: 'id', seq: 1, is_unique: true, is_primary: true, method: 'btree' }]
    const out = inspectTesting.aggregateRows(rows, 'postgresql')
    expect(out).toEqual([{ name: 'orders_pkey', columns: ['id'], unique: true, primary: true, method: 'btree' }])
  })
})

// ---------------------------------------------------------------------------
// sample_rows
// ---------------------------------------------------------------------------

describe('runSampleRows', () => {
  it('clampLimit enforces [1, 100]', () => {
    expect(sampleTesting.clampLimit(0)).toBe(sampleTesting.MIN_LIMIT)
    expect(sampleTesting.clampLimit(-5)).toBe(sampleTesting.MIN_LIMIT)
    expect(sampleTesting.clampLimit(9999)).toBe(sampleTesting.MAX_LIMIT)
    expect(sampleTesting.clampLimit(undefined)).toBe(sampleTesting.DEFAULT_LIMIT)
    expect(sampleTesting.clampLimit(Number.NaN)).toBe(sampleTesting.DEFAULT_LIMIT)
    expect(sampleTesting.clampLimit(12.9)).toBe(12)
  })

  it('inlines LIMIT as a literal into SELECT * FROM quoted', async () => {
    let capturedSql = ''
    const session = makeSession({
      async execute(sql) {
        capturedSql = sql
        return { columns: ['id'], rows: [{ id: 1 }], rowCount: 1, truncated: false, durationMs: 0 }
      }
    } as MockOverrides)
    const r = await runSampleRows(session, { database: 'appdb', schema: 'public', table: 'orders', limit: 5 })
    expect(r.ok).toBe(true)
    expect(capturedSql).toContain('SELECT * FROM')
    expect(capturedSql).toMatch(/LIMIT 5$/)
    // PG quoting of schema.table.
    expect(capturedSql).toContain('"public"."orders"')
  })

  it('uses default limit 10 when omitted', async () => {
    let captured = ''
    const session = makeSession({
      async execute(sql) {
        captured = sql
        return { columns: [], rows: [], rowCount: 0, truncated: false, durationMs: 0 }
      }
    } as MockOverrides)
    await runSampleRows(session, { database: 'appdb', schema: 'public', table: 'orders' })
    expect(captured).toMatch(/LIMIT 10$/)
  })

  it('clamps limit above 100 back to 100', async () => {
    let captured = ''
    const session = makeSession({
      async execute(sql) {
        captured = sql
        return { columns: [], rows: [], rowCount: 0, truncated: false, durationMs: 0 }
      }
    } as MockOverrides)
    await runSampleRows(session, { database: 'appdb', schema: 'public', table: 'orders', limit: 9999 })
    expect(captured).toMatch(/LIMIT 100$/)
  })

  it('MySQL uses database.table qualification with backticks', async () => {
    let captured = ''
    const session = makeSession({
      dbType: 'mysql',
      schemas: [],
      async execute(sql) {
        captured = sql
        return { columns: [], rows: [], rowCount: 0, truncated: false, durationMs: 0 }
      }
    } as MockOverrides)
    await runSampleRows(session, { database: 'appdb', table: 'orders', limit: 3 })
    expect(captured).toContain('`appdb`.`orders`')
    expect(captured).toMatch(/LIMIT 3$/)
  })
})

// ---------------------------------------------------------------------------
// count_rows
// ---------------------------------------------------------------------------

describe('runCountRows', () => {
  it('uses information_schema for approximate MySQL counts', async () => {
    let capturedSql = ''
    const session = makeSession({
      dbType: 'mysql',
      schemas: [],
      async execute(sql) {
        capturedSql = sql
        return { columns: ['n'], rows: [{ n: 1234 }], rowCount: 1, truncated: false, durationMs: 0 }
      }
    } as MockOverrides)
    const r = await runCountRows(session, { database: 'appdb', table: 'orders' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.count).toBe(1234)
      expect(r.data.approximate).toBe(true)
    }
    expect(capturedSql).toContain('information_schema.tables')
  })

  it('uses pg_class.reltuples for approximate PG counts', async () => {
    let capturedSql = ''
    const session = makeSession({
      async execute(sql) {
        capturedSql = sql
        return { columns: ['n'], rows: [{ n: 9001 }], rowCount: 1, truncated: false, durationMs: 0 }
      }
    } as MockOverrides)
    const r = await runCountRows(session, { database: 'appdb', schema: 'public', table: 'orders' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.count).toBe(9001)
    expect(capturedSql).toContain('pg_class')
  })

  it('runs exact COUNT(*) when exact=true', async () => {
    let capturedSql = ''
    const session = makeSession({
      async execute(sql) {
        capturedSql = sql
        return { columns: ['n'], rows: [{ n: 10 }], rowCount: 1, truncated: false, durationMs: 0 }
      }
    } as MockOverrides)
    const r = await runCountRows(session, { database: 'appdb', schema: 'public', table: 'orders', exact: true })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.approximate).toBe(false)
      expect(r.data.count).toBe(10)
    }
    expect(capturedSql).toContain('COUNT(*)')
  })

  it('toNonNegativeInt coerces numeric strings and caps negatives at 0', () => {
    expect(countTesting.toNonNegativeInt('42')).toBe(42)
    expect(countTesting.toNonNegativeInt(-7)).toBe(0)
    expect(countTesting.toNonNegativeInt('garbage')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// explain_plan
// ---------------------------------------------------------------------------

describe('runExplainPlan', () => {
  it('rejects DML via sql-readonly-guard', async () => {
    const session = makeSession()
    const r = await runExplainPlan(session, { sql: 'UPDATE t SET a=1' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_SQL_NOT_READONLY')
  })

  it('rejects EXPLAIN ANALYZE even when wrapped by caller', async () => {
    const session = makeSession()
    const r = await runExplainPlan(session, { sql: 'EXPLAIN ANALYZE SELECT * FROM t' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_EXPLAIN_ANALYZE')
  })

  it('accepts a plain SELECT and prefixes EXPLAIN FORMAT=JSON on MySQL', async () => {
    let captured = ''
    const session = makeSession({
      dbType: 'mysql',
      schemas: [],
      async execute(sql) {
        captured = sql
        return { columns: ['plan'], rows: [{ plan: '{"x":1}' }], rowCount: 1, truncated: false, durationMs: 0 }
      }
    } as MockOverrides)
    const r = await runExplainPlan(session, { sql: 'SELECT * FROM t' })
    expect(r.ok).toBe(true)
    expect(captured).toMatch(/^EXPLAIN FORMAT=JSON /)
  })

  it('accepts a plain SELECT and prefixes EXPLAIN (FORMAT JSON) on PG', async () => {
    let captured = ''
    const session = makeSession({
      async execute(sql) {
        captured = sql
        return { columns: ['QUERY PLAN'], rows: [{ 'QUERY PLAN': [{ Plan: {} }] }], rowCount: 1, truncated: false, durationMs: 0 }
      }
    } as MockOverrides)
    const r = await runExplainPlan(session, { sql: 'SELECT * FROM t' })
    expect(r.ok).toBe(true)
    expect(captured).toMatch(/^EXPLAIN \(FORMAT JSON\) /)
  })

  it('rejects SQL exceeding the 50KB cap', async () => {
    const session = makeSession()
    const big = 'SELECT 1 -- ' + 'x'.repeat(51 * 1024)
    const r = await runExplainPlan(session, { sql: big })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_SQL_TOO_LARGE')
  })
})

// ---------------------------------------------------------------------------
// execute_readonly_query
// ---------------------------------------------------------------------------

describe('runExecuteReadonlyQuery', () => {
  it('executes a plain SELECT and returns rows', async () => {
    let captured = ''
    const session = makeSession({
      async execute(sql) {
        captured = sql
        return { columns: ['id'], rows: [{ id: 1 }], rowCount: 1, truncated: false, durationMs: 12 }
      }
    } as MockOverrides)
    const r = await runExecuteReadonlyQuery(session, { sql: 'SELECT id FROM users LIMIT 1' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.executedSql).toBe('SELECT id FROM users LIMIT 1')
      expect(r.data.rowCount).toBe(1)
      expect(r.data.rows).toEqual([{ id: 1 }])
    }
    expect(captured).toBe('SELECT id FROM users LIMIT 1')
  })

  it('rejects write SQL', async () => {
    const session = makeSession()
    const r = await runExecuteReadonlyQuery(session, { sql: "UPDATE users SET name='x'" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_SQL_NOT_READONLY')
  })
})

describe('runExecuteWriteQuery', () => {
  it('executes a write SQL and returns bounded result', async () => {
    let captured = ''
    const session = makeSession({
      async execute(sql) {
        captured = sql
        return { columns: [], rows: [], rowCount: 0, truncated: false, durationMs: 8 }
      }
    } as MockOverrides)
    const r = await runExecuteWriteQuery(session, { sql: "UPDATE users SET status='active' WHERE id=1" })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.executedSql).toBe("UPDATE users SET status='active' WHERE id=1")
      expect(r.data.durationMs).toBe(8)
    }
    expect(captured).toBe("UPDATE users SET status='active' WHERE id=1")
  })

  it('rejects read-only SQL for write tool', async () => {
    const session = makeSession()
    const r = await runExecuteWriteQuery(session, { sql: 'SELECT 1' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_INVALID_PARAM')
  })
})

// ---------------------------------------------------------------------------
// suggest_indexes
// ---------------------------------------------------------------------------

describe('runSuggestIndexes', () => {
  it('suggests index on _id columns, timestamps, and pattern-matched columns', async () => {
    const session = makeSession({
      columns: [{ name: 'id' }, { name: 'user_id' }, { name: 'status' }, { name: 'created_at' }]
    })
    const r = await runSuggestIndexes(session, {
      database: 'appdb',
      schema: 'public',
      table: 'orders',
      query_patterns: 'WHERE status = ? AND user_id = ?'
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const cols = r.data.suggestions.map((s) => s.columns.join(','))
      expect(cols).toContain('user_id')
      expect(cols).toContain('status')
      expect(cols).toContain('created_at')
      expect(r.data.note).toMatch(/schema only/i)
      // DDLs are CREATE INDEX statements only (no EXECUTE wording).
      for (const s of r.data.suggestions) {
        expect(s.ddl).toMatch(/^CREATE INDEX /)
      }
    }
  })

  it('does not suggest an index for the bare `id` column', async () => {
    const session = makeSession({ columns: [{ name: 'id' }] })
    const r = await runSuggestIndexes(session, { database: 'appdb', schema: 'public', table: 'orders' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.suggestions).toHaveLength(0)
  })

  it('extractPatternColumns preserves case from schema', () => {
    const cols: ColumnInfo[] = [{ name: 'CreatedAt' }, { name: 'UserID' }]
    const out = suggestTesting.extractPatternColumns('WHERE createdat > now() AND userid = ?', cols)
    expect(out).toContain('CreatedAt')
    expect(out).toContain('UserID')
  })

  it('looksLikeTimestamp matches common patterns', () => {
    expect(suggestTesting.looksLikeTimestamp({ name: 'created_at' })).toBe(true)
    expect(suggestTesting.looksLikeTimestamp({ name: 'published_date' })).toBe(true)
    expect(suggestTesting.looksLikeTimestamp({ name: 'event_time' })).toBe(true)
    expect(suggestTesting.looksLikeTimestamp({ name: 'title' })).toBe(false)
  })

  it('looksLikeForeignKey excludes the bare `id` column', () => {
    expect(suggestTesting.looksLikeForeignKey({ name: 'user_id' })).toBe(true)
    expect(suggestTesting.looksLikeForeignKey({ name: 'id' })).toBe(false)
    expect(suggestTesting.looksLikeForeignKey({ name: 'name' })).toBe(false)
  })
})
