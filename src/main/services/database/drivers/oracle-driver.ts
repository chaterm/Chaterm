//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import type { ConnectionTestResult, DatabaseDriverAdapter, DbObjectKind, DbSchemaInfo, QueryResult, ResolvedDbCredential } from '../types'
import type * as OracleDb from 'oracledb'

const logger = createLogger('db')

const DEFAULT_ORACLE_PORT = 1521
const DEFAULT_CALL_TIMEOUT_MS = 30_000
const ORACLE_DRIVER_NAME = 'Chaterm'

const SYSTEM_SCHEMAS = new Set([
  'SYS',
  'SYSTEM',
  'XDB',
  'CTXSYS',
  'MDSYS',
  'ORDSYS',
  'OUTLN',
  'DBSNMP',
  'AUDSYS',
  'GSMADMIN_INTERNAL',
  'OJVMSYS',
  'WMSYS',
  'LBACSYS',
  'DVSYS',
  'DVF'
])

type OracleDriver = typeof OracleDb

type OracleConnection = OracleDb.Connection

interface OracleClientInitArgs {
  libDir?: string
  configDir?: string
}

let oracleClientInitArgs: OracleClientInitArgs | null = null

interface OracleHandle {
  connection: OracleConnection
  serviceName: string | null
  defaultSchema: string | null
}

interface OracleRow {
  [key: string]: unknown
}

async function loadDriver(): Promise<OracleDriver> {
  const mod = await import('oracledb')
  const driver = ((mod as unknown as { default?: OracleDriver }).default ?? mod) as OracleDriver
  driver.fetchAsString = [driver.CLOB, driver.NCLOB]
  driver.fetchAsBuffer = [driver.BLOB]
  return driver
}

