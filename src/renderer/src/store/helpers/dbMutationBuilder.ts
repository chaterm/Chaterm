/**
 * Pure SQL builder for the data-grid edit/commit flow.
 *
 * Called by `databaseWorkspaceStore.commitDirty`. Produces an ordered list
 * of `{ sql, params }` parameterized statements suitable for the main-process
 * driver (`dbAssetExecuteMutations`). Emits DELETE -> UPDATE -> INSERT, so
 * that deletes don't conflict with later inserts on the same keys.
 *
 * Placeholder style is dialect-specific:
 *   - MySQL:       `?` positional placeholders
 *   - PostgreSQL:  `$1`, `$2`, ... positional placeholders
 *
 * Identifiers (table, column, database, primary-key names) are NEVER
 * parameterized — the SQL dialect forbids it. We therefore require every
 * identifier to match a strict whitelist pattern before interpolating it
 * into SQL. Anything outside the pattern aborts with an error so the store
 * can surface it to the user rather than ship a malformed statement.
 */

export type DbDialect = 'mysql' | 'postgresql'

export interface BuildMutationsArgs {
  dbType: DbDialect
  database: string
  table: string
  primaryKey: string[] | null
  newRows: Array<{ tmpId: string; values: Record<string, unknown> }>
  deletedRowKeys: string[]
  updatedCells: Array<[string, Record<string, unknown>]>
  originalRows: Map<string, Record<string, unknown>>
  knownColumns: string[]
}

export interface BuiltStatement {
  sql: string
  params: unknown[]
}

// Strict identifier pattern: start with letter/underscore, then alphanumerics
// or underscore. Matches the task contract and avoids any SQL-injection
// surface through backtick / quote-wrapped identifiers.
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

function assertIdent(label: string, value: string): void {
  if (typeof value !== 'string' || !IDENT_RE.test(value)) {
    throw new Error(`Invalid SQL identifier for ${label}: ${String(value)}`)
  }
}

// Quote an identifier for the target dialect. `table`.`col` in MySQL,
// "table"."col" in PostgreSQL. Identifiers must be pre-validated.
function quoteIdent(dialect: DbDialect, ident: string): string {
  return dialect === 'mysql' ? `\`${ident}\`` : `"${ident}"`
}

function qualifiedTable(dialect: DbDialect, database: string, table: string): string {
  return `${quoteIdent(dialect, database)}.${quoteIdent(dialect, table)}`
}

/**
 * Positional placeholder emitter. Kept as a closure per-statement so each
 * statement's `$N` numbering starts at 1 in PostgreSQL. MySQL always uses `?`.
 */
function makePlaceholder(dialect: DbDialect): () => string {
  let n = 0
  return () => {
    n += 1
    return dialect === 'mysql' ? '?' : `$${n}`
  }
}

/**
 * Parse a rowKey back into the ordered list of primary-key values that
 * produced it. rowKey is `JSON.stringify(pk.map((c) => row[c]))`. Returns
 * `null` if the key isn't a JSON array of the expected length.
 */
