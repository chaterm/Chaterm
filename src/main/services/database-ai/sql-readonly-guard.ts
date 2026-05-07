// SQL read-only guard used by DB-AI tools that can execute SQL against a live
// session (`execute_readonly_query`, `explain_plan`). Goal: allow only
// verifiably read-only statements through a conservative whitelist. The
// policy is "reject on ambiguity" — any construct we cannot statically prove
// safe is rejected. See docs/database_ai.md §10.1.
//
// IMPORTANT: this is NOT a full SQL parser. It performs two passes:
//
//   1. Strip comments and string literals (including PG dollar-quoted and
//      E'...' escape, MySQL backticks, block + line comments). Nested block
//      comments are rejected because JavaScript regex cannot disambiguate
//      them safely, and §10.1 requires conservative rejection.
//
//   2. On the resulting skeleton, perform token-level checks:
//      - single statement (no `;` followed by non-whitespace)
//      - first keyword in a whitelist
//      - WITH / EXPLAIN variant restrictions
//
// A future iteration may introduce a second pass via `node-sql-parser` /
// `pgsql-ast-parser`. That does not replace this guard; it only adds a
// stricter second opinion.

/**
 * Error codes returned to the caller. Stable so the renderer can show a
 * localized label without parsing the reason text.
 */
export type GuardErrorCode =
  | 'E_NESTED_BLOCK_COMMENT'
  | 'E_MULTIPLE_STATEMENTS'
  | 'E_EMPTY_STATEMENT'
  | 'E_NOT_WHITELISTED'
  | 'E_WITH_CONTAINS_DML'
  | 'E_EXPLAIN_ANALYZE'
  | 'E_EXPLAIN_TARGET_NOT_SELECT'
  | 'E_UNTERMINATED_LITERAL'

export type GuardResult = { ok: true; skeleton: string } | { ok: false; errorCode: GuardErrorCode; reason: string }

// ---------------------------------------------------------------------------
// Stripper: replace comments + string literals with spaces, preserving length
// so skeleton offsets match the original SQL.
// ---------------------------------------------------------------------------

interface StripOutcome {
  skeleton: string
  /** Set when we detected something we cannot safely parse. */
  hardFail?: GuardErrorCode
}

function blankRange(src: string, start: number, end: number): string {
  return src.slice(0, start) + ' '.repeat(end - start) + src.slice(end)
}

/**
 * Detect whether we are at the start of a nested block comment opener inside
 * an already-open block comment. We reject these outright — see §10.1.
 */
