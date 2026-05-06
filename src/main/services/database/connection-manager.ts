//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import { randomUUID } from 'crypto'
import type { DbAssetRecord, DbAssetType } from '../../storage/db/chaterm/db-assets'
import type {
  ConnectionTestResult,
  DatabaseDriverAdapter,
  DbObjectKind,
  DbSchemaInfo,
  MutationBatchResult,
  MutationStatement,
  QueryResult,
  ResolvedDbCredential,
  RuntimeDbConnection
} from './types'

const logger = createLogger('db')

export interface CredentialResolver {
  decryptSecret(cipher: string): Promise<string>
}

export interface StatusUpdater {
  updateDbAssetStatus(
    id: string,
    patch: {
      status?: 'idle' | 'testing' | 'connected' | 'failed'
      last_connected_at?: string | null
      last_tested_at?: string | null
      last_error_code?: string | null
      last_error_message?: string | null
    }
  ): void
}

export interface ConnectionManagerOptions {
  adapters: Record<DbAssetType, DatabaseDriverAdapter>
  credentialResolver: CredentialResolver
  statusUpdater: StatusUpdater
}

function nowIso(): string {
  return new Date().toISOString()
}

async function resolveCredential(asset: DbAssetRecord, resolver: CredentialResolver): Promise<ResolvedDbCredential> {
  const password = asset.password_ciphertext ? await resolver.decryptSecret(asset.password_ciphertext) : null
  return {
    dbType: asset.db_type,
    host: asset.host,
    port: asset.port,
    username: asset.username,
    password,
    database: asset.database_name,
    sslMode: asset.ssl_mode
  }
}

export class ConnectionManager {
  private readonly sessions = new Map<string, RuntimeDbConnection>()

  constructor(private readonly opts: ConnectionManagerOptions) {}

  private adapterFor(dbType: DbAssetType): DatabaseDriverAdapter {
    const adapter = this.opts.adapters[dbType]
    if (!adapter) throw new Error(`no adapter registered for ${dbType}`)
    return adapter
  }

  async testConnection(asset: DbAssetRecord): Promise<ConnectionTestResult> {
    this.opts.statusUpdater.updateDbAssetStatus(asset.id, { status: 'testing', last_tested_at: nowIso() })
    try {
      const credential = await resolveCredential(asset, this.opts.credentialResolver)
      const adapter = this.adapterFor(asset.db_type)
      const result = await adapter.testConnection(credential)
      this.opts.statusUpdater.updateDbAssetStatus(asset.id, {
        status: result.ok ? 'idle' : 'failed',
        last_tested_at: nowIso(),
        last_error_code: result.ok ? null : (result.errorCode ?? null),
        last_error_message: result.ok ? null : (result.errorMessage ?? null)
      })
      return result
    } catch (error) {
      logger.error('testConnection failed', { event: 'db.test.fail', assetId: asset.id, error })
      const err = error as { code?: string; message?: string }
      this.opts.statusUpdater.updateDbAssetStatus(asset.id, {
        status: 'failed',
        last_tested_at: nowIso(),
        last_error_code: err.code ?? 'E_UNKNOWN',
        last_error_message: err.message ?? 'unknown error'
      })
      return { ok: false, errorCode: err.code, errorMessage: err.message }
    }
  }

  async connect(asset: DbAssetRecord): Promise<RuntimeDbConnection> {
    const existing = this.sessions.get(asset.id)
    if (existing) return existing
    try {
      const credential = await resolveCredential(asset, this.opts.credentialResolver)
      const adapter = this.adapterFor(asset.db_type)
      const handle = await adapter.connect(credential)
      const session: RuntimeDbConnection = {
        assetId: asset.id,
        sessionId: randomUUID(),
        dbType: asset.db_type,
        handle,
        connectedAt: nowIso()
      }
      this.sessions.set(asset.id, session)
      this.opts.statusUpdater.updateDbAssetStatus(asset.id, {
        status: 'connected',
        last_connected_at: session.connectedAt,
        last_error_code: null,
        last_error_message: null
      })
      return session
    } catch (error) {
      logger.error('connect failed', { event: 'db.connect.fail', assetId: asset.id, error })
      const err = error as { code?: string; message?: string }
      this.opts.statusUpdater.updateDbAssetStatus(asset.id, {
        status: 'failed',
        last_error_code: err.code ?? 'E_UNKNOWN',
        last_error_message: err.message ?? 'unknown error'
      })
      throw error
    }
  }

  async disconnect(assetId: string): Promise<void> {
    const session = this.sessions.get(assetId)
    if (!session) return
    try {
      const adapter = this.adapterFor(session.dbType)
      await adapter.disconnect(session.handle)
    } catch (error) {
      logger.error('disconnect failed', { event: 'db.disconnect.fail', assetId, error })
    } finally {
      this.sessions.delete(assetId)
      this.opts.statusUpdater.updateDbAssetStatus(assetId, { status: 'idle' })
    }
  }

  isConnected(assetId: string): boolean {
    return this.sessions.has(assetId)
  }

