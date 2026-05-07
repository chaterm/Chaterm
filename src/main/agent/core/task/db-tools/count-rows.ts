// count_rows: approximate or exact row count.
//
//   - exact=false (default): use statistics tables (fast, possibly stale).
//     MySQL: information_schema.tables.table_rows.
//     PG:    pg_class.reltuples.
//   - exact=true: run `SELECT COUNT(*)` with a 30s deadline. Can be slow on
//     large tables; callers should prefer approximate unless the model
//     explicitly asks for exact.

import type { DbAiActiveSession, DbToolResult } from './shared'
import {
  dialectOf,
  optionalStringParam,
  parseBooleanParam,
  qualifiedTableName,
  requireStringParam,
  unexpectedError,
  validateTableScope
} from './shared'

export interface CountRowsInput {
  database: string
  schema?: string
  table: string
  exact?: boolean | string
}

export interface CountRowsResult {
  database: string
  schema?: string
  table: string
  executedSql: string
  count: number
  /** True when the count came from statistics (approximate, may be stale). */
  approximate: boolean
}

// MySQL: the statistics row exists even when the table is empty (count 0).
const MYSQL_APPROX_SQL = `
SELECT TABLE_ROWS AS n
FROM information_schema.tables
WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
`.trim()

// PostgreSQL: reltuples is a float; we truncate to a non-negative integer.
const POSTGRES_APPROX_SQL = `
SELECT CAST(c.reltuples AS BIGINT) AS n
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = $1 AND c.relname = $2
`.trim()

function toNonNegativeInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value))
  if (typeof value === 'bigint') return Number(value < 0n ? 0n : value)
  if (typeof value === 'string') {
    const n = Number(value)
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n))
  }
  return 0
}

export async function runCountRows(session: DbAiActiveSession, input: CountRowsInput): Promise<DbToolResult<CountRowsResult>> {
  const db = requireStringParam(input.database, 'database')
  if (!db.ok) return db
  const table = requireStringParam(input.table, 'table')
  if (!table.ok) return table
  const schema = optionalStringParam(input.schema, 'schema')
  if (!schema.ok) return schema

  const scope = await validateTableScope(session, {
    database: db.value,
    schema: schema.value,
    table: table.value
  })
  if (!scope.ok) return scope

  const exact = parseBooleanParam(input.exact) ?? false
  const engine = session.dbType
  const dialect = dialectOf(session)
  try {
    if (!exact) {
      let n = 0
      let executedSql = ''
      if (engine === 'mysql') {
        executedSql = MYSQL_APPROX_SQL
        const r = await session.executeQuery(MYSQL_APPROX_SQL, {
          maxRows: 1,
          timeoutMs: 5_000,
          params: [db.value, table.value]
        })
        n = toNonNegativeInt(r.rows[0]?.n)
      } else {
        executedSql = POSTGRES_APPROX_SQL
        const pgSchema = schema.value ?? 'public'
        const r = await session.executeQuery(POSTGRES_APPROX_SQL, {
          maxRows: 1,
          timeoutMs: 5_000,
          params: [pgSchema, table.value]
        })
        n = toNonNegativeInt(r.rows[0]?.n)
      }
      return {
        ok: true,
        data: {
          database: db.value,
          schema: schema.value,
          table: table.value,
          executedSql,
          count: n,
          approximate: true
        }
      }
    }

    // Exact count: SELECT COUNT(*) against the quoted, validated table.
    const qualified = qualifiedTableName(dialect, {
      database: db.value,
      schema: schema.value,
      table: table.value
    })
    const sql = `SELECT COUNT(*) AS n FROM ${qualified}`
    const result = await session.executeQuery(sql, { maxRows: 1, timeoutMs: 30_000 })
    const n = toNonNegativeInt(result.rows[0]?.n)
    return {
      ok: true,
      data: {
        database: db.value,
        schema: schema.value,
        table: table.value,
        executedSql: sql,
        count: n,
        approximate: false
      }
    }
  } catch (error) {
    return unexpectedError(error)
  }
}

export const __testing = { toNonNegativeInt }