function stripCommentsAndLiterals(sqlIn: string): StripOutcome {
  let sql = sqlIn
  const len = sql.length
  let i = 0
  while (i < len) {
    const c = sql[i]
    const n = sql[i + 1]

    // Line comment: -- ...\n
    if (c === '-' && n === '-') {
      let j = i + 2
      while (j < len && sql[j] !== '\n') j++
      sql = blankRange(sql, i, j)
      i = j
      continue
    }

    // Block comment: /* ... */ . Nested opens are rejected.
    if (c === '/' && n === '*') {
      let depth = 1
      let j = i + 2
      while (j < len - 1) {
        if (sql[j] === '/' && sql[j + 1] === '*') {
          // Nested block comment opener: reject conservatively.
          return { skeleton: sql, hardFail: 'E_NESTED_BLOCK_COMMENT' }
        }
        if (sql[j] === '*' && sql[j + 1] === '/') {
          depth--
          j += 2
          if (depth === 0) break
          continue
        }
        j++
      }
      if (depth !== 0) {
        // Unterminated block comment: treat as unsafe (likely malformed SQL).
        return { skeleton: sql, hardFail: 'E_UNTERMINATED_LITERAL' }
      }
      sql = blankRange(sql, i, j)
      i = j
      continue
    }

    // MySQL backtick identifier: `...` with `` as escape. We blank the
    // identifier content (including the backticks) so outer parsers don't
    // see keywords inside identifiers like `created_at`.
    if (c === '`') {
      let j = i + 1
      while (j < len) {
        if (sql[j] === '`') {
          if (sql[j + 1] === '`') {
            j += 2
            continue
          }
          j++
          break
        }
        j++
      }
      if (j > len) return { skeleton: sql, hardFail: 'E_UNTERMINATED_LITERAL' }
      sql = blankRange(sql, i, j)
      i = j
      continue
    }

    // PostgreSQL double-quoted identifier: "..." with "" as escape. Treated
    // the same as backticks — strip so keywords inside identifiers don't
    // reach the whitelist checks.
    if (c === '"') {
      let j = i + 1
      while (j < len) {
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') {
            j += 2
            continue
          }
          j++
          break
        }
        j++
      }
      if (j > len) return { skeleton: sql, hardFail: 'E_UNTERMINATED_LITERAL' }
      sql = blankRange(sql, i, j)
      i = j
      continue
    }

    // PostgreSQL escape string: E'...'. The `E` prefix enables backslash
    // escapes so we consume `\X` as a unit.
    if ((c === 'E' || c === 'e') && n === "'") {
      let j = i + 2
      while (j < len) {
        if (sql[j] === '\\' && j + 1 < len) {
          j += 2
          continue
        }
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2
            continue
          }
          j++
          break
        }
        j++
      }
      if (j > len) return { skeleton: sql, hardFail: 'E_UNTERMINATED_LITERAL' }
      sql = blankRange(sql, i, j)
      i = j
      continue
    }

    // Standard single-quoted string: '...' with '' as escape.
    if (c === "'") {
      let j = i + 1
      while (j < len) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2
            continue
          }
          j++
          break
        }
        j++
      }
      if (j > len) return { skeleton: sql, hardFail: 'E_UNTERMINATED_LITERAL' }
      sql = blankRange(sql, i, j)
      i = j
      continue
    }

    // PostgreSQL dollar-quoted string: $tag$...$tag$ (tag may be empty).
    if (c === '$') {
      const tagMatch = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))
      if (tagMatch) {
        const tag = tagMatch[0]
        const endIdx = sql.indexOf(tag, i + tag.length)
        if (endIdx === -1) {
          return { skeleton: sql, hardFail: 'E_UNTERMINATED_LITERAL' }
        }
        const endPos = endIdx + tag.length
        sql = blankRange(sql, i, endPos)
        i = endPos
        continue
      }
    }

    i++
  }
  return { skeleton: sql }
}

// ---------------------------------------------------------------------------
// Token helpers.
// ---------------------------------------------------------------------------

/**
 * Split the skeleton on word/non-word boundaries so we can look at keywords
 * in isolation. Preserves case of original tokens; callers lowercase the
 * prefix they care about.
 */
function tokens(skel: string): string[] {
  return skel.match(/[A-Za-z_][A-Za-z0-9_]*|\S/g) ?? []
}

/**
 * True when the skeleton contains a `;` followed by a non-whitespace token.
 * Trailing `;` is allowed (common idiom) but anything after it is not.
 */
function hasExtraStatement(skel: string): boolean {
  const idx = skel.indexOf(';')
  if (idx === -1) return false
  const tail = skel.slice(idx + 1)
  return tail.trim().length > 0
}

/** Strip leading whitespace and normalize to lowercase for keyword checks. */
function trimStart(skel: string): string {
  return skel.replace(/^\s+/, '')
}

/** DML/DDL keywords forbidden inside a CTE body and as top-level statements. */
const DISALLOWED_KEYWORDS = new Set([
  'insert',
  'update',
  'delete',
  'merge',
  'upsert',
  'replace',
  'create',
  'drop',
  'alter',
  'truncate',
  'grant',
  'revoke',
  'call',
  'commit',
  'rollback',
  'savepoint',
  'begin',
  'copy',
  'vacuum',
  'analyze',
  'analyse',
  'reindex',
  'cluster',
  'lock',
  'set'
])

// ---------------------------------------------------------------------------
// EXPLAIN handling.
// ---------------------------------------------------------------------------

/**
 * Match any EXPLAIN options block, whether PostgreSQL `EXPLAIN (a, b, c)` or
 * MySQL `EXPLAIN FORMAT=JSON` / `EXPLAIN EXTENDED` / `EXPLAIN ANALYZE`.
 * Returns the substring between EXPLAIN and the first SELECT token so the
 * caller can look for forbidden options.
 */
