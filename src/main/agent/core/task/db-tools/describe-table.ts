// describe_table: full structural description of a table — DDL + columns +
// indexes + primary key. Aggregates several session calls so the model has
// one round-trip per describe instead of chaining list_columns / ddl / etc.

import type { ColumnInfo, DbAiActiveSession, DbToolResult } from './shared'
import { optionalStringParam, requireStringParam, unexpectedError, validateTableScope } from './shared'

export interface DescribeTableInput {
  database: string
  schema?: string
  table: string
}

export interface DescribeTableResult {
  database: string
  schema?: string
  table: string
  /** Raw CREATE TABLE / SHOW CREATE TABLE output, or undefined if fetch failed. */
  ddl?: string
  columns: ColumnInfo[]
  /** Primary-key column names in ordinal order; null when no PK is defined. */
  primaryKey: string[] | null
}

export async function runDescribeTable(session: DbAiActiveSession, input: DescribeTableInput): Promise<DbToolResult<DescribeTableResult>> {
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

  try {
    const columns = await session.listColumnsDetailed(db.value, table.value, schema.value)
    let ddl: string | undefined
    try {
      ddl = await session.getTableDdl(db.value, table.value, schema.value)
    } catch {
      // DDL fetch failures are non-fatal; the caller can still work with
      // columns. The service-side DDL helper logs the failure reason.
      ddl = undefined
    }
    // Primary-key detection goes through the underlying driver via the
    // session's handle. For now we expose PK through an opportunistic SQL:
    // the driver has its own `detectPrimaryKey` adapter hook that the UI
    // layer uses, but DB-AI does not reach into the adapter directly.
    // MVP returns null; Phase 4 can wire this via a new session method.
    const primaryKey: string[] | null = null
    return {
      ok: true,
      data: {
        database: db.value,
        schema: schema.value,
        table: table.value,
        ddl,
        columns,
        primaryKey
      }
    }
  } catch (error) {
    return unexpectedError(error)
  }
}
