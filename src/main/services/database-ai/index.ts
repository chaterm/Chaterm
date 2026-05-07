// DB-AI service facade (track A). Orchestrates api-client, stream-runner,
// schema-context, and prompt builders for single-turn actions. Multi-turn
// ChatBot (track B) does NOT go through this facade; see docs/database_ai.md
// §6.1 + §9.
//
// Phase 2 scope: explain / nl2sql / optimize / convert are fully wired.
// `complete` (SQL completion) is the last single-turn action pending; it
// will land with Phase 4 because it requires a dedicated prompt + debounce
// contract, see §8.6.

import type { DbAiAction, DbAiDoneEvent, DbAiStartRequest, DbAiTableHint } from '@common/db-ai-types'
import type { DbAiEventSink, DbAiRunResult, DbAiSchemaContext, DbAiService } from './types'
import { createDbAiApiHandler } from './api-client'
import { runDbAiStream } from './stream-runner'
import { buildSchemaContext } from './schema-context'
import { buildExplainPrompt } from './prompts/explain'
import { buildNl2SqlPrompt } from './prompts/nl2sql'
import { buildOptimizePrompt } from './prompts/optimize'
import { buildConvertPrompt } from './prompts/convert'
import { extractFirstSqlBlock } from './sql-markdown'

const logger = createLogger('db-ai')

/**
 * Cancellation token state. Kept in a module-scoped map so `cancel(reqId)`
 * from the IPC handler can flip the flag without holding on to request
 * state. The service layer never reads request-specific data from this map
 * beyond the bool.
 */
const CANCELLED = new Set<string>()

function markCancelled(reqId: string): void {
  CANCELLED.add(reqId)
}

function isCancelled(reqId: string): boolean {
  return CANCELLED.has(reqId)
}

function forgetCancellation(reqId: string): void {
  CANCELLED.delete(reqId)
}

/**
 * Produce a sanitized error message safe to emit to the renderer. Keeps the
 * provider error code when present so the drawer can show a stable label
 * ("E_AUTH", "E_TIMEOUT") instead of leaking SDK internals.
 */
function sanitizeError(error: unknown): string {
  const err = error as { code?: string; message?: string }
  if (err?.code) return err.code
  if (err?.message) {
    return err.message.length > 200 ? `${err.message.slice(0, 200)}...` : err.message
  }
  return 'unknown error'
}

/**
 * Default schema-context token budget. Matches §7.4; individual actions can
 * override via `req.options?.maxSchemaTokens`.
 */
const DEFAULT_MAX_SCHEMA_TOKENS = 4000

/**
 * Build the prompt pair for a given action. Returns `null` for actions that
 * are not yet implemented so `run()` can surface a clean "not implemented"
 * done event. Actions that require schema context receive the pre-built
 * `DbAiSchemaContext`; actions that do not still receive an empty context so
 * the signature stays uniform.
 */
/**
 * True when the given action's happy-path output contains a runnable SQL
 * block the renderer should surface as a drawer action (insert / replace
 * selection / copy / read-only execute). `explain` returns prose + bullets;
 * `complete` returns a raw fragment (no fenced block). The rest produce
 * a fenced SQL block that `sql-markdown.ts` can extract.
 */
function actionEmitsSql(action: DbAiAction): boolean {
  return action === 'nl2sql' || action === 'optimize' || action === 'convert'
}

function buildPrompt(
  action: DbAiAction,
  req: DbAiStartRequest,
  schemaContext: DbAiSchemaContext
): { systemPrompt: string; userPrompt: string } | null {
  if (action === 'explain') {
    return buildExplainPrompt({ request: req, schemaContext })
  }
  if (action === 'nl2sql') {
    return buildNl2SqlPrompt({ request: req, schemaContext })
  }
  if (action === 'optimize') {
    return buildOptimizePrompt({ request: req, schemaContext, hasExplainPlan: false })
  }
  if (action === 'convert') {
    // convert REQUIRES a target dialect; if missing, fall through to the
    // "not implemented" path so the renderer surfaces a clean error rather
    // than a half-populated prompt.
    const target = req.input.targetDialect
    if (!target) return null
    return buildConvertPrompt({ request: req, targetDialect: target })
  }
  // `complete` lands in Phase 4 (§8.6). Returning null keeps the IPC
  // behavior predictable — the renderer sees a "not implemented" done
  // event rather than an empty stream.
  return null
}

/**
 * Resolve the schema context for the given request. Actions that benefit
 * from schema injection (explain, nl2sql, optimize, complete) go through
 * `buildSchemaContext`; pure text transformations like `convert` receive an
 * empty context to save a round trip to the driver.
 */
