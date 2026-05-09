// DB-AI independent session facade. Creates a separate driver connection per
// DB-AI request or per database-workspace Task, so that any session-level
// state (USE database, SET search_path) set by DB-AI tools cannot leak into
// the UI-shared connection used by editor tabs. See docs/database_ai.md §7.3.
//
// Also owns the per-session metadata cache (§9.6.1): schemas / tables /
// columns with TTL-based freshness, inflight-promise deduplication, and
// opt-in refresh for the "first-miss re-fetch once" policy.
//
// Streaming cursor support (§10.2.1) is NOT implemented here — task #15
// owns that work. The Phase 1 skeleton only exposes the metadata helpers
// required by schema-context + SQL explain; DB tools (#16) build on top of
// the cache-aware list* methods introduced here.

import type { DbAssetType } from '../../storage/db/chaterm/db-assets'
import type { DatabaseDriverAdapter, QueryResult, ResolvedDbCredential } from '../database/types'
import { getConnectionManager, getCredentialStore } from '../database'
import { ChatermDatabaseService } from '../../storage/db/chaterm.service'
import { MysqlDriverAdapter, fetchMysqlTableDdl } from '../database/drivers/mysql-driver'
import { PostgresDriverAdapter, fetchPostgresTableDdl } from '../database/drivers/postgres-driver'
import { randomUUID } from 'crypto'
import type { BoundedQueryResult, ColumnInfo, DbAiActiveSession, DbAiSessionOwner, ExecuteQueryOptions, MetadataFetchOptions } from './types'
import { DbAiMetadataCache, TTL_DEFAULT_MS, type ColumnInfoCacheValue } from './metadata-cache'

const logger = createLogger('db-ai')

/**
 * Hard defaults + ceilings for bounded read queries. `maxRows` and `timeoutMs`
 * are the MVP safety rails: no DB tool caller may raise them past the
 * ceiling, and exceeding the deadline is a hard failure. Keep in sync with
 * docs/database_ai.md §10.2 (safety boundary table).
 */
const DEFAULT_MAX_ROWS = 200
const CEILING_MAX_ROWS = 1000
const DEFAULT_TIMEOUT_MS = 30_000
const CEILING_TIMEOUT_MS = 120_000

function clampMaxRows(maxRows: number | undefined): number {
  if (typeof maxRows !== 'number' || !Number.isFinite(maxRows) || maxRows <= 0) return DEFAULT_MAX_ROWS
  return Math.min(Math.floor(maxRows), CEILING_MAX_ROWS)
}

function clampTimeoutMs(timeoutMs: number | undefined): number {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return DEFAULT_TIMEOUT_MS
  return Math.min(Math.floor(timeoutMs), CEILING_TIMEOUT_MS)
}

/**
 * Run a promise with a client-side deadline. The returned promise rejects
 * with `E_QUERY_TIMEOUT` if the deadline fires first. The upstream promise
 * is NOT cancelled by Promise.race itself — but the optional `onTimeout`
 * callback is invoked before the rejection so callers can close the underlying
 * connection. Any exception thrown by `onTimeout` is swallowed to guarantee
 * that `reject(err)` always fires.
 */
function raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout?: () => void): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('query timeout') as Error & { code?: string }
      err.code = 'E_QUERY_TIMEOUT'
      try {
        onTimeout?.()
      } catch {
        // Swallow so reject(err) always fires even if cleanup throws.
      }
      reject(err)
    }, timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  }) as Promise<T>
}

/**
 * Per-process adapter registry. Re-instantiating adapters each session is
 * cheap (they carry no state) but sharing one instance matches how the
 * main ConnectionManager is wired up.
 */
const ADAPTERS: Record<DbAssetType, DatabaseDriverAdapter> = {
  mysql: new MysqlDriverAdapter(),
  postgresql: new PostgresDriverAdapter()
}

