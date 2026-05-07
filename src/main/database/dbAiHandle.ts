// IPC handlers for the DB-AI single-turn (track A) surface. Responsibilities
// per docs/database_ai.md §5.3:
//   - Validate incoming requests (reqId format, action, context, payload size)
//   - Confirm the asset is actually connected via ConnectionManager
//   - Register a per-request controller so cancellation cleans up sessions
//   - Forward service events back to the renderer via event.sender.send
//   - Close DB-AI-owned sessions on done/cancel to prevent connection leaks

import { ipcMain, type WebContents } from 'electron'
import {
  DB_AI_IPC_CHANNELS,
  type DbAiAction,
  type DbAiCancelResult,
  type DbAiDoneEvent,
  type DbAiRequestContext,
  type DbAiStartRequest,
  type DbAiStartResult,
  type DbAiStreamEvent,
  type DbAiTableHint,
  type DbAiToolEvent,
  type DbType
} from '@common/db-ai-types'
import { createDbAiService, type DbAiEventSink, type DbAiService } from '../services/database-ai'
import { closeSessionsOwnedBy } from '../services/database-ai/db-session'
import { getConnectionManager } from '../services/database'

const logger = createLogger('db-ai')

// ---------------------------------------------------------------------------
// Payload limits (kept locally so validation is self-contained).
// ---------------------------------------------------------------------------

/** Maximum SQL / question / selectedText size (50 KB, matches §10.2). */
const MAX_TEXT_BYTES = 50 * 1024
/** Maximum number of hinted tables the renderer may attach. */
const MAX_HINTED_TABLES = 64
/** Maximum cursor context payload for `complete` action. */
const MAX_CURSOR_CONTEXT_BYTES = 8 * 1024

const VALID_ACTIONS: ReadonlyArray<DbAiAction> = ['nl2sql', 'explain', 'optimize', 'convert', 'complete']
const VALID_DB_TYPES: ReadonlyArray<DbType> = ['mysql', 'postgresql']

/** UUIDv4 / UUIDv7 style id shape used by the renderer. */
const REQ_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/

// ---------------------------------------------------------------------------
// Per-request controller registry. Keyed by reqId so cancellation can find
// the matching entry without the renderer having to hand back handles.
// ---------------------------------------------------------------------------

interface RuntimeRequest {
  reqId: string
  action: DbAiAction
  webContents: WebContents
  finished: boolean
}

const ACTIVE_REQUESTS = new Map<string, RuntimeRequest>()

let service: DbAiService | null = null

function getService(): DbAiService {
  if (!service) service = createDbAiService()
  return service
}

function byteLen(text: string): number {
  // Uses UTF-8 byte length so multi-byte SQL (e.g. comments with non-ASCII)
  // are bounded by the same limit the doc specifies in §10.2.
  return Buffer.byteLength(text, 'utf8')
}

function isTableHintList(value: unknown): value is DbAiTableHint[] {
  if (!Array.isArray(value)) return false
  if (value.length > MAX_HINTED_TABLES) return false
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return false
    const h = raw as Record<string, unknown>
    if (typeof h.table !== 'string' || h.table.length === 0) return false
    if (h.schema !== undefined && typeof h.schema !== 'string') return false
  }
  return true
}

function validateContext(ctx: unknown): DbAiRequestContext | null {
  if (!ctx || typeof ctx !== 'object') return null
  const c = ctx as Record<string, unknown>
  if (typeof c.assetId !== 'string' || c.assetId.length === 0) return null
  if (typeof c.dbType !== 'string' || !VALID_DB_TYPES.includes(c.dbType as DbType)) return null
  return {
    assetId: c.assetId,
    databaseName: typeof c.databaseName === 'string' ? c.databaseName : undefined,
    schemaName: typeof c.schemaName === 'string' ? c.schemaName : undefined,
    tableName: typeof c.tableName === 'string' ? c.tableName : undefined,
    dbType: c.dbType as DbType
  }
}

