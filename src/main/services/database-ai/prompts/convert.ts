// SQL dialect-conversion prompt builder. See docs/database_ai.md §8.5 —
// target-dialect SQL code block, semantic-change bullets, and an explicit
// "cannot auto-convert" list. Dialect hints (quote char, pagination, date
// functions, etc.) come from `dialect.ts`.

import type { DbAiStartRequest, SqlDialect } from '@common/db-ai-types'
import { getDialectInfo } from '../dialect'
import { buildSafetyBoundary, buildSharedHeader } from './shared'

export interface ConvertPromptInput {
  request: DbAiStartRequest
  /** Target dialect chosen by the renderer (unconnected targets are allowed). */
  targetDialect: SqlDialect
}

const SYSTEM_PROMPT_EN = [
  'You are a SQL portability expert converting a statement between dialects.',
  'Output the following Markdown sections, in exact order:',
  '',
  '1. **Converted SQL** — one fenced ```sql code block written in the TARGET dialect. Preserve the original intent; do not add new joins, columns, or filters.',
  '2. **Semantic Changes** — bullet list of textual transformations (quote characters, pagination, date/time functions, boolean literals, JSON operators, upsert syntax, limit/top/fetch-first).',
  '3. **Cannot Auto-Convert** — bullet list of constructs that cannot be translated safely (e.g. engine-specific hints, stored procedures, dialect-only functions). Each bullet describes the construct and the reason.',
  '',
  'Rules:',
  '- Assume you have NO live connection to the target engine. The conversion is purely textual; do not claim execution results.',
  '- Do NOT fabricate functions or constructs that are not standard on the target dialect.',
  '- Never produce credentials, hostnames, or any secret.',
  '- Keep the code block compact; place explanatory text in the bullet lists, not inline.'
].join('\n')

export function buildConvertPrompt(input: ConvertPromptInput): { systemPrompt: string; userPrompt: string } {
  const { request, targetDialect } = input
  const sourceDialect = request.input.targetDialect ?? request.context.dbType
  const sql = request.input.sql ?? request.input.selectedText ?? ''
  const sourceInfo = getDialectInfo(sourceDialect)
  const targetInfo = getDialectInfo(targetDialect)
  const sections: string[] = []
  sections.push(buildSharedHeader(request.context, sourceDialect))
  sections.push('## Conversion Target')
  sections.push(`- Target engine: ${targetInfo.displayName} (${targetInfo.dialect})`)
  sections.push(`- Target identifier quote: ${targetInfo.identifierQuote}`)
  sections.push('## Dialect Hint')
  sections.push(dialectHintTable(sourceInfo.dialect, targetInfo.dialect))
  sections.push(buildSafetyBoundary())
  sections.push('## SQL to Convert')
  sections.push('```sql')
  sections.push(sql.trim())
  sections.push('```')
  return {
    systemPrompt: SYSTEM_PROMPT_EN,
    userPrompt: sections.join('\n\n')
  }
}

/**
 * Inline cheat-sheet of the most commonly mistranslated constructs. Kept
 * terse so it fits in the prompt budget without displacing schema context.
 * Entries cover the categories listed in §8.5.
 */
function dialectHintTable(source: SqlDialect, target: SqlDialect): string {
  if (source === target) return '- Source and target are identical; emit the SQL unchanged (still do the sanity checks).'
  const lines: string[] = []
  const q = (d: SqlDialect): string => getDialectInfo(d).identifierQuote
  lines.push(`- Identifier quote: ${q(source)} (source) -> ${q(target)} (target)`)
  if (target === 'mysql') {
    lines.push('- Pagination: use LIMIT n OFFSET m (or LIMIT m, n). MySQL does not support FETCH FIRST.')
    lines.push("- String aggregation: GROUP_CONCAT(expr SEPARATOR ',')")
    lines.push('- Boolean literal: TRUE/FALSE accepted; stored as tinyint(1).')
    lines.push('- Upsert: INSERT ... ON DUPLICATE KEY UPDATE')
    lines.push("- JSON: JSON_EXTRACT(col, '$.path') or col->'$.path'; no PG jsonb operators.")
    lines.push('- Date/time: NOW(), CURDATE(), DATE_SUB(), DATE_FORMAT() — prefer over PG date_trunc/TO_CHAR.')
  } else if (target === 'postgresql') {
    lines.push('- Pagination: LIMIT n OFFSET m. FETCH FIRST n ROWS ONLY is also valid.')
    lines.push("- String aggregation: STRING_AGG(expr, ',')")
    lines.push('- Boolean literal: TRUE/FALSE (real boolean type, not tinyint).')
    lines.push('- Upsert: INSERT ... ON CONFLICT (...) DO UPDATE SET ...')
    lines.push('- JSON: jsonb operators (->, ->>, #>, @>). MySQL JSON_EXTRACT has no direct PG equivalent.')
    lines.push('- Date/time: NOW(), CURRENT_DATE, DATE_TRUNC(), TO_CHAR() — prefer over MySQL DATE_FORMAT.')
  }
  return lines.join('\n')
}