function readExplainOptions(skel: string): { optionsText: string; rest: string } | null {
  const m = /^\s*explain\b/i.exec(skel)
  if (!m) return null
  let i = m.index + m[0].length
  // Skip whitespace + optional options clauses. We consume everything up to
  // the first `select` keyword, treating the intermediate text as option text
  // so that both `EXPLAIN ANALYZE SELECT` and `EXPLAIN (ANALYZE, BUFFERS)
  // SELECT` feed `optionsText`.
  const afterSelect = /\bselect\b/i.exec(skel.slice(i))
  if (!afterSelect) {
    return { optionsText: skel.slice(i), rest: '' }
  }
  const selectAt = i + afterSelect.index
  const optionsText = skel.slice(i, selectAt)
  const rest = skel.slice(selectAt)
  return { optionsText, rest }
}

/**
 * Detect ANALYZE / ANALYSE tokens anywhere in the EXPLAIN options block.
 * The §10.1 policy is: ANY form of ANALYZE in EXPLAIN is a hard reject
 * because PostgreSQL actually executes the query.
 */
function explainOptionsContainAnalyze(optionsText: string): boolean {
  return /\banaly[sz]e\b/i.test(optionsText)
}

// ---------------------------------------------------------------------------
// WITH / CTE handling.
// ---------------------------------------------------------------------------

/**
 * Walk the skeleton starting at the `WITH` keyword and return the list of
 * CTE bodies (substrings between their outer parentheses). The walker
 * respects nested parentheses so a CTE containing a subquery is captured
 * whole.
 */
