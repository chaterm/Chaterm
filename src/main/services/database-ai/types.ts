// Internal service types for the database-ai facade. Kept separate from
// @common/db-ai-types (which defines the IPC-facing payloads) because these
// types describe main-process internals that must not cross into renderer.

import type {
  DbAiAction,
  DbAiDoneEvent,
  DbAiStartRequest,
  DbAiStreamEvent,
  DbAiTableHint,
  DbAiToolEvent,
  DbType,
  SqlDialect
} from '@common/db-ai-types'

/**
 * Sink used by the service to emit events back to the IPC handler. Wrapped so
 * the service layer never touches `WebContents`/`event.sender` directly.
 */
export interface DbAiEventSink {
  emitStream(event: DbAiStreamEvent): void
  emitTool(event: DbAiToolEvent): void
  /**
   * Emit a terminal done event. The service layer MUST invoke this exactly
   * once per request; the handler relies on it for controller cleanup.
   */
  emitDone(event: DbAiDoneEvent): void
}

/**
 * Outcome returned to the IPC handler after `run()` resolves. Mirrors the
 * fields carried in the done event so the handler can cross-check.
 */
export interface DbAiRunResult {
  reqId: string
  action: DbAiAction
  ok: boolean
  errorMessage?: string
  cancelled: boolean
}

/**
 * Owner of a DB-AI independent session. Only one owner lives on a session at
 * a time; callers identify themselves so the session manager can close
 * matching sessions on request cancel / task dispose.
 */
export type DbAiSessionOwner = { type: 'request'; reqId: string } | { type: 'task'; taskId: string }

/**
 * Handle for a DB-AI-owned database session. Independent from the UI-shared
 * session (`ConnectionManager.getSession`) so setting search_path on a DB-AI
 * query cannot leak into the workspace tabs. See docs/database_ai.md §7.3.
 */
/**
 * Metadata lookup options. `refresh: true` bypasses the cache so callers
 * who just got a miss can force one extra round-trip (the "first miss,
 * re-fetch once" policy described in §9.6.1). Low-level callers use this
 * directly; tool code SHOULD prefer the higher-level `hasSchema` / `hasTable`
 * helpers on `DbAiActiveSession`, which encapsulate the retry policy.
 */
export interface MetadataFetchOptions {
  refresh?: boolean
}

/**
 * Per-column metadata. Only `name` is guaranteed today because the underlying
 * `DatabaseDriverAdapter.listColumns` returns names only (by contract, per
 * §7.3 "MVP does not change DatabaseDriverAdapter"). The other fields are
 * reserved so that when the adapter contract is extended in a later phase,
 * callers and the cache layout do not change.
 */
export interface ColumnInfo {
  name: string
  type?: string
  nullable?: boolean
  comment?: string
}

/**
 * Options accepted by `DbAiActiveSession.executeQuery`. Caller overrides
 * the MVP defaults (maxRows 200, timeoutMs 30_000) so that tools with tight
 * budgets (e.g. `count_rows`) can shrink them further. Exceeding either
 * ceiling is a hard failure; the bounds are safety rails and cannot be
 * raised by a DB tool caller past the MVP-B maxima.
 */
export interface ExecuteQueryOptions {
  /** Hard row cap. Rows beyond this are discarded and `truncated=true`. */
  maxRows?: number
  /** Client-side deadline for the query. */
  timeoutMs?: number
  /** Bound parameters forwarded to the driver. */
  params?: unknown[]
}

/**
 * Result of `DbAiActiveSession.executeQuery`. Shape intentionally mirrors
 * `QueryResult` from the driver layer but adds `truncated` so callers can
 * surface the "we dropped rows" signal without re-comparing lengths.
 */
export interface BoundedQueryResult {
  columns: string[]
  rows: Array<Record<string, unknown>>
  /** Number of rows returned (≤ maxRows). */
  rowCount: number
  /** True when the driver returned more rows than `maxRows` and we dropped the tail. */
  truncated: boolean
  /** Wall-clock duration from the session layer's perspective. */
  durationMs: number
}

