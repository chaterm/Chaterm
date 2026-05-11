// Translate an ApiStream (provider-agnostic chunk iterator) into DB-AI
// stream events. Responsibilities:
//   - Fan-out text chunks to `emitStream({kind:'text'})`
//   - Fan-out reasoning chunks to `emitStream({kind:'reasoning'})`
//   - Accumulate the final text (so callers can attach it to the done event
//     when a provider only emits usage/text-in-one-shot)
//   - Aggregate the last usage chunk for the done event
//   - Stop emitting events as soon as the cancellation token is tripped
// See docs/database_ai.md §6.3.

import type { Anthropic } from '@anthropic-ai/sdk'
import type { ApiHandler } from '@api/index'
import type { ApiStreamChunk, ApiStreamUsageChunk } from '@api/transform/stream'
import type { DbAiAction } from '@common/db-ai-types'
import type { DbAiEventSink } from './types'

const logger = createLogger('db-ai')

export interface StreamRunnerInput {
  reqId: string
  action: DbAiAction
  handler: ApiHandler
  systemPrompt: string
  messages: Anthropic.Messages.MessageParam[]
  sink: DbAiEventSink
  /** Function that returns true once the request has been cancelled. */
  isCancelled: () => boolean
}

export interface StreamRunnerOutput {
  text: string
  reasoning: string
  usage?: ApiStreamUsageChunk
  cancelled: boolean
}

/**
 * Iterate the provider stream and emit DB-AI events. Returns the
 * accumulated text/reasoning/usage for the caller to fold into the done
 * event. Does NOT emit the done event itself — that is the caller's job so
 * callers can attach metadata derived after the stream finishes (e.g. SQL
 * extraction, result.tablesUsed).
 *
 * Errors thrown by the provider bubble up so the caller can sanitize them
 * into the done event; we do not swallow them here.
 */
export async function runDbAiStream(input: StreamRunnerInput): Promise<StreamRunnerOutput> {
  const { reqId, action, handler, systemPrompt, messages, sink, isCancelled } = input
  let text = ''
  let reasoning = ''
  let usage: ApiStreamUsageChunk | undefined
  const apiStream = handler.createMessage(systemPrompt, messages)
  try {
    for await (const rawChunk of apiStream as AsyncGenerator<ApiStreamChunk>) {
      if (isCancelled()) break
      const chunk = rawChunk as ApiStreamChunk
      if (chunk.type === 'text') {
        text += chunk.text
        sink.emitStream({ reqId, action, kind: 'text', text: chunk.text })
      } else if (chunk.type === 'reasoning') {
        reasoning += chunk.reasoning
        sink.emitStream({ reqId, action, kind: 'reasoning', text: chunk.reasoning })
      } else if (chunk.type === 'usage') {
        usage = chunk
      }
    }
  } finally {
    // Best-effort close the provider stream. Different providers expose
    // different cleanup hooks (AsyncGenerator.return, reader.cancel,
    // response.body.destroy) so we only invoke what AsyncGenerator exposes
    // universally. Provider-specific AbortSignal wiring is Phase 4 work
    // (see §5.3).
    const maybeGen = apiStream as { return?: (value?: unknown) => Promise<IteratorResult<unknown>> }
    if (typeof maybeGen.return === 'function') {
      try {
        await maybeGen.return(undefined)
      } catch (error) {
        const err = error as { code?: string; message?: string }
        logger.debug('db-ai stream close failed', {
          event: 'db-ai.stream.close.fail',
          reqId,
          action,
          errorCode: err.code
        })
      }
    }
  }
  return { text, reasoning, usage, cancelled: isCancelled() }
}