async function resolveSchemaContext(req: DbAiStartRequest): Promise<DbAiSchemaContext> {
  if (req.action === 'convert') {
    return { tables: [], unresolvedCandidates: [], estimatedTokens: 0, truncated: false }
  }
  const maxTokens = req.options?.maxSchemaTokens ?? DEFAULT_MAX_SCHEMA_TOKENS
  return buildSchemaContext({
    assetId: req.context.assetId,
    databaseName: req.context.databaseName,
    schemaName: req.context.schemaName,
    dbType: req.context.dbType,
    sql: req.input.sql ?? req.input.selectedText,
    question: req.input.question,
    hintedTables: req.input.hintedTables,
    maxTokens,
    owner: { type: 'request', reqId: req.reqId }
  })
}

/**
 * Collect the table set referenced by the request + schema context for the
 * done event. De-duplicates on (schema, table) so the drawer can render
 * stable "tables used" chips.
 */
function resolveTablesUsed(req: DbAiStartRequest, schemaContext: DbAiSchemaContext): DbAiTableHint[] {
  const seen = new Set<string>()
  const out: DbAiTableHint[] = []
  const push = (hint: DbAiTableHint): void => {
    const key = `${hint.schema ?? ''}.${hint.table}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(hint)
  }
  for (const h of req.input.hintedTables ?? []) push({ schema: h.schema, table: h.table })
  for (const t of schemaContext.tables) push({ schema: t.schema, table: t.table })
  return out
}

/**
 * Construct the DB-AI service singleton. Kept as a factory so tests can
 * build isolated instances and so future DI work can inject mocks.
 */
export function createDbAiService(): DbAiService {
  return {
    async run(req: DbAiStartRequest, sink: DbAiEventSink): Promise<DbAiRunResult> {
      const { reqId, action } = req
      forgetCancellation(reqId)
      const startedAt = Date.now()
      const finalize = (doneEvent: DbAiDoneEvent): DbAiRunResult => {
        sink.emitDone(doneEvent)
        forgetCancellation(reqId)
        const durationMs = Date.now() - startedAt
        logger.info('db-ai run finished', {
          event: 'db-ai.run.finished',
          reqId,
          action,
          ok: doneEvent.ok,
          cancelled: isCancelled(reqId),
          durationMs
        })
        return {
          reqId,
          action,
          ok: doneEvent.ok,
          errorMessage: doneEvent.errorMessage,
          cancelled: isCancelled(reqId)
        }
      }
      try {
        // Resolve schema context first so an empty/unavailable schema
        // produces a recoverable warning rather than an opaque provider
        // error deep in the stream runner.
        const schemaContext = await resolveSchemaContext(req)
        const prompt = buildPrompt(action, req, schemaContext)
        if (!prompt) {
          return finalize({
            reqId,
            action,
            ok: false,
            errorMessage: `action ${action} not implemented`
          })
        }
        const { handler } = await createDbAiApiHandler({ modelOverride: req.options?.modelOverride })
        if (req.options?.dryRun) {
          return finalize({
            reqId,
            action,
            ok: true,
            result: { text: '', tablesUsed: resolveTablesUsed(req, schemaContext) }
          })
        }
        const { text, usage } = await runDbAiStream({
          reqId,
          action,
          handler,
          systemPrompt: prompt.systemPrompt,
          messages: [{ role: 'user', content: prompt.userPrompt }],
          sink,
          isCancelled: () => isCancelled(reqId)
        })
        if (isCancelled(reqId)) {
          return finalize({
            reqId,
            action,
            ok: false,
            errorMessage: 'cancelled'
          })
        }
        return finalize({
          reqId,
          action,
          ok: true,
          usage: usage
            ? {
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                totalCost: usage.totalCost
              }
            : undefined,
          result: {
            text,
            // Extract the first SQL code block for actions whose contract is
            // "produce SQL". `explain` and `complete` are excluded because
            // their output shapes do not center on a single runnable SQL.
            sql: actionEmitsSql(action) ? (extractFirstSqlBlock(text) ?? undefined) : undefined,
            tablesUsed: resolveTablesUsed(req, schemaContext)
          }
        })
      } catch (error) {
        const errorMessage = sanitizeError(error)
        logger.warn('db-ai run failed', {
          event: 'db-ai.run.fail',
          reqId,
          action,
          errorCode: (error as { code?: string })?.code
        })
        return finalize({ reqId, action, ok: false, errorMessage })
      }
    },
    cancel(reqId: string): void {
      markCancelled(reqId)
      logger.info('db-ai cancel requested', { event: 'db-ai.cancel', reqId })
    }
  }
}

// Re-exports used by task #5 (IPC handler) so the handler can depend on a
// single import surface without pulling sub-files directly.
export type { DbAiEventSink, DbAiRunResult, DbAiService } from './types'
