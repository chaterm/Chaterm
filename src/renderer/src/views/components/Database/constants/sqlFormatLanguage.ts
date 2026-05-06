// Maps the backend-normalized dbType string (as stored on connection node
// meta.dbType) to the `language` option of the `sql-formatter` library.
//
// Adding a new database driver in the future usually only needs a new row
// in DIALECT_MAP — the toolbar, editor, and workspace wiring do not need
// to change. Unknown dbType values fall back to the generic 'sql' parser,
// which still yields readable output (indentation + keyword casing) for
// any SQL-92-ish engine.

import type { FormatOptionsWithLanguage } from 'sql-formatter'

export type SqlFormatterLanguage = FormatOptionsWithLanguage['language']

const DIALECT_MAP: Record<string, SqlFormatterLanguage> = {
  mysql: 'mysql',
  mariadb: 'mariadb',
  postgresql: 'postgresql',
  postgres: 'postgresql',
  sqlite: 'sqlite',
  oracle: 'plsql',
  mssql: 'tsql',
  sqlserver: 'tsql',
  redshift: 'redshift',
  snowflake: 'snowflake',
  bigquery: 'bigquery',
  hive: 'hive',
  spark: 'spark',
  trino: 'trino',
  presto: 'trino',
  db2: 'db2'
  // Engines without a dedicated dialect (ClickHouse, DM, OceanBase, Kingbase,
  // H2, Timeplus, MongoDB) intentionally fall through to the 'sql' default.
}

export function toFormatterLanguage(dbType: string | undefined): SqlFormatterLanguage {
  if (!dbType) return 'sql'
  return DIALECT_MAP[dbType.toLowerCase()] ?? 'sql'
}
