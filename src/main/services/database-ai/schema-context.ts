// Schema context builder for DB-AI prompts. Combines hinted tables (from the
// renderer), SQL references (from `sql-reference-parser`), the current tab's
// table, natural-language keyword matches, and the small-schema fallback
// into a deduplicated candidate list (via `schema-retriever.ts`), resolves
// them against the live driver via `DbAiActiveSession`, and produces a
// token-budgeted `DbAiSchemaContext`. See docs/database_ai.md §7.

import type { DbAiSchemaContext, DbAiSchemaContextOptions, TableSchemaSnippet } from './types'
import { openDbAiSession } from './db-session'
import { collectStaticCandidates, mergeKeywordAndFallback, type RetrieverCandidate } from './schema-retriever'

const logger = createLogger('db-ai')

/**
 * Rough character-to-token estimate shared across the DB-AI service. See
 * §7.4 for the rationale — conservative 3.5 chars per token keeps us safely
 * under the contextWindow budget without a tokenizer dependency.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 3.5)
}

/**
 * Resolve a single candidate against the live session. Returns `null` when
 * the table cannot be found via `listTables`, so the caller can surface it
 * under `unresolvedCandidates` for telemetry.
 */
async function resolveCandidate(
  candidate: RetrieverCandidate,
  ctx: DbAiSchemaContextOptions,
  session: Awaited<ReturnType<typeof openDbAiSession>>,
  tablesInScope: string[]
): Promise<TableSchemaSnippet | null> {
  const databaseName = ctx.databaseName
  if (!databaseName) return null
  const schemaName = candidate.schema ?? ctx.schemaName
  // Short-circuit on pre-fetched scope: avoids a second `listTables()` round
  // trip per candidate when the scope has already been enumerated.
  const inScope = candidate.schema && candidate.schema !== ctx.schemaName ? null : tablesInScope
  try {
    if (inScope) {
      if (!inScope.includes(candidate.table)) return null
    } else {
      const tables = await session.listTables(databaseName, schemaName)
      if (!tables.includes(candidate.table)) return null
    }
    const columns = await session.listColumns(databaseName, candidate.table, schemaName)
    const columnInfo = columns.map((name) => ({ name }))
    let ddl: string | undefined
    try {
      ddl = await session.getTableDdl(databaseName, candidate.table, schemaName)
    } catch (error) {
      const err = error as { code?: string; message?: string }
      logger.warn('db-ai ddl fetch failed', {
        event: 'db-ai.schema.ddl.fail',
        dbType: ctx.dbType,
        hasSchemaName: Boolean(schemaName),
        errorCode: err.code
      })
    }
    return {
      schema: schemaName,
      table: candidate.table,
      ddl,
      columns: columnInfo,
      source: candidate.source
    }
  } catch (error) {
    const err = error as { code?: string; message?: string }
    logger.warn('db-ai candidate resolve failed', {
      event: 'db-ai.schema.resolve.fail',
      dbType: ctx.dbType,
      errorCode: err.code
    })
    return null
  }
}

/**
 * Apply the token-budget trim described in §7.4. We never split a DDL in
 * half: either the whole DDL fits, or we fall back to the columns summary.
 */
function trimToBudget(snippets: TableSchemaSnippet[], maxTokens: number): { kept: TableSchemaSnippet[]; truncated: boolean } {
  let running = 0
  let truncated = false
  const kept: TableSchemaSnippet[] = []
  for (const s of snippets) {
    const ddlCost = s.ddl ? estimateTokens(s.ddl) : 0
    const colCost = estimateTokens(s.columns.map((c) => c.name).join(','))
    if (s.ddl && running + ddlCost <= maxTokens) {
      kept.push(s)
      running += ddlCost
    } else if (running + colCost <= maxTokens) {
      // Fall back to columns-only representation.
      kept.push({ ...s, ddl: undefined })
      running += colCost
      if (s.ddl) truncated = true
    } else {
      truncated = true
      break
    }
  }
  return { kept, truncated }
}

/**
 * Build a full `DbAiSchemaContext` for the current request. The session is
 * closed on every exit path (success, error, cancellation) so connection
 * resources do not leak.
 */
export async function buildSchemaContext(opts: DbAiSchemaContextOptions): Promise<DbAiSchemaContext> {
  const staticCandidates = collectStaticCandidates(opts)
  // If the caller has neither a database name nor any static candidates,
  // there is nothing the driver can help us with; short-circuit.
  if (!opts.databaseName && staticCandidates.length === 0) {
    return { tables: [], unresolvedCandidates: [], estimatedTokens: 0, truncated: false }
  }
  const session = await openDbAiSession({
    assetId: opts.assetId,
    owner: opts.owner,
    databaseName: opts.databaseName,
    schemaName: opts.schemaName
  })
  try {
    // Pre-fetch the current-scope table list once so keyword + fallback +
    // per-candidate existence checks don't each trigger their own query.
    let tablesInScope: string[] = []
    if (opts.databaseName) {
      try {
        tablesInScope = await session.listTables(opts.databaseName, opts.schemaName)
      } catch (error) {
        const err = error as { code?: string; message?: string }
        logger.warn('db-ai listTables failed', {
          event: 'db-ai.schema.list-tables.fail',
          dbType: opts.dbType,
          errorCode: err.code
        })
      }
    }
    const candidates = mergeKeywordAndFallback(staticCandidates, opts, tablesInScope)
    const snippets: TableSchemaSnippet[] = []
    const unresolved: Array<{ schema?: string; table: string }> = []
    for (const candidate of candidates) {
      const snippet = await resolveCandidate(candidate, opts, session, tablesInScope)
      if (snippet) {
        snippets.push(snippet)
      } else {
        unresolved.push({ schema: candidate.schema, table: candidate.table })
      }
    }
    const { kept, truncated } = trimToBudget(snippets, opts.maxTokens)
    const estimated = kept.reduce((acc, s) => acc + (s.ddl ? estimateTokens(s.ddl) : estimateTokens(s.columns.map((c) => c.name).join(','))), 0)
    return {
      tables: kept,
      unresolvedCandidates: unresolved,
      estimatedTokens: estimated,
      truncated
    }
  } finally {
    try {
      await session.close()
    } catch {
      // close() already logs internally; swallow to keep finally side-effect-free.
    }
  }
}
