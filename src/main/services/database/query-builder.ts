//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

/**
 * Table query SQL builder + safety helpers.
 *
 * Safety model:
 * - Column and table names are untrusted strings from the renderer. They are
 *   validated against a known-column whitelist the caller fetched from the
 *   driver; unknown identifiers are refused.
 * - Filter/sort values are bound as parameters, never interpolated.
 * - Identifier quoting is dialect-aware (backticks for mysql, double quotes
 *   for postgres).
 * - Free-form WHERE / ORDER BY expressions are deliberately concatenated
 *   verbatim. They are only invoked when the user pastes SQL fragments into
 *   the dedicated panels in the UI, and they win over structured column
 *   filters / sorts (i.e. if whereRaw is non-empty, the structured filters
 *   are ignored — same for orderByRaw vs structured sort). This keeps the
 *   semantics unambiguous and prevents accidental AND-ing that contradicts
 *   the filter panel.
 */

export type FilterOperator = 'eq' | 'neq' | 'like' | 'in' | 'isnull' | 'notnull'

export interface ColumnFilter {
  column: string
  operator: FilterOperator
  value?: string
  values?: string[]
}

export interface ColumnSort {
  column: string
  direction: 'asc' | 'desc'
}

export interface QueryTableInput {
  dbType: 'mysql' | 'postgresql'
  database: string
  /**
   * Schema the table lives in. PG-only: used to emit "schema"."table"
   * qualifiers. MySQL ignores it (no schema layer).
   */
  schema?: string
  table: string
  knownColumns: string[]
  filters: ColumnFilter[]
  sort: ColumnSort | null
  /** Free-form WHERE expression authored in the UI. Overrides structured filters. */
  whereRaw?: string | null
  /** Free-form ORDER BY expression authored in the UI. Overrides structured sort. */
  orderByRaw?: string | null
  page: number
  pageSize: number
}

export interface BuiltQuery {
  sql: string
  countSql: string
  params: unknown[]
  countParams: unknown[]
}

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

function assertIdent(name: string, label: string): string {
  if (!IDENT_RE.test(name)) {
    throw new Error(`unsafe ${label}: ${JSON.stringify(name).slice(0, 64)}`)
  }
  return name
}

function quoteIdent(name: string, dbType: 'mysql' | 'postgresql'): string {
  if (dbType === 'mysql') return `\`${name}\``
  return `"${name}"`
}

function placeholder(dbType: 'mysql' | 'postgresql', index1Based: number): string {
  return dbType === 'postgresql' ? `$${index1Based}` : '?'
}

function buildStructuredWhere(
  filters: ColumnFilter[],
  knownColumns: Set<string>,
  dbType: 'mysql' | 'postgresql',
  startIndex: number
): { sql: string; params: unknown[]; endIndex: number } {
  if (filters.length === 0) return { sql: '', params: [], endIndex: startIndex }
  const params: unknown[] = []
  let index = startIndex
  const clauses: string[] = []
  for (const f of filters) {
    if (!knownColumns.has(f.column)) throw new Error(`unknown filter column: ${f.column}`)
    assertIdent(f.column, 'filter column')
    const col = quoteIdent(f.column, dbType)
    switch (f.operator) {
      case 'isnull':
        clauses.push(`${col} IS NULL`)
        break
      case 'notnull':
        clauses.push(`${col} IS NOT NULL`)
        break
      case 'eq':
        clauses.push(`${col} = ${placeholder(dbType, index++)}`)
        params.push(f.value ?? '')
        break
      case 'neq':
        clauses.push(`${col} <> ${placeholder(dbType, index++)}`)
        params.push(f.value ?? '')
        break
      case 'like':
        clauses.push(`${col} LIKE ${placeholder(dbType, index++)}`)
        params.push(f.value ?? '')
        break
      case 'in': {
        const vals = f.values ?? []
        if (vals.length === 0) {
          clauses.push('1 = 0')
          break
        }
        const marks = vals.map(() => placeholder(dbType, index++)).join(', ')
        clauses.push(`${col} IN (${marks})`)
        for (const v of vals) params.push(v)
        break
      }
      default:
        throw new Error(`unsupported operator: ${(f as { operator: string }).operator}`)
    }
  }
  return { sql: ` WHERE ${clauses.join(' AND ')}`, params, endIndex: index }
}

