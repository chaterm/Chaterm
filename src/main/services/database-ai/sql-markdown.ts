// Extract a SQL code block from model Markdown output. Used by every DB-AI
// action that returns SQL (nl2sql, optimize, convert). Implementation is
// intentionally simple and forgiving — the model sometimes forgets the
// language tag, wraps in single backticks, or prefixes the block with
// "Here is the SQL:" so we tolerate those variants without getting clever.
// See docs/database_ai.md §8.2.

/**
 * Remove a single trailing semicolon plus whitespace. Keeps the SQL clean
 * when callers feed the extracted block back into a `execute_readonly_query`
 * or Monaco insertion.
 */
function stripTrailingSemicolon(sqlIn: string): string {
  return sqlIn.replace(/;\s*$/u, '').trimEnd()
}

/**
 * Extract the first fenced SQL block. Returns `null` when no code block is
 * present so callers can fall back to showing the raw text.
 *
 * Matches (case-insensitive):
 *   ```sql\n...\n```
 *   ```SQL\n...\n```
 *   ``` postgresql\n...\n```
 *   ```\n<code>\n```  (no language tag, only when content starts with
 *                     select/with/update/insert/delete/explain/show/create)
 */
export function extractFirstSqlBlock(markdown: string): string | null {
  if (!markdown) return null

  // Prefer explicit sql-tagged fences.
  const tagged = /```\s*(sql|postgresql|postgres|pg|mysql|plpgsql|tsql|plsql)\s*\r?\n([\s\S]*?)```/i.exec(markdown)
  if (tagged && tagged[2]) {
    return stripTrailingSemicolon(tagged[2].trim())
  }

  // Accept untagged blocks only when the first non-empty line looks like SQL.
  const untagged = /```\s*\r?\n([\s\S]*?)```/.exec(markdown)
  if (untagged && untagged[1]) {
    const body = untagged[1].trim()
    if (/^\s*(select|with|update|insert|delete|explain|show|create|alter|drop)\b/i.test(body)) {
      return stripTrailingSemicolon(body)
    }
  }
  return null
}

/**
 * Pull every fenced SQL block out of the Markdown. Useful for `optimize`
 * prompts that legitimately return both a rewritten SQL and one or more
 * suggested `CREATE INDEX` DDLs.
 */
export function extractAllSqlBlocks(markdown: string): string[] {
  if (!markdown) return []
  const out: string[] = []
  const tagged = /```\s*(sql|postgresql|postgres|pg|mysql|plpgsql|tsql|plsql)\s*\r?\n([\s\S]*?)```/gi
  let m: RegExpExecArray | null
  while ((m = tagged.exec(markdown)) !== null) {
    const body = m[2].trim()
    if (body) out.push(stripTrailingSemicolon(body))
  }
  return out
}

/**
 * Test-only surface. Kept exported so unit tests can assert the
 * semicolon-stripping edge cases without re-implementing them.
 */
export const __testing = { stripTrailingSemicolon }
