// Natural-language-to-SQL prompt builder. See docs/database_ai.md §8.2 —
// one fenced SQL block only, default read-only, schema-qualified on
// PostgreSQL, no fabricated tables.

import type { DbAiStartRequest } from '@common/db-ai-types'
import type { DbAiSchemaContext } from '../types'
import { buildSafetyBoundary, buildSchemaContextSection, buildSharedHeader } from './shared'

export interface Nl2SqlPromptInput {
  request: DbAiStartRequest
  schemaContext: DbAiSchemaContext
}

const SYSTEM_PROMPT_EN = [
  'You are a senior database engineer who converts natural-language intent into a single, executable SQL statement.',
  'Output rules:',
  '- Emit EXACTLY one fenced SQL code block (```sql ... ```). No prose before or after the block unless the user explicitly asks for an explanation.',
  '- Default to a read-only query (SELECT / WITH ... SELECT). Only emit DDL/DML when the user explicitly asks for it.',
  '- On PostgreSQL, qualify identifiers with their schema (e.g. "public"."orders").',
  '- On MySQL, use database.table semantics — NEVER invent a PostgreSQL-style schema name.',
  '- If the request cannot be answered safely from the provided schema context, say so in a short note BEFORE the code block and emit a comment-only SQL block (`-- cannot infer from schema`).',
  '- Never request, echo, or invent credentials, hostnames, or secrets.',
  '- Never fabricate tables, columns, indexes, or data that are not in the schema context.'
].join('\n')

export function buildNl2SqlPrompt(input: Nl2SqlPromptInput): { systemPrompt: string; userPrompt: string } {
  const { request, schemaContext } = input
  const dialect = request.input.targetDialect ?? request.context.dbType
  const question = request.input.question?.trim() ?? ''
  const sections: string[] = []
  sections.push(buildSharedHeader(request.context, dialect))
  const schema = buildSchemaContextSection(schemaContext)
  if (schema) sections.push(schema)
  sections.push(buildSafetyBoundary())
  sections.push('## User Intent')
  sections.push(question.length > 0 ? question : '(empty — respond with a placeholder comment)')
  return {
    systemPrompt: SYSTEM_PROMPT_EN,
    userPrompt: sections.join('\n\n')
  }
}
