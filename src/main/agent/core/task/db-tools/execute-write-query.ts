// execute_write_query: run a write SQL statement after explicit user approval.
//
// Safety:
//   - SQL must be non-read-only (SELECT/SHOW/etc should use execute_readonly_query).
//   - SQL size is capped at 50KB.
//   - Final execution approval is handled by Task.askApproval('command', sql).

import { isReadOnlySql } from '../../../../services/database-ai/sql-readonly-guard'
import type { DbAiActiveSession, DbToolResult } from './shared'
import { optionalStringParam, requireStringParam, unexpectedError } from './shared'

export interface ExecuteWriteQueryInput {
  database?: string
  schema?: string
  sql: string
}

export interface ExecuteWriteQueryResult {
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

export async function runExecuteWriteQuery(
  session: DbAiActiveSession,
  input: ExecuteWriteQueryInput
): Promise<DbToolResult<ExecuteWriteQueryResult>> {
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
  if (guard.ok) {
    return {
      ok: false,
      errorCode: 'E_INVALID_PARAM',
      errorMessage: 'SQL is read-only. Use execute_readonly_query for SELECT/SHOW/DESCRIBE/EXPLAIN.'
    }
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
