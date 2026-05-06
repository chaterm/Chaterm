//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import type { ConnectionTestResult, DatabaseDriverAdapter, QueryResult, ResolvedDbCredential } from '../types'

const logger = createLogger('db')

type MySqlConnection = {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<[T, unknown]>
  end(): Promise<void>
}

type MySqlDriver = {
  createConnection(config: Record<string, unknown>): Promise<MySqlConnection>
}

async function loadDriver(): Promise<MySqlDriver> {
  const mod = await import('mysql2/promise')
  return mod as unknown as MySqlDriver
}

function buildConfig(input: ResolvedDbCredential): Record<string, unknown> {
  const config: Record<string, unknown> = {
    host: input.host,
    port: input.port,
    user: input.username ?? undefined,
    password: input.password ?? undefined,
    database: input.database ?? undefined,
    connectTimeout: 10000
  }
  if (input.sslMode && input.sslMode !== 'disable') {
    config.ssl = { rejectUnauthorized: false }
  }
  return config
}

export class MysqlDriverAdapter implements DatabaseDriverAdapter {
  async testConnection(input: ResolvedDbCredential): Promise<ConnectionTestResult> {
    const start = Date.now()
    let conn: MySqlConnection | null = null
    try {
      const driver = await loadDriver()
      conn = await driver.createConnection(buildConfig(input))
      const [rows] = await conn.query<Array<{ v: string }>>('SELECT VERSION() as v')
      const version = Array.isArray(rows) && rows.length > 0 ? rows[0]?.v : undefined
      const latencyMs = Date.now() - start
      return { ok: true, serverVersion: version, latencyMs }
    } catch (error) {
      logger.error('mysql testConnection failed', { event: 'db.mysql.test.fail', error })
      const err = error as { code?: string; message?: string }
      return {
        ok: false,
        errorCode: err.code,
        errorMessage: err.message ?? 'unknown error'
      }
    } finally {
      if (conn) {
        try {
          await conn.end()
        } catch {
          /* ignore */
        }
      }
    }
  }

  async connect(input: ResolvedDbCredential): Promise<unknown> {
    const driver = await loadDriver()
    return driver.createConnection(buildConfig(input))
  }

  async disconnect(handle: unknown): Promise<void> {
    const conn = handle as MySqlConnection | null
    if (!conn) return
    await conn.end()
  }

  async listDatabases(handle: unknown): Promise<string[]> {
    const conn = handle as MySqlConnection
    const [rows] = await conn.query<Array<Record<string, string>>>('SHOW DATABASES')
    if (!Array.isArray(rows)) return []
    return rows.map((r) => Object.values(r)[0] as string).filter(Boolean)
  }

  async listTables(handle: unknown, databaseName: string): Promise<string[]> {
    const conn = handle as MySqlConnection
    const [rows] = await conn.query<Array<Record<string, string>>>(`SHOW TABLES FROM \`${databaseName.replace(/`/g, '')}\``)
    if (!Array.isArray(rows)) return []
    return rows.map((r) => Object.values(r)[0] as string).filter(Boolean)
  }

  async listColumns(handle: unknown, databaseName: string, tableName: string): Promise<string[]> {
    const conn = handle as MySqlConnection
    const [rows] = await conn.query<Array<{ Field: string }>>(
      `SHOW COLUMNS FROM \`${databaseName.replace(/`/g, '')}\`.\`${tableName.replace(/`/g, '')}\``
    )
    if (!Array.isArray(rows)) return []
    return rows.map((r) => r.Field).filter(Boolean)
  }

  /**
   * Wrap identifier in backticks, escaping embedded backticks by doubling them.
   * MySQL-safe; rejects nothing by itself, so callers MUST still validate
   * names against a whitelist regex before passing them in.
   */
  quoteIdentifier(name: string): string {
    return '`' + String(name).replace(/`/g, '``') + '`'
  }

  /**
   * MySQL uses unnamed positional parameters; the index is irrelevant.
   */
  placeholder(_index1Based: number): string {
    void _index1Based
    return '?'
  }

  /**
   * Resolve the primary-key column order from INFORMATION_SCHEMA. Returns
   * null when the table has no primary key.
   */
  async detectPrimaryKey(handle: unknown, databaseName: string, tableName: string): Promise<string[] | null> {
    const conn = handle as MySqlConnection
    const sql =
      'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE ' +
      'WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? ' +
      'ORDER BY ORDINAL_POSITION'
    const [rows] = (await conn.query(sql, [databaseName, tableName, 'PRIMARY'])) as [Array<{ COLUMN_NAME?: string; column_name?: string }>, unknown]
    if (!Array.isArray(rows) || rows.length === 0) return null
    const cols = rows.map((r) => r.COLUMN_NAME ?? r.column_name ?? '').filter((s) => s.length > 0)
    return cols.length > 0 ? cols : null
  }

  async beginTransaction(handle: unknown): Promise<void> {
    const conn = handle as MySqlConnection
    await conn.query('BEGIN')
  }

  async commitTransaction(handle: unknown): Promise<void> {
    const conn = handle as MySqlConnection
    await conn.query('COMMIT')
  }

  async rollbackTransaction(handle: unknown): Promise<void> {
    const conn = handle as MySqlConnection
    await conn.query('ROLLBACK')
  }

  async executeQuery(handle: unknown, sql: string, params: unknown[] = []): Promise<QueryResult> {
    const conn = handle as MySqlConnection
    const start = Date.now()
    const [rows, fields] =
      params.length === 0
        ? ((await conn.query(sql)) as [Array<Record<string, unknown>>, Array<{ name: string }>])
        : ((await conn.query(sql, params)) as [Array<Record<string, unknown>>, Array<{ name: string }>])
    const durationMs = Date.now() - start
    if (!Array.isArray(rows)) {
      return { columns: [], rows: [], rowCount: 0, durationMs }
    }
    const columns = Array.isArray(fields) && fields.length > 0 ? fields.map((f) => f.name) : Object.keys(rows[0] ?? {})
    return { columns, rows, rowCount: rows.length, durationMs }
  }
}

