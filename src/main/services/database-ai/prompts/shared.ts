// Shared prompt helpers used by every DB-AI action. Single source of truth
// for header injection (dialect, database/schema, schema context, safety
// boundaries) so individual action prompts stay focused on their specific
// output format. See docs/database_ai.md §8.1.

import type { DbAiRequestContext, SqlDialect } from '@common/db-ai-types'
import type { DbAiSchemaContext, TableSchemaSnippet } from '../types'
import { getDialectInfo } from '../dialect'

/**
 * Produce the dialect-aware header shared by every DB-AI prompt. Emits
 * structured Markdown so the model can parse it consistently across actions.
 */
export function buildSharedHeader(ctx: DbAiRequestContext, dialect: SqlDialect): string {
  const info = getDialectInfo(dialect)
  const lines: string[] = []
  lines.push(`## Database Context`)
  lines.push(`- Engine: ${info.displayName} (${info.dialect})`)
  lines.push(`- Identifier quote: ${info.identifierQuote}`)
  if (ctx.databaseName) lines.push(`- Current database: ${ctx.databaseName}`)
  if (ctx.schemaName) lines.push(`- Current schema: ${ctx.schemaName}`)
  if (ctx.tableName) lines.push(`- Current table: ${ctx.tableName}`)
  return lines.join('\n')
}

/**
 * Render a single table snippet into a Markdown section the model can
 * consume. DDL takes priority; when only columns are available we render a
 * compact bullet list so the model can still reason about shape.
 */
export function renderTableSnippet(snippet: TableSchemaSnippet): string {
  const qualified = snippet.schema ? `${snippet.schema}.${snippet.table}` : snippet.table
  const out: string[] = []
  out.push(`### Table: ${qualified}`)
  if (snippet.ddl) {
    out.push('```sql')
    out.push(snippet.ddl.trim())
    out.push('```')
  } else if (snippet.columns.length > 0) {
    out.push('Columns:')
    for (const col of snippet.columns) {
      const type = col.type ? ` (${col.type})` : ''
      const comment = col.comment ? ` -- ${col.comment}` : ''
      out.push(`- ${col.name}${type}${comment}`)
    }
  }
  return out.join('\n')
}

/**
 * Emit the full schema-context section (header + table snippets). Returns an
 * empty string when no tables are available so the prompt keeps a consistent
 * shape regardless of schema availability.
 */
export function buildSchemaContextSection(context: DbAiSchemaContext): string {
  if (context.tables.length === 0) return ''
  const parts: string[] = []
  parts.push('## Schema Context')
  if (context.truncated) {
    parts.push('_Note: schema context was truncated due to token budget._')
  }
  for (const t of context.tables) {
    parts.push(renderTableSnippet(t))
  }
  return parts.join('\n\n')
}

/**
 * Safety-boundary section included in every DB-AI prompt. The goal is to
 * discourage the model from producing credentials or fabricating schema.
 */
export function buildSafetyBoundary(): string {
  return [
    '## Safety Boundary',
    '- Do NOT request, echo, or invent credentials, tokens, hostnames, or connection strings.',
    '- Do NOT assume tables, columns, or indexes that are not present in the schema context above.',
    '- When information is missing, say so explicitly instead of guessing.'
  ].join('\n')
}