/**
 * Lookup table keyed by `sessionId` so `closeDbAiSession` can find the
 * correct driver/handle without callers hanging on to the adapter reference.
 * Keyed by sessionId (not assetId) because multiple DB-AI sessions may target
 * the same asset concurrently.
 */
interface SessionEntry {
  assetId: string
  sessionId: string
  dbType: DbAssetType
  adapter: DatabaseDriverAdapter
  handle: unknown
  owner: DbAiSessionOwner
  cache: DbAiMetadataCache
  session: DbAiActiveSession
}
const OPEN_SESSIONS = new Map<string, SessionEntry>()

/**
 * Resolve the asset record + credential for the given id. Throws a sanitized
 * error on missing asset so callers can surface a stable error message to
 * the drawer without leaking existence/enumeration info.
 */
async function resolveCredential(assetId: string): Promise<{ asset: DbAssetType; credential: ResolvedDbCredential }> {
  const assetService = await ChatermDatabaseService.getInstance()
  const asset = assetService.getDbAsset(assetId)
  if (!asset) {
    throw new Error('asset not found')
  }
  const credStore = getCredentialStore()
  const password = asset.password_ciphertext ? await credStore.decryptSecret(asset.password_ciphertext) : null
  const credential: ResolvedDbCredential = {
    dbType: asset.db_type,
    host: asset.host,
    port: asset.port,
    username: asset.username,
    password,
    database: asset.database_name,
    sslMode: asset.ssl_mode
  }
  return { asset: asset.db_type, credential }
}

/**
 * Upgrade a driver `string[]` column list into the detailed `ColumnInfo[]`
 * shape that the §9.6.1 cache expects. The adapter contract currently only
 * returns names; MVP fills `type/nullable/comment` with `undefined` so the
 * shape is future-proof without an adapter change.
 */
function columnsToInfo(names: string[]): ColumnInfoCacheValue[] {
  return names.map((name) => ({ name }))
}

function infoToNames(info: ColumnInfoCacheValue[]): string[] {
  return info.map((c) => c.name)
}

/**
 * Build a `DbAiActiveSession` bound to the given `handle` + metadata cache.
 * Split out so tests can pass a fake handle/adapter/cache without touching
 * the real drivers.
 */
