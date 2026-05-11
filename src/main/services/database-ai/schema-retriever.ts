// Schema retriever for DB-AI prompts. Implements the priority ordering in
// docs/database_ai.md §7.2:
//   1. User-selected tables (hinted / right-click / current data tab)
//   2. Tables referenced in the SQL (FROM/JOIN/UPDATE/INSERT INTO/DELETE FROM)
//   3. Current SQL tab's tableName + schemaName
//   4. Keyword match against table/column names (Phase 2 heuristic)
//   5. Small-schema fallback: inject the current schema's full table list
//      when `listTables()` returns <= SMALL_SCHEMA_THRESHOLD tables
//   6. RAG / embedding Top-K — Phase 5, not implemented here
//
// The retriever is intentionally stateless: callers (currently
// `schema-context.ts`) resolve the candidates against a live
// `DbAiActiveSession` to produce the final `TableSchemaSnippet` list.

import type { DbAiTableHint } from '@common/db-ai-types'
import type { DbAiSchemaContextOptions, TableSchemaSnippet } from './types'
import { extractSqlTableReferences } from './sql-reference-parser'

/**
 * Threshold below which we inject every table in the current schema as a
 * last-resort fallback. 30 matches §7.2 bullet 5 — small enough that the
 * DDLs still fit a typical 4K token budget.
 */
export const SMALL_SCHEMA_THRESHOLD = 30

/**
 * Internal candidate shape. `priority` is 0-based and lower is better.
 * Priorities mirror the §7.2 ordering so a stable sort keeps selected
 * tables at the top and fallback matches at the bottom.
 */
export interface RetrieverCandidate {
  schema?: string
  table: string
  source: TableSchemaSnippet['source']
  priority: number
}

const P_SELECTED = 0
const P_SQL_REF = 1
const P_CURRENT_TAB = 2
const P_KEYWORD = 3
const P_FALLBACK = 4

function key(c: Pick<RetrieverCandidate, 'schema' | 'table'>): string {
  return `${c.schema ?? ''}.${c.table}`
}

function upsert(out: Map<string, RetrieverCandidate>, c: RetrieverCandidate): void {
  const existing = out.get(key(c))
  if (!existing || c.priority < existing.priority) {
    out.set(key(c), c)
  }
}

/**
 * Naive keyword extractor. Splits the question on non-word boundaries, drops
 * stopwords, lowercases, and returns unique tokens. Intentionally simple —
 * proper tokenization is Phase 5 work.
 */
const STOPWORDS = new Set([
  'the',
  'and',
  'or',
  'of',
  'in',
  'to',
  'for',
  'on',
  'with',
  'from',
  'is',
  'are',
  'was',
  'were',
  'a',
  'an',
  'all',
  'any',
  'how',
  'what',
  'which',
  'when',
  'why',
  'where',
  'show',
  'list',
  'get',
  'find',
  'give',
  'me',
  'please',
  'top',
  'by',
  'group',
  'order',
  'count'
])

/**
 * Detect any CJK character (Han, Hiragana, Katakana, Hangul, CJK Symbols).
 * We use this to decide between the Latin word-split path (stopword filter)
 * and the CJK substring path. Kept as a single character-class regex so we
 * don't need to lift in an ICU/segmenter dependency for MVP. Ranges use
 * Unicode escapes so the source file stays clean under the
 * `no-irregular-whitespace` lint rule (the CJK ranges include U+3000
 * ideographic space).
 */
const CJK_CHAR_REGEX = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\u3000-\u303F\uFF00-\uFFEF]/

/**
 * MVP-grade keyword extractor (docs/database_ai.md §13.1):
 *   - Latin input: split on non-word chars, lowercase, drop stopwords and
 *     tokens shorter than 3 chars.
 *   - CJK input: we do NOT tokenize (no space delimiter). Instead we take
 *     sliding n-grams of length 2 and 3 off each CJK run so `mergeKeyword...`
 *     can perform substring containment against table/column names and
 *     comments. Bigram-only was considered but trigrams materially improve
 *     precision on domain-specific table names like `订单记录`.
 *
 * Latin and CJK paths are unioned so a mixed question
 * ("show me 订单 records") still produces both kinds of tokens.
 */
