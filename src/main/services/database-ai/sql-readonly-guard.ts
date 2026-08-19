// SQL read-only guard used by DB-AI tools that can execute SQL against a live
// session (`execute_readonly_query`, `explain_plan`). Goal: allow only
// verifiably read-only statements through a conservative whitelist. The
// policy is "reject on ambiguity" — any construct we cannot statically prove
// safe is rejected.
//
// IMPORTANT: this is NOT a full SQL parser. It performs two passes:
//
//   1. Strip comments and string literals (including PG dollar-quoted, Oracle q-quoted,
//      E'...' escape, MySQL backticks, block + line comments). Nested block
//      comments are rejected because JavaScript regex cannot disambiguate
//      them safely, and the policy is to reject rather than guess.
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
  | 'E_EXECUTABLE_COMMENT'

export type GuardResult = { ok: true; skeleton: string } | { ok: false; errorCode: GuardErrorCode; reason: string }

/**
 * Engine the SQL will run against. Only used to gate dialect-specific syntax.
 * Omitting it is safe but strict: PRAGMA is rejected when the dialect is
 * unknown, so a caller that forgets to pass one fails closed rather than
 * silently widening the whitelist.
 */
export type GuardDialect = 'mysql' | 'postgresql' | 'sqlite' | 'oracle'

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

const STRIP_FAIL_REASONS: Partial<Record<GuardErrorCode, string>> = {
  E_NESTED_BLOCK_COMMENT: 'Nested block comments are not supported; please simplify the SQL.',
  E_EXECUTABLE_COMMENT: 'MySQL executable comments (/*! ... */) are not allowed; they execute as SQL.',
  E_UNTERMINATED_LITERAL: 'SQL contains an unterminated string or comment.'
}

/**
 * Detect whether we are at the start of a nested block comment opener inside
 * an already-open block comment. We reject these outright.
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
      // MySQL executable comment: /*! ... */ and /*!50000 ... */ are executed
      // by MySQL, not ignored. Blanking one would hide real SQL — including a
      // `;` that `hasExtraStatement` would otherwise catch. Reject outright.
      if (sql[i + 2] === '!') {
        return { skeleton: sql, hardFail: 'E_EXECUTABLE_COMMENT' }
      }
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
 * Index of the first token that can begin an EXPLAIN target, scanning only at
 * paren depth 0. Returns -1 when there is none.
 *
 * Depth matters: `EXPLAIN WITH c AS (SELECT 1) SELECT * FROM c` has its first
 * `SELECT` inside the CTE body, so keying on "the first SELECT anywhere" splits
 * the statement mid-parenthesis and false-rejects it. `WITH` counts as a target
 * opener for the same reason.
 */
function findExplainTargetStart(text: string): number {
  let depth = 0
  const opener = /\b(select|with)\b/iy
  const wordChar = /[a-z0-9_]/i
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (depth === 0 && !wordChar.test(text[i - 1] ?? '')) {
      opener.lastIndex = i
      if (opener.test(text)) return i
    }
  }
  return -1
}

/**
 * Match any EXPLAIN options block, whether PostgreSQL `EXPLAIN (a, b, c)` or
 * MySQL `EXPLAIN FORMAT=JSON` / `EXPLAIN EXTENDED` / `EXPLAIN ANALYZE`.
 * Returns the substring between EXPLAIN and the start of its target so the
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
  const selectAt = findExplainTargetStart(afterExplain)
  if (selectAt === -1) {
    return { optionsText: afterExplain, rest: '' }
  }
  const optionsText = afterExplain.slice(0, selectAt)
  if (
    tokens(optionsText).some((token) => {
      const lower = token.toLowerCase()
      return DISALLOWED_KEYWORDS.has(lower) && lower !== 'analyze' && lower !== 'analyse'
    })
  ) {
    return null
  }
  return { optionsText, rest: afterExplain.slice(selectAt) }
}

/**
 * Detect ANALYZE / ANALYSE tokens anywhere in the EXPLAIN options block.
 * The policy is: ANY form of ANALYZE in EXPLAIN is a hard reject
 * because PostgreSQL actually executes the query.
 */
function explainOptionsContainAnalyze(optionsText: string): boolean {
  return /\banaly[sz]e\b/i.test(optionsText)
}

// ---------------------------------------------------------------------------
// WITH / CTE handling.
// ---------------------------------------------------------------------------

/**
 * Walk the skeleton from the `WITH` keyword and return each CTE body plus the
 * offset just past the last one, so the caller can check the main statement
 * that follows.
 *
 * Follows the actual grammar of a CTE definition:
 *
 *   name [ ( col, ... ) ] AS [ NOT ] [ MATERIALIZED ] ( body )
 *
 * The optional column list matters: taking the first parenthesis after the CTE
 * name picks up `(col, ...)` rather than the body, which both hides a
 * data-modifying body from inspection and false-rejects the standard
 * `WITH RECURSIVE t(n) AS (...)` form.
 */
