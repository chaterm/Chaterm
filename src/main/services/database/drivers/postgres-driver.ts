//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import type { ConnectionTestResult, DatabaseDriverAdapter, QueryResult, ResolvedDbCredential } from '../types'

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
  const config: Record<string, unknown> = {
    host: input.host,
    port: input.port,
    user: input.username ?? undefined,
    password: input.password ?? undefined,
    database: input.database ?? undefined,
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000
  }
  if (input.sslMode && input.sslMode !== 'disable') {
    config.ssl = { rejectUnauthorized: false }
  }
  return config
}

export class PostgresDriverAdapter implements DatabaseDriverAdapter {
  async testConnection(input: ResolvedDbCredential): Promise<ConnectionTestResult> {
    const start = Date.now()
    let client: PgClient | null = null
    try {
      const driver = await loadDriver()
      client = new driver.Client(buildConfig(input))
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
    const client = new driver.Client(buildConfig(input))
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
    const res = await client.query<{ datname: string }>('SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname')
    return res.rows.map((r) => r.datname)
  }

  async listTables(handle: unknown, databaseName: string): Promise<string[]> {
    const client = handle as PgClient
    void databaseName
    const res = await client.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    )
    return res.rows.map((r) => r.table_name)
  }

  async listColumns(handle: unknown, databaseName: string, tableName: string): Promise<string[]> {
    const client = handle as PgClient
    void databaseName
    const res = await client.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
      [tableName]
    )
    return res.rows.map((r) => r.column_name)
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
   * one database; we match on current schema by default.
   */
  async detectPrimaryKey(handle: unknown, databaseName: string, tableName: string): Promise<string[] | null> {
    void databaseName
    const client = handle as PgClient
    const sql =
      'SELECT a.attname AS column_name, a.attnum AS attnum ' +
      'FROM pg_index i ' +
      'JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) ' +
      'WHERE i.indrelid = $1::regclass AND i.indisprimary ' +
      'ORDER BY array_position(i.indkey, a.attnum)'
    try {
      const res = await client.query<{ column_name: string; attnum: number }>(sql, [tableName])
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