function extractKeywords(text: string | undefined): string[] {
  if (!text) return []
  const seen = new Set<string>()
  const out: string[] = []
  const push = (token: string): void => {
    if (!token || seen.has(token)) return
    seen.add(token)
    out.push(token)
  }
  // Latin path.
  for (const raw of text.split(/[^A-Za-z0-9_]+/)) {
    if (!raw) continue
    const token = raw.toLowerCase()
    if (token.length < 3) continue
    if (STOPWORDS.has(token)) continue
    push(token)
  }
  // CJK path: emit sliding 2-gram and 3-gram windows from every contiguous
  // CJK run. Non-CJK chars break the run so we don't accidentally straddle
  // language boundaries.
  if (CJK_CHAR_REGEX.test(text)) {
    let run = ''
    const flushRun = (): void => {
      if (run.length === 0) return
      for (let i = 0; i < run.length; i++) {
        if (i + 2 <= run.length) push(run.slice(i, i + 2))
        if (i + 3 <= run.length) push(run.slice(i, i + 3))
      }
      run = ''
    }
    for (const ch of text) {
      if (CJK_CHAR_REGEX.test(ch)) {
        run += ch
      } else {
        flushRun()
      }
    }
    flushRun()
  }
  return out
}

/**
 * Collect candidates from the static signals available before any driver
 * call: hinted tables (priority 1), SQL references (priority 2), and the
 * request's current tab (priority 3). Downstream callers merge these with
 * keyword and fallback candidates that require a live `listTables()`.
 */
export function collectStaticCandidates(opts: DbAiSchemaContextOptions): RetrieverCandidate[] {
  const out = new Map<string, RetrieverCandidate>()
  for (const h of opts.hintedTables ?? []) {
    upsert(out, { schema: h.schema, table: h.table, source: 'selected', priority: P_SELECTED })
  }
  if (opts.sql) {
    for (const ref of extractSqlTableReferences(opts.sql)) {
      upsert(out, {
        schema: ref.schema,
        table: ref.table,
        source: 'sql-reference',
        priority: P_SQL_REF
      })
    }
  }
  // Priority 3: `schema-context.ts` passes the current-tab table through
  // `hintedTables` when available, but if a caller wires the current tab
  // via the context object directly we still want to honor it here.
  const tabTable = (opts as DbAiSchemaContextOptions & { currentTabTable?: string }).currentTabTable
  if (tabTable) {
    upsert(out, {
      schema: opts.schemaName,
      table: tabTable,
      source: 'selected',
      priority: P_CURRENT_TAB
    })
  }
  return Array.from(out.values()).sort((a, b) => a.priority - b.priority)
}

/**
 * Merge static candidates with keyword + fallback candidates produced once
 * the caller has a driver session. `allTablesInScope` is the output of
 * `session.listTables(databaseName, schemaName)`.
 *
 * Keyword rule: a table name that contains ANY extracted keyword (lowercase,
 * substring) is promoted to priority 4. Fallback rule: if the static list is
 * empty AND the scope has <= SMALL_SCHEMA_THRESHOLD tables, every table is
 * injected at priority 5.
 */
export function mergeKeywordAndFallback(
  statics: RetrieverCandidate[],
  opts: DbAiSchemaContextOptions,
  allTablesInScope: string[]
): RetrieverCandidate[] {
  const out = new Map<string, RetrieverCandidate>()
  for (const c of statics) upsert(out, c)

  const keywords = extractKeywords(opts.question)
  if (keywords.length > 0) {
    for (const table of allTablesInScope) {
      const lower = table.toLowerCase()
      if (keywords.some((k) => lower.includes(k))) {
        upsert(out, {
          schema: opts.schemaName,
          table,
          source: 'keyword',
          priority: P_KEYWORD
        })
      }
    }
  }

  // Small-schema fallback: only triggered when nothing else matched. Avoids
  // overwhelming the budget on medium-sized schemas where keyword match
  // already produced signal.
  if (out.size === 0 && allTablesInScope.length > 0 && allTablesInScope.length <= SMALL_SCHEMA_THRESHOLD) {
    for (const table of allTablesInScope) {
      upsert(out, {
        schema: opts.schemaName,
        table,
        source: 'fallback',
        priority: P_FALLBACK
      })
    }
  }
  return Array.from(out.values()).sort((a, b) => a.priority - b.priority)
}

/**
 * Convenience: turn a candidate list into the `DbAiTableHint[]` shape
 * used by the `tablesUsed` telemetry field.
 */
export function toTableHints(candidates: RetrieverCandidate[]): DbAiTableHint[] {
  return candidates.map((c) => ({ schema: c.schema, table: c.table }))
}

/** Test-only surface. */
export const __testing = { extractKeywords, STOPWORDS, SMALL_SCHEMA_THRESHOLD }