function extractCteBodies(skel: string): { bodies: string[]; tailStart: number } {
  const m = /\bwith\b(\s+recursive\b)?/i.exec(skel)
  if (!m) return { bodies: [], tailStart: 0 }
  let i = m.index + m[0].length
  const bodies: string[] = []
  const len = skel.length
  // Sticky matchers: they test at a position without slicing the remainder.
  // Slicing inside these per-character loops allocates O(L) per step and
  // dominates the cost on deeply nested input.
  const asKeyword = /\s*\bas\b/iy
  const materialized = /\s*(not\s+)?materialized\b/iy
  const mainVerb = /\s*\b(select|insert|update|delete|merge|replace)\b/iy

  while (i < len) {
    // Find this CTE's `AS`, skipping the name and any column list. Bail out if
    // a main statement verb appears first — that means the CTE list has ended.
    let depth = 0
    let asEnd = -1
    while (i < len) {
      const ch = skel[i]
      if (ch === '(') depth++
      else if (ch === ')') depth--
      else if (depth === 0) {
        asKeyword.lastIndex = i
        const asMatch = asKeyword.exec(skel)
        if (asMatch) {
          asEnd = i + asMatch[0].length
          break
        }
        mainVerb.lastIndex = i
        if (mainVerb.test(skel)) return { bodies, tailStart: i }
      }
      i++
    }
    if (asEnd === -1) break

    // Skip PG's [NOT] MATERIALIZED between AS and the body.
    i = asEnd
    materialized.lastIndex = i
    const matMatch = materialized.exec(skel)
    if (matMatch) i += matMatch[0].length

    while (i < len && /\s/.test(skel[i])) i++
    if (skel[i] !== '(') break

    // On the body's opening paren. Walk to its match.
    let bodyDepth = 1
    const bodyStart = i + 1
    i++
    while (i < len && bodyDepth > 0) {
      const ch = skel[i]
      if (ch === '(') bodyDepth++
      else if (ch === ')') bodyDepth--
      i++
    }
    const bodyEnd = i - 1
    if (bodyEnd > bodyStart) bodies.push(skel.slice(bodyStart, bodyEnd))

    // A comma means another CTE follows; anything else ends the CTE list.
    let j = i
    while (j < len && /\s/.test(skel[j])) j++
    if (skel[j] === ',') {
      i = j + 1
      continue
    }
    return { bodies, tailStart: j }
  }
  return { bodies, tailStart: i }
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
 * True when the skeleton has a top-level (paren depth 0) INTO / OUTFILE /
 * DUMPFILE. A statement can start with SELECT and still write:
 * MySQL `SELECT ... INTO OUTFILE '/path'` writes the server filesystem, and
 * `SELECT ... INTO new_table` creates a table on PostgreSQL and SQL Server.
 * Depth 0 only, so an INTO inside a subquery does not trip the check.
 */
function hasTopLevelInto(skel: string): boolean {
  let depth = 0
  const intoWord = /\b(into|outfile|dumpfile)\b/iy
  const wordChar = /[a-z0-9_]/i
  for (let i = 0; i < skel.length; i++) {
    const ch = skel[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (depth === 0 && !wordChar.test(skel[i - 1] ?? '')) {
      intoWord.lastIndex = i
      if (intoWord.test(skel)) return true
    }
  }
  return false
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
function cteBodyIsSafe(body: string, budget: Budget, dialect?: GuardDialect): boolean | 'limit' {
  // A CTE body is a query expression, so the `query` position already rejects
  // SHOW / DESC / DESCRIBE / EXPLAIN / PRAGMA and accepts a bare VALUES list.
  const inner = checkSkeleton(body, budget, 'query', dialect)
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
export function isReadOnlySql(sqlIn: string, dialect?: GuardDialect): GuardResult {
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
      reason: STRIP_FAIL_REASONS[stripped.hardFail] ?? 'SQL contains an unterminated string or comment.'
    }
  }
  return checkSkeleton(stripped.skeleton, newBudget(), 'statement', dialect)
}

/**
 * What grammar position we are validating.
 *
 * - `statement`: a whole statement. SELECT / WITH / SHOW / DESC / EXPLAIN /
 *   PRAGMA are all legal here.
 * - `query`: a query expression — the operand of a set operation, a CTE body,
 *   or an EXPLAIN target. Only SELECT / WITH / VALUES / a parenthesized or set
 *   query belong here. SHOW / DESC / PRAGMA / EXPLAIN do not: reusing the
 *   statement whitelist for these positions accepts nonsense like
 *   `SELECT 1 UNION SHOW TABLES` and defers the error to the database.
 */
type Position = 'statement' | 'query'

/**
 * Recursive core. Operates on an already-stripped skeleton so nested levels do
 * not re-run the stripper, and shares one budget across every recursion site
 * (CTE bodies, set-operation operands, EXPLAIN targets).
 */
function checkSkeleton(skelIn: string, budget: Budget, position: Position = 'statement', dialect?: GuardDialect): GuardResult {
  if (!spend(budget, skelIn.length)) return complexityLimit
  budget.depth++
  try {
    return checkSkeletonInner(skelIn, budget, position, dialect)
  } finally {
    budget.depth--
  }
}

function checkSkeletonInner(skelIn: string, budget: Budget, position: Position, dialect?: GuardDialect): GuardResult {
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

  // Check for top-level set operations. An EXPLAIN prefix governs its whole
  // target, set operators included, so `EXPLAIN SELECT a UNION SELECT b` must
  // not be split here — that would leave `EXPLAIN SELECT a` as an operand.
  // Let the EXPLAIN branch below take it and validate the target as a unit.
  const isExplain = /^\s*explain\b/i.test(currentSkel)
  const splits = isExplain ? [] : getTopLevelSetSplits(currentSkel)
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
      // Operands of a set operation are query expressions, not statements.
      const res = checkSkeleton(segment, budget, 'query', dialect)
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
    // Runs after set-operation splitting, so each operand is checked on its own.
    if (hasTopLevelInto(skel)) {
      return {
        ok: false,
        errorCode: 'E_NOT_WHITELISTED',
        reason: 'SELECT ... INTO / OUTFILE / DUMPFILE writes data and is not allowed.'
      }
    }
    return { ok: true, skeleton: skel }
  }
  // A bare VALUES list is a query expression, and read-only.
  if (position === 'query' && /^values\b/.test(lower)) {
    return { ok: true, skeleton: skel }
  }
  // SHOW / DESC / PRAGMA / EXPLAIN are statements, not query expressions. In a
  // query position they are grammatically wrong, so reject here rather than let
  // the database raise the error later. WITH is handled below: it is legal in
  // both positions, and its own branch enforces that it ends in a SELECT.
  if (position === 'query' && !/^with\b/.test(lower)) {
    return {
      ok: false,
      errorCode: 'E_NOT_WHITELISTED',
      reason: 'Only a SELECT / WITH / VALUES query is allowed in this position.'
    }
  }
  if (/^show\b/.test(lower)) {
    return { ok: true, skeleton: skel }
  }
  if (/^(desc|describe)\b/.test(lower)) {
    return { ok: true, skeleton: skel }
  }
  if (/^pragma\b/.test(lower)) {
    // PRAGMA is SQLite-only. Gate on dialect so the other engines do not get a
    // wider whitelist than they can parse, and so a caller that omits the
    // dialect fails closed.
    if (dialect !== 'sqlite') {
      return {
        ok: false,
        errorCode: 'E_NOT_WHITELISTED',
        reason: 'PRAGMA is only allowed on SQLite connections.'
      }
    }
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
    const { bodies, tailStart } = extractCteBodies(skel)
    for (const body of bodies) {
      const safe = cteBodyIsSafe(body, budget, dialect)
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
    // After the last CTE, require the main statement to be a SELECT or a
    // parenthesized query. Anchored at the CTE list's end: testing the whole
    // skeleton for `) SELECT` lets a column list such as `INSERT INTO t(x)
    // SELECT ...` satisfy the check, which routes a write through the
    // read-only tool and past its approval gate.
    const tail = skel.slice(tailStart)
    if (!/^\s*(select\b|\()/i.test(tail)) {
      return {
        ok: false,
        errorCode: 'E_NOT_WHITELISTED',
        reason: 'WITH clause must be followed by a SELECT statement.'
      }
    }
    const tailResult = checkSkeleton(tail, budget, 'query', dialect)
    if (!tailResult.ok) {
      if (tailResult.errorCode === 'E_COMPLEXITY_LIMIT') return complexityLimit
      return tailResult
    }
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
    // An EXPLAIN target is a query expression, so the `query` position rejects
    // SHOW / DESC / DESCRIBE / PRAGMA / nested EXPLAIN targets for us.
    const explainTarget = unwrapOuterParentheses(explain.rest)
    const inner = checkSkeleton(explainTarget, budget, 'query', dialect)
    if (!inner.ok) {
      if (inner.errorCode === 'E_COMPLEXITY_LIMIT') return complexityLimit
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
    reason: 'Only read-only statements are allowed (SELECT / WITH / SHOW / DESC / EXPLAIN, plus PRAGMA on SQLite).'
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