function stringOption(options: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = options?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberOption(options: Record<string, unknown> | null | undefined, key: string): number | null {
  const value = options?.[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function sameOracleClientInitArgs(a: OracleClientInitArgs, b: OracleClientInitArgs): boolean {
  return a.libDir === b.libDir && a.configDir === b.configDir
}

function ensureOracleClientInitialized(driver: OracleDriver, args: OracleClientInitArgs): void {
  if (oracleClientInitArgs) {
    if (!sameOracleClientInitArgs(oracleClientInitArgs, args)) {
      throw new Error('Oracle thick client already initialized with different client library settings')
    }
    return
  }
  driver.initOracleClient({ ...args, driverName: ORACLE_DRIVER_NAME })
  oracleClientInitArgs = { ...args }
}

function normalizeConnectString(raw: string): string {
  const value = raw.trim()
  if (value.startsWith('jdbc:oracle:thin:@//')) return value.slice('jdbc:oracle:thin:@//'.length)
  if (value.startsWith('jdbc:oracle:thin:@')) return value.slice('jdbc:oracle:thin:@'.length)
  if (value.startsWith('oracle://')) return value.slice('oracle://'.length)
  if (value.startsWith('//')) return value.slice(2)
  return value
}

function buildConnectString(input: ResolvedDbCredential): string {
  const configured = stringOption(input.options, 'connectString') ?? input.jdbcUrl?.trim()
  if (configured) return normalizeConnectString(configured)

  const host = input.host?.trim()
  if (!host) throw new Error('Oracle host or connect string is required')
  const port = Number.isFinite(input.port) && Number(input.port) > 0 ? Number(input.port) : DEFAULT_ORACLE_PORT
  const service = input.database?.trim()
  return service ? `${host}:${port}/${service}` : `${host}:${port}`
}

function callTimeoutOf(input: ResolvedDbCredential): number {
  const configured = numberOption(input.options, 'callTimeout') ?? numberOption(input.options, 'callTimeoutMs')
  if (configured && configured > 0) return Math.min(Math.floor(configured), 300_000)
  return DEFAULT_CALL_TIMEOUT_MS
}

function quoteOracleIdentifier(name: string): string {
  return '"' + String(name).replace(/"/g, '""') + '"'
}

function sanitizeSql(sql: string): string {
  const trimmed = String(sql ?? '').trim()
  if (/^(begin|declare)\b/i.test(trimmed)) return trimmed
  return trimmed.replace(/;+\s*$/, '')
}

function rowValue(row: OracleRow | undefined, key: string): unknown {
  if (!row) return undefined
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key]
  const upper = key.toUpperCase()
  if (Object.prototype.hasOwnProperty.call(row, upper)) return row[upper]
  const lower = key.toLowerCase()
  if (Object.prototype.hasOwnProperty.call(row, lower)) return row[lower]
  return Object.values(row)[0]
}

function normalizeRows(rows: unknown[] | undefined, columns: string[]): Array<Record<string, unknown>> {
  if (!Array.isArray(rows)) return []
  return rows.map((row) => {
    if (row && typeof row === 'object' && !Array.isArray(row)) return row as Record<string, unknown>
    if (Array.isArray(row)) {
      return Object.fromEntries(columns.map((column, index) => [column, row[index]]))
    }
    return { VALUE: row }
  })
}

function objectTypeFor(kind: DbObjectKind): string {
  switch (kind) {
    case 'tables':
      return 'TABLE'
    case 'views':
      return 'VIEW'
    case 'functions':
      return 'FUNCTION'
    case 'procedures':
      return 'PROCEDURE'
    default:
      return 'TABLE'
  }
}

function isPermissionError(error: unknown): boolean {
  const err = error as { errorNum?: number; code?: string; message?: string } | null
  const message = String(err?.message ?? '').toLowerCase()
  return err?.errorNum === 1031 || err?.code === 'ORA-01031' || message.includes('insufficient privilege') || message.includes('permission')
}

async function executeRows<T extends OracleRow = OracleRow>(
  connection: OracleConnection,
  driver: OracleDriver,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await connection.execute<T>(sanitizeSql(sql), params, { outFormat: driver.OUT_FORMAT_OBJECT })
  return Array.isArray(result.rows) ? (result.rows as T[]) : []
}

async function currentServiceName(connection: OracleConnection, driver: OracleDriver): Promise<string | null> {
  try {
    const rows = await executeRows(connection, driver, `SELECT SYS_CONTEXT('USERENV', 'SERVICE_NAME') AS "name" FROM dual`)
    const value = rowValue(rows[0], 'name')
    return typeof value === 'string' && value.trim() ? value.trim() : null
  } catch {
    return null
  }
}

async function currentSchemaName(connection: OracleConnection, driver: OracleDriver): Promise<string | null> {
  try {
    const rows = await executeRows(connection, driver, `SELECT SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA') AS "name" FROM dual`)
    const value = rowValue(rows[0], 'name')
    return typeof value === 'string' && value.trim() ? value.trim() : null
  } catch {
    return null
  }
}

async function applyCurrentSchema(connection: OracleConnection, schemaName: string | null | undefined): Promise<void> {
  const schema = schemaName?.trim()
  if (!schema) return
  await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${quoteOracleIdentifier(schema)}`)
}

async function createConnection(
  input: ResolvedDbCredential
): Promise<{ driver: OracleDriver; connection: OracleConnection; serviceName: string | null; schemaName: string | null }> {
  const driver = await loadDriver()
  const connectString = buildConnectString(input)

  const thickMode = stringOption(input.options, 'mode') === 'thick' || stringOption(input.options, 'driverMode') === 'thick'
  if (thickMode) {
    const libDir = stringOption(input.options, 'clientLibraryPath') ?? stringOption(input.options, 'libDir') ?? undefined
    const configDir = stringOption(input.options, 'configDir') ?? undefined
    ensureOracleClientInitialized(driver, { libDir, configDir })
  }

  const connection = await driver.getConnection({
    user: input.username ?? undefined,
    password: input.password ?? undefined,
    connectString,
    configDir: stringOption(input.options, 'configDir') ?? undefined,
    connectionIdPrefix: 'Chaterm'
  })
  connection.callTimeout = callTimeoutOf(input)
  await applyCurrentSchema(connection, input.schemaName)
  return {
    driver,
    connection,
    serviceName: (await currentServiceName(connection, driver)) ?? input.database ?? null,
    schemaName: (await currentSchemaName(connection, driver)) ?? input.schemaName ?? input.username ?? null
  }
}

export class OracleDriverAdapter implements DatabaseDriverAdapter {
  async testConnection(input: ResolvedDbCredential): Promise<ConnectionTestResult> {
    const start = Date.now()
    let connection: OracleConnection | null = null
    try {
      const { driver, connection: conn } = await createConnection(input)
      connection = conn
      let version: string | undefined
      try {
        const rows = await executeRows(conn, driver, `SELECT banner AS "version" FROM v$version WHERE ROWNUM = 1`)
        const value = rowValue(rows[0], 'version')
        if (typeof value === 'string') version = value
      } catch {
        const rows = await executeRows(conn, driver, `SELECT SYS_CONTEXT('USERENV', 'SERVICE_NAME') AS "version" FROM dual`)
        const value = rowValue(rows[0], 'version')
        if (typeof value === 'string') version = value
      }
      return { ok: true, serverVersion: version, latencyMs: Date.now() - start }
    } catch (error) {
      logger.error('oracle testConnection failed', {
        event: 'db.oracle.test.fail',
        errorCode: (error as { code?: string })?.code,
        errorNum: (error as { errorNum?: number })?.errorNum
      })
      const err = error as { code?: string; message?: string }
      return { ok: false, errorCode: err.code, errorMessage: err.message ?? 'unknown error' }
    } finally {
      if (connection) await connection.close().catch(() => undefined)
    }
  }

  async connect(input: ResolvedDbCredential): Promise<unknown> {
    const { connection, serviceName, schemaName } = await createConnection(input)
    return { connection, serviceName, defaultSchema: schemaName } satisfies OracleHandle
  }

  async disconnect(handle: unknown): Promise<void> {
    const conn = (handle as OracleHandle | null)?.connection
    if (!conn) return
    await conn.close()
  }

  async forceClose(handle: unknown): Promise<void> {
    const conn = (handle as OracleHandle | null)?.connection
    if (!conn) return
    try {
      if (typeof conn.break === 'function') await conn.break()
    } finally {
      await conn.close().catch(() => undefined)
    }
  }

  async listDatabases(handle: unknown): Promise<string[]> {
    const h = handle as OracleHandle
    const name = h.serviceName ?? h.defaultSchema ?? 'ORACLE'
    return [name]
  }

  async listSchemas(handle: unknown, databaseName: string): Promise<DbSchemaInfo[]> {
    void databaseName
    const driver = await loadDriver()
    const conn = (handle as OracleHandle).connection
    const rows = await executeRows(
      conn,
      driver,
      `
      SELECT DISTINCT owner AS "name"
      FROM all_objects
      WHERE object_type IN ('TABLE', 'VIEW', 'PROCEDURE', 'FUNCTION')
      ORDER BY owner
    `
    )
    return rows
      .map((row) => String(rowValue(row, 'name') ?? '').trim())
      .filter(Boolean)
      .map((name) => ({ name, isSystem: SYSTEM_SCHEMAS.has(name.toUpperCase()) }))
  }

  async listTables(handle: unknown, databaseName: string, schemaName?: string): Promise<string[]> {
    return this.listObjects(handle, databaseName, schemaName ?? (handle as OracleHandle).defaultSchema ?? '', 'tables')
  }

  async listObjects(handle: unknown, databaseName: string, schemaName: string, kind: DbObjectKind): Promise<string[]> {
    void databaseName
    const schema = schemaName?.trim() || (handle as OracleHandle).defaultSchema
    if (!schema) return []
    const driver = await loadDriver()
    const conn = (handle as OracleHandle).connection
    const objectType = objectTypeFor(kind)
    const rows = await executeRows(
      conn,
      driver,
      `
      SELECT object_name AS "name"
      FROM all_objects
      WHERE owner = :1 AND object_type = :2
      ORDER BY object_name
    `,
      [schema.toUpperCase(), objectType]
    )
    return rows.map((row) => String(rowValue(row, 'name') ?? '').trim()).filter(Boolean)
  }

  async listColumns(handle: unknown, databaseName: string, tableName: string, schemaName?: string): Promise<string[]> {
    void databaseName
    const schema = schemaName?.trim() || (handle as OracleHandle).defaultSchema
    if (!schema) return []
    const driver = await loadDriver()
    const conn = (handle as OracleHandle).connection
    const rows = await executeRows(
      conn,
      driver,
      `
      SELECT column_name AS "name"
      FROM all_tab_columns
      WHERE owner = :1 AND table_name = :2
      ORDER BY column_id
    `,
      [schema.toUpperCase(), tableName.toUpperCase()]
    )
    return rows.map((row) => String(rowValue(row, 'name') ?? '').trim()).filter(Boolean)
  }

  async executeQuery(handle: unknown, sql: string, params: unknown[] = []): Promise<QueryResult> {
    const driver = await loadDriver()
    const conn = (handle as OracleHandle).connection
    const start = Date.now()
    const result = await conn.execute<OracleRow>(sanitizeSql(sql), params, { outFormat: driver.OUT_FORMAT_OBJECT })
    const durationMs = Date.now() - start
    const columns = Array.isArray(result.metaData) && result.metaData.length > 0 ? result.metaData.map((m) => m.name ?? '').filter(Boolean) : []
    const rows = normalizeRows(result.rows as unknown[] | undefined, columns)
    const rowCount = rows.length > 0 ? rows.length : Number(result.rowsAffected ?? 0)
    return { columns, rows, rowCount, durationMs }
  }

  async detectPrimaryKey(handle: unknown, databaseName: string, tableName: string, schemaName?: string): Promise<string[] | null> {
    void databaseName
    const schema = schemaName?.trim() || (handle as OracleHandle).defaultSchema
    if (!schema) return null
    const driver = await loadDriver()
    const conn = (handle as OracleHandle).connection
    const rows = await executeRows(
      conn,
      driver,
      `
      SELECT cc.column_name AS "name"
      FROM all_constraints c
      JOIN all_cons_columns cc
        ON cc.owner = c.owner
       AND cc.constraint_name = c.constraint_name
       AND cc.table_name = c.table_name
      WHERE c.owner = :1
        AND c.table_name = :2
        AND c.constraint_type = 'P'
      ORDER BY cc.position
    `,
      [schema.toUpperCase(), tableName.toUpperCase()]
    )
    const cols = rows.map((row) => String(rowValue(row, 'name') ?? '').trim()).filter(Boolean)
    return cols.length > 0 ? cols : null
  }

  async beginTransaction(_handle: unknown): Promise<void> {
    void _handle
    // Oracle starts a transaction implicitly with the first DML statement.
  }

  async commitTransaction(handle: unknown): Promise<void> {
    await (handle as OracleHandle).connection.commit()
  }

  async rollbackTransaction(handle: unknown): Promise<void> {
    await (handle as OracleHandle).connection.rollback()
  }

  quoteIdentifier(name: string): string {
    return quoteOracleIdentifier(name)
  }

  placeholder(index1Based: number): string {
    return ':' + String(index1Based)
  }
}

export type OracleTableDdlError = Error & { code?: 'permission' | 'other' }

export async function fetchOracleTableDdl(handle: unknown, schemaName: string, tableName: string): Promise<string> {
  const driver = await loadDriver()
  const conn = (handle as OracleHandle).connection
  const schema = schemaName?.trim() || (handle as OracleHandle).defaultSchema
  if (!schema) throw new Error('schema is required to fetch Oracle table DDL')

  try {
    const typeRows = await executeRows(
      conn,
      driver,
      `
      SELECT object_type AS "type"
      FROM all_objects
      WHERE owner = :1
        AND object_name = :2
        AND object_type IN ('TABLE', 'VIEW')
      ORDER BY CASE object_type WHEN 'TABLE' THEN 0 ELSE 1 END
    `,
      [schema.toUpperCase(), tableName.toUpperCase()]
    )
    const objectType = String(rowValue(typeRows[0], 'type') ?? 'TABLE').toUpperCase() === 'VIEW' ? 'VIEW' : 'TABLE'
    const rows = await executeRows(conn, driver, `SELECT DBMS_METADATA.GET_DDL(:1, :2, :3) AS "ddl" FROM dual`, [
      objectType,
      tableName.toUpperCase(),
      schema.toUpperCase()
    ])
    const ddl = rowValue(rows[0], 'ddl')
    return typeof ddl === 'string' ? ddl : String(ddl ?? '')
  } catch (error) {
    if (isPermissionError(error)) {
      const err: OracleTableDdlError = new Error('insufficient privilege to read table definition') as OracleTableDdlError
      err.code = 'permission'
      logger.error('oracle fetchTableDdl denied', {
        event: 'db.oracle.fetchTableDdl.denied',
        hasSchema: !!schemaName,
        tableLen: tableName.length
      })
      throw err
    }
    logger.error('oracle fetchTableDdl failed', {
      event: 'db.oracle.fetchTableDdl.fail',
      hasSchema: !!schemaName,
      tableLen: tableName.length,
      errorCode: (error as { code?: string })?.code,
      errorNum: (error as { errorNum?: number })?.errorNum
    })
    throw error
  }
}

function resetOracleClientInitForTests(): void {
  oracleClientInitArgs = null
}

export const __testing = {
  buildConnectString,
  normalizeConnectString,
  sanitizeSql,
  quoteOracleIdentifier,
  ensureOracleClientInitialized,
  resetOracleClientInitForTests
}