export interface DbAiActiveSession {
  assetId: string
  sessionId: string
  dbType: DbType
  /** Driver-specific handle; never serialized over IPC. */
  handle: unknown
  databaseName?: string
  schemaName?: string
  /**
   * List database names available on the server. Cached per-session under a
   * dedicated slot keyed by empty-string (single-instance cache).
   */
  listDatabases(opts?: MetadataFetchOptions): Promise<string[]>
  /**
   * List schema names for the given database. PostgreSQL-only in practice;
   * MySQL adapters return `[]`. Cached per-session under the `schemas` slot
   * of `DbAiMetadataCache`.
   */
  listSchemas(databaseName: string, opts?: MetadataFetchOptions): Promise<string[]>
  listTables(databaseName: string, schemaName?: string, opts?: MetadataFetchOptions): Promise<string[]>
  /**
   * Legacy column list API used by `schema-context.ts`. Returns names only
   * because that is all the current adapters expose. New DB-tool callers
   * SHOULD prefer `listColumnsDetailed()` so that when the adapter contract
   * is extended the tool output can evolve without touching call sites.
   */
  listColumns(databaseName: string, tableName: string, schemaName?: string, opts?: MetadataFetchOptions): Promise<string[]>
  /**
   * Cached detailed column list. MVP shape has only `name`; see `ColumnInfo`.
   */
  listColumnsDetailed(databaseName: string, tableName: string, schemaName?: string, opts?: MetadataFetchOptions): Promise<ColumnInfo[]>
  /**
   * Membership-check helpers that bake in the "first miss, re-fetch once"
   * policy of §9.6.1: check cache; on miss force a refresh and check again;
   * only return `false` when both passes fail. Tool code uses these to
   * validate model-supplied `schema` / `table` parameters before doing
   * anything destructive with them.
   */
  hasSchema(databaseName: string, schemaName: string): Promise<boolean>
  hasTable(databaseName: string, tableName: string, schemaName?: string): Promise<boolean>
  getTableDdl(databaseName: string, tableName: string, schemaName?: string): Promise<string>
  /**
   * Execute a bounded read-only SQL. Applies a client-side row cap + timeout
   * so MVP tools remain safe even without driver-level streaming cursors
   * (see docs/db-ai-driver-streaming-investigation.md). The returned shape
   * always reports `truncated`; check it before reasoning about completeness.
   */
  executeQuery(sql: string, opts?: ExecuteQueryOptions): Promise<BoundedQueryResult>
  /**
   * Test / diagnostic hook: drop all cached metadata for this session.
   * Intended for the future `/db-refresh` slash command and for unit tests
   * that exercise cache-invalidation paths. Not part of the regular tool
   * flow — tools use `opts.refresh` on individual calls instead.
   */
  invalidateMetadataCache(): void
  close(): Promise<void>
}

/**
 * Schema context input shared by every DB-AI action. Mirrors the doc spec in
 * §7.1 with additional driver-coupled fields (owner) that are resolved in the
 * service layer, not in the IPC payload.
 */
export interface DbAiSchemaContextOptions {
  assetId: string
  databaseName?: string
  schemaName?: string
  dbType: DbType
  sql?: string
  question?: string
  hintedTables?: DbAiTableHint[]
  maxTokens: number
  owner: DbAiSessionOwner
}

/**
 * A single table snippet emitted by `schema-context`. `source` records how
 * the table was selected so the prompt builder can reason about relevance
 * and so telemetry can distinguish hand-picked from inferred context.
 */
export interface TableSchemaSnippet {
  schema?: string
  table: string
  ddl?: string
  columns: Array<{ name: string; type?: string; nullable?: boolean; comment?: string }>
  indexes?: Array<{ name: string; columns: string[]; unique?: boolean }>
  rowCountHint?: number
  source: 'selected' | 'sql-reference' | 'keyword' | 'rag' | 'fallback'
}

/**
 * Aggregated schema context fed into the prompt layer. `unresolvedCandidates`
 * is logged at low confidence (§7.2) so we can tell when the parser names a
 * table that no longer exists.
 */
export interface DbAiSchemaContext {
  tables: TableSchemaSnippet[]
  unresolvedCandidates: DbAiTableHint[]
  estimatedTokens: number
  truncated: boolean
}

/**
 * Metadata safely returned from the api client. API keys / base URLs are
 * intentionally excluded so this object can be logged.
 */
export interface DbAiModelMetadata {
  provider: string
  modelId: string
}

/**
 * Parsed SQL reference detected by `sql-reference-parser`. Case is preserved
 * because PostgreSQL identifiers are case-sensitive when quoted.
 */
export interface SqlTableReference {
  schema?: string
  table: string
  /** True when the identifier was quoted; case must be preserved verbatim. */
  quoted: boolean
}

/**
 * Dialect descriptor used by prompt builders and target-dialect conversion.
 */
export interface DialectInfo {
  dialect: SqlDialect
  /** Canonical display name shown to the user and model. */
  displayName: string
  /** Identifier quoting character used by prompt examples. */
  identifierQuote: '"' | '`'
}

/**
 * Shape returned by the facade factory so IPC handlers can both run new
 * requests and cancel in-flight ones with a single object.
 */
export interface DbAiService {
  run(req: DbAiStartRequest, sink: DbAiEventSink): Promise<DbAiRunResult>
  /**
   * Mark the request cancelled. Best-effort on MVP: downstream IPC stops
   * immediately, but the underlying provider stream is only best-effort
   * closed (see §5.3).
   */
  cancel(reqId: string): void
}

/** Re-exports for convenience so consumers can `import from './types'`. */
export type { DbAiAction, DbAiRequestContext, DbAiStartRequest } from '@common/db-ai-types'
