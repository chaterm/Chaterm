// SQL read-only guard used by DB-AI tools that can execute SQL against a live
// session (`execute_readonly_query`, `explain_plan`). Goal: allow only
// verifiably read-only statements through a conservative whitelist. The
// policy is "reject on ambiguity" — any construct we cannot statically prove
// safe is rejected. See docs/database_ai.md §10.1.
//
// IMPORTANT: this is NOT a full SQL parser. It performs two passes:
//
//   1. Strip comments and string literals (including PG dollar-quoted, Oracle q-quoted,
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
  | 'E_COMPLEXITY_LIMIT'

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

    // Oracle alternative quoting mechanism: q'[ ... ]', q'( ... )',
    // q'{ ... }', q'< ... >', or q'X ... X'. Strip it before the
    // standard single-quote branch so semicolons/keywords inside literals
    // do not affect read-only checks.
    if ((c === 'Q' || c === 'q') && n === "'") {
      const open = sql[i + 2]
      if (!open) return { skeleton: sql, hardFail: 'E_UNTERMINATED_LITERAL' }
      const closeMap: Record<string, string> = {
        '[': ']',
        '(': ')',
        '{': '}',
        '<': '>'
      }
      const close = closeMap[open] ?? open
      const needle = `${close}'`
      const endIdx = sql.indexOf(needle, i + 3)
      if (endIdx === -1) return { skeleton: sql, hardFail: 'E_UNTERMINATED_LITERAL' }
      const endPos = endIdx + needle.length
      sql = blankRange(sql, i, endPos)
      i = endPos
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
  const afterExplain = skel.slice(m.index + m[0].length)
  const trimmed = afterExplain.trimStart()

  // Check if the entire target query is parenthesized: EXPLAIN (SELECT 1) or EXPLAIN ((SELECT ...))
  const outerRange = unwrapOuterParenthesesRange(trimmed)
  if (outerRange) {
    return { optionsText: '', rest: trimmed }
  }

  // Check if there are options in parens followed by a query: EXPLAIN (ANALYZE) SELECT ...
  if (trimmed.startsWith('(')) {
    let depth = 0
    let closeIdx = -1
    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i] === '(') depth++
      else if (trimmed[i] === ')') {
        depth--
        if (depth === 0) {
          closeIdx = i
          break
        }
      }
    }
    if (closeIdx !== -1 && closeIdx < trimmed.length - 1) {
      const options = trimmed.slice(0, closeIdx + 1)
      const rest = trimmed.slice(closeIdx + 1)
      return { optionsText: options, rest: rest.trimStart() }
    }
  }

  // Standard options without parens: EXPLAIN ANALYZE SELECT ... or EXPLAIN SELECT ...
  const afterSelect = /\bselect\b/i.exec(afterExplain)
  if (!afterSelect) {
    return { optionsText: afterExplain, rest: '' }
  }
  const selectAt = afterSelect.index
  const optionsText = afterExplain.slice(0, selectAt)
  if (
    tokens(optionsText).some((token) => {
      const lower = token.toLowerCase()
      return DISALLOWED_KEYWORDS.has(lower) && lower !== 'analyze' && lower !== 'analyse'
    })
  ) {
    return null
  }
  const rest = afterExplain.slice(selectAt)
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
  // Sticky so it matches at a position without slicing the remainder; slicing
  // inside these per-character loops allocates O(L) per step and dominates the
  // cost on deeply nested input.
  const mainVerb = /\s*(select|insert|update|delete|merge)\b/iy
  while (i < len) {
    // Skip whitespace + CTE name + optional column list until the next `(`.
    while (i < len && skel[i] !== '(') {
      // Stop if we've already passed into the main SELECT body.
      mainVerb.lastIndex = i
      if (mainVerb.test(skel)) {
        return bodies
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
    let j = i
    while (j < len && /\s/.test(skel[j])) j++
    if (skel[j] === ',') {
      i = j + 1
      continue
    }
    break
  }
  return bodies
}

const MAX_UNWRAP_DEPTH = 20

// Validation budget. `MAX_UNWRAP_DEPTH` only bounds consecutive parenthesis
// unwrapping within one level; these bound the whole validation, including the
// recursive descent through CTE bodies, set-operation operands and EXPLAIN
// targets. Without them a ~27KB input (well under the caller's 50KB cap) can
// occupy the Electron main process for over a minute.
const MAX_RECURSION_DEPTH = 32
const MAX_TOTAL_WORK = 2_000_000

interface Budget {
  depth: number
  remainingWork: number
}

function newBudget(): Budget {
  return { depth: 0, remainingWork: MAX_TOTAL_WORK }
}

/** Charge one recursion level plus the text it will scan. */
function spend(budget: Budget, textLength: number): boolean {
  if (budget.depth >= MAX_RECURSION_DEPTH) return false
  if (budget.remainingWork < textLength) return false
  budget.remainingWork -= textLength
  return true
}

const complexityLimit: GuardResult = {
  ok: false,
  errorCode: 'E_COMPLEXITY_LIMIT',
  reason: 'SQL is too deeply nested or too complex to verify; please simplify it.'
}

/**
 * Safely find the indices of matched outer parentheses wrapping the whole skeleton.
 */
function unwrapOuterParenthesesRange(skel: string): { start: number; end: number } | null {
  const startMatch = /^\s*\(/.exec(skel)
  if (!startMatch) return null
  const startIdx = startMatch[0].length - 1

  let depth = 0
  for (let i = startIdx; i < skel.length; i++) {
    if (skel[i] === '(') {
      depth++
    } else if (skel[i] === ')') {
      depth--
      if (depth === 0) {
        for (let j = i + 1; j < skel.length; j++) {
          if (!/\s/.test(skel[j])) return null
        }
        return { start: startIdx, end: i }
      }
    }
  }
  return null
}

/**
 * Iteratively unwrap all matching outer parentheses of a string.
 */
function unwrapOuterParentheses(str: string): string {
  let current = str
  let iterations = 0
  while (iterations < MAX_UNWRAP_DEPTH) {
    const range = unwrapOuterParenthesesRange(current)
    if (!range) break
    current = current.slice(range.start + 1, range.end)
    iterations++
  }
  return current.trim()
}

/**
 * Scan the skeleton and identify all top-level (paren depth 0) set operators (UNION, INTERSECT, EXCEPT).
 */
function getTopLevelSetSplits(skel: string): { index: number; length: number }[] | null {
  let depth = 0
  const splits: { index: number; length: number }[] = []
  // Sticky matchers avoid a whole-string toLowerCase copy and avoid slicing the
  // remainder to read the ALL / DISTINCT modifier.
  const setOp = /(union|intersect|except)\b/iy
  const modifier = /\s*(all|distinct)\b/iy
  const wordChar = /[a-z0-9_]/i
  for (let i = 0; i < skel.length; i++) {
    const char = skel[i]
    if (char === '(') {
      depth++
    } else if (char === ')') {
      depth--
      if (depth < 0) {
        return null
      }
    } else if (depth === 0) {
      let opLength = 0
      if (!wordChar.test(skel[i - 1] ?? '')) {
        setOp.lastIndex = i
        const opMatch = setOp.exec(skel)
        if (opMatch) opLength = opMatch[1].length
      }

      if (opLength > 0) {
        modifier.lastIndex = i + opLength
        const modifierMatch = modifier.exec(skel)
        let totalLength = opLength
        if (modifierMatch) {
          totalLength += modifierMatch[0].length
        }
        splits.push({ index: i, length: totalLength })
        i += totalLength - 1
      }
    }
  }
  if (depth !== 0) {
    return null
  }
  return splits
}

/**
 * Validate a CTE body with the read-only guard. A bare VALUES list is also
 * accepted, because it is read-only. SHOW / DESC / DESCRIBE / EXPLAIN bodies
 * are rejected.
 */
function cteBodyIsSafe(body: string, budget: Budget): boolean | 'limit' {
  const trimmed = unwrapOuterParentheses(body).toLowerCase()
  if (/^(show|desc|describe|explain)\b/.test(trimmed)) {
    return false
  }
  if (/^values\b/.test(trimmed)) return true
  const inner = checkSkeleton(body, budget)
  if (!inner.ok) {
    return inner.errorCode === 'E_COMPLEXITY_LIMIT' ? 'limit' : false
  }
  return true
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
    return {
      ok: false,
      errorCode: 'E_EMPTY_STATEMENT',
      reason: 'SQL is empty.'
    }
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
  return checkSkeleton(stripped.skeleton, newBudget())
}

/**
 * Recursive core. Operates on an already-stripped skeleton so nested levels do
 * not re-run the stripper, and shares one budget across every recursion site
 * (CTE bodies, set-operation operands, EXPLAIN targets).
 */
function checkSkeleton(skelIn: string, budget: Budget): GuardResult {
  if (!spend(budget, skelIn.length)) return complexityLimit
  budget.depth++
  try {
    return checkSkeletonInner(skelIn, budget)
  } finally {
    budget.depth--
  }
}

function checkSkeletonInner(skelIn: string, budget: Budget): GuardResult {
  let skel = skelIn
  if (hasExtraStatement(skel)) {
    return {
      ok: false,
      errorCode: 'E_MULTIPLE_STATEMENTS',
      reason: 'Multiple statements are not allowed.'
    }
  }
  const trimmed = trimStart(skel)
  if (trimmed.length === 0) {
    return {
      ok: false,
      errorCode: 'E_EMPTY_STATEMENT',
      reason: 'SQL is empty after stripping comments.'
    }
  }

  let currentSkel = skel

  // Unwrap matched outer parentheses layers up to MAX_UNWRAP_DEPTH
  let unwrapIterations = 0
  while (unwrapIterations < MAX_UNWRAP_DEPTH) {
    const range = unwrapOuterParenthesesRange(currentSkel)
    if (!range) break
    currentSkel = currentSkel.slice(range.start + 1, range.end)
    unwrapIterations++
  }

  // Check for top-level set operations
  const splits = getTopLevelSetSplits(currentSkel)
  if (splits === null) {
    return {
      ok: false,
      errorCode: 'E_NOT_WHITELISTED',
      reason: 'SQL contains unbalanced parentheses.'
    }
  }
  if (splits.length > 0) {
    const segments: string[] = []
    let lastIndex = 0
    for (const split of splits) {
      segments.push(currentSkel.slice(lastIndex, split.index))
      lastIndex = split.index + split.length
    }
    segments.push(currentSkel.slice(lastIndex))

    for (const segment of segments) {
      if (segment.trim().length === 0) {
        return {
          ok: false,
          errorCode: 'E_EMPTY_STATEMENT',
          reason: 'SQL is empty after stripping comments.'
        }
      }
      const res = checkSkeleton(segment, budget)
      if (!res.ok) {
        return res
      }
    }
    return { ok: true, skeleton: skel }
  }

  skel = currentSkel
  const trimmedUnwrapped = trimStart(skel)
  if (trimmedUnwrapped.length === 0) {
    return {
      ok: false,
      errorCode: 'E_EMPTY_STATEMENT',
      reason: 'SQL is empty after stripping comments.'
    }
  }
  const lower = trimmedUnwrapped.toLowerCase()

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
  if (/^pragma\b/.test(lower)) {
    const pragmaTokens = tokens(skel)
    if (pragmaTokens.length < 2) {
      return {
        ok: false,
        errorCode: 'E_NOT_WHITELISTED',
        reason: 'PRAGMA statement is incomplete.'
      }
    }
    const firstTok = pragmaTokens[0].toLowerCase()
    const secondTok = pragmaTokens[1].toLowerCase()

    const allowedPragmas = new Set(['table_info', 'table_xinfo', 'index_info', 'index_list', 'foreign_key_list', 'database_list'])

    if (firstTok !== 'pragma' || !allowedPragmas.has(secondTok)) {
      return {
        ok: false,
        errorCode: 'E_NOT_WHITELISTED',
        reason: 'This PRAGMA statement is not whitelisted or is not read-only.'
      }
    }

    const forbiddenWords = new Set([...DISALLOWED_KEYWORDS, 'select', 'union', 'from', 'where', 'join', 'with', 'explain', 'as'])

    const allowedPunctuation = new Set(['(', ')', ',', '.', ';'])

    for (let i = 2; i < pragmaTokens.length; i++) {
      const tok = pragmaTokens[i]
      const tokLower = tok.toLowerCase()

      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(tok)) {
        if (forbiddenWords.has(tokLower)) {
          return {
            ok: false,
            errorCode: 'E_NOT_WHITELISTED',
            reason: `PRAGMA statement contains forbidden keyword: ${tok}.`
          }
        }
      } else if (/^[0-9]+$/.test(tok)) {
        continue
      } else {
        if (!allowedPunctuation.has(tok)) {
          return {
            ok: false,
            errorCode: 'E_NOT_WHITELISTED',
            reason: `PRAGMA statement contains forbidden character or operator: ${tok}.`
          }
        }
      }
    }

    return { ok: true, skeleton: skel }
  }
  if (/^with\b/.test(lower)) {
    // WITH must finish with a top-level SELECT and no CTE body may contain
    // DML/DDL.
    const bodies = extractCteBodies(skel)
    for (const body of bodies) {
      const safe = cteBodyIsSafe(body, budget)
      if (safe === 'limit') return complexityLimit
      if (!safe) {
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
    const explainTarget = unwrapOuterParentheses(explain.rest)
    const inner = checkSkeleton(explainTarget, budget)
    if (!inner.ok) {
      if (inner.errorCode === 'E_COMPLEXITY_LIMIT') return complexityLimit
      return {
        ok: false,
        errorCode: 'E_EXPLAIN_TARGET_NOT_SELECT',
        reason: 'EXPLAIN must target a SELECT statement.'
      }
    }
    const targetTrimmed = trimStart(explainTarget).toLowerCase()
    if (/^(show|desc|describe)\b/i.test(targetTrimmed)) {
      return {
        ok: false,
        errorCode: 'E_EXPLAIN_TARGET_NOT_SELECT',
        reason: 'EXPLAIN must target a SELECT statement.'
      }
    }
    return { ok: true, skeleton: skel }
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
  cteBodyIsSafe: (body: string) => cteBodyIsSafe(body, newBudget()) === true,
  readExplainOptions,
  explainOptionsContainAnalyze,
  tokens
}
