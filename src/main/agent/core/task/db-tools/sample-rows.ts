// sample_rows: return up to `limit` rows from a table.
//
// Safety:
//   - `limit` is clamped to [1, 100] then inlined as a numeric literal into
//     `LIMIT N`. LIMIT placeholder binding is inconsistent across engines
//     (MySQL prepared statements reject string params in LIMIT) so we stick
//     to literal interpolation after range validation.
//   - The table reference is built via `qualifiedTableName` AFTER the table
//     membership check, so the identifier is known to exist and is quoted.
//   - `session.executeQuery` applies the row cap + timeout defined in #14.
//   - The SQL is NOT derived from user input; the model never gets to write
//     the statement itself.

import type { DbAiActiveSession, DbToolResult } from './shared'
import {
  dialectOf,
  optionalStringParam,
  parseNumericParam,
  qualifiedTableName,
  requireStringParam,
  unexpectedError,
  validateTableScope
} from './shared'

export interface SampleRowsInput {
  database: string
  schema?: string
  table: string
  limit?: number | string
}

export interface SampleRowsResult {
  database: string
  schema?: string
  table: string
  executedSql: string
  columns: string[]
  rows: Array<Record<string, unknown>>
  rowCount: number
  truncated: boolean
  /** Effective limit after clamping. */
  limit: number
}

const DEFAULT_LIMIT = 10
const MIN_LIMIT = 1
const MAX_LIMIT = 100

function clampLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_LIMIT
  return Math.min(Math.max(Math.floor(value), MIN_LIMIT), MAX_LIMIT)
}

export async function runSampleRows(session: DbAiActiveSession, input: SampleRowsInput): Promise<DbToolResult<SampleRowsResult>> {
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

  const limit = clampLimit(parseNumericParam(input.limit))
  const dialect = dialectOf(session)
  const qualified = qualifiedTableName(dialect, {
    database: db.value,
    schema: schema.value,
    table: table.value
  })
  // `limit` is a clamped integer, safe to interpolate. We still strip any
  // stray characters as an extra belt-and-braces step.
  const sql = `SELECT * FROM ${qualified} LIMIT ${Math.floor(limit)}`
  try {
    const result = await session.executeQuery(sql, { maxRows: limit, timeoutMs: 15_000 })
    return {
      ok: true,
      data: {
        database: db.value,
        schema: schema.value,
        table: table.value,
        executedSql: sql,
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rowCount,
        truncated: result.truncated,
        limit
      }
    }
  } catch (error) {
    return unexpectedError(error)
  }
}

export const __testing = { clampLimit, DEFAULT_LIMIT, MIN_LIMIT, MAX_LIMIT }
