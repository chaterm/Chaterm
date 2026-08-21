// Pre-approval classification for execute_write_query.
//
// The approval prompt is the last point at which a human sees the SQL, so the
// verdict has to be known before it is shown: approving SQL that the tool will
// then refuse teaches the user that the prompt is noise. This module is a pure
// function so the Task dispatch path can be unit-tested without a live session.
//
// It deliberately mirrors the order of checks inside `runExecuteWriteQuery`.
// The tool keeps its own copy of those checks — the duplication is the point,
// so a future caller that forgets to preflight still cannot execute
// unverifiable SQL.

import { isReadOnlySql, isUnverifiableRejection } from '../../../../services/database-ai/sql-readonly-guard'
import type { GuardDialect } from '../../../../services/database-ai/sql-readonly-guard'
import type { DbToolErrorCode } from './shared'

export type PreflightResult = { ok: true } | { ok: false; errorCode: DbToolErrorCode; errorMessage: string }

const MAX_SQL_BYTES = 50 * 1024

/**
 * Decide whether `sql` may proceed to the approval prompt.
 *
 * `dialect` comes from the task's DB context, not from a session: opening a
 * connection just to learn the engine would be a side effect before the user
 * has approved anything. An absent dialect fails closed, matching the guard's
 * own policy of rejecting rather than guessing.
 */
export function preflightWriteSql(sql: string, dialect: GuardDialect | undefined): PreflightResult {
  if (!dialect) {
    return {
      ok: false,
      errorCode: 'E_INVALID_PARAM',
      errorMessage: 'Database engine is unknown for this session; cannot verify the SQL.'
    }
  }
  if (Buffer.byteLength(sql, 'utf8') > MAX_SQL_BYTES) {
    return { ok: false, errorCode: 'E_SQL_TOO_LARGE', errorMessage: 'SQL exceeds the 50KB safety limit.' }
  }

  const guard = isReadOnlySql(sql, dialect)
  if (guard.ok) {
    return {
      ok: false,
      errorCode: 'E_INVALID_PARAM',
      errorMessage: 'SQL is read-only. Use execute_readonly_query for SELECT/SHOW/DESCRIBE/EXPLAIN/PRAGMA.'
    }
  }
  if (isUnverifiableRejection(guard.errorCode)) {
    return {
      ok: false,
      errorCode: 'E_SQL_UNVERIFIABLE',
      errorMessage: 'SQL could not be safely verified and was not executed. Submit a single, complete statement.'
    }
  }
  return { ok: true }
}

export const __testing = { MAX_SQL_BYTES }
