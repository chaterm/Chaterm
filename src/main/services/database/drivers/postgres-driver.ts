//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import type { ConnectionTestResult, DatabaseDriverAdapter, DbObjectKind, DbSchemaInfo, QueryResult, ResolvedDbCredential } from '../types'
import { PG_TABLE_DEF_FUNCTION_SQL } from '../ddl/pg-table-ddl'

const logger = createLogger('db')

type PgClient = {
  connect(): Promise<void>
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[]; fields?: Array<{ name: string }> }>
  end(): Promise<void>
}

type PgDriver = {
  Client: new (config: Record<string, unknown>) => PgClient
}

async function loadDriver(): Promise<PgDriver> {
  const mod = await import('pg')
  const any = mod as unknown as { Client?: PgDriver['Client']; default?: PgDriver }
  if (any.Client) return { Client: any.Client }
  if (any.default?.Client) return { Client: any.default.Client }
  throw new Error('pg driver missing Client export')
}

function buildConfig(input: ResolvedDbCredential): Record<string, unknown> {
  // NOTE: do NOT set `statement_timeout` here. node-postgres forwards it as a
  // Postgres startup parameter, which PgBouncer/Supabase pooler/Aurora Proxy
  // and similar middlewares reject with "unsupported startup parameter".
  // If a per-query timeout is needed, issue `SET statement_timeout` after
  // connect, or wrap executeQuery with a client-side AbortController.
  const config: Record<string, unknown> = {
    host: input.host,
    port: input.port,
    user: input.username ?? undefined,
    password: input.password ?? undefined,
    database: input.database ?? undefined,
    connectionTimeoutMillis: 10000
  }
  if (input.sslMode && input.sslMode !== 'disable') {
    config.ssl = { rejectUnauthorized: false }
  }
  return config
}

function describeConfigForLog(config: Record<string, unknown>): Record<string, unknown> {
  return {
    host: config.host,
    port: config.port,
    user: config.user,
    database: config.database,
    hasPassword: !!config.password,
    ssl: !!config.ssl,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    keys: Object.keys(config)
  }
}

export class PostgresDriverAdapter implements DatabaseDriverAdapter {
  async testConnection(input: ResolvedDbCredential): Promise<ConnectionTestResult> {
    const start = Date.now()
    let client: PgClient | null = null
    const config = buildConfig(input)
    logger.info('postgres testConnection start', {
      event: 'db.postgres.test.start',
      config: describeConfigForLog(config),
      pgOptionsEnv: process.env.PGOPTIONS ? 'SET' : 'UNSET'
    })
    try {
      const driver = await loadDriver()
      client = new driver.Client(config)
      await client.connect()
      const res = await client.query<{ version: string }>('SELECT version() as version')
      const version = res.rows?.[0]?.version
      const latencyMs = Date.now() - start
      return { ok: true, serverVersion: version, latencyMs }
    } catch (error) {
      logger.error('postgres testConnection failed', { event: 'db.postgres.test.fail', error })
      const err = error as { code?: string; message?: string }
      return {
        ok: false,
        errorCode: err.code,
        errorMessage: err.message ?? 'unknown error'
      }
    } finally {
      if (client) {
        try {
          await client.end()
        } catch {
          /* ignore */
        }
      }
    }
  }

  async connect(input: ResolvedDbCredential): Promise<unknown> {
    const driver = await loadDriver()
    const config = buildConfig(input)
    logger.info('postgres connect start', {
      event: 'db.postgres.connect.start',
      config: describeConfigForLog(config),
      pgOptionsEnv: process.env.PGOPTIONS ? 'SET' : 'UNSET'
    })
    const client = new driver.Client(config)
    await client.connect()
    return client
  }

  async disconnect(handle: unknown): Promise<void> {
    const client = handle as PgClient | null
    if (!client) return
    await client.end()
  }

  async listDatabases(handle: unknown): Promise<string[]> {
    const client = handle as PgClient
    try {
      const res = await client.query<{ datname: string }>('SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname')
      const names = res.rows.map((r) => r.datname)
      logger.info('postgres listDatabases ok', {
        event: 'db.postgres.listDatabases.ok',
        rowCount: names.length,
        sample: names.slice(0, 5)
      })
      return names
    } catch (error) {
      logger.error('postgres listDatabases failed', { event: 'db.postgres.listDatabases.fail', error })
      throw error
    }
  }

