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
