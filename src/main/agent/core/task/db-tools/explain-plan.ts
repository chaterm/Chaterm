// explain_plan: prefix EXPLAIN to the caller's SQL and return the JSON plan.
//
// Safety:
//   - SQL must pass `sql-readonly-guard` (whitelist + single statement +
//     comment/literal stripping) — the guard itself rejects ANALYZE/ANALYSE
//     variants.
//   - SQL length capped at 50KB as per §10.2 parameter bounds.
//   - Engine-specific EXPLAIN flavour: PG `EXPLAIN (FORMAT JSON)`, MySQL
//     `EXPLAIN FORMAT=JSON`.

import { isReadOnlySql } from '../../../../services/database-ai/sql-readonly-guard'
import type { DbAiActiveSession, DbToolResult } from './shared'
import { optionalStringParam, requireStringParam, unexpectedError } from './shared'

export interface ExplainPlanInput {
  database?: string
  schema?: string
  sql: string
}

export interface ExplainPlanResult {
  engine: 'mysql' | 'postgresql'
  executedSql: string
  /** Raw plan payload: MySQL JSON text, PG jsonb object, or row-form fallback. */
  plan: unknown
}

const MAX_SQL_BYTES = 50 * 1024

function byteLen(s: string): number {
  return Buffer.byteLength(s, 'utf8')
}

export async function runExplainPlan(session: DbAiActiveSession, input: ExplainPlanInput): Promise<DbToolResult<ExplainPlanResult>> {
  const sqlParam = requireStringParam(input.sql, 'sql')
  if (!sqlParam.ok) return sqlParam
  if (byteLen(sqlParam.value) > MAX_SQL_BYTES) {
    return { ok: false, errorCode: 'E_SQL_TOO_LARGE', errorMessage: 'SQL exceeds the 50KB safety limit.' }
  }
  // Optional scope params; not used in the SQL itself but kept for logging
  // parity with other tools.
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
    let plan: unknown
    let executedSql = ''
    if (session.dbType === 'mysql') {
      const sql = `EXPLAIN FORMAT=JSON ${sqlParam.value}`
      executedSql = sql
      const r = await session.executeQuery(sql, { maxRows: 1, timeoutMs: 15_000 })
      const first = r.rows[0]
      // MySQL returns a single column whose value is the JSON plan string.
      plan = first ? Object.values(first)[0] : null
    } else {
      const sql = `EXPLAIN (FORMAT JSON) ${sqlParam.value}`
      executedSql = sql
      const r = await session.executeQuery(sql, { maxRows: 200, timeoutMs: 15_000 })
      // PG returns a column named "QUERY PLAN" with a jsonb array of plan nodes.
      plan = r.rows.map((row) => Object.values(row)[0])
    }
    return { ok: true, data: { engine: session.dbType, executedSql, plan } }
  } catch (error) {
    return unexpectedError(error)
  }
}

export const __testing = { byteLen, MAX_SQL_BYTES }