  async listTables(handle: unknown, databaseName: string, schemaName?: string): Promise<string[]> {
    const client = handle as PgClient
    void databaseName
    const schema = schemaName ?? 'public'
    try {
      const res = await client.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name",
        [schema]
      )
      const names = res.rows.map((r) => r.table_name)
      logger.info('postgres listTables ok', {
        event: 'db.postgres.listTables.ok',
        databaseName,
        schemaName: schema,
        rowCount: names.length,
        sample: names.slice(0, 5)
      })
      return names
    } catch (error) {
      logger.error('postgres listTables failed', {
        event: 'db.postgres.listTables.fail',
        databaseName,
        schemaName: schema,
        error
      })
      throw error
    }
  }

  /**
   * Enumerate schemas visible on the current connection. Filters out
   * pg_toast and any temporary schemas (pg_toast_temp_*, pg_temp_*),
   * which are implementation details users never interact with. Returns
   * schemas sorted alphabetically with an isSystem flag so the renderer
   * can style or group them.
   */
  async listSchemas(handle: unknown, databaseName: string): Promise<DbSchemaInfo[]> {
    const client = handle as PgClient
    void databaseName
    try {
      const res = await client.query<{ schema_name: string }>(
        'SELECT schema_name FROM information_schema.schemata ' +
          "WHERE schema_name NOT LIKE 'pg_toast%' AND schema_name NOT LIKE 'pg_temp_%' " +
          'ORDER BY schema_name'
      )
      const schemas: DbSchemaInfo[] = res.rows.map((r) => ({
        name: r.schema_name,
        isSystem: r.schema_name === 'pg_catalog' || r.schema_name === 'information_schema' || r.schema_name.startsWith('pg_')
      }))
      logger.info('postgres listSchemas ok', {
        event: 'db.postgres.listSchemas.ok',
        databaseName,
        rowCount: schemas.length,
        sample: schemas.slice(0, 5).map((s) => s.name)
      })
      return schemas
    } catch (error) {
      logger.error('postgres listSchemas failed', { event: 'db.postgres.listSchemas.fail', databaseName, error })
      throw error
    }
  }

  /**
   * Enumerate schema-scoped objects by kind. Tables and views come from
   * information_schema; functions and procedures come from pg_proc
   * (prokind distinguishes 'f' functions, 'p' procedures, 'a' aggregates,
   * 'w' window). Aggregates and window functions are excluded.
   */
  async listObjects(handle: unknown, databaseName: string, schemaName: string, kind: DbObjectKind): Promise<string[]> {
    const client = handle as PgClient
    void databaseName
    try {
      let sql: string
      let params: unknown[]
      switch (kind) {
        case 'tables':
          sql = "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name"
          params = [schemaName]
          break
        case 'views':
          sql = 'SELECT table_name AS name FROM information_schema.views WHERE table_schema = $1 ORDER BY table_name'
          params = [schemaName]
          break
        case 'functions':
          sql =
            'SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace ' +
            "WHERE n.nspname = $1 AND p.prokind = 'f' ORDER BY p.proname"
          params = [schemaName]
          break
        case 'procedures':
          sql =
            'SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace ' +
            "WHERE n.nspname = $1 AND p.prokind = 'p' ORDER BY p.proname"
          params = [schemaName]
          break
        default:
          return []
      }
      const res = await client.query<{ name: string }>(sql, params)
      const names = res.rows.map((r) => r.name).filter(Boolean)
      logger.info('postgres listObjects ok', {
        event: 'db.postgres.listObjects.ok',
        databaseName,
        schemaName,
        kind,
        rowCount: names.length,
        sample: names.slice(0, 5)
      })
      return names
    } catch (error) {
      logger.error('postgres listObjects failed', {
        event: 'db.postgres.listObjects.fail',
        databaseName,
        schemaName,
        kind,
        error
      })
      throw error
    }
  }

  async listColumns(handle: unknown, databaseName: string, tableName: string, schemaName?: string): Promise<string[]> {
    const client = handle as PgClient
    void databaseName
    const schema = schemaName ?? 'public'
    try {
      const res = await client.query<{ column_name: string }>(
        'SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position',
        [schema, tableName]
      )
      const names = res.rows.map((r) => r.column_name)
      logger.info('postgres listColumns ok', {
        event: 'db.postgres.listColumns.ok',
        databaseName,
        schemaName: schema,
        tableName,
        rowCount: names.length
      })
      return names
    } catch (error) {
      logger.error('postgres listColumns failed', {
        event: 'db.postgres.listColumns.fail',
        databaseName,
        schemaName: schema,
        tableName,
        error
      })
      throw error
    }
  }

  /**
   * Wrap identifier in double quotes, escaping embedded double quotes by
   * doubling them. Callers MUST still validate names against a whitelist.
   */
  quoteIdentifier(name: string): string {
    return '"' + String(name).replace(/"/g, '""') + '"'
  }

  /**
   * Postgres uses numbered positional placeholders: $1, $2, ...
   */
  placeholder(index1Based: number): string {
    return '$' + String(index1Based)
  }

  /**
   * Detect primary-key column names from pg_index/pg_attribute. The
   * databaseName argument is unused because pg connections are scoped to
   * one database; schemaName is used to build the regclass qualifier so
   * non-public schemas are supported. If schemaName is omitted, the
   * server's search_path resolves the bare table name.
   */
  async detectPrimaryKey(handle: unknown, databaseName: string, tableName: string, schemaName?: string): Promise<string[] | null> {
    void databaseName
    const client = handle as PgClient
    // Quote identifiers before concatenating into the regclass cast so that
    // mixed-case or reserved-word schema/table names resolve correctly.
    const qt = this.quoteIdentifier.bind(this)
    const qualified = schemaName ? `${qt(schemaName)}.${qt(tableName)}` : qt(tableName)
    const sql =
      'SELECT a.attname AS column_name, a.attnum AS attnum ' +
      'FROM pg_index i ' +
      'JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) ' +
      'WHERE i.indrelid = $1::regclass AND i.indisprimary ' +
      'ORDER BY array_position(i.indkey, a.attnum)'
    try {
      const res = await client.query<{ column_name: string; attnum: number }>(sql, [qualified])
      const rows = res.rows ?? []
      if (rows.length === 0) return null
      return rows.map((r) => r.column_name).filter(Boolean)
    } catch {
      // regclass cast fails when the relation does not exist.
      return null
    }
  }

  async beginTransaction(handle: unknown): Promise<void> {
    const client = handle as PgClient
    await client.query('BEGIN')
  }

  async commitTransaction(handle: unknown): Promise<void> {
    const client = handle as PgClient
    await client.query('COMMIT')
  }

  async rollbackTransaction(handle: unknown): Promise<void> {
    const client = handle as PgClient
    await client.query('ROLLBACK')
  }

  async executeQuery(handle: unknown, sql: string, params: unknown[] = []): Promise<QueryResult> {
    const client = handle as PgClient
    const start = Date.now()
    const res = await client.query<Record<string, unknown>>(sql, params)
    const durationMs = Date.now() - start
    const rows = res.rows ?? []
    const columns = Array.isArray(res.fields) && res.fields.length > 0 ? res.fields.map((f) => f.name) : Object.keys(rows[0] ?? {})
    return { columns, rows, rowCount: rows.length, durationMs }
  }
}

