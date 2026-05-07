// execute_readonly_query: run a read-only SQL statement and return rows.
//
// Safety:
//   - SQL must pass sql-readonly-guard (single statement, read-only verb).
//   - SQL size is capped at 50KB.
//   - Result is bounded by maxRows=200 and timeoutMs=30s at the session layer.

import { isReadOnlySql } from '../../../../services/database-ai/sql-readonly-guard'
import type { DbAiActiveSession, DbToolResult } from './shared'
import { optionalStringParam, requireStringParam, unexpectedError } from './shared'

export interface ExecuteReadonlyQueryInput {
  database?: string
  schema?: string
  sql: string
}

export interface ExecuteReadonlyQueryResult {
  engine: 'mysql' | 'postgresql'
  executedSql: string
  columns: string[]
  rows: Array<Record<string, unknown>>
  rowCount: number
  truncated: boolean
  durationMs: number
}

const MAX_SQL_BYTES = 50 * 1024

function byteLen(s: string): number {
  return Buffer.byteLength(s, 'utf8')
}

export async function runExecuteReadonlyQuery(
  session: DbAiActiveSession,
  input: ExecuteReadonlyQueryInput
): Promise<DbToolResult<ExecuteReadonlyQueryResult>> {
  const sqlParam = requireStringParam(input.sql, 'sql')
  if (!sqlParam.ok) return sqlParam
  if (byteLen(sqlParam.value) > MAX_SQL_BYTES) {
    return { ok: false, errorCode: 'E_SQL_TOO_LARGE', errorMessage: 'SQL exceeds the 50KB safety limit.' }
  }

  const dbOk = optionalStringParam(input.database, 'database')
  if (!dbOk.ok) return dbOk
  const schemaOk = optionalStringParam(input.schema, 'schema')
  if (!schemaOk.ok) return schemaOk

  const guard = isReadOnlySql(sqlParam.value)
  if (!guard.ok) {
    const errorCode = guard.errorCode === 'E_EXPLAIN_ANALYZE' ? 'E_EXPLAIN_ANALYZE' : 'E_SQL_NOT_READONLY'
    return { ok: false, errorCode, errorMessage: guard.reason }
  }

  try {
    const result = await session.executeQuery(sqlParam.value, { maxRows: 200, timeoutMs: 30_000 })
    return {
      ok: true,
      data: {
        engine: session.dbType,
        executedSql: sqlParam.value,
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rowCount,
        truncated: result.truncated,
        durationMs: result.durationMs
      }
    }
  } catch (error) {
    return unexpectedError(error)
  }
}

export const __testing = { byteLen, MAX_SQL_BYTES }
