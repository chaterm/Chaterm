//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import { Worker } from 'worker_threads'
import type { ConnectionTestResult, DatabaseDriverAdapter, QueryResult, ResolvedDbCredential } from '../types'

const logger = createLogger('db')

const SQLITE_TIMEOUT_MS = 5_000

interface SqliteWorkerResponse {
  id: number
  ok: boolean
  result?: unknown
  error?: { message?: string; code?: string }
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

interface SqliteDatabaseRow {
  name?: string
  file?: string
}

interface SqliteTableRow {
  name?: string
}

interface SqliteColumnRow {
  name?: string
  pk?: number
  hidden?: number
}

const SQLITE_WORKER_SOURCE = `
const { parentPort } = require('worker_threads')
let db = null

function callWithParams(stmt, params, mode) {
  if (!Array.isArray(params) || params.length === 0) {
    return stmt[mode]()
  }
  return stmt[mode](...params)
}

function executeQuery(sql, params) {
  if (!db) throw new Error('sqlite connection is not open')
  const startedAt = Date.now()
  const stmt = db.prepare(String(sql))
  if (stmt.reader) {
    const columns = stmt.columns().map((column) => column.name).filter(Boolean)
    const rows = callWithParams(stmt, params, 'all')
    return {
      columns: columns.length > 0 ? columns : Object.keys(rows[0] || {}),
      rows,
      rowCount: rows.length,
      durationMs: Date.now() - startedAt
    }
  }
  const info = callWithParams(stmt, params, 'run')
  return {
    columns: [],
    rows: [],
    rowCount: Number(info && typeof info.changes === 'number' ? info.changes : 0),
    durationMs: Date.now() - startedAt
  }
}

function closeDb() {
  if (db) {
    db.close()
    db = null
  }
}

parentPort.on('message', (message) => {
  const id = message && message.id
  const method = message && message.method
  const args = (message && message.args) || []
  Promise.resolve()
    .then(() => {
      if (method === 'open') {
        closeDb()
        const Database = require('better-sqlite3')
        const input = args[0] || {}
        db = new Database(input.filePath, {
          readonly: Boolean(input.readonly),
          fileMustExist: true,
          timeout: Number(input.timeoutMs || 5000)
        })
        return true
      }
      if (method === 'execute') {
        return executeQuery(args[0], args[1] || [])
      }
      if (method === 'close') {
        closeDb()
        return true
      }
      throw new Error('unknown sqlite worker method: ' + String(method))
    })
    .then((result) => parentPort.postMessage({ id, ok: true, result }))
    .catch((error) => {
      parentPort.postMessage({
        id,
        ok: false,
        error: {
          message: error && error.message ? String(error.message) : 'sqlite worker error',
          code: error && error.code ? String(error.code) : undefined
        }
      })
    })
})
`

class SqliteWorkerConnection {
  private worker: Worker
  private seq = 0
  private readonly pending = new Map<number, PendingRequest>()
  private closed = false

  constructor() {
    this.worker = new Worker(SQLITE_WORKER_SOURCE, { eval: true })
    this.worker.on('message', (response: SqliteWorkerResponse) => this.handleResponse(response))
    this.worker.on('error', (error) => this.rejectAll(error instanceof Error ? error : new Error(String(error))))
    this.worker.on('exit', (code) => {
      this.closed = true
      if (code !== 0) this.rejectAll(new Error(`sqlite worker exited with code ${code}`))
    })
  }

  request<T>(method: string, ...args: unknown[]): Promise<T> {
    if (this.closed) return Promise.reject(new Error('sqlite worker is closed'))
    const id = ++this.seq
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      this.worker.postMessage({ id, method, args })
    })
  }

  async open(input: { filePath: string; readonly: boolean; timeoutMs: number }): Promise<void> {
    await this.request<boolean>('open', input)
  }

  async close(): Promise<void> {
    if (this.closed) return
    try {
      await this.request<boolean>('close')
    } finally {
      this.closed = true
      await this.worker.terminate()
    }
  }

  async terminate(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.rejectAll(new Error('sqlite worker terminated'))
    await this.worker.terminate()
  }

  private handleResponse(response: SqliteWorkerResponse): void {
    const pending = this.pending.get(response.id)
    if (!pending) return
    this.pending.delete(response.id)
    if (response.ok) {
      pending.resolve(response.result)
      return
    }
    const err = new Error(response.error?.message ?? 'sqlite worker error') as Error & { code?: string }
    if (response.error?.code) err.code = response.error.code
    pending.reject(err)
  }

  private rejectAll(error: Error): void {
    for (const [, pending] of this.pending) pending.reject(error)
    this.pending.clear()
  }
}

function requireFilePath(input: ResolvedDbCredential): string {
  const filePath = input.filePath?.trim()
  if (!filePath) throw new Error('SQLite file path is required')
  return filePath
}

function readonlyOf(input: ResolvedDbCredential): boolean {
  return input.connectionMode === 'readonly'
}

