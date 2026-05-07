import { describe, expect, it } from 'vitest'
import { isReadOnlySql, __testing } from '../sql-readonly-guard'

// ---------------------------------------------------------------------------
// Allow: canonical read-only statements (10+ cases)
// ---------------------------------------------------------------------------
describe('isReadOnlySql - allowed statements', () => {
  it('allows plain SELECT', () => {
    const r = isReadOnlySql('SELECT 1')
    expect(r.ok).toBe(true)
  })

  it('allows SELECT with JOIN', () => {
    const r = isReadOnlySql('SELECT a.id FROM a JOIN b ON a.id = b.a_id')
    expect(r.ok).toBe(true)
  })

  it('allows SELECT with subquery', () => {
    const r = isReadOnlySql('SELECT * FROM (SELECT id FROM t) sub')
    expect(r.ok).toBe(true)
  })

  it('allows SELECT with trailing semicolon', () => {
    const r = isReadOnlySql('SELECT 1;')
    expect(r.ok).toBe(true)
  })

  it('allows SHOW DATABASES', () => {
    const r = isReadOnlySql('SHOW DATABASES')
    expect(r.ok).toBe(true)
  })

  it('allows SHOW TABLES FROM x', () => {
    const r = isReadOnlySql('SHOW TABLES FROM mydb')
    expect(r.ok).toBe(true)
  })

  it('allows DESC table', () => {
    const r = isReadOnlySql('DESC orders')
    expect(r.ok).toBe(true)
  })

  it('allows DESCRIBE table', () => {
    const r = isReadOnlySql('DESCRIBE orders')
    expect(r.ok).toBe(true)
  })

  it('allows EXPLAIN SELECT', () => {
    const r = isReadOnlySql('EXPLAIN SELECT * FROM t')
    expect(r.ok).toBe(true)
  })

  it('allows PG EXPLAIN (FORMAT JSON) SELECT', () => {
    const r = isReadOnlySql('EXPLAIN (FORMAT JSON) SELECT * FROM t')
    expect(r.ok).toBe(true)
  })

  it('allows PG EXPLAIN (VERBOSE, COSTS OFF) SELECT', () => {
    const r = isReadOnlySql('EXPLAIN (VERBOSE, COSTS OFF) SELECT * FROM t')
    expect(r.ok).toBe(true)
  })

  it('allows MySQL EXPLAIN FORMAT=JSON SELECT', () => {
    const r = isReadOnlySql('EXPLAIN FORMAT=JSON SELECT * FROM t')
    expect(r.ok).toBe(true)
  })

  it('allows WITH cte AS (SELECT ...) SELECT', () => {
    const r = isReadOnlySql('WITH cte AS (SELECT id FROM t) SELECT * FROM cte')
    expect(r.ok).toBe(true)
  })

  it('allows WITH RECURSIVE cte AS (SELECT ...) SELECT', () => {
    const r = isReadOnlySql('WITH RECURSIVE cte AS (SELECT id FROM t UNION ALL SELECT id FROM cte) SELECT * FROM cte')
    expect(r.ok).toBe(true)
  })

  it('allows multi-CTE WITH a AS (...), b AS (...) SELECT', () => {
    const r = isReadOnlySql('WITH a AS (SELECT 1 x), b AS (SELECT 2 y) SELECT * FROM a, b')
    expect(r.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Reject: DML / DDL at top level (8 cases)
// ---------------------------------------------------------------------------
describe('isReadOnlySql - reject DML/DDL', () => {
  it('rejects INSERT', () => {
    const r = isReadOnlySql('INSERT INTO t VALUES (1)')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects UPDATE', () => {
    const r = isReadOnlySql('UPDATE t SET a = 1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects DELETE', () => {
    const r = isReadOnlySql('DELETE FROM t')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects CREATE TABLE', () => {
    const r = isReadOnlySql('CREATE TABLE x (id INT)')
    expect(r.ok).toBe(false)
  })

  it('rejects DROP TABLE', () => {
    const r = isReadOnlySql('DROP TABLE x')
    expect(r.ok).toBe(false)
  })

  it('rejects ALTER TABLE', () => {
    const r = isReadOnlySql('ALTER TABLE x ADD COLUMN y INT')
    expect(r.ok).toBe(false)
  })

  it('rejects TRUNCATE', () => {
    const r = isReadOnlySql('TRUNCATE TABLE x')
    expect(r.ok).toBe(false)
  })

  it('rejects MERGE', () => {
    const r = isReadOnlySql('MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN UPDATE SET a = 1')
    expect(r.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Reject: multiple statements (3 cases)
// ---------------------------------------------------------------------------
describe('isReadOnlySql - reject multi-statement', () => {
  it('rejects SELECT; SELECT', () => {
    const r = isReadOnlySql('SELECT 1; SELECT 2')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_MULTIPLE_STATEMENTS')
  })

  it('rejects SELECT; -- comment does not help', () => {
    const r = isReadOnlySql('SELECT 1; SELECT 2 -- trailing')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_MULTIPLE_STATEMENTS')
  })

  it('rejects SELECT; DROP piggyback', () => {
    const r = isReadOnlySql('SELECT 1; DROP TABLE users')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_MULTIPLE_STATEMENTS')
  })
})

// ---------------------------------------------------------------------------
// Reject: CTE body contains DML (3 cases)
// ---------------------------------------------------------------------------
describe('isReadOnlySql - reject CTE DML', () => {
  it('rejects WITH x AS (INSERT ...) SELECT', () => {
    const r = isReadOnlySql('WITH x AS (INSERT INTO t VALUES (1) RETURNING *) SELECT * FROM x')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_WITH_CONTAINS_DML')
  })

  it('rejects WITH x AS (DELETE ...) SELECT', () => {
    const r = isReadOnlySql('WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_WITH_CONTAINS_DML')
  })

  it('rejects WITH x AS (UPDATE ...) SELECT', () => {
    const r = isReadOnlySql('WITH x AS (UPDATE t SET a=1 RETURNING *) SELECT * FROM x')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_WITH_CONTAINS_DML')
  })
})

// ---------------------------------------------------------------------------
// Reject: EXPLAIN ANALYZE / ANALYSE variants (4 cases)
// ---------------------------------------------------------------------------
describe('isReadOnlySql - reject EXPLAIN ANALYZE', () => {
  it('rejects EXPLAIN ANALYZE SELECT', () => {
    const r = isReadOnlySql('EXPLAIN ANALYZE SELECT * FROM t')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_EXPLAIN_ANALYZE')
  })

  it('rejects EXPLAIN (ANALYZE) SELECT', () => {
    const r = isReadOnlySql('EXPLAIN (ANALYZE) SELECT * FROM t')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_EXPLAIN_ANALYZE')
  })

  it('rejects EXPLAIN (ANALYSE, BUFFERS) SELECT', () => {
    const r = isReadOnlySql('EXPLAIN (ANALYSE, BUFFERS) SELECT * FROM t')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_EXPLAIN_ANALYZE')
  })

  it('rejects EXPLAIN ANALYSE SELECT (British spelling, bare form)', () => {
    const r = isReadOnlySql('EXPLAIN ANALYSE SELECT * FROM t')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_EXPLAIN_ANALYZE')
  })

  it('rejects EXPLAIN (ANALYZE TRUE) SELECT', () => {
    const r = isReadOnlySql('EXPLAIN (ANALYZE TRUE) SELECT * FROM t')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_EXPLAIN_ANALYZE')
  })

  it('rejects EXPLAIN with no SELECT target', () => {
    const r = isReadOnlySql('EXPLAIN INSERT INTO t VALUES (1)')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_EXPLAIN_TARGET_NOT_SELECT')
  })
})

// ---------------------------------------------------------------------------
// Allow but with traps: forbidden words appear only inside string literals,
// identifiers, or comments (7 cases)
// ---------------------------------------------------------------------------
describe('isReadOnlySql - allow with traps', () => {
  it('allows string literal containing DELETE FROM', () => {
    const r = isReadOnlySql("SELECT 'DELETE FROM users' AS note")
    expect(r.ok).toBe(true)
  })

  it('allows column identifier containing keyword-like substring (created_at)', () => {
    const r = isReadOnlySql('SELECT created_at FROM orders')
    expect(r.ok).toBe(true)
  })

  it('allows line comment mentioning DROP / CREATE', () => {
    const r = isReadOnlySql('SELECT 1 -- drop or create something\n')
    expect(r.ok).toBe(true)
  })

  it('allows block comment mentioning DROP', () => {
    const r = isReadOnlySql('SELECT /* drop table banned */ 1')
    expect(r.ok).toBe(true)
  })

  it('allows PG escape-string literal with embedded newline', () => {
    const r = isReadOnlySql("SELECT E'line1\\nline2'")
    expect(r.ok).toBe(true)
  })

  it('allows MySQL backtick-quoted identifier (`created_at`)', () => {
    const r = isReadOnlySql('SELECT `created_at` FROM `orders`')
    expect(r.ok).toBe(true)
  })

  it('allows PG dollar-quoted string containing DROP', () => {
    const r = isReadOnlySql('SELECT $$DROP TABLE x$$ AS script')
    expect(r.ok).toBe(true)
  })

  it('allows PG dollar-quoted string with named tag containing DELETE', () => {
    const r = isReadOnlySql('SELECT $tag$DELETE FROM t$tag$ AS script')
    expect(r.ok).toBe(true)
  })

  it("allows single-quoted string with escaped quote containing 'DELETE'", () => {
    const r = isReadOnlySql("SELECT 'it''s fine DELETE' AS note")
    expect(r.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Empty / whitespace-only input (2 cases)
// ---------------------------------------------------------------------------
describe('isReadOnlySql - empty input', () => {
  it('rejects empty string', () => {
    const r = isReadOnlySql('')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_EMPTY_STATEMENT')
  })

  it('rejects whitespace only', () => {
    const r = isReadOnlySql('   \n\t  ')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_EMPTY_STATEMENT')
  })
})

// ---------------------------------------------------------------------------
// Nested block comments + unterminated literals (3 cases)
// ---------------------------------------------------------------------------
describe('isReadOnlySql - malformed input', () => {
  it('rejects nested block comments (conservative policy)', () => {
    const r = isReadOnlySql('SELECT /* outer /* inner */ */ 1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NESTED_BLOCK_COMMENT')
  })

  it('rejects unterminated block comment', () => {
    const r = isReadOnlySql('SELECT /* never closes 1')
    expect(r.ok).toBe(false)
  })

  it('rejects unterminated dollar-quoted string', () => {
    const r = isReadOnlySql('SELECT $tag$ unterminated')
    expect(r.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Reason field does not echo raw SQL
// ---------------------------------------------------------------------------
describe('isReadOnlySql - reason hygiene', () => {
  const samples = ['DELETE FROM secret_table WHERE id=1', "INSERT INTO users (name) VALUES ('admin')", 'SELECT 1; DROP TABLE audit']
  for (const sql of samples) {
    it(`reason must not contain SQL fragment for: ${sql.slice(0, 30)}...`, () => {
      const r = isReadOnlySql(sql)
      expect(r.ok).toBe(false)
      if (!r.ok) {
        // The reason is a short human-readable message; it should not contain
        // table names or SQL keywords copied from the input.
        expect(r.reason).not.toMatch(/secret_table/i)
        expect(r.reason).not.toMatch(/audit/i)
        expect(r.reason).not.toMatch(/admin/i)
      }
    })
  }
})

// ---------------------------------------------------------------------------
// Stripper unit tests (exercise __testing surface directly)
// ---------------------------------------------------------------------------
describe('stripper internals', () => {
  const { stripCommentsAndLiterals, hasExtraStatement } = __testing

  it('blanks out -- line comments', () => {
    const r = stripCommentsAndLiterals('SELECT 1 -- drop\nFROM t')
    expect(r.hardFail).toBeUndefined()
    expect(r.skeleton).not.toMatch(/drop/i)
  })

  it('blanks out /* block */ comments', () => {
    const r = stripCommentsAndLiterals('SELECT /* drop */ 1')
    expect(r.hardFail).toBeUndefined()
    expect(r.skeleton).not.toMatch(/drop/i)
  })

  it('blanks out single-quoted strings', () => {
    const r = stripCommentsAndLiterals("SELECT 'DELETE FROM x'")
    expect(r.hardFail).toBeUndefined()
    expect(r.skeleton).not.toMatch(/delete/i)
  })

  it('blanks out MySQL backtick identifiers', () => {
    const r = stripCommentsAndLiterals('SELECT `created_at` FROM t')
    expect(r.hardFail).toBeUndefined()
    // The whole backticked region is blanked including keyword-looking text.
    expect(r.skeleton).not.toMatch(/created_at/)
  })

  it('blanks out escaped backticks in MySQL identifiers', () => {
    const r = stripCommentsAndLiterals('SELECT `a``b` FROM t')
    expect(r.hardFail).toBeUndefined()
    expect(r.skeleton).not.toMatch(/a.*b/)
  })

  it('blanks out PG dollar-quoted string', () => {
    const r = stripCommentsAndLiterals('SELECT $$drop$$')
    expect(r.hardFail).toBeUndefined()
    expect(r.skeleton).not.toMatch(/drop/i)
  })

  it("blanks out PG escape string E'...'", () => {
    const r = stripCommentsAndLiterals("SELECT E'delete\\n'")
    expect(r.hardFail).toBeUndefined()
    expect(r.skeleton).not.toMatch(/delete/i)
  })

  it('flags nested block comment', () => {
    const r = stripCommentsAndLiterals('SELECT /* /* */ */ 1')
    expect(r.hardFail).toBe('E_NESTED_BLOCK_COMMENT')
  })

  it('hasExtraStatement returns true for SELECT 1; SELECT 2', () => {
    expect(hasExtraStatement('SELECT 1; SELECT 2')).toBe(true)
  })

  it('hasExtraStatement returns false for trailing-only semicolon', () => {
    expect(hasExtraStatement('SELECT 1;   ')).toBe(false)
  })
})
