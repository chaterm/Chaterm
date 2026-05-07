// inspect_indexes: list indexes on a table, including column ordering and
// uniqueness. Queries information_schema on both engines so the output is
// comparable without pulling driver-specific DDL parsing into the tool.

import type { DbAiActiveSession, DbToolResult } from './shared'
import { optionalStringParam, requireStringParam, unexpectedError, validateTableScope } from './shared'

export interface InspectIndexesInput {
  database: string
  schema?: string
  table: string
}

export interface IndexInfo {
  name: string
  columns: string[]
  unique: boolean
  primary: boolean
  method?: string
}

export interface InspectIndexesResult {
  database: string
  schema?: string
  table: string
  executedSql: string
  indexes: IndexInfo[]
}

// MySQL: information_schema.statistics groups rows per index. We aggregate
// into ordered column arrays on the application side because SQL-level
// GROUP_CONCAT with ORDER BY produces a single string that is brittle to
// parse.
const MYSQL_INDEX_SQL = `
SELECT INDEX_NAME AS name,
       COLUMN_NAME AS column_name,
       SEQ_IN_INDEX AS seq,
       NON_UNIQUE AS non_unique,
       INDEX_TYPE AS method
FROM information_schema.statistics
WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
ORDER BY INDEX_NAME, SEQ_IN_INDEX
`.trim()

// PostgreSQL: pg_indexes + pg_index/pg_class for uniqueness + ordering.
// We rely on the classic join pattern; results come back one row per
// (index, column) pair.
const POSTGRES_INDEX_SQL = `
SELECT i.relname AS name,
       a.attname AS column_name,
       k AS seq,
       idx.indisunique AS is_unique,
       idx.indisprimary AS is_primary,
       am.amname AS method
FROM pg_index idx
JOIN pg_class i ON i.oid = idx.indexrelid
JOIN pg_class t ON t.oid = idx.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
JOIN pg_am am ON am.oid = i.relam
JOIN LATERAL unnest(idx.indkey) WITH ORDINALITY AS u(attnum, k) ON TRUE
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = u.attnum
WHERE n.nspname = $1 AND t.relname = $2
ORDER BY i.relname, k
`.trim()

interface RawIndexRow {
  name?: string
  column_name?: string
  seq?: number | string
  non_unique?: number | string
  is_unique?: boolean
  is_primary?: boolean
  method?: string
}

function aggregateRows(rows: Array<Record<string, unknown>>, engine: 'mysql' | 'postgresql'): IndexInfo[] {
  const byName = new Map<string, IndexInfo>()
  for (const raw of rows as RawIndexRow[]) {
    const name = raw.name
    const col = raw.column_name
    if (!name || !col) continue
    let entry = byName.get(name)
    if (!entry) {
      if (engine === 'mysql') {
        // non_unique is 0 for unique, 1 otherwise.
        const unique = String(raw.non_unique) === '0'
        entry = { name, columns: [], unique, primary: name === 'PRIMARY', method: raw.method }
      } else {
        entry = {
          name,
          columns: [],
          unique: Boolean(raw.is_unique),
          primary: Boolean(raw.is_primary),
          method: raw.method
        }
      }
      byName.set(name, entry)
    }
    entry.columns.push(col)
  }
  return Array.from(byName.values())
}

export async function runInspectIndexes(session: DbAiActiveSession, input: InspectIndexesInput): Promise<DbToolResult<InspectIndexesResult>> {
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
    const engine = session.dbType
    let rows: Array<Record<string, unknown>> = []
    let executedSql = ''
    if (engine === 'mysql') {
      executedSql = MYSQL_INDEX_SQL
      const result = await session.executeQuery(MYSQL_INDEX_SQL, {
        maxRows: 1000,
        timeoutMs: 15_000,
        params: [db.value, table.value]
      })
      rows = result.rows
    } else {
      executedSql = POSTGRES_INDEX_SQL
      const pgSchema = schema.value ?? 'public'
      const result = await session.executeQuery(POSTGRES_INDEX_SQL, {
        maxRows: 1000,
        timeoutMs: 15_000,
        params: [pgSchema, table.value]
      })
      rows = result.rows
    }
    const indexes = aggregateRows(rows, engine)
    return {
      ok: true,
      data: {
        database: db.value,
        schema: schema.value,
        table: table.value,
        executedSql,
        indexes
      }
    }
  } catch (error) {
    return unexpectedError(error)
  }
}

export const __testing = { aggregateRows }