function buildSession(input: {
  assetId: string
  sessionId: string
  dbType: DbAssetType
  adapter: DatabaseDriverAdapter
  handle: unknown
  databaseName?: string
  schemaName?: string
  cache: DbAiMetadataCache
}): DbAiActiveSession {
  const { assetId, sessionId, dbType, adapter, handle, databaseName, schemaName, cache } = input
  const session: DbAiActiveSession = {
    assetId,
    sessionId,
    dbType,
    handle,
    databaseName,
    schemaName,
    isClosed: false,

    async listDatabases(opts?: MetadataFetchOptions): Promise<string[]> {
      if (!adapter.listDatabases) return []
      const slot = cache.getDatabases()
      return cache.run(slot, 'databases', Boolean(opts?.refresh), 'db-ai.cache.databases', async () => {
        return adapter.listDatabases!(handle)
      })
    },

    async listSchemas(db: string, opts?: MetadataFetchOptions): Promise<string[]> {
      if (!adapter.listSchemas) return []
      const key = cache.schemaKey(db)
      const slot = cache.getSchemas(key)
      return cache.run(slot, key, Boolean(opts?.refresh), 'db-ai.cache.schemas', async () => {
        const raw = await adapter.listSchemas!(handle, db)
        return raw.map((s) => s.name)
      })
    },

    async listTables(db: string, schema?: string, opts?: MetadataFetchOptions): Promise<string[]> {
      if (!adapter.listTables) return []
      const key = cache.tableKey(db, schema)
      const slot = cache.getTables(key)
      return cache.run(slot, key, Boolean(opts?.refresh), 'db-ai.cache.tables', async () => {
        return adapter.listTables!(handle, db, schema)
      })
    },

    async listColumns(db: string, table: string, schema?: string, opts?: MetadataFetchOptions): Promise<string[]> {
      const detailed = await (this as DbAiActiveSession).listColumnsDetailed(db, table, schema, opts)
      return infoToNames(detailed)
    },

    async listColumnsDetailed(db: string, table: string, schema?: string, opts?: MetadataFetchOptions): Promise<ColumnInfo[]> {
      if (!adapter.listColumns) return []
      const key = cache.columnKey(db, table, schema)
      const slot = cache.getColumns(key)
      return cache.run(slot, key, Boolean(opts?.refresh), 'db-ai.cache.columns', async () => {
        const names = await adapter.listColumns!(handle, db, table, schema)
        return columnsToInfo(names)
      })
    },

    async hasSchema(db: string, schema: string): Promise<boolean> {
      // First pass: whatever the cache has. Second pass: force refresh once
      // to absorb schemas that were created after the cache was filled. The
      // policy is spelt out in §9.6.1 — two tries, then fail.
      const first = await this.listSchemas(db)
      if (first.includes(schema)) return true
      const second = await this.listSchemas(db, { refresh: true })
      return second.includes(schema)
    },

    async hasTable(db: string, table: string, schema?: string): Promise<boolean> {
      const first = await this.listTables(db, schema)
      if (first.includes(table)) return true
      const second = await this.listTables(db, schema, { refresh: true })
      return second.includes(table)
    },

    async getTableDdl(db: string, table: string, schema?: string): Promise<string> {
      if (dbType === 'postgresql') {
        // PG requires schema; default to `public` when caller omits it, matching
        // the existing UI fallback. Caller SHOULD supply schema explicitly.
        return fetchPostgresTableDdl(handle, db, schema ?? 'public', table)
      }
      return fetchMysqlTableDdl(handle, db, table)
    },

    async executeQuery(sql: string, opts?: ExecuteQueryOptions): Promise<BoundedQueryResult> {
      if (!adapter.executeQuery) {
        throw new Error(`${dbType} adapter does not support executeQuery`)
      }
      const maxRows = clampMaxRows(opts?.maxRows)
      const timeoutMs = clampTimeoutMs(opts?.timeoutMs)
      const params = opts?.params ?? []
      const startedAt = Date.now()
      // Client-side deadline: when the timer fires we close the independent
      // DB-AI connection. For MySQL this calls destroy() which abruptly tears
      // down the socket; for Postgres this calls end(). Either path terminates
      // the server-side query sooner than leaving the connection open. The
      // session is removed from OPEN_SESSIONS so subsequent tool calls on this
      // task get a fresh connection rather than queuing on the dead handle.
      const onTimeout = () => {
        logger.warn('query timeout: closing db-ai connection to terminate server-side query', {
          event: 'db-ai.session.query_timeout_close',
          sessionId,
          timeoutMs
        })
        session.isClosed = true
        OPEN_SESSIONS.delete(sessionId)
        const closeMethod = adapter.forceClose ?? adapter.disconnect
        void Promise.resolve(closeMethod.call(adapter, handle)).catch(() => {
          // Best-effort: ignore close errors during timeout cleanup.
        })
      }
      const result = await raceWithTimeout<QueryResult>(adapter.executeQuery!(handle, sql, params), timeoutMs, onTimeout)
      const allRows = result.rows
      const truncated = allRows.length > maxRows
      const rows = truncated ? allRows.slice(0, maxRows) : allRows
      const durationMs = Date.now() - startedAt
      return {
        columns: result.columns,
        rows,
        rowCount: rows.length,
        truncated,
        durationMs
      }
    },

    invalidateMetadataCache(): void {
      cache.invalidateAll()
    },

    async close(): Promise<void> {
      // Close the driver handle, drop the metadata cache, and remove the
      // registry entry. Errors are swallowed after logging to keep the
      // session-close path best-effort.
      session.isClosed = true
      try {
        await adapter.disconnect(handle)
      } catch (error) {
        const err = error as { code?: string; message?: string }
        logger.warn('db-ai session close failed', {
          event: 'db-ai.session.close.fail',
          sessionId,
          errorCode: err.code
        })
      } finally {
        cache.invalidateAll()
        OPEN_SESSIONS.delete(sessionId)
      }
    }
  }
  return session
}

