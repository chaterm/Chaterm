// suggest_indexes: purely analytical tool — looks at a table's schema + any
// caller-supplied query patterns and outputs CREATE INDEX DDL *text*. The
// tool does NOT run CREATE INDEX; the model / user decides whether to
// execute the suggestions. MVP heuristics cover the most common wins:
//
//   - Foreign-key-like columns (name ends with `_id`) get a btree index
//   - Timestamp columns (`created_at`, `updated_at`) get a btree index
//   - Column names referenced by query patterns get a btree index
//
// Phase 5 will replace this with a proper optimizer-assisted recommender;
// the MVP output is clearly labelled "based on schema only".

import type { DbAiActiveSession, DbToolResult, ColumnInfo } from './shared'
import { dialectOf, optionalStringParam, quoteIdentifier, requireStringParam, unexpectedError, validateTableScope } from './shared'

export interface SuggestIndexesInput {
  database: string
  schema?: string
  table: string
  /** Optional free-text patterns, e.g. `WHERE user_id = ? AND status IN (...)`. */
  query_patterns?: string
}

export interface SuggestIndexesResult {
  database: string
  schema?: string
  table: string
  suggestions: Array<{
    ddl: string
    columns: string[]
    rationale: string
  }>
  note: string
}

/**
 * Pull candidate column tokens from the caller's free-text query patterns.
 * We look for identifiers that appear right after WHERE / AND / OR /
 * ORDER BY / GROUP BY / JOIN ... ON clauses. The extraction is deliberately
 * conservative: better to miss a hint than to over-suggest indexes.
 */
function extractPatternColumns(patterns: string | undefined, known: ColumnInfo[]): Set<string> {
  const out = new Set<string>()
  if (!patterns) return out
  const knownSet = new Set(known.map((c) => c.name.toLowerCase()))
  const tokens = patterns.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []
  for (const tok of tokens) {
    if (knownSet.has(tok.toLowerCase())) {
      // Preserve the original column casing in the output to match driver
      // case-sensitivity expectations.
      const match = known.find((c) => c.name.toLowerCase() === tok.toLowerCase())
      if (match) out.add(match.name)
    }
  }
  return out
}

/** Return true when the column looks like a join-key column. */
function looksLikeForeignKey(col: ColumnInfo): boolean {
  return /_id$/i.test(col.name) && col.name.toLowerCase() !== 'id'
}

/** Return true when the column looks like a timestamp used for sorting/filtering. */
function looksLikeTimestamp(col: ColumnInfo): boolean {
  return /(_at|_date|_time|_timestamp)$/i.test(col.name)
}

export async function runSuggestIndexes(session: DbAiActiveSession, input: SuggestIndexesInput): Promise<DbToolResult<SuggestIndexesResult>> {
  const db = requireStringParam(input.database, 'database')
  if (!db.ok) return db
  const table = requireStringParam(input.table, 'table')
  if (!table.ok) return table
  const schema = optionalStringParam(input.schema, 'schema')
  if (!schema.ok) return schema
  const patterns = optionalStringParam(input.query_patterns, 'query_patterns')
  if (!patterns.ok) return patterns

  const scope = await validateTableScope(session, {
    database: db.value,
    schema: schema.value,
    table: table.value
  })
  if (!scope.ok) return scope

  try {
    const cols = await session.listColumnsDetailed(db.value, table.value, schema.value)
    const dialect = dialectOf(session)
    const quotedTable =
      dialect === 'postgresql'
        ? `${quoteIdentifier(dialect, schema.value ?? 'public')}.${quoteIdentifier(dialect, table.value)}`
        : `${quoteIdentifier(dialect, db.value)}.${quoteIdentifier(dialect, table.value)}`

    const patternCols = extractPatternColumns(patterns.value, cols)
    const suggested = new Map<string, { columns: string[]; rationale: string }>()
    const addSuggestion = (columns: string[], rationale: string): void => {
      const key = columns.join(',').toLowerCase()
      if (!suggested.has(key)) suggested.set(key, { columns, rationale })
    }

    for (const col of cols) {
      if (patternCols.has(col.name)) {
        addSuggestion([col.name], 'Column referenced in caller-provided query pattern.')
      }
      if (looksLikeForeignKey(col)) {
        addSuggestion([col.name], 'Column name suggests a foreign key (ends with _id).')
      }
      if (looksLikeTimestamp(col)) {
        addSuggestion([col.name], 'Timestamp-like column; common filter/sort key.')
      }
    }

    const suggestions = Array.from(suggested.entries()).map(([, { columns, rationale }]) => {
      const indexName = `idx_${table.value}_${columns.join('_')}`.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 60)
      const cols = columns.map((c) => quoteIdentifier(dialect, c)).join(', ')
      return {
        ddl: `CREATE INDEX ${quoteIdentifier(dialect, indexName)} ON ${quotedTable} (${cols});`,
        columns,
        rationale
      }
    })

    return {
      ok: true,
      data: {
        database: db.value,
        schema: schema.value,
        table: table.value,
        suggestions,
        note: 'Based on schema only. Verify with EXPLAIN before applying in production.'
      }
    }
  } catch (error) {
    return unexpectedError(error)
  }
}

export const __testing = { extractPatternColumns, looksLikeForeignKey, looksLikeTimestamp }
