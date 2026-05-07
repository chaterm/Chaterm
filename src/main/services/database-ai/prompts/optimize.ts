// SQL optimize prompt builder. See docs/database_ai.md §8.4 — output the
// issues ranked by impact, a rewritten SQL block, suggested index DDLs,
// rationale, and risk/verification steps. Critical caveat: without
// statistics or an actual EXPLAIN plan, advice MUST be framed as
// "based on schema only" rather than claims about execution plans.

import type { DbAiStartRequest } from '@common/db-ai-types'
import type { DbAiSchemaContext } from '../types'
import { buildSafetyBoundary, buildSchemaContextSection, buildSharedHeader } from './shared'

export interface OptimizePromptInput {
  request: DbAiStartRequest
  schemaContext: DbAiSchemaContext
  /** True when the caller was able to attach an EXPLAIN plan. Phase 3+ only. */
  hasExplainPlan?: boolean
}

const SYSTEM_PROMPT_EN = [
  'You are a senior database performance engineer reviewing a SQL statement.',
  'Output the following Markdown sections in exact order:',
  '',
  '1. **Issues** — bullet list, ranked by impact (highest first). Each bullet: issue + short evidence drawn from the SQL / schema context.',
  '2. **Rewritten SQL** — one fenced ```sql code block. If no rewrite is beneficial, repeat the original SQL and say so in (1).',
  '3. **Suggested Indexes** — zero or more fenced ```sql blocks with CREATE INDEX / CREATE UNIQUE INDEX DDLs. Omit the section when you have no index advice.',
  '4. **Rationale** — short explanation of why the rewrite and the suggested indexes help. Tie each point back to an item in (1).',
  '5. **Risks & Verification** — bullet list. Always include at least one verification step (e.g. "run EXPLAIN on the rewritten SQL and compare planning + execution cost").',
  '',
  'Framing rules:',
  '- When no EXPLAIN plan or statistics are provided, prefix performance claims with "Based on schema only:" and NEVER assert a concrete plan outcome.',
  '- Do not invent columns or indexes that are not in the schema context. If the schema does not contain the required columns, state so and stop.',
  '- Never produce credentials, hostnames, or any secret.',
  '- Keep the response concise; bullets beat prose.'
].join('\n')

export function buildOptimizePrompt(input: OptimizePromptInput): { systemPrompt: string; userPrompt: string } {
  const { request, schemaContext, hasExplainPlan } = input
  const dialect = request.input.targetDialect ?? request.context.dbType
  const sql = request.input.sql ?? request.input.selectedText ?? ''
  const sections: string[] = []
  sections.push(buildSharedHeader(request.context, dialect))
  const schema = buildSchemaContextSection(schemaContext)
  if (schema) sections.push(schema)
  sections.push(buildSafetyBoundary())
  sections.push('## Signal Availability')
  sections.push(hasExplainPlan ? '- EXPLAIN plan: provided' : '- EXPLAIN plan: NOT available (advise based on schema only)')
  sections.push('## SQL to Optimize')
  sections.push('```sql')
  sections.push(sql.trim())
  sections.push('```')
  return {
    systemPrompt: SYSTEM_PROMPT_EN,
    userPrompt: sections.join('\n\n')
  }
}
