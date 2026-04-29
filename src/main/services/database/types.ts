//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import type { DbAssetType } from '../../storage/db/chaterm/db-assets'

export interface ResolvedDbCredential {
  dbType: DbAssetType
  host: string
  port: number
  username: string | null
  password: string | null
  database: string | null
  sslMode: string | null
  options?: Record<string, unknown> | null
}

export interface ConnectionTestResult {
  ok: boolean
  errorCode?: string
  errorMessage?: string
  serverVersion?: string
  latencyMs?: number
}

export interface RuntimeDbConnection {
  assetId: string
  sessionId: string
  dbType: DbAssetType
  /** Driver-specific connection handle. Never crosses the IPC boundary. */
  handle: unknown
  connectedAt: string
}

export interface DatabaseDriverAdapter {
  testConnection(input: ResolvedDbCredential): Promise<ConnectionTestResult>
  connect(input: ResolvedDbCredential): Promise<unknown>
  disconnect(handle: unknown): Promise<void>
  listDatabases?(handle: unknown): Promise<string[]>
  listTables?(handle: unknown, databaseName: string): Promise<string[]>
  listColumns?(handle: unknown, databaseName: string, tableName: string): Promise<string[]>
  executeQuery?(handle: unknown, sql: string, params?: unknown[]): Promise<QueryResult>
  /**
   * Detect the primary-key column(s) of a table. Returns the ordered column
   * names (by ordinal_position) or null when no primary key is defined.
   */
  detectPrimaryKey?(handle: unknown, databaseName: string, tableName: string): Promise<string[] | null>
  /** Begin a SQL transaction on the given handle. */
  beginTransaction?(handle: unknown): Promise<void>
  /** Commit the current SQL transaction on the given handle. */
  commitTransaction?(handle: unknown): Promise<void>
  /** Rollback the current SQL transaction on the given handle. */
  rollbackTransaction?(handle: unknown): Promise<void>
  /** Quote an identifier (schema/table/column) for safe SQL interpolation. */
  quoteIdentifier?(name: string): string
  /** Build a positional placeholder token for the given 1-based index. */
  placeholder?(index1Based: number): string
}

export interface QueryResult {
  columns: string[]
  rows: Array<Record<string, unknown>>
  rowCount: number
  durationMs: number
}

/**
 * A single parameterized SQL statement that mutates state. Always executed
 * inside an explicit transaction, never sent directly to the wire.
 */
export interface MutationStatement {
  sql: string
  params: unknown[]
}

/**
 * Aggregate result of a mutation batch. The batch is atomic: either all
 * statements commit (ok=true) or none do (ok=false with errorMessage).
 */
export interface MutationBatchResult {
  ok: boolean
  errorMessage?: string
  affected?: number[]
  durationMs: number
}

export interface DbTreeDatabase {
  name: string
}

export interface DbTreeTable {
  name: string
}