/**
 * Typed error produced when a MySQL DDL fetch fails. Mirrors the shape
 * of the Postgres variant so the IPC layer can treat both alike.
 */
export type MysqlTableDdlError = Error & { code?: 'permission' | 'other' }

function isMysqlPermissionError(err: unknown): boolean {
  const e = err as { code?: string; errno?: number; message?: string } | null
  if (!e) return false
  // MySQL error numbers: 1142 table access denied, 1227 access denied.
  if (e.errno === 1142 || e.errno === 1227) return true
  const code = String(e.code ?? '')
  if (code === 'ER_TABLEACCESS_DENIED_ERROR' || code === 'ER_SPECIFIC_ACCESS_DENIED_ERROR') return true
  const msg = String(e.message ?? '').toLowerCase()
  return msg.includes('access denied')
}

/**
 * Retrieve the CREATE TABLE DDL for a MySQL table via `SHOW CREATE TABLE`.
 * Returns the second column of the first row (the server's canonical DDL
 * rendering). A permission failure surfaces as `code = 'permission'` so the
 * IPC layer can return a friendly message without leaking driver text.
 */
export async function fetchMysqlTableDdl(handle: unknown, databaseName: string, tableName: string): Promise<string> {
  const conn = handle as MySqlConnection
  const safeDb = String(databaseName).replace(/`/g, '')
  const safeTable = String(tableName).replace(/`/g, '')
  try {
    await conn.query(`USE \`${safeDb}\``)
    const [rows] = (await conn.query(`SHOW CREATE TABLE \`${safeTable}\``)) as [Array<Record<string, unknown>>, unknown]
    if (!Array.isArray(rows) || rows.length === 0) return ''
    const row = rows[0] as Record<string, unknown>
    // MySQL returns {Table, Create Table}; driver modes vary on key casing.
    const values = Object.values(row)
    const ddl = typeof values[1] === 'string' ? (values[1] as string) : ''
    return ddl
  } catch (error) {
    if (isMysqlPermissionError(error)) {
      const err: MysqlTableDdlError = new Error('insufficient privilege to read table definition') as MysqlTableDdlError
      err.code = 'permission'
      logger.error('mysql fetchTableDdl denied', {
        event: 'db.mysql.fetchTableDdl.denied',
        hasDatabase: !!databaseName,
        tableLen: tableName.length
      })
      throw err
    }
    logger.error('mysql fetchTableDdl failed', {
      event: 'db.mysql.fetchTableDdl.fail',
      hasDatabase: !!databaseName,
      tableLen: tableName.length,
      mysqlCode: (error as { code?: string })?.code,
      errno: (error as { errno?: number })?.errno
    })
    throw error
  }
}