  getSession(assetId: string): RuntimeDbConnection | null {
    return this.sessions.get(assetId) ?? null
  }

  async listDatabases(assetId: string): Promise<string[]> {
    const session = this.sessions.get(assetId)
    if (!session) throw new Error('not connected')
    const adapter = this.adapterFor(session.dbType)
    if (!adapter.listDatabases) return []
    return adapter.listDatabases(session.handle)
  }

  async listTables(assetId: string, databaseName: string, schemaName?: string): Promise<string[]> {
    const session = this.sessions.get(assetId)
    if (!session) throw new Error('not connected')
    const adapter = this.adapterFor(session.dbType)
    if (!adapter.listTables) return []
    return adapter.listTables(session.handle, databaseName, schemaName)
  }

  /**
   * List schemas for PG connections. MySQL adapters do not implement
   * listSchemas; returns [] so callers can branch on emptiness.
   */
  async listSchemas(assetId: string, databaseName: string): Promise<DbSchemaInfo[]> {
    const session = this.sessions.get(assetId)
    if (!session) throw new Error('not connected')
    const adapter = this.adapterFor(session.dbType)
    if (!adapter.listSchemas) return []
    return adapter.listSchemas(session.handle, databaseName)
  }

  async listObjects(assetId: string, databaseName: string, schemaName: string, kind: DbObjectKind): Promise<string[]> {
    const session = this.sessions.get(assetId)
    if (!session) throw new Error('not connected')
    const adapter = this.adapterFor(session.dbType)
    if (!adapter.listObjects) return []
    return adapter.listObjects(session.handle, databaseName, schemaName, kind)
  }

  async listColumns(assetId: string, databaseName: string, tableName: string, schemaName?: string): Promise<string[]> {
    const session = this.sessions.get(assetId)
    if (!session) throw new Error('not connected')
    const adapter = this.adapterFor(session.dbType)
    if (!adapter.listColumns) return []
    return adapter.listColumns(session.handle, databaseName, tableName, schemaName)
  }

  async executeQuery(assetId: string, sql: string, params: unknown[] = []): Promise<QueryResult> {
    const session = this.sessions.get(assetId)
    if (!session) throw new Error('not connected')
    const adapter = this.adapterFor(session.dbType)
    if (!adapter.executeQuery) throw new Error(`${session.dbType} adapter does not support executeQuery`)
    return adapter.executeQuery(session.handle, sql, params)
  }

  /**
   * Ask the adapter for the primary-key columns of a table. Returns null
   * when the table has no PK or when the adapter does not support detection.
   * schemaName is PG-only; MySQL adapters ignore it.
   */
  async detectPrimaryKey(assetId: string, databaseName: string, tableName: string, schemaName?: string): Promise<string[] | null> {
    const session = this.sessions.get(assetId)
    if (!session) throw new Error('not connected')
    const adapter = this.adapterFor(session.dbType)
    if (!adapter.detectPrimaryKey) return null
    return adapter.detectPrimaryKey(session.handle, databaseName, tableName, schemaName)
  }

  /**
   * Run a batch of mutation statements inside an explicit transaction.
   * Either commits and returns per-statement affected counts, or rolls
   * back and returns ok=false with the error message.
   */
  async executeMutations(assetId: string, statements: MutationStatement[]): Promise<MutationBatchResult> {
    const session = this.sessions.get(assetId)
    if (!session) throw new Error('not connected')
    const adapter = this.adapterFor(session.dbType)
    if (!adapter.beginTransaction || !adapter.commitTransaction || !adapter.rollbackTransaction || !adapter.executeQuery) {
      return { ok: false, errorMessage: `${session.dbType} adapter does not support mutations`, durationMs: 0 }
    }
    const start = Date.now()
    try {
      await adapter.beginTransaction(session.handle)
    } catch (error) {
      return {
        ok: false,
        errorMessage: (error as Error)?.message ?? 'failed to begin transaction',
        durationMs: Date.now() - start
      }
    }
    const affected: number[] = []
    try {
      for (const stmt of statements) {
        const result = await adapter.executeQuery(session.handle, stmt.sql, stmt.params)
        // executeQuery is modeled around SELECT; for INSERT/UPDATE/DELETE
        // most drivers return rowCount=0 rows. We defensively fall back to 0.
        affected.push(typeof result.rowCount === 'number' ? result.rowCount : 0)
      }
      await adapter.commitTransaction(session.handle)
      return { ok: true, affected, durationMs: Date.now() - start }
    } catch (error) {
      try {
        await adapter.rollbackTransaction(session.handle)
      } catch (rollbackError) {
        logger.error('rollback after mutation failure failed', {
          event: 'db.mutation.rollback.fail',
          assetId,
          stmtCount: statements.length
        })
        void rollbackError
      }
      return {
        ok: false,
        errorMessage: (error as Error)?.message ?? 'unknown mutation error',
        durationMs: Date.now() - start
      }
    }
  }

  async shutdown(): Promise<void> {
    const ids = Array.from(this.sessions.keys())
    await Promise.all(ids.map((id) => this.disconnect(id)))
  }
}