function buildStructuredOrderBy(sort: ColumnSort | null, knownColumns: Set<string>, dbType: 'mysql' | 'postgresql'): string {
  if (!sort) return ''
  if (!knownColumns.has(sort.column)) throw new Error(`unknown sort column: ${sort.column}`)
  assertIdent(sort.column, 'sort column')
  const dir = sort.direction === 'desc' ? 'DESC' : 'ASC'
  return ` ORDER BY ${quoteIdent(sort.column, dbType)} ${dir}`
}

function buildLimitOffset(
  page: number,
  pageSize: number,
  dbType: 'mysql' | 'postgresql',
  startIndex: number
): { sql: string; params: unknown[]; endIndex: number } {
  // Bounds: [10, 10000] matches the UI page-size selector.
  const safePageSize = Math.max(1, Math.min(Math.floor(pageSize), 10000))
  const safePage = Math.max(1, Math.floor(page))
  const offset = (safePage - 1) * safePageSize
  // LIMIT / OFFSET are integer literals. MySQL cannot bind them via `?`
  // with mysql2's unprepared `query()` and even with `execute()` the server
  // requires they be literal integers in many server/client combinations.
  // We clamped both values above, so inlining is safe.
  if (dbType === 'mysql') {
    return {
      sql: ` LIMIT ${safePageSize} OFFSET ${offset}`,
      params: [],
      endIndex: startIndex
    }
  }
  // Postgres binds them just fine.
  const limitPh = placeholder(dbType, startIndex)
  const offsetPh = placeholder(dbType, startIndex + 1)
  return {
    sql: ` LIMIT ${limitPh} OFFSET ${offsetPh}`,
    params: [safePageSize, offset],
    endIndex: startIndex + 2
  }
}

function qualifiedTable(input: Pick<QueryTableInput, 'dbType' | 'database' | 'schema' | 'table'>): string {
  const { dbType, database, schema, table } = input
  assertIdent(table, 'table')
  if (dbType === 'mysql' && database) {
    assertIdent(database, 'database')
    return `${quoteIdent(database, dbType)}.${quoteIdent(table, dbType)}`
  }
  // Postgres: connections are bound to one database, so we cannot
  // cross-qualify with the database name. Qualify with the schema when
  // known; otherwise fall back to bare table and rely on search_path.
  if (dbType === 'postgresql' && schema) {
    assertIdent(schema, 'schema')
    return `${quoteIdent(schema, dbType)}.${quoteIdent(table, dbType)}`
  }
  return quoteIdent(table, dbType)
}

export function buildTableQuery(input: QueryTableInput): BuiltQuery {
  const knownColumns = new Set(input.knownColumns)
  const table = qualifiedTable(input)

  // WHERE: free-form overrides structured. Parameters start at $1 either way.
  const whereRaw = (input.whereRaw ?? '').trim()
  let whereSql = ''
  let whereParams: unknown[] = []
  let nextIndex = 1
  if (whereRaw) {
    whereSql = ` WHERE ${whereRaw}`
  } else {
    const w = buildStructuredWhere(input.filters, knownColumns, input.dbType, 1)
    whereSql = w.sql
    whereParams = w.params
    nextIndex = w.endIndex
  }

  // ORDER BY: free-form overrides structured.
  const orderByRaw = (input.orderByRaw ?? '').trim()
  const orderBySql = orderByRaw ? ` ORDER BY ${orderByRaw}` : buildStructuredOrderBy(input.sort, knownColumns, input.dbType)

  const limit = buildLimitOffset(input.page, input.pageSize, input.dbType, nextIndex)

  return {
    sql: `SELECT * FROM ${table}${whereSql}${orderBySql}${limit.sql}`,
    countSql: `SELECT COUNT(*) AS total FROM ${table}${whereSql}`,
    params: [...whereParams, ...limit.params],
    countParams: [...whereParams]
  }
}
