// Dialect metadata used across DB-AI prompt builders and target-dialect
// conversion. Kept deliberately small: only the facts a prompt needs to
// quote identifiers correctly and tell the model which engine we target.

import type { SqlDialect } from '@common/db-ai-types'
import type { DialectInfo } from './types'

/**
 * Canonical dialect descriptors. `identifierQuote` matches the engine's
 * default quoting character (MySQL uses backticks, PostgreSQL uses
 * double quotes).
 */
const DIALECT_TABLE: Record<SqlDialect, DialectInfo> = {
  mysql: {
    dialect: 'mysql',
    displayName: 'MySQL',
    identifierQuote: '`'
  },
  postgresql: {
    dialect: 'postgresql',
    displayName: 'PostgreSQL',
    identifierQuote: '"'
  }
}

/**
 * Resolve dialect metadata for a given dialect literal. Throws on unknown
 * values so callers fail loudly rather than silently falling back to the
 * wrong dialect and producing invalid SQL.
 */
export function getDialectInfo(dialect: SqlDialect): DialectInfo {
  const info = DIALECT_TABLE[dialect]
  if (!info) {
    throw new Error(`unknown SQL dialect: ${String(dialect)}`)
  }
  return info
}

/**
 * Accept anything the UI/IPC may pass and map it to a strict `SqlDialect`.
 * Unrecognized strings return `null` so the caller can fall back (e.g. when
 * the user has not chosen a target dialect yet).
 */
export function normalizeDialect(candidate: unknown): SqlDialect | null {
  if (typeof candidate !== 'string') return null
  const lower = candidate.toLowerCase()
  if (lower === 'mysql') return 'mysql'
  if (lower === 'postgres' || lower === 'postgresql' || lower === 'pg') return 'postgresql'
  return null
}

/**
 * True when `source !== target`. Prompt builders use this to decide whether
 * to inject a dialect-conversion hint section.
 */
export function isDifferentDialect(source: SqlDialect, target: SqlDialect): boolean {
  return source !== target
}

/** Enumerate all supported dialects; order is stable for UI pickers. */
export function allDialects(): SqlDialect[] {
  return ['mysql', 'postgresql']
}