function decodeRowKeyToPkValues(rowKey: string, pk: string[]): unknown[] | null {
  try {
    const parsed = JSON.parse(rowKey)
    if (!Array.isArray(parsed)) return null
    if (parsed.length !== pk.length) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Build a parametrized WHERE clause that identifies a single row.
 *
 * When `pk` is non-empty, use `pk_col = ?` (or IS NULL) for each column.
 * When `pk` is null/empty, fall back to matching every known column of the
 * snapshot, with NULL columns going through `IS NULL` (can't be parameterized).
 */
function buildWhereForRow(
  dialect: DbDialect,
  pk: string[] | null,
  knownColumns: string[],
  snapshot: Record<string, unknown>,
  placeholder: () => string,
  params: unknown[]
): string {
  const usingPk = pk && pk.length > 0
  const cols = usingPk ? pk! : knownColumns
  if (!cols || cols.length === 0) {
    throw new Error('Cannot build WHERE clause: no primary key and no known columns')
  }
  const clauses: string[] = []
  for (const col of cols) {
    assertIdent('column', col)
    const val = snapshot[col]
    if (val === null || val === undefined) {
      clauses.push(`${quoteIdent(dialect, col)} IS NULL`)
    } else {
      clauses.push(`${quoteIdent(dialect, col)} = ${placeholder()}`)
      params.push(val)
    }
  }
  return clauses.join(' AND ')
}

function buildDeleteStatement(
  dialect: DbDialect,
  database: string,
  table: string,
  pk: string[] | null,
  knownColumns: string[],
  rowKey: string,
  originalRows: Map<string, Record<string, unknown>>
): BuiltStatement {
  const placeholder = makePlaceholder(dialect)
  const params: unknown[] = []
  let where: string

  if (pk && pk.length > 0) {
    const values = decodeRowKeyToPkValues(rowKey, pk)
    if (!values) {
      throw new Error(`Cannot decode primary-key rowKey for delete: ${rowKey}`)
    }
    const clauses: string[] = []
    for (let i = 0; i < pk.length; i += 1) {
      assertIdent('column', pk[i])
      const v = values[i]
      if (v === null || v === undefined) {
        clauses.push(`${quoteIdent(dialect, pk[i])} IS NULL`)
      } else {
        clauses.push(`${quoteIdent(dialect, pk[i])} = ${placeholder()}`)
        params.push(v)
      }
    }
    where = clauses.join(' AND ')
  } else {
    const snapshot = originalRows.get(rowKey)
    if (!snapshot) {
      throw new Error(`Cannot build DELETE: missing originalRows snapshot for rowKey=${rowKey}`)
    }
    where = buildWhereForRow(dialect, null, knownColumns, snapshot, placeholder, params)
  }

  // No-primary-key fallbacks need a single-row guard. MySQL supports
  // `LIMIT 1` directly on DELETE. PostgreSQL doesn't allow LIMIT on DELETE,
  // so we route through `ctid` which uniquely identifies a physical tuple.
  const hasPk = !!pk && pk.length > 0
  let sql: string
  if (hasPk) {
    sql = `DELETE FROM ${qualifiedTable(dialect, database, table)} WHERE ${where}`
  } else if (dialect === 'mysql') {
    sql = `DELETE FROM ${qualifiedTable(dialect, database, table)} WHERE ${where} LIMIT 1`
  } else {
    sql = `DELETE FROM ${qualifiedTable(dialect, database, table)} WHERE ctid = (SELECT ctid FROM ${qualifiedTable(dialect, database, table)} WHERE ${where} LIMIT 1)`
  }
  return { sql, params }
}

function buildUpdateStatement(
  dialect: DbDialect,
  database: string,
  table: string,
  pk: string[] | null,
  knownColumns: string[],
  rowKey: string,
  changes: Record<string, unknown>,
  originalRows: Map<string, Record<string, unknown>>
): BuiltStatement {
  const placeholder = makePlaceholder(dialect)
  const params: unknown[] = []
  const setParts: string[] = []
  const changeKeys = Object.keys(changes)
  if (changeKeys.length === 0) {
    throw new Error(`Cannot build UPDATE: no changed columns for rowKey=${rowKey}`)
  }
  for (const col of changeKeys) {
    assertIdent('column', col)
    setParts.push(`${quoteIdent(dialect, col)} = ${placeholder()}`)
    params.push(changes[col])
  }

  let where: string
  if (pk && pk.length > 0) {
    const values = decodeRowKeyToPkValues(rowKey, pk)
    if (!values) {
      throw new Error(`Cannot decode primary-key rowKey for update: ${rowKey}`)
    }
    const clauses: string[] = []
    for (let i = 0; i < pk.length; i += 1) {
      assertIdent('column', pk[i])
      const v = values[i]
      if (v === null || v === undefined) {
        clauses.push(`${quoteIdent(dialect, pk[i])} IS NULL`)
      } else {
        clauses.push(`${quoteIdent(dialect, pk[i])} = ${placeholder()}`)
        params.push(v)
      }
    }
    where = clauses.join(' AND ')
  } else {
    const snapshot = originalRows.get(rowKey)
    if (!snapshot) {
      throw new Error(`Cannot build UPDATE: missing originalRows snapshot for rowKey=${rowKey}`)
    }
    where = buildWhereForRow(dialect, null, knownColumns, snapshot, placeholder, params)
  }

  const hasPk = !!pk && pk.length > 0
  let sql: string
  if (hasPk) {
    sql = `UPDATE ${qualifiedTable(dialect, database, table)} SET ${setParts.join(', ')} WHERE ${where}`
  } else if (dialect === 'mysql') {
    sql = `UPDATE ${qualifiedTable(dialect, database, table)} SET ${setParts.join(', ')} WHERE ${where} LIMIT 1`
  } else {
    sql = `UPDATE ${qualifiedTable(dialect, database, table)} SET ${setParts.join(', ')} WHERE ctid = (SELECT ctid FROM ${qualifiedTable(dialect, database, table)} WHERE ${where} LIMIT 1)`
  }
  return { sql, params }
}

function buildInsertStatement(dialect: DbDialect, database: string, table: string, values: Record<string, unknown>): BuiltStatement | null {
  const cols = Object.keys(values)
  if (cols.length === 0) return null
  // Drop rows where every cell is null/undefined. The user almost certainly
  // doesn't want to insert an all-defaults blank row; filter it out here so
  // the builder is the single source of truth for this rule.
  const hasAnyValue = cols.some((c) => values[c] !== null && values[c] !== undefined)
  if (!hasAnyValue) return null

  const placeholder = makePlaceholder(dialect)
  const params: unknown[] = []
  const quotedCols: string[] = []
  const placeholders: string[] = []
  for (const col of cols) {
    assertIdent('column', col)
    quotedCols.push(quoteIdent(dialect, col))
    placeholders.push(placeholder())
    params.push(values[col])
  }
  const sql = `INSERT INTO ${qualifiedTable(dialect, database, table)} (${quotedCols.join(', ')}) VALUES (${placeholders.join(', ')})`
  return { sql, params }
}

/**
 * Entry point. Emits DELETE -> UPDATE -> INSERT in that order. Each
 * statement is fully parametrized with dialect-correct placeholders and
 * identifier quoting. Identifiers that fail `IDENT_RE` abort the build.
 */
export function buildMutations(args: BuildMutationsArgs): BuiltStatement[] {
  const { dbType, database, table, primaryKey, newRows, deletedRowKeys, updatedCells, originalRows, knownColumns } = args

  assertIdent('database', database)
  assertIdent('table', table)
  if (primaryKey && primaryKey.length > 0) {
    for (const c of primaryKey) assertIdent('primaryKey column', c)
  }
  for (const c of knownColumns) assertIdent('knownColumns column', c)

  const out: BuiltStatement[] = []

  // 1) DELETEs
  for (const rowKey of deletedRowKeys) {
    out.push(buildDeleteStatement(dbType, database, table, primaryKey ?? null, knownColumns, rowKey, originalRows))
  }

  // 2) UPDATEs
  for (const [rowKey, changes] of updatedCells) {
    if (!changes || Object.keys(changes).length === 0) continue
    out.push(buildUpdateStatement(dbType, database, table, primaryKey ?? null, knownColumns, rowKey, changes, originalRows))
  }

  // 3) INSERTs
  for (const row of newRows) {
    const stmt = buildInsertStatement(dbType, database, table, row.values)
    if (stmt) out.push(stmt)
  }

  return out
}

/** Regex export for reuse in the store (identifier validation of user input). */
export const DB_IDENTIFIER_RE = IDENT_RE