function quoteSqliteIdentifier(name: string): string {
  return '"' + String(name).replace(/"/g, '""') + '"'
}

async function createWorkerConnection(input: ResolvedDbCredential): Promise<SqliteWorkerConnection> {
  const conn = new SqliteWorkerConnection()
  try {
    await conn.open({ filePath: requireFilePath(input), readonly: readonlyOf(input), timeoutMs: SQLITE_TIMEOUT_MS })
    return conn
  } catch (error) {
    await conn.terminate().catch(() => undefined)
    throw error
  }
}

export class SqliteDriverAdapter implements DatabaseDriverAdapter {
  async testConnection(input: ResolvedDbCredential): Promise<ConnectionTestResult> {
    const start = Date.now()
    let conn: SqliteWorkerConnection | null = null
    try {
      conn = await createWorkerConnection(input)
      const result = await conn.request<QueryResult>('execute', 'SELECT sqlite_version() AS version', [])
      const version = String(result.rows[0]?.version ?? '') || undefined
      return { ok: true, serverVersion: version, latencyMs: Date.now() - start }
    } catch (error) {
      logger.error('sqlite testConnection failed', { event: 'db.sqlite.test.fail', error })
      const err = error as { code?: string; message?: string }
      return { ok: false, errorCode: err.code, errorMessage: err.message ?? 'unknown error' }
    } finally {
      if (conn) await conn.close().catch(() => undefined)
    }
  }

  async connect(input: ResolvedDbCredential): Promise<unknown> {
    return createWorkerConnection(input)
  }

  async disconnect(handle: unknown): Promise<void> {
    const conn = handle as SqliteWorkerConnection | null
    if (!conn) return
    await conn.close()
  }

  async forceClose(handle: unknown): Promise<void> {
    const conn = handle as SqliteWorkerConnection | null
    if (!conn) return
    await conn.terminate()
  }

  async listDatabases(handle: unknown): Promise<string[]> {
    const conn = handle as SqliteWorkerConnection
    const result = await conn.request<QueryResult>('execute', 'PRAGMA database_list', [])
    return (result.rows as SqliteDatabaseRow[]).map((row) => row.name).filter((name): name is string => Boolean(name))
  }

  listSchemas(): Promise<[]> {
    return Promise.resolve([])
  }

  async listTables(handle: unknown, databaseName: string): Promise<string[]> {
    const conn = handle as SqliteWorkerConnection
    const schema = quoteSqliteIdentifier(databaseName || 'main')
    const sql = `SELECT name FROM ${schema}.sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    const result = await conn.request<QueryResult>('execute', sql, [])
    return (result.rows as SqliteTableRow[]).map((row) => row.name).filter((name): name is string => Boolean(name))
  }

  async listColumns(handle: unknown, databaseName: string, tableName: string): Promise<string[]> {
    const conn = handle as SqliteWorkerConnection
    const schema = quoteSqliteIdentifier(databaseName || 'main')
    const table = quoteSqliteIdentifier(tableName)
    const result = await conn.request<QueryResult>('execute', `PRAGMA ${schema}.table_xinfo(${table})`, [])
    return (result.rows as SqliteColumnRow[]).map((row) => row.name).filter((name): name is string => Boolean(name))
  }

  async executeQuery(handle: unknown, sql: string, params: unknown[] = []): Promise<QueryResult> {
    const conn = handle as SqliteWorkerConnection
    return conn.request<QueryResult>('execute', sql, params)
  }

  async detectPrimaryKey(handle: unknown, databaseName: string, tableName: string): Promise<string[] | null> {
    const conn = handle as SqliteWorkerConnection
    const schema = quoteSqliteIdentifier(databaseName || 'main')
    const table = quoteSqliteIdentifier(tableName)
    const result = await conn.request<QueryResult>('execute', `PRAGMA ${schema}.table_xinfo(${table})`, [])
    const cols = (result.rows as SqliteColumnRow[])
      .filter((row) => typeof row.name === 'string' && Number(row.pk ?? 0) > 0)
      .sort((a, b) => Number(a.pk ?? 0) - Number(b.pk ?? 0))
      .map((row) => row.name!)
    return cols.length > 0 ? cols : null
  }

  async beginTransaction(handle: unknown): Promise<void> {
    await this.executeQuery(handle, 'BEGIN')
  }

  async commitTransaction(handle: unknown): Promise<void> {
    await this.executeQuery(handle, 'COMMIT')
  }

  async rollbackTransaction(handle: unknown): Promise<void> {
    await this.executeQuery(handle, 'ROLLBACK')
  }

  quoteIdentifier(name: string): string {
    return quoteSqliteIdentifier(name)
  }

  placeholder(_index1Based: number): string {
    void _index1Based
    return '?'
  }
}

export async function fetchSqliteTableDdl(handle: unknown, databaseName: string, tableName: string): Promise<string> {
  const conn = handle as SqliteWorkerConnection
  const schema = quoteSqliteIdentifier(databaseName || 'main')
  const sql = `SELECT sql FROM ${schema}.sqlite_schema WHERE type IN ('table', 'view') AND name = ? ORDER BY type LIMIT 1`
  const result = await conn.request<QueryResult>('execute', sql, [tableName])
  const ddl = result.rows[0]?.sql
  return typeof ddl === 'string' ? ddl : ''
}

export const __testing = { quoteSqliteIdentifier, SqliteWorkerConnection }