function validateRequest(raw: unknown): { ok: true; req: DbAiStartRequest } | { ok: false; errorMessage: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, errorMessage: 'invalid request' }
  const r = raw as Record<string, unknown>
  if (typeof r.reqId !== 'string' || !REQ_ID_REGEX.test(r.reqId)) {
    return { ok: false, errorMessage: 'invalid reqId' }
  }
  if (typeof r.action !== 'string' || !VALID_ACTIONS.includes(r.action as DbAiAction)) {
    return { ok: false, errorMessage: 'invalid action' }
  }
  const context = validateContext(r.context)
  if (!context) return { ok: false, errorMessage: 'invalid context' }
  const inputRaw = r.input && typeof r.input === 'object' ? (r.input as Record<string, unknown>) : {}
  // Enforce text-field size limits individually so the renderer gets a
  // precise error code for the oversized field.
  for (const field of ['sql', 'question', 'selectedText'] as const) {
    const v = inputRaw[field]
    if (v !== undefined && (typeof v !== 'string' || byteLen(v) > MAX_TEXT_BYTES)) {
      return { ok: false, errorMessage: `input.${field} too large or invalid` }
    }
  }
  for (const field of ['cursorTextBefore', 'cursorTextAfter'] as const) {
    const v = inputRaw[field]
    if (v !== undefined && (typeof v !== 'string' || byteLen(v) > MAX_CURSOR_CONTEXT_BYTES)) {
      return { ok: false, errorMessage: `input.${field} too large or invalid` }
    }
  }
  if (inputRaw.targetDialect !== undefined) {
    if (inputRaw.targetDialect !== 'mysql' && inputRaw.targetDialect !== 'postgresql') {
      return { ok: false, errorMessage: 'invalid targetDialect' }
    }
  }
  if (inputRaw.hintedTables !== undefined && !isTableHintList(inputRaw.hintedTables)) {
    return { ok: false, errorMessage: 'invalid hintedTables' }
  }
  // Options are optional; we shallow-validate types only.
  const optionsRaw = r.options && typeof r.options === 'object' ? (r.options as Record<string, unknown>) : undefined
  if (optionsRaw) {
    if (optionsRaw.modelOverride !== undefined && typeof optionsRaw.modelOverride !== 'string') {
      return { ok: false, errorMessage: 'invalid options.modelOverride' }
    }
    if (optionsRaw.maxSchemaTokens !== undefined && typeof optionsRaw.maxSchemaTokens !== 'number') {
      return { ok: false, errorMessage: 'invalid options.maxSchemaTokens' }
    }
    if (optionsRaw.dryRun !== undefined && typeof optionsRaw.dryRun !== 'boolean') {
      return { ok: false, errorMessage: 'invalid options.dryRun' }
    }
  }
  const req: DbAiStartRequest = {
    reqId: r.reqId,
    action: r.action as DbAiAction,
    context,
    input: {
      sql: inputRaw.sql as string | undefined,
      question: inputRaw.question as string | undefined,
      selectedText: inputRaw.selectedText as string | undefined,
      cursorTextBefore: inputRaw.cursorTextBefore as string | undefined,
      cursorTextAfter: inputRaw.cursorTextAfter as string | undefined,
      targetDialect: inputRaw.targetDialect as DbAiStartRequest['input']['targetDialect'],
      hintedTables: inputRaw.hintedTables as DbAiTableHint[] | undefined
    },
    options: optionsRaw
      ? {
          modelOverride: optionsRaw.modelOverride as string | undefined,
          maxSchemaTokens: optionsRaw.maxSchemaTokens as number | undefined,
          dryRun: optionsRaw.dryRun as boolean | undefined
        }
      : undefined
  }
  return { ok: true, req }
}

/**
 * Build a sink that forwards service events to the renderer associated with
 * the given webContents. `emitDone` also clears the runtime registry entry
 * and closes any DB-AI sessions owned by the request.
 */
function buildSink(runtime: RuntimeRequest): DbAiEventSink {
  const { reqId, webContents } = runtime
  const safeSend = (channel: string, event: unknown): void => {
    if (webContents.isDestroyed()) return
    try {
      webContents.send(channel, event)
    } catch (error) {
      const err = error as { code?: string; message?: string }
      logger.warn('db-ai ipc send failed', {
        event: 'db-ai.ipc.send.fail',
        reqId,
        channel,
        errorCode: err.code
      })
    }
  }
  return {
    emitStream(event: DbAiStreamEvent): void {
      if (runtime.finished) return
      safeSend(DB_AI_IPC_CHANNELS.stream, event)
    },
    emitTool(event: DbAiToolEvent): void {
      if (runtime.finished) return
      safeSend(DB_AI_IPC_CHANNELS.tool, event)
    },
    emitDone(event: DbAiDoneEvent): void {
      if (runtime.finished) return
      runtime.finished = true
      safeSend(DB_AI_IPC_CHANNELS.done, event)
      ACTIVE_REQUESTS.delete(reqId)
      // Fire-and-forget: close any DB-AI sessions associated with the
      // request. Failures are logged inside `closeSessionsOwnedBy`.
      void closeSessionsOwnedBy({ type: 'request', reqId }).catch(() => undefined)
    }
  }
}

