// Shared types + helpers for DB tools (MVP-B, workspace='database').
//
// These modules live in the Task code path but are intentionally decoupled
// from Task internals: each tool takes a `DbAiActiveSession` (constructed by
// Task dispatch or by unit tests) plus plain parameters, and returns a
// `DbToolResult`. No tool reaches into Task state directly. That keeps the
// tool logic unit-testable without spinning up a full Task instance and
// leaves the dispatch / approval glue for task #11 + the follow-up
// registration step. See docs/database_ai.md §9.6 / §9.8.
//
// Error policy: tool errors are returned as values (not thrown) so the
// dispatcher can forward them as `tool_error` messages to the model without
// interpreting exceptions. `errorMessage` is user-safe — it must NOT contain
// SQL fragments, schema/table names from the caller, credentials, or host
// strings. Stable `errorCode`s let the UI localize error labels.

import type { DbAiActiveSession, ColumnInfo } from '../../../../services/database-ai/types'
import type { DbType, SqlDialect } from '@common/db-ai-types'

export type DbToolErrorCode =
  | 'E_MISSING_PARAM'
  | 'E_INVALID_PARAM'
  | 'E_UNKNOWN_SCHEMA'
  | 'E_UNKNOWN_TABLE'
  | 'E_SQL_NOT_READONLY'
  | 'E_SQL_TOO_LARGE'
  | 'E_EXPLAIN_ANALYZE'
  | 'E_DRIVER_UNSUPPORTED'
  | 'E_QUERY_TIMEOUT'
  | 'E_UNEXPECTED'

export type DbToolResult<T> = { ok: true; data: T } | { ok: false; errorCode: DbToolErrorCode; errorMessage: string }

/** Wrap an unexpected exception into a sanitized tool error. */
export function unexpectedError(error: unknown): DbToolResult<never> {
  const err = error as { code?: string; message?: string }
  if (err?.code === 'E_QUERY_TIMEOUT') {
    return { ok: false, errorCode: 'E_QUERY_TIMEOUT', errorMessage: 'Query exceeded the safety timeout.' }
  }
  // Keep provider / driver code when present so the caller can distinguish
  // e.g. connection errors from semantic errors. We intentionally do not
  // forward `err.message` to avoid leaking SQL or connection strings.
  return {
    ok: false,
    errorCode: 'E_UNEXPECTED',
    errorMessage: err?.code ? `Driver error (${err.code}).` : 'Driver error.'
  }
}

/** Validate that a string param is present and non-empty. */
export function requireStringParam(
  value: unknown,
  paramName: string
): { ok: true; value: string } | { ok: false; errorCode: DbToolErrorCode; errorMessage: string } {
  if (typeof value !== 'string' || value.length === 0) {
    return { ok: false, errorCode: 'E_MISSING_PARAM', errorMessage: `Missing required parameter: ${paramName}.` }
  }
  return { ok: true, value }
}

/** Validate an optional string param (undefined is allowed, empty string is not). */
export function optionalStringParam(
  value: unknown,
  paramName: string
): { ok: true; value: string | undefined } | { ok: false; errorCode: DbToolErrorCode; errorMessage: string } {
  if (value === undefined || value === null) return { ok: true, value: undefined }
  if (typeof value !== 'string') {
    return { ok: false, errorCode: 'E_INVALID_PARAM', errorMessage: `Parameter ${paramName} must be a string.` }
  }
  if (value.length === 0) return { ok: true, value: undefined }
  return { ok: true, value }
}

/** Validate that a `{database, schema?, table}` trio resolves against the live session. */
export async function validateTableScope(
  session: DbAiActiveSession,
  input: { database: string; schema?: string; table: string }
): Promise<DbToolResult<{ database: string; schema?: string; table: string }>> {
  const { database, schema, table } = input
  // Schema validation is PG-only; MySQL has no schema layer and listSchemas
  // returns []. We only enforce schema membership when the caller actually
  // supplied one AND `listSchemas` reports at least one entry.
  if (schema) {
    const pgSchemas = await session.listSchemas(database)
    if (pgSchemas.length > 0 && !(await session.hasSchema(database, schema))) {
      return { ok: false, errorCode: 'E_UNKNOWN_SCHEMA', errorMessage: 'Schema does not exist.' }
    }
  }
  if (!(await session.hasTable(database, table, schema))) {
    return { ok: false, errorCode: 'E_UNKNOWN_TABLE', errorMessage: 'Table does not exist.' }
  }
  return { ok: true, data: { database, schema, table } }
}

/**
 * Quote an identifier for safe SQL interpolation. PG uses double quotes with
 * `""` escape; MySQL uses backticks with `` `` `` escape. We NEVER interpolate
 * a raw identifier that came from a model; callers must have gone through
 * `validateTableScope` first so the identifier is known to exist.
 */
export function quoteIdentifier(dialect: SqlDialect, ident: string): string {
  if (dialect === 'mysql') return '`' + ident.replace(/`/g, '``') + '`'
  return '"' + ident.replace(/"/g, '""') + '"'
}

/**
 * Fully-qualified table reference used inside sample-rows / count-rows.
 * PG prefers "schema"."table"; MySQL prefers `database`.`table` with the
 * database name taking the schema slot.
 */
export function qualifiedTableName(dialect: SqlDialect, parts: { database: string; schema?: string; table: string }): string {
  if (dialect === 'postgresql') {
    const schema = parts.schema ?? 'public'
    return `${quoteIdentifier(dialect, schema)}.${quoteIdentifier(dialect, parts.table)}`
  }
  return `${quoteIdentifier(dialect, parts.database)}.${quoteIdentifier(dialect, parts.table)}`
}

/** Dialect from the DB-AI session (DbType and SqlDialect currently overlap). */
export function dialectOf(session: DbAiActiveSession): SqlDialect {
  return session.dbType as unknown as SqlDialect
}

/** Coerce a numeric parameter from string or number; returns undefined when not present. */
export function parseNumericParam(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && value.length > 0) {
    const n = Number(value)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

/** Coerce a boolean parameter from 'true'/'false' strings or booleans. */
export function parseBooleanParam(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value === 'true' || value === '1') return true
    if (value === 'false' || value === '0') return false
  }
  return undefined
}

/** Re-exports so tool files only need to import from this module. */
export type { ColumnInfo, DbAiActiveSession, DbType, SqlDialect }