/**
 * Open a DB-AI independent session for the given asset/owner. The caller is
 * responsible for calling `close()` when done; the service layer wraps this
 * call in try/finally so cancellation still releases the connection.
 *
 * `schemaCacheTtlMs` maps to the `dbAi.schemaCacheTtlMs` user setting
 * (docs/database_ai.md §9.6.1). Values outside the 0 – 300000 range are
 * clamped by the cache constructor.
 */
export async function openDbAiSession(input: {
  assetId: string
  owner: DbAiSessionOwner
  databaseName?: string
  schemaName?: string
  schemaCacheTtlMs?: number
}): Promise<DbAiActiveSession> {
  // Validate asset connectivity via the process-wide ConnectionManager: if
  // the UI session is not live for this asset the DB-AI request should be
  // rejected by the handler BEFORE we reach this point. We still guard here
  // so tests that exercise the service directly can observe the behaviour.
  const mgr = await getConnectionManager()
  if (!mgr.isConnected(input.assetId)) {
    throw new Error('asset not connected')
  }
  const { asset: dbType, credential } = await resolveCredential(input.assetId)
  const adapter = ADAPTERS[dbType]
  if (!adapter) {
    throw new Error('no adapter registered for asset')
  }
  const handle = await adapter.connect(credential)
  const sessionId = randomUUID()
  const cache = new DbAiMetadataCache(input.schemaCacheTtlMs ?? TTL_DEFAULT_MS)
  const session = buildSession({
    assetId: input.assetId,
    sessionId,
    dbType,
    adapter,
    handle,
    databaseName: input.databaseName,
    schemaName: input.schemaName,
    cache
  })
  const entry: SessionEntry = {
    assetId: input.assetId,
    sessionId,
    dbType,
    adapter,
    handle,
    owner: input.owner,
    cache,
    session
  }
  OPEN_SESSIONS.set(sessionId, entry)
  logger.info('db-ai session opened', {
    event: 'db-ai.session.open',
    sessionId,
    dbType,
    ownerKind: input.owner.type,
    hasDatabaseName: Boolean(input.databaseName),
    hasSchemaName: Boolean(input.schemaName)
  })
  return session
}

/**
 * Close every DB-AI session owned by the given reqId / taskId. Used by the
 * IPC handler on cancel / Task dispose to guarantee we release connections
 * even if the service run() path was cancelled mid-flight.
 */
export async function closeSessionsOwnedBy(owner: DbAiSessionOwner): Promise<void> {
  const victims: SessionEntry[] = []
  for (const entry of OPEN_SESSIONS.values()) {
    if (entry.owner.type === owner.type) {
      if (owner.type === 'request' && entry.owner.type === 'request' && entry.owner.reqId === owner.reqId) {
        victims.push(entry)
      } else if (owner.type === 'task' && entry.owner.type === 'task' && entry.owner.taskId === owner.taskId) {
        victims.push(entry)
      }
    }
  }
  for (const v of victims) {
    try {
      v.session.isClosed = true
      await v.adapter.disconnect(v.handle)
    } catch (error) {
      const err = error as { code?: string; message?: string }
      logger.warn('db-ai session force-close failed', {
        event: 'db-ai.session.force-close.fail',
        sessionId: v.sessionId,
        errorCode: err.code
      })
    } finally {
      v.cache.invalidateAll()
      OPEN_SESSIONS.delete(v.sessionId)
    }
  }
}

/**
 * Test-only: injectable adapter + handle + cache so unit tests can exercise
 * buildSession without a real driver. Not part of the public runtime API.
 */
export const __testing = { buildSession, OPEN_SESSIONS }