/**
 * Typed error produced when a DDL fetch fails. `code` carries a coarse
 * category the IPC layer can forward to the renderer without leaking
 * the underlying driver error text.
 */
export type TableDdlError = Error & { code?: 'permission' | 'other' }

function isPermissionError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  if (!e) return false
  // SQLSTATE 42501: insufficient privilege.
  if (e.code === '42501') return true
  const msg = String(e.message ?? '').toLowerCase()
  return msg.includes('permission denied') || msg.includes('must be owner') || msg.includes('must be superuser')
}

/**
 * Retrieve the CREATE TABLE DDL for a Postgres table by delegating to the
 * helper PL/pgSQL function `pg_get_tabledef`. Lazy-installs the helper type
 * and function into `public` only when missing — checked via `to_regtype`
 * and `to_regprocedure`. If a prior install landed the TYPE outside `public`
 * and the probe returns NULL for `public.tabledefs`, `DROP TYPE IF EXISTS`
 * during reinstall clears the conflict.
 *
 * `schemaName` and `tableName` are bound as parameters to the SELECT to avoid
 * SQL injection. `SET search_path` targets the requested schema so the helper
 * resolves unqualified references there first.
 *
 * Permission failures during install surface as `code = 'permission'`.
 */
export async function fetchPostgresTableDdl(handle: unknown, databaseName: string, schemaName: string, tableName: string): Promise<string> {
  const client = handle as PgClient
  void databaseName
  const safeSchema = String(schemaName).replace(/"/g, '""')

  const probe = await client.query<{ has_type: boolean; has_fn: boolean }>(
    "SELECT to_regtype('public.tabledefs') IS NOT NULL AS has_type, " +
      "to_regprocedure('public.pg_get_tabledef(varchar,varchar,boolean,tabledefs)') IS NOT NULL AS has_fn"
  )
  const installed = !!probe.rows?.[0]?.has_type && !!probe.rows?.[0]?.has_fn
  if (!installed) {
    try {
      await client.query('DROP TYPE IF EXISTS public.tabledefs CASCADE')
      await client.query(PG_TABLE_DEF_FUNCTION_SQL)
    } catch (installError) {
      if (isPermissionError(installError)) {
        const err: TableDdlError = new Error('insufficient privilege to install pg_get_tabledef helper on this database') as TableDdlError
        err.code = 'permission'
        logger.error('postgres fetchTableDdl install denied', {
          event: 'db.postgres.fetchTableDdl.install.denied',
          hasSchema: !!schemaName,
          tableLen: tableName.length
        })
        throw err
      }
      logger.error('postgres fetchTableDdl install failed', {
        event: 'db.postgres.fetchTableDdl.install.fail',
        hasSchema: !!schemaName,
        tableLen: tableName.length,
        sqlState: (installError as { code?: string })?.code
      })
      throw installError
    }
  }

  await client.query(`SET search_path = "${safeSchema}", public`)

  // Schema-qualify with `public.` so we never resolve to a stale overload
  // living in another schema on the search_path.
  try {
    const res = await client.query<{ ddl: string }>("SELECT public.pg_get_tabledef($1::varchar, $2::varchar, false, 'COMMENTS'::tabledefs) AS ddl", [
      schemaName,
      tableName
    ])
    const ddl = res.rows?.[0]?.ddl
    return typeof ddl === 'string' ? ddl : ''
  } catch (error) {
    logger.error('postgres fetchTableDdl failed', {
      event: 'db.postgres.fetchTableDdl.fail',
      hasSchema: !!schemaName,
      tableLen: tableName.length,
      sqlState: (error as { code?: string })?.code
    })
    throw error
  }
}