async function handleStart(sender: WebContents, raw: unknown): Promise<DbAiStartResult> {
  const parsed = validateRequest(raw)
  if (!parsed.ok) {
    return { ok: false, errorMessage: parsed.errorMessage }
  }
  const { req } = parsed
  if (ACTIVE_REQUESTS.has(req.reqId)) {
    return { ok: false, errorMessage: 'duplicate reqId' }
  }
  // Ensure the asset is connected BEFORE the service spins up. Otherwise
  // schema-context would fail several layers in and the drawer would see a
  // generic error instead of the actionable "not connected".
  try {
    const mgr = await getConnectionManager()
    if (!mgr.isConnected(req.context.assetId)) {
      return { ok: false, errorMessage: 'asset not connected' }
    }
  } catch (error) {
    const err = error as { code?: string; message?: string }
    logger.warn('db-ai connection check failed', {
      event: 'db-ai.ipc.connection-check.fail',
      reqId: req.reqId,
      errorCode: err.code
    })
    return { ok: false, errorMessage: 'connection manager unavailable' }
  }
  const runtime: RuntimeRequest = {
    reqId: req.reqId,
    action: req.action,
    webContents: sender,
    finished: false
  }
  ACTIVE_REQUESTS.set(req.reqId, runtime)
  logger.info('db-ai request accepted', {
    event: 'db-ai.ipc.accept',
    reqId: req.reqId,
    action: req.action,
    dbType: req.context.dbType,
    hasDatabaseName: Boolean(req.context.databaseName),
    hasSchemaName: Boolean(req.context.schemaName),
    sqlLen: req.input.sql ? byteLen(req.input.sql) : 0,
    questionLen: req.input.question ? byteLen(req.input.question) : 0
  })
  const sink = buildSink(runtime)
  // Intentionally do NOT await: start() must return synchronously so the
  // renderer can unblock the UI. The service pushes events back via the sink.
  void getService()
    .run(req, sink)
    .catch((error) => {
      const err = error as { code?: string; message?: string }
      logger.warn('db-ai service run threw', {
        event: 'db-ai.ipc.run.unhandled',
        reqId: req.reqId,
        errorCode: err.code
      })
      if (!runtime.finished) {
        sink.emitDone({
          reqId: req.reqId,
          action: req.action,
          ok: false,
          errorMessage: err.code ?? err.message ?? 'unknown error'
        })
      }
    })
  return { ok: true, reqId: req.reqId }
}

function handleCancel(reqId: unknown): DbAiCancelResult {
  if (typeof reqId !== 'string' || reqId.length === 0) {
    return { ok: false }
  }
  const runtime = ACTIVE_REQUESTS.get(reqId)
  if (!runtime) return { ok: false }
  getService().cancel(reqId)
  // Note: we do NOT flip `runtime.finished` here; the service will call
  // `emitDone` with ok:false and that will clean up the registry entry.
  logger.info('db-ai cancel accepted', {
    event: 'db-ai.ipc.cancel',
    reqId,
    action: runtime.action
  })
  return { ok: true }
}

/**
 * Register all db-ai:* IPC handlers. Called once from `src/main/index.ts`
 * after the Database asset handlers have been registered (the asset layer
 * is a hard dependency because we need ConnectionManager + adapter setup).
 */
export function registerDbAiHandlers(): void {
  ipcMain.handle(DB_AI_IPC_CHANNELS.start, async (event, raw: unknown) => {
    return handleStart(event.sender, raw)
  })
  ipcMain.handle(DB_AI_IPC_CHANNELS.cancel, async (_event, reqId: unknown) => {
    return handleCancel(reqId)
  })
}

/** Test-only surface: inspect registry + reset between tests. */
export const __testing = {
  ACTIVE_REQUESTS,
  validateRequest,
  handleStart,
  handleCancel
}