function extractCteBodies(skel: string): string[] {
  const m = /\bwith\b(\s+recursive\b)?/i.exec(skel)
  if (!m) return []
  let i = m.index + m[0].length
  const bodies: string[] = []
  const len = skel.length
  while (i < len) {
    // Skip whitespace + CTE name + optional column list until the next `(`.
    while (i < len && /[^(]/.test(skel[i])) {
      // Stop if we've already passed into the main SELECT body.
      if (/select|insert|update|delete|merge/i.test(skel.slice(i, i + 6))) {
        // Check word boundary: /select\b/ etc.
        if (/^\s*(select|insert|update|delete|merge)\b/i.test(skel.slice(i))) {
          return bodies
        }
      }
      i++
    }
    if (i >= len) break
    // We're on an opening paren. Walk to the matching close.
    let depth = 1
    const bodyStart = i + 1
    i++
    while (i < len && depth > 0) {
      const ch = skel[i]
      if (ch === '(') depth++
      else if (ch === ')') depth--
      i++
    }
    const bodyEnd = i - 1
    if (bodyEnd > bodyStart) bodies.push(skel.slice(bodyStart, bodyEnd))
    // After the close paren, expect a comma (another CTE) or the final SELECT.
    const after = skel.slice(i).trimStart()
    if (after.startsWith(',')) {
      i = skel.indexOf(',', i) + 1
      continue
    }
    break
  }
  return bodies
}

/**
 * Scan a CTE body for disallowed top-level statements. We look at the first
 * meaningful keyword inside the body; a SELECT / WITH / VALUES body is
 * allowed, everything else is rejected.
 */
function cteBodyIsSafe(body: string): boolean {
  const trimmed = trimStart(body).toLowerCase()
  if (trimmed.startsWith('select')) return /^select\b/.test(trimmed)
  if (trimmed.startsWith('values')) return /^values\b/.test(trimmed)
  if (trimmed.startsWith('with')) return /^with\b/.test(trimmed)
  if (trimmed.startsWith('(')) {
    // Parenthesized sub-select; unwrap one level and recurse once.
    return cteBodyIsSafe(body.replace(/^\s*\(/, '').replace(/\)\s*$/, ''))
  }
  return false
}

// ---------------------------------------------------------------------------
// Public guard.
// ---------------------------------------------------------------------------

/**
 * Determine whether the given SQL is safe to execute under the DB-AI
 * read-only tool contract. The function is deliberately conservative:
 * anything it cannot statically prove safe is rejected.
 */
export function isReadOnlySql(sqlIn: string): GuardResult {
  if (!sqlIn || sqlIn.trim().length === 0) {
    return { ok: false, errorCode: 'E_EMPTY_STATEMENT', reason: 'SQL is empty.' }
  }
  const stripped = stripCommentsAndLiterals(sqlIn)
  if (stripped.hardFail) {
    return {
      ok: false,
      errorCode: stripped.hardFail,
      reason:
        stripped.hardFail === 'E_NESTED_BLOCK_COMMENT'
          ? 'Nested block comments are not supported; please simplify the SQL.'
          : 'SQL contains an unterminated string or comment.'
    }
  }
  const skel = stripped.skeleton
  if (hasExtraStatement(skel)) {
    return { ok: false, errorCode: 'E_MULTIPLE_STATEMENTS', reason: 'Multiple statements are not allowed.' }
  }
  const trimmed = trimStart(skel)
  if (trimmed.length === 0) {
    return { ok: false, errorCode: 'E_EMPTY_STATEMENT', reason: 'SQL is empty after stripping comments.' }
  }
  const lower = trimmed.toLowerCase()

  // Whitelist branch: SELECT / WITH ... SELECT / SHOW / DESC(RIBE) / EXPLAIN.
  if (/^select\b/.test(lower)) {
    return { ok: true, skeleton: skel }
  }
  if (/^show\b/.test(lower)) {
    return { ok: true, skeleton: skel }
  }
  if (/^(desc|describe)\b/.test(lower)) {
    return { ok: true, skeleton: skel }
  }
  if (/^with\b/.test(lower)) {
    // WITH must finish with a top-level SELECT and no CTE body may contain
    // DML/DDL.
    const bodies = extractCteBodies(skel)
    for (const body of bodies) {
      if (!cteBodyIsSafe(body)) {
        return {
          ok: false,
          errorCode: 'E_WITH_CONTAINS_DML',
          reason: 'WITH clause contains a non-read-only statement.'
        }
      }
      // Even a SELECT body can harbor DML via e.g. `SELECT ...  FROM (DELETE
      // ...)` on databases that support data-modifying CTEs. Reject if any
      // disallowed top-level keyword appears.
      const bodyTokens = tokens(body)
      for (const tok of bodyTokens) {
        if (DISALLOWED_KEYWORDS.has(tok.toLowerCase())) {
          return {
            ok: false,
            errorCode: 'E_WITH_CONTAINS_DML',
            reason: 'WITH clause contains a disallowed keyword.'
          }
        }
      }
    }
    // After the last CTE, require the main statement to be SELECT.
    const mainMatch = /\)\s*(,|(?:select)\b)/gi
    // Find the final occurrence where a `)` is immediately followed by SELECT
    // (potentially after whitespace). If the main statement starts with
    // something else we reject.
    const finalSelect = /\)\s*(?:select)\b/i.test(skel)
    if (!finalSelect) {
      return {
        ok: false,
        errorCode: 'E_NOT_WHITELISTED',
        reason: 'WITH clause must be followed by a SELECT statement.'
      }
    }
    void mainMatch
    return { ok: true, skeleton: skel }
  }
  if (/^explain\b/.test(lower)) {
    const explain = readExplainOptions(skel)
    if (!explain || explain.rest.length === 0) {
      return {
        ok: false,
        errorCode: 'E_EXPLAIN_TARGET_NOT_SELECT',
        reason: 'EXPLAIN must target a SELECT statement.'
      }
    }
    if (explainOptionsContainAnalyze(explain.optionsText)) {
      return {
        ok: false,
        errorCode: 'E_EXPLAIN_ANALYZE',
        reason: 'EXPLAIN ANALYZE / ANALYSE is not allowed; it may execute the query.'
      }
    }
    // The target SQL must itself be a SELECT (or WITH ... SELECT).
    const restLower = trimStart(explain.rest).toLowerCase()
    if (/^select\b/.test(restLower) || /^with\b/.test(restLower)) {
      // Recurse once into the target to reuse WITH validation.
      if (/^with\b/.test(restLower)) {
        const inner = isReadOnlySql(explain.rest)
        if (!inner.ok) return inner
      }
      return { ok: true, skeleton: skel }
    }
    return {
      ok: false,
      errorCode: 'E_EXPLAIN_TARGET_NOT_SELECT',
      reason: 'EXPLAIN must target a SELECT statement.'
    }
  }

  return {
    ok: false,
    errorCode: 'E_NOT_WHITELISTED',
    reason: 'Only read-only statements are allowed (SELECT / WITH / SHOW / DESC / EXPLAIN).'
  }
}

/**
 * Test-only surface. Kept exported so the unit test suite can exercise the
 * stripper in isolation for comment / literal edge cases.
 */
export const __testing = {
  stripCommentsAndLiterals,
  hasExtraStatement,
  extractCteBodies,
  cteBodyIsSafe,
  readExplainOptions,
  explainOptionsContainAnalyze,
  tokens
}
