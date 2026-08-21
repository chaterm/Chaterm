import { describe, expect, it } from 'vitest'
import { classifySql, isReadOnlySql, __testing } from '../sql-readonly-guard'
import type { GuardDialect, GuardErrorCode, SqlOperation } from '../sql-readonly-guard'

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

  it('allows Oracle q-quoted string containing DML keywords', () => {
    const r = isReadOnlySql("SELECT q'[DELETE FROM users]' AS script FROM dual")
    expect(r.ok).toBe(true)
  })

  it('allows Oracle q-quoted string with custom delimiter containing DROP', () => {
    const r = isReadOnlySql("SELECT q'!DROP TABLE x!' AS script FROM dual")
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

  // Quote-delimited literals scan with `while (j < len)`, so an unterminated
  // one exits at j === len. The reachable guard is "did we see the closing
  // delimiter", not a bound comparison on j.
  it('rejects every unterminated quote-delimited literal and identifier', () => {
    const cases: Array<[string, GuardDialect]> = [
      ["SELECT 'x", 'mysql'],
      ['SELECT `x', 'mysql'],
      ['SELECT "x', 'postgresql'],
      ["SELECT E'x", 'postgresql'],
      ["SELECT q'[x", 'oracle']
    ]
    for (const [sql, dialect] of cases) {
      const r = isReadOnlySql(sql, dialect)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errorCode).toBe('E_UNTERMINATED_LITERAL')
    }
  })

  it('does not let an unterminated literal hide a second statement', () => {
    // Blanking from the opening quote to end-of-input removes the `;` before
    // the single-statement check runs, which would let the read-only tool
    // execute a smuggled statement.
    for (const sql of ["SELECT 'x; DROP TABLE users", 'SELECT `x; DROP TABLE users', "SELECT * FROM t WHERE a='x; DELETE FROM t"]) {
      const r = isReadOnlySql(sql, 'mysql')
      expect(r.ok).toBe(false)
    }
  })

  it('still accepts well-formed literals and escaped delimiters', () => {
    const cases: Array<[string, GuardDialect]> = [
      ["SELECT 'x'", 'mysql'],
      ["SELECT 'it''s'", 'mysql'],
      ['SELECT `a``b` FROM t', 'mysql'],
      ['SELECT "a""b" FROM t', 'postgresql'],
      ["SELECT E'it''s'", 'postgresql'],
      ["SELECT q'[bracketed]' FROM dual", 'oracle'],
      ["SELECT * FROM t WHERE note = 'has ; semicolon'", 'mysql'],
      ["SELECT 'ends at very end'", 'mysql']
    ]
    for (const [sql, dialect] of cases) {
      expect(isReadOnlySql(sql, dialect).ok).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// MySQL executable comments. MySQL runs /*! ... */ rather than ignoring it, so
// blanking one as an ordinary comment hides real SQL — including a `;` that
// hasExtraStatement would otherwise catch.
// ---------------------------------------------------------------------------
describe('isReadOnlySql - MySQL executable comments', () => {
  it('rejects /*! ... */ hiding a second statement', () => {
    const r = isReadOnlySql('SELECT 1 /*! ; DROP TABLE users */')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_EXECUTABLE_COMMENT')
  })

  it('rejects version-gated /*!NNNNN ... */', () => {
    const r = isReadOnlySql('SELECT 1 /*!32302 UNION SELECT 2 */')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_EXECUTABLE_COMMENT')
  })

  it('still allows an ordinary block comment', () => {
    expect(isReadOnlySql('SELECT /* drop table banned */ 1').ok).toBe(true)
  })

  it('still allows an Oracle optimizer hint', () => {
    expect(isReadOnlySql('SELECT /*+ INDEX(t idx) */ 1 FROM t').ok).toBe(true)
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

  it('blanks out Oracle q-quoted strings', () => {
    const r = stripCommentsAndLiterals("SELECT q'[drop table x]' FROM dual")
    expect(r.hardFail).toBeUndefined()
    expect(r.skeleton).not.toMatch(/drop/i)
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

// ---------------------------------------------------------------------------
// Read-only SQLite PRAGMA checks
// ---------------------------------------------------------------------------
describe('isReadOnlySql - SQLite PRAGMA support', () => {
  it('allows read-only PRAGMA table_info with identifier', () => {
    const r = isReadOnlySql('PRAGMA table_info(users);', 'sqlite')
    expect(r.ok).toBe(true)
  })

  it('allows read-only PRAGMA table_info with string literal', () => {
    const r = isReadOnlySql("PRAGMA table_info('users')", 'sqlite')
    expect(r.ok).toBe(true)
  })

  it('allows read-only PRAGMA table_xinfo', () => {
    const r = isReadOnlySql("PRAGMA table_xinfo('logs')", 'sqlite')
    expect(r.ok).toBe(true)
  })

  it('allows read-only PRAGMA index_info', () => {
    const r = isReadOnlySql("PRAGMA index_info('idx_users_email')", 'sqlite')
    expect(r.ok).toBe(true)
  })

  it('allows read-only PRAGMA index_list', () => {
    const r = isReadOnlySql("PRAGMA index_list('posts')", 'sqlite')
    expect(r.ok).toBe(true)
  })

  it('allows read-only PRAGMA foreign_key_list', () => {
    const r = isReadOnlySql('PRAGMA foreign_key_list(comments)', 'sqlite')
    expect(r.ok).toBe(true)
  })

  it('allows read-only PRAGMA database_list', () => {
    const r = isReadOnlySql('PRAGMA database_list;', 'sqlite')
    expect(r.ok).toBe(true)
  })

  it('allows case-insensitive PRAGMA statements', () => {
    const r = isReadOnlySql('pragma Table_Info(Users)', 'sqlite')
    expect(r.ok).toBe(true)
  })

  it('rejects mutating or configuration PRAGMA journal_mode = WAL', () => {
    const r = isReadOnlySql('PRAGMA journal_mode = WAL;', 'sqlite')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects mutating or configuration PRAGMA foreign_keys = OFF', () => {
    const r = isReadOnlySql('PRAGMA foreign_keys = OFF', 'sqlite')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects mutating or configuration PRAGMA synchronous = 0', () => {
    const r = isReadOnlySql('PRAGMA synchronous = 0;', 'sqlite')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects PRAGMA table_info containing assignment operator', () => {
    const r = isReadOnlySql("PRAGMA table_info = 'users'", 'sqlite')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects incomplete PRAGMA statements', () => {
    const r = isReadOnlySql('PRAGMA', 'sqlite')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects non-whitelisted PRAGMAs', () => {
    const r = isReadOnlySql('PRAGMA encoding', 'sqlite')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects PRAGMAs containing forbidden SQL keywords', () => {
    const r = isReadOnlySql('PRAGMA table_info(select)', 'sqlite')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects PRAGMAs containing forbidden operators', () => {
    const r = isReadOnlySql('PRAGMA table_info(users + 1)', 'sqlite')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })
})

// ---------------------------------------------------------------------------
// PRAGMA is SQLite-only syntax, so it is gated on dialect. Omitting the dialect
// fails closed: a caller that forgets to pass one does not silently get the
// wider whitelist.
// ---------------------------------------------------------------------------
describe('isReadOnlySql - PRAGMA dialect gating', () => {
  it('rejects PRAGMA on MySQL', () => {
    const r = isReadOnlySql('PRAGMA table_info(users)', 'mysql')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects PRAGMA on PostgreSQL', () => {
    const r = isReadOnlySql('PRAGMA table_info(users)', 'postgresql')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects PRAGMA on Oracle', () => {
    const r = isReadOnlySql('PRAGMA table_info(users)', 'oracle')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects PRAGMA when the dialect is omitted', () => {
    const r = isReadOnlySql('PRAGMA table_info(users)')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('allows a whitelisted PRAGMA on SQLite', () => {
    expect(isReadOnlySql('PRAGMA table_info(users)', 'sqlite').ok).toBe(true)
  })

  it('does not change non-PRAGMA statements across dialects', () => {
    for (const d of ['mysql', 'postgresql', 'sqlite', 'oracle'] as const) {
      expect(isReadOnlySql('SELECT 1', d).ok).toBe(true)
      expect(isReadOnlySql('DELETE FROM t', d).ok).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// Parenthesized and Set Queries
// ---------------------------------------------------------------------------
describe('isReadOnlySql - parenthesized and set queries', () => {
  it('allows simple parenthesized query: (SELECT 1)', () => {
    const r = isReadOnlySql('(SELECT 1)')
    expect(r.ok).toBe(true)
  })

  it('allows deeply nested parenthesized query: ((SELECT 1))', () => {
    const r = isReadOnlySql('((SELECT 1))')
    expect(r.ok).toBe(true)
  })

  it('allows parenthesized select with whitespace:  ( SELECT id FROM users )  ', () => {
    const r = isReadOnlySql('  ( SELECT id FROM users )  ')
    expect(r.ok).toBe(true)
  })

  it('allows set operation: (SELECT id FROM a) UNION ALL (SELECT id FROM b)', () => {
    const r = isReadOnlySql('(SELECT id FROM a) UNION ALL (SELECT id FROM b)')
    expect(r.ok).toBe(true)
  })

  it('allows set operation: (SELECT id FROM a) INTERSECT (SELECT id FROM b)', () => {
    const r = isReadOnlySql('(SELECT id FROM a) INTERSECT (SELECT id FROM b)')
    expect(r.ok).toBe(true)
  })

  it('allows set operation: (SELECT id FROM a) EXCEPT (SELECT id FROM b)', () => {
    const r = isReadOnlySql('(SELECT id FROM a) EXCEPT (SELECT id FROM b)')
    expect(r.ok).toBe(true)
  })

  it('allows set operation without outer parens: SELECT id FROM a UNION SELECT id FROM b', () => {
    const r = isReadOnlySql('SELECT id FROM a UNION SELECT id FROM b')
    expect(r.ok).toBe(true)
  })

  it('allows complex set nesting: (SELECT 1) UNION ALL ((SELECT 2) INTERSECT (SELECT 3))', () => {
    const r = isReadOnlySql('(SELECT 1) UNION ALL ((SELECT 2) INTERSECT (SELECT 3))')
    expect(r.ok).toBe(true)
  })

  it('allows EXPLAIN with parenthesized target: EXPLAIN (SELECT 1)', () => {
    const r = isReadOnlySql('EXPLAIN (SELECT 1)')
    expect(r.ok).toBe(true)
  })

  it('allows EXPLAIN with set target: EXPLAIN ((SELECT id FROM a) UNION (SELECT id FROM b))', () => {
    const r = isReadOnlySql('EXPLAIN ((SELECT id FROM a) UNION (SELECT id FROM b))')
    expect(r.ok).toBe(true)
  })

  it('rejects malicious enclosed query: (DELETE FROM users)', () => {
    const r = isReadOnlySql('(DELETE FROM users)')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects malicious enclosed query: (DROP TABLE users)', () => {
    const r = isReadOnlySql('(DROP TABLE users)')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects malicious set operation: (SELECT 1) UNION ALL (DELETE FROM users)', () => {
    const r = isReadOnlySql('(SELECT 1) UNION ALL (DELETE FROM users)')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects malicious set operation: (DELETE FROM users) UNION ALL (SELECT 1)', () => {
    const r = isReadOnlySql('(DELETE FROM users) UNION ALL (SELECT 1)')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects malicious EXPLAIN with parenthesized target: EXPLAIN (DELETE FROM users)', () => {
    const r = isReadOnlySql('EXPLAIN (DELETE FROM users)')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_EXPLAIN_TARGET_NOT_SELECT')
  })

  it('rejects malicious EXPLAIN with set target containing DML: EXPLAIN ((SELECT 1) UNION (DELETE FROM users))', () => {
    const r = isReadOnlySql('EXPLAIN ((SELECT 1) UNION (DELETE FROM users))')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_EXPLAIN_TARGET_NOT_SELECT')
  })

  it('allows read-only VALUES clause in CTE body: WITH v AS (VALUES (1), (2)) SELECT * FROM v', () => {
    const r = isReadOnlySql('WITH v AS (VALUES (1), (2)) SELECT * FROM v')
    expect(r.ok).toBe(true)
  })

  it('rejects unbalanced parentheses in set queries: (SELECT 1)) UNION (SELECT 2)', () => {
    const r = isReadOnlySql('(SELECT 1)) UNION (SELECT 2)')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects EXPLAIN with DML preceding SELECT: EXPLAIN INSERT INTO audit SELECT * FROM source', () => {
    const r = isReadOnlySql('EXPLAIN INSERT INTO audit SELECT * FROM source')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_EXPLAIN_TARGET_NOT_SELECT')
  })
})

// ---------------------------------------------------------------------------
// Validation budget. MAX_UNWRAP_DEPTH only bounds consecutive parenthesis
// unwrapping within one level; these cover the whole-validation budget that
// bounds recursion through CTE bodies, set operands and EXPLAIN targets.
//
// Assertions are on error codes only, never on elapsed time: the same input
// varied by ~500x run-to-run on the authoring machine, so a timing assertion
// would be flaky in CI.
// ---------------------------------------------------------------------------
describe('isReadOnlySql - complexity budget', () => {
  const nestedWith = (n: number): string => {
    let s = 'SELECT 1'
    for (let i = 0; i < n; i++) s = `WITH c${i} AS (${s}) SELECT * FROM c${i}`
    return s
  }
  const nestedExplain = (n: number): string => 'EXPLAIN ('.repeat(n) + 'SELECT 1' + ')'.repeat(n)
  const nestedUnion = (n: number): string => {
    let s = 'SELECT 1'
    for (let i = 0; i < n; i++) s = `(${s}) UNION ALL (SELECT ${i})`
    return s
  }

  it('rejects deeply nested CTEs rather than blocking on them', () => {
    const r = isReadOnlySql(nestedWith(400))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_COMPLEXITY_LIMIT')
  })

  it('rejects nested CTEs at 800 levels (~27KB, under the 50KB caller cap)', () => {
    const r = isReadOnlySql(nestedWith(800))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_COMPLEXITY_LIMIT')
  })

  it('rejects deeply nested EXPLAIN, on grammar before the budget is reached', () => {
    // EXPLAIN is not a query expression, so an EXPLAIN target that is itself an
    // EXPLAIN is rejected on grammar. EXPLAIN targets still share the same
    // budget, which the nested-CTE and set-operation cases above exercise.
    const r = isReadOnlySql(nestedExplain(400))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_EXPLAIN_TARGET_NOT_SELECT')
  })

  it('rejects deeply nested set operations', () => {
    const r = isReadOnlySql(nestedUnion(400))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_COMPLEXITY_LIMIT')
  })

  it('returns an error code rather than throwing on pathological nesting', () => {
    expect(() => isReadOnlySql(nestedWith(2000))).not.toThrow()
    expect(() => isReadOnlySql(nestedExplain(2000))).not.toThrow()
  })

  it('still allows realistic nesting well inside the budget', () => {
    expect(isReadOnlySql(nestedWith(8)).ok).toBe(true)
    expect(isReadOnlySql(nestedUnion(8)).ok).toBe(true)
    expect(isReadOnlySql('EXPLAIN (SELECT 1)').ok).toBe(true)
  })

  it('allows a large but flat 50KB SELECT', () => {
    const r = isReadOnlySql('SELECT ' + "'x',".repeat(12000) + '1')
    expect(r.ok).toBe(true)
  })

  it('allows a long flat UNION chain', () => {
    const r = isReadOnlySql('SELECT 1' + ' UNION SELECT 1'.repeat(3400))
    expect(r.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Write paths that open with a whitelisted keyword.
//
// These reach the database through execute_readonly_query, which has no
// approval gate — execute_write_query is the tool that prompts. So a write
// slipping past this guard also slips past user approval.
// ---------------------------------------------------------------------------
describe('isReadOnlySql - reject writes behind a read-only prefix', () => {
  it('rejects a CTE followed by INSERT whose column list precedes SELECT', () => {
    const r = isReadOnlySql('WITH a AS (SELECT 1) INSERT INTO t(x) SELECT * FROM a')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects a CTE followed by REPLACE whose column list precedes SELECT', () => {
    const r = isReadOnlySql('WITH a AS (SELECT 1) REPLACE INTO t(x) SELECT * FROM a')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects a data-modifying CTE body hidden behind a column list', () => {
    const r = isReadOnlySql('WITH a(values) AS (DELETE FROM t RETURNING 1) SELECT * FROM a')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_WITH_CONTAINS_DML')
  })

  it('rejects an INSERT CTE body hidden behind a column list', () => {
    const r = isReadOnlySql('WITH a(x) AS (INSERT INTO t VALUES(1) RETURNING 1) SELECT * FROM a')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_WITH_CONTAINS_DML')
  })

  it('rejects MySQL SELECT ... INTO OUTFILE', () => {
    const r = isReadOnlySql("SELECT * FROM t INTO OUTFILE '/tmp/x'")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects MySQL SELECT ... INTO DUMPFILE', () => {
    const r = isReadOnlySql("SELECT * FROM t INTO DUMPFILE '/tmp/x'")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects SELECT ... INTO new_table (PG / MSSQL CTAS)', () => {
    const r = isReadOnlySql('SELECT * INTO new_table FROM t')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects INTO OUTFILE in any set-operation operand', () => {
    const r = isReadOnlySql("SELECT 1 UNION SELECT * FROM t INTO OUTFILE '/tmp/x'")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  // `outfile` / `dumpfile` are ordinary identifiers. Matching them
  // independently of INTO rejected these queries, and the write tool then
  // executed them because it read any guard failure as "this is a write".
  it('allows outfile / dumpfile as ordinary identifiers', () => {
    const cases = [
      'SELECT outfile FROM logs',
      'SELECT dumpfile FROM logs',
      'SELECT * FROM outfile',
      'SELECT x AS outfile FROM logs',
      'SELECT t.outfile FROM logs t',
      'SELECT outfile, dumpfile FROM logs',
      'SELECT * FROM logs WHERE outfile IS NOT NULL'
    ]
    for (const sql of cases) {
      expect(isReadOnlySql(sql, 'mysql').ok).toBe(true)
    }
  })

  it('still rejects every SELECT ... INTO variant', () => {
    const cases = [
      'SELECT * INTO new_table FROM t',
      "SELECT * FROM t INTO OUTFILE '/tmp/x'",
      "SELECT * FROM t INTO DUMPFILE '/tmp/x'",
      'SELECT a INTO @v FROM t',
      "SELECT * FROM t INTO outfile '/tmp/x'"
    ]
    for (const sql of cases) {
      expect(isReadOnlySql(sql, 'mysql').ok).toBe(false)
    }
  })

  it('does not trip on identifiers that merely contain "into"', () => {
    expect(isReadOnlySql('SELECT into_count FROM logs', 'mysql').ok).toBe(true)
    expect(isReadOnlySql('SELECT * FROM intolerance', 'mysql').ok).toBe(true)
  })

  // Locking reads return rows but hold locks until the transaction ends, so
  // they are not read-only. Detected at any depth, unlike INTO.
  it('rejects every locking-read form as non-read-only', () => {
    const cases: Array<[string, GuardDialect]> = [
      ['SELECT * FROM t FOR UPDATE', 'mysql'],
      ['SELECT * FROM t FOR NO KEY UPDATE', 'postgresql'],
      ['SELECT * FROM t FOR SHARE', 'mysql'],
      ['SELECT * FROM t FOR KEY SHARE', 'postgresql'],
      ['SELECT * FROM t LOCK IN SHARE MODE', 'mysql'],
      ['SELECT * FROM t FOR UPDATE NOWAIT', 'mysql'],
      ['SELECT * FROM t FOR UPDATE SKIP LOCKED', 'mysql'],
      ['SELECT * FROM t FOR UPDATE OF c', 'oracle'],
      ['SELECT * FROM t FOR UPDATE WAIT 5', 'oracle'],
      ['SELECT * FROM t for update', 'mysql']
    ]
    for (const [sql, dialect] of cases) {
      const r = isReadOnlySql(sql, dialect)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errorCode).toBe('E_LOCKING_READ')
    }
  })

  it('rejects locking reads in every grammar position, including subqueries', () => {
    const cases = [
      'SELECT 1 UNION SELECT 2 FOR UPDATE',
      'WITH c AS (SELECT 1) SELECT * FROM c FOR UPDATE',
      'WITH c AS (SELECT 1 FOR UPDATE) SELECT * FROM c',
      'SELECT * FROM (SELECT 1 FOR UPDATE) x',
      'SELECT * FROM t WHERE id IN (SELECT id FROM u FOR UPDATE)',
      'EXPLAIN SELECT * FROM t FOR UPDATE'
    ]
    for (const sql of cases) {
      const r = isReadOnlySql(sql, 'mysql')
      expect(r.ok).toBe(false)
      // A lock inside a subquery blocks as much as one at the top level, so
      // depth is deliberately not part of this check.
      if (!r.ok) expect(r.errorCode).toBe('E_LOCKING_READ')
    }
  })

  it('does not mistake identifiers or string contents for a lock clause', () => {
    const cases: Array<[string, GuardDialect]> = [
      ['SELECT * FROM t', 'mysql'],
      ['SELECT for_update FROM t', 'mysql'],
      ['SELECT update_for FROM t', 'mysql'],
      ["SELECT * FROM t WHERE note = 'for update'", 'mysql'],
      ["SELECT * FROM t WHERE note = 'lock in share mode'", 'mysql'],
      ['SELECT `for update` FROM t', 'mysql'],
      ['SELECT "for update" FROM t', 'postgresql'],
      ['SELECT * FROM t -- for update', 'mysql'],
      ['SELECT * FROM t /* for update */', 'mysql'],
      ['SELECT share_price FROM t', 'mysql'],
      ['SELECT * FROM t ORDER BY updated_at', 'mysql']
    ]
    for (const [sql, dialect] of cases) {
      expect(isReadOnlySql(sql, dialect).ok).toBe(true)
    }
  })

  it('keeps ignoring INTO below the top level', () => {
    // Depth > 0 is out of scope by design; asserted so a future change to the
    // depth rule is a deliberate decision rather than a silent one.
    expect(isReadOnlySql('SELECT * FROM (SELECT 1 INTO x) y', 'mysql').ok).toBe(true)
  })

  it('does not trip on a subquery that merely uses IN', () => {
    const r = isReadOnlySql('SELECT * FROM (SELECT id FROM t) sub WHERE sub.id IN (SELECT 1)')
    expect(r.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Statement vs query-expression position.
//
// A set-operation operand, a CTE body and an EXPLAIN target are query
// expressions: only SELECT / WITH / VALUES belong there. Reusing the top-level
// statement whitelist for those positions accepts nonsense and defers the error
// to the database.
// ---------------------------------------------------------------------------
describe('isReadOnlySql - statement vs query position', () => {
  it('rejects SHOW as a set-operation operand', () => {
    const r = isReadOnlySql('SELECT 1 UNION SHOW TABLES')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects PRAGMA as a set-operation operand', () => {
    const r = isReadOnlySql('SELECT 1 UNION PRAGMA table_info(users)')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects DESC as a set-operation operand', () => {
    const r = isReadOnlySql('SELECT 1 UNION DESC t')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects EXPLAIN as a set-operation operand', () => {
    const r = isReadOnlySql('SELECT 1 UNION EXPLAIN SELECT 2')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('rejects PRAGMA as an EXPLAIN target', () => {
    const r = isReadOnlySql('EXPLAIN (PRAGMA table_info(users))')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_EXPLAIN_TARGET_NOT_SELECT')
  })

  it('rejects PRAGMA as a CTE body', () => {
    const r = isReadOnlySql('WITH x AS (PRAGMA table_info(users)) SELECT * FROM x')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_WITH_CONTAINS_DML')
  })

  it('rejects SHOW as a CTE body', () => {
    const r = isReadOnlySql('WITH x AS (SHOW TABLES) SELECT * FROM x')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_WITH_CONTAINS_DML')
  })

  it('rejects a non-query statement after the CTE list', () => {
    const r = isReadOnlySql('WITH a AS (SELECT 1) SHOW TABLES')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_NOT_WHITELISTED')
  })

  it('still allows SHOW / DESC / PRAGMA at the top level', () => {
    expect(isReadOnlySql('SHOW TABLES').ok).toBe(true)
    expect(isReadOnlySql('DESC t').ok).toBe(true)
    expect(isReadOnlySql('PRAGMA table_info(users)', 'sqlite').ok).toBe(true)
  })

  it('rejects PRAGMA in a query position even on SQLite', () => {
    expect(isReadOnlySql('SELECT 1 UNION PRAGMA table_info(users)', 'sqlite').ok).toBe(false)
    expect(isReadOnlySql('WITH x AS (PRAGMA table_info(users)) SELECT * FROM x', 'sqlite').ok).toBe(false)
  })

  it('still allows a nested WITH as a CTE body', () => {
    const r = isReadOnlySql('WITH b AS (WITH a AS (SELECT 1) SELECT * FROM a) SELECT * FROM b')
    expect(r.ok).toBe(true)
  })

  it('does not split an EXPLAIN on its target set operators', () => {
    const r = isReadOnlySql('EXPLAIN SELECT * FROM a UNION SELECT * FROM b')
    expect(r.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// EXPLAIN over a WITH target.
//
// The target boundary is found by scanning at paren depth 0. Keying on "the
// first SELECT anywhere" puts the boundary inside the CTE body, which splits the
// statement mid-parenthesis and false-rejects valid SQL.
// ---------------------------------------------------------------------------
describe('isReadOnlySql - EXPLAIN with a WITH target', () => {
  it('allows EXPLAIN over a CTE query', () => {
    const r = isReadOnlySql('EXPLAIN WITH c AS (SELECT 1) SELECT * FROM c')
    expect(r.ok).toBe(true)
  })

  it('allows EXPLAIN over a recursive CTE with a column list', () => {
    const r = isReadOnlySql('EXPLAIN WITH RECURSIVE t(n) AS (SELECT 1) SELECT * FROM t')
    expect(r.ok).toBe(true)
  })

  it('allows EXPLAIN over multiple CTEs', () => {
    const r = isReadOnlySql('EXPLAIN WITH a AS (SELECT 1), b AS (SELECT 2) SELECT * FROM a, b')
    expect(r.ok).toBe(true)
  })

  it('allows PG options before a CTE target', () => {
    const r = isReadOnlySql('EXPLAIN (FORMAT JSON) WITH c AS (SELECT 1) SELECT * FROM c')
    expect(r.ok).toBe(true)
  })

  it('still rejects ANALYZE over a CTE target', () => {
    const r = isReadOnlySql('EXPLAIN ANALYZE WITH c AS (SELECT 1) SELECT * FROM c')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_EXPLAIN_ANALYZE')
  })

  it('still rejects a data-modifying CTE body under EXPLAIN', () => {
    const r = isReadOnlySql('EXPLAIN WITH x AS (DELETE FROM t RETURNING 1) SELECT * FROM x')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_EXPLAIN_TARGET_NOT_SELECT')
  })

  it('still rejects a write after the CTE list under EXPLAIN', () => {
    const r = isReadOnlySql('EXPLAIN WITH a AS (SELECT 1) INSERT INTO t(x) SELECT * FROM a')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_EXPLAIN_TARGET_NOT_SELECT')
  })
})

// ---------------------------------------------------------------------------
// CTE column lists. Taking the first parenthesis after the CTE name picks up
// the column list rather than the body, which both hides a data-modifying body
// from inspection and false-rejects standard SQL.
// ---------------------------------------------------------------------------
describe('isReadOnlySql - CTE column lists', () => {
  it('allows the standard recursive CTE form with a column list', () => {
    const r = isReadOnlySql('WITH RECURSIVE t(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM t WHERE n<5) SELECT * FROM t')
    expect(r.ok).toBe(true)
  })

  it('allows a single-column CTE column list', () => {
    const r = isReadOnlySql('WITH a(x) AS (SELECT 1) SELECT * FROM a')
    expect(r.ok).toBe(true)
  })

  it('allows a multi-column CTE column list with spacing', () => {
    const r = isReadOnlySql('WITH a (x, y) AS (SELECT 1, 2) SELECT * FROM a')
    expect(r.ok).toBe(true)
  })

  it('allows PG NOT MATERIALIZED between AS and the body', () => {
    const r = isReadOnlySql('WITH a AS NOT MATERIALIZED (SELECT 1) SELECT * FROM a')
    expect(r.ok).toBe(true)
  })

  it('allows multiple CTEs that each carry a column list', () => {
    const r = isReadOnlySql('WITH a(x) AS (SELECT 1), b(y) AS (SELECT 2) SELECT * FROM a, b')
    expect(r.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// classifySql: the tri-state verdict. Replaces the deny-list predicate, whose
// weakness was that "not read-only" had to stand in for "is a write".
// ---------------------------------------------------------------------------
const nestedWith = (n: number): string => {
  let s = 'SELECT 1'
  for (let i = 0; i < n; i++) s = `WITH c${i} AS (${s}) SELECT * FROM c${i}`
  return s
}

describe('classifySql - readonly', () => {
  it('classifies proven read-only statements as readonly', () => {
    const cases: Array<[string, GuardDialect]> = [
      ['SELECT 1', 'mysql'],
      ['WITH c AS (SELECT 1) SELECT * FROM c', 'mysql'],
      ['SELECT 1 UNION SELECT 2', 'mysql'],
      ['SELECT outfile FROM logs', 'mysql'],
      ['SHOW TABLES', 'mysql'],
      ['DESC users', 'mysql'],
      ['EXPLAIN SELECT 1', 'mysql'],
      ['PRAGMA table_info(users)', 'sqlite']
    ]
    for (const [sql, dialect] of cases) {
      expect(classifySql(sql, dialect).kind).toBe('readonly')
    }
  })
})

describe('classifySql - requires_approval', () => {
  it('names the side effect of recognized stateful statements', () => {
    const cases: Array<[string, GuardDialect, SqlOperation]> = [
      ['INSERT INTO t VALUES (1)', 'mysql', 'dml'],
      ['UPDATE t SET a=1', 'mysql', 'dml'],
      ['DELETE FROM t', 'mysql', 'dml'],
      ['CREATE TABLE t(id INT)', 'mysql', 'ddl'],
      ['DROP TABLE t', 'mysql', 'ddl'],
      ['TRUNCATE TABLE t', 'mysql', 'ddl'],
      ['GRANT SELECT ON t TO u', 'mysql', 'session'],
      ['SET autocommit=0', 'mysql', 'session'],
      ['COMMIT', 'mysql', 'session'],
      ['SELECT * FROM t FOR UPDATE', 'mysql', 'lock'],
      ['SELECT * FROM t LOCK IN SHARE MODE', 'mysql', 'lock']
    ]
    for (const [sql, dialect, operation] of cases) {
      const d = classifySql(sql, dialect)
      expect(d.kind).toBe('requires_approval')
      if (d.kind === 'requires_approval') expect(d.operation).toBe(operation)
    }
  })

  it('resolves the effective verb past a CTE list', () => {
    // Reading the leading word would say WITH and look read-only.
    const d = classifySql('WITH c AS (SELECT 1) INSERT INTO t SELECT * FROM c', 'mysql')
    expect(d.kind).toBe('requires_approval')
    if (d.kind === 'requires_approval') expect(d.operation).toBe('dml')
  })

  it('treats SELECT ... INTO as a write despite the SELECT verb', () => {
    for (const sql of ['SELECT * INTO new_table FROM t', "SELECT * FROM t INTO OUTFILE '/tmp/x'", "SELECT * FROM t INTO DUMPFILE '/tmp/x'"]) {
      const d = classifySql(sql, 'mysql')
      expect(d.kind).toBe('requires_approval')
      if (d.kind === 'requires_approval') expect(d.operation).toBe('dml')
    }
  })

  it('honours dialect-specific verbs', () => {
    const cases: Array<[string, GuardDialect]> = [
      ['REPLACE INTO t VALUES (1)', 'mysql'],
      ['RENAME TABLE a TO b', 'mysql'],
      ['OPTIMIZE TABLE t', 'mysql'],
      ["COPY t FROM '/tmp/x'", 'postgresql'],
      ['VACUUM', 'postgresql'],
      ['REFRESH MATERIALIZED VIEW mv', 'postgresql'],
      ['REINDEX INDEX i', 'postgresql'],
      ["ATTACH DATABASE 'x' AS y", 'sqlite'],
      ['DETACH DATABASE y', 'sqlite'],
      ['MERGE INTO t USING s ON (1=1) WHEN MATCHED THEN UPDATE SET a=1', 'oracle']
    ]
    for (const [sql, dialect] of cases) {
      expect(classifySql(sql, dialect).kind).toBe('requires_approval')
    }
  })

  it('does not leak one dialect’s verbs into another', () => {
    // VACUUM / COPY are not MySQL statements; admitting them would widen the
    // allow-list beyond what the engine can actually parse.
    expect(classifySql('VACUUM', 'mysql').kind).toBe('reject')
    expect(classifySql("COPY t FROM '/tmp/x'", 'mysql').kind).toBe('reject')
    expect(classifySql("ATTACH DATABASE 'x' AS y", 'mysql').kind).toBe('reject')
  })

  it('falls back to the common table when no dialect is supplied', () => {
    expect(classifySql('UPDATE t SET a=1').kind).toBe('requires_approval')
    // Dialect-only verbs must not be admitted without knowing the engine.
    expect(classifySql('VACUUM').kind).toBe('reject')
  })
})

describe('classifySql - reject', () => {
  it('rejects unverifiable structure rather than guessing a verb', () => {
    const cases: Array<[string, GuardErrorCode]> = [
      ['SELECT 1; DROP TABLE users', 'E_MULTIPLE_STATEMENTS'],
      ["SELECT 1 /*! INTO OUTFILE '/tmp/x' */", 'E_EXECUTABLE_COMMENT'],
      ['SELECT 1 /* unterminated', 'E_UNTERMINATED_LITERAL'],
      ["UPDATE t SET a='unterminated", 'E_UNTERMINATED_LITERAL'],
      [nestedWith(400), 'E_COMPLEXITY_LIMIT'],
      ['', 'E_EMPTY_STATEMENT'],
      ['EXPLAIN ANALYZE SELECT 1', 'E_EXPLAIN_ANALYZE']
    ]
    for (const [sql, errorCode] of cases) {
      const d = classifySql(sql, 'mysql')
      expect(d.kind).toBe('reject')
      if (d.kind === 'reject') expect(d.errorCode).toBe(errorCode)
    }
  })

  it('rejects verbs whose side effects cannot be bounded from text', () => {
    // The heart of the allow-list: unknown means refused, not executed.
    for (const sql of ['CALL sp()', 'FROBNICATE t', 'EXEC sp_who']) {
      expect(classifySql(sql, 'mysql').kind).toBe('reject')
    }
    expect(classifySql('BEGIN NULL; END;', 'oracle').kind).toBe('reject')
  })

  it('rejects grammatically wrong and dialect-mismatched statements', () => {
    expect(classifySql('SELECT 1 UNION SHOW TABLES', 'mysql').kind).toBe('reject')
    expect(classifySql('PRAGMA table_info(users)', 'mysql').kind).toBe('reject')
    expect(classifySql('PRAGMA table_info(users)', 'postgresql').kind).toBe('reject')
    expect(classifySql('PRAGMA journal_mode = WAL', 'sqlite').kind).toBe('reject')
  })
})

describe('classifySql - flat vs nested complexity', () => {
  it('admits legitimate flat multi-CTE and multi-UNION queries', () => {
    const flatCte = 'WITH ' + Array.from({ length: 400 }, (_, i) => `c${i} AS (SELECT 1)`).join(', ') + ' SELECT 1'
    const flatUnion = Array.from({ length: 400 }, () => 'SELECT 1').join(' UNION ')
    expect(classifySql(flatCte, 'mysql').kind).toBe('readonly')
    expect(classifySql(flatUnion, 'mysql').kind).toBe('readonly')
  })
})

describe('isReadOnlySql - compatibility wrapper', () => {
  it('reports readonly as ok and both other states as not ok', () => {
    expect(isReadOnlySql('SELECT 1', 'mysql').ok).toBe(true)
    expect(isReadOnlySql('UPDATE t SET a=1', 'mysql').ok).toBe(false)
    expect(isReadOnlySql('CALL sp()', 'mysql').ok).toBe(false)
  })

  it('preserves the specific error code for rejections', () => {
    const r = isReadOnlySql('SELECT 1; DROP TABLE users', 'mysql')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_MULTIPLE_STATEMENTS')
  })

  it('still surfaces locking reads as E_LOCKING_READ', () => {
    const r = isReadOnlySql('SELECT * FROM t FOR UPDATE', 'mysql')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_LOCKING_READ')
  })
})
