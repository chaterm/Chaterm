// SQL Explain prompt builder. Emits the five-section structure required by
// docs/database_ai.md §8.3:
//   1. Query purpose
//   2. Clause-by-clause explanation
//   3. Tables and columns involved
//   4. Potential risks (full scan, implicit cast, cartesian product, NULL
//      semantics, unstable pagination)
//   5. Suggested next steps for the user

import type { DbAiStartRequest } from '@common/db-ai-types'
import type { DbAiSchemaContext } from '../types'
import { buildSafetyBoundary, buildSchemaContextSection, buildSharedHeader } from './shared'

export interface ExplainPromptInput {
  request: DbAiStartRequest
  schemaContext: DbAiSchemaContext
}

/**
 * System prompt: frames the model as a DBA and pins the output format so
 * the drawer can rely on a stable section order.
 */
const SYSTEM_PROMPT_EN = [
  'You are a senior database engineer who explains SQL with precision and calm.',
  'Respond in clear English (the UI will localize surrounding labels).',
  'Output exactly the following Markdown sections, in this order:',
  '',
  '1. **Query Purpose** — one short paragraph describing what the query returns or performs.',
  '2. **Clause-by-clause Explanation** — walk through each top-level clause (SELECT / FROM / JOIN / WHERE / GROUP BY / HAVING / ORDER BY / LIMIT / WITH / UNION etc.) and describe its effect.',
  '3. **Tables and Columns Involved** — bullet list. Use fully qualified names when multiple schemas are in play.',
  '4. **Potential Risks** — flag at least the following when applicable: full table scan, implicit type conversion, cartesian product from missing JOIN predicate, NULL-related semantics, unstable pagination (ORDER BY without tiebreaker), non-sargable predicates.',
  '5. **Suggested Next Steps** — concrete, ranked suggestions (e.g. "run EXPLAIN", "add composite index on (a, b)", "clarify business intent"). Keep each bullet actionable.',
  '',
  'Rules:',
  '- Never invent tables, columns, indexes, or data that are not in the schema context.',
  '- Never echo credentials, connection strings, or any secret.',
  '- Never guess at data volumes; phrase scan/cost warnings conditionally.',
  '- Keep the response concise; prefer bullet points over prose when possible.'
].join('\n')

/**
 * Build the explain prompt pair. `userPrompt` intentionally re-inlines the
 * raw SQL inside a fenced code block so the model sees it verbatim.
 */
export function buildExplainPrompt(input: ExplainPromptInput): { systemPrompt: string; userPrompt: string } {
  const { request, schemaContext } = input
  const sql = request.input.sql ?? request.input.selectedText ?? ''
  const dialect = request.input.targetDialect ?? request.context.dbType
  const sections: string[] = []
  sections.push(buildSharedHeader(request.context, dialect))
  const schema = buildSchemaContextSection(schemaContext)
  if (schema) sections.push(schema)
  sections.push(buildSafetyBoundary())
  sections.push('## SQL to Explain')
  sections.push('```sql')
  sections.push(sql.trim())
  sections.push('```')
  return {
    systemPrompt: SYSTEM_PROMPT_EN,
    userPrompt: sections.join('\n\n')
  }
}
