// DB-AI service facade (track A). Orchestrates api-client, stream-runner,
// schema-context, and prompt builders for single-turn actions. Multi-turn
// ChatBot (track B) does NOT go through this facade; see docs/database_ai.md
// §6.1 + §9.
//
// Phase 2 scope: explain / nl2sql / optimize / convert are fully wired.
// `complete` (SQL completion) is the last single-turn action pending; it
// will land with Phase 4 because it requires a dedicated prompt + debounce
// contract, see §8.6.

import type { DbAiDoneEvent, DbAiStartRequest } from '@common/db-ai-types'
import type { DbAiEventSink, DbAiRunResult, DbAiService } from './types'
import { createDbAiApiHandler } from './api-client'
import { buildSchemaContext } from './schema-context'
import { openDbAiSession, closeSessionsOwnedBy } from './db-session'
import { runDbAiStream } from './stream-runner'
import { extractFirstSqlBlock } from './sql-markdown'

const logger = createLogger('db-ai')

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
 * Build system prompt and user message for the `diagnose` action.
 * `schemaBlock` is DDL for tables resolved from the SQL itself.
 * `tableList` is a fallback list of all table names in the current database,
 * used when the SQL references an unknown/misspelled table name.
 */
function buildDiagnosePrompt(
  sql: string,
  errorMessage: string,
  dbType: string,
  schemaBlock: string,
  tableList: string[]
): { systemPrompt: string; userMessage: string } {
  const schemaSection = schemaBlock ? `\n\nSCHEMA CONTEXT (resolved from your SQL):\n${schemaBlock}` : ''

  const tableListSection = tableList.length > 0 ? `\n\nAVAILABLE TABLES IN CURRENT DATABASE:\n${tableList.join(', ')}` : ''

  const systemPrompt = `You are Chaterm DB-AI, a database assistant specialised in diagnosing and fixing SQL errors. You are working with a ${dbType} database.

OUTPUT RULES:
- Briefly explain why the SQL failed (1-3 sentences).
- Provide a corrected SQL statement inside a fenced \`\`\`sql block.
- If the error is a misspelled or missing table/column name, use the available tables list or schema context to suggest the correct name.
- Do not mention internal tool names or connection details.
- Respond in the same language the user's error message implies.${schemaSection}${tableListSection}`

  const userMessage = `The following SQL statement failed with an error. Please explain why and provide a corrected version.

SQL:
\`\`\`sql
${sql}
\`\`\`

Error:
${errorMessage}`

  return { systemPrompt, userMessage }
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

      if (action === 'diagnose') {
        const sql = req.input.sql?.trim() ?? ''
        const errorMessage = req.input.errorMessage?.trim() ?? ''
        if (!sql || !errorMessage) {
          return finalize({ reqId, action, ok: false, errorMessage: 'diagnose requires sql and errorMessage' })
        }
        const owner = { type: 'request' as const, reqId }
        try {
          const { handler } = await createDbAiApiHandler({ modelOverride: req.options?.modelOverride })

          // Step 1: try to resolve schema context from the SQL itself.
          let schemaBlock = ''
          try {
            const schemaCtx = await buildSchemaContext({
              assetId: req.context.assetId,
              databaseName: req.context.databaseName,
              schemaName: req.context.schemaName,
              dbType: req.context.dbType,
              sql,
              hintedTables: req.input.hintedTables,
              maxTokens: req.options?.maxSchemaTokens ?? 4000,
              owner
            })
            schemaBlock = schemaCtx.tables.map((t) => t.ddl ?? `-- table: ${t.table}`).join('\n\n')
          } catch (schemaErr) {
            const err = schemaErr as { message?: string }
            logger.warn('db-ai diagnose schema context failed', {
              event: 'db-ai.diagnose.schema.fail',
              reqId,
              reason: err.message ?? 'unknown'
            })
          }

          // Step 2: if schema context is empty (e.g. table name was misspelled
          // or belongs to a different schema), fall back to listing all tables
          // in the current database so the AI can spot the correct name.
          let tableList: string[] = []
          if (!schemaBlock && req.context.databaseName) {
            try {
              const session = await openDbAiSession({
                assetId: req.context.assetId,
                databaseName: req.context.databaseName,
                owner
              })
              tableList = await session.listTables(req.context.databaseName, req.context.schemaName)
            } catch (listErr) {
              const err = listErr as { message?: string }
              logger.warn('db-ai diagnose table list fallback failed', {
                event: 'db-ai.diagnose.tablelist.fail',
                reqId,
                reason: err.message ?? 'unknown'
              })
            }
          }

          const { systemPrompt, userMessage } = buildDiagnosePrompt(sql, errorMessage, req.context.dbType, schemaBlock, tableList)
          const messages: import('@anthropic-ai/sdk').Anthropic.Messages.MessageParam[] = [{ role: 'user', content: userMessage }]
          const { text, cancelled } = await runDbAiStream({
            reqId,
            action,
            handler,
            systemPrompt,
            messages,
            sink,
            isCancelled: () => isCancelled(reqId)
          })
          if (cancelled) {
            return finalize({ reqId, action, ok: false, errorMessage: 'cancelled' })
          }
          const sqlResult = extractFirstSqlBlock(text) ?? undefined
          return finalize({ reqId, action, ok: true, result: { text, sql: sqlResult } })
        } catch (err) {
          const e = err as { message?: string; code?: string }
          logger.warn('db-ai diagnose failed', {
            event: 'db-ai.diagnose.fail',
            reqId,
            reason: e.message ?? 'unknown'
          })
          return finalize({ reqId, action, ok: false, errorMessage: e.message ?? 'diagnose failed' })
        } finally {
          void closeSessionsOwnedBy(owner).catch(() => undefined)
        }
      }

      return finalize({ reqId, action, ok: false, errorMessage: `action ${action} not implemented` })
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
