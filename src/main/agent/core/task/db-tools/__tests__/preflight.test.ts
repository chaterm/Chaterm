import { describe, expect, it } from 'vitest'
import { preflightWriteSql } from '../preflight'

const nestedWith = (n: number): string => {
  let s = 'SELECT 1'
  for (let i = 0; i < n; i++) s = `WITH c${i} AS (${s}) SELECT * FROM c${i}`
  return s
}

describe('preflightWriteSql', () => {
  it('rejects read-only SQL so no approval prompt is shown', () => {
    for (const sql of ['SELECT 1', 'SHOW TABLES', 'DESC users', 'SELECT outfile FROM logs']) {
      const r = preflightWriteSql(sql, 'mysql')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errorCode).toBe('E_INVALID_PARAM')
    }
  })

  it('rejects unverifiable SQL so no approval prompt is shown', () => {
    for (const sql of ['SELECT 1; DROP TABLE users', "SELECT 1 /*! INTO OUTFILE '/tmp/x' */", nestedWith(400), "UPDATE t SET a='unterminated"]) {
      const r = preflightWriteSql(sql, 'mysql')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errorCode).toBe('E_SQL_UNVERIFIABLE')
    }
  })

  it('admits ordinary write SQL', () => {
    for (const sql of [
      'UPDATE t SET a=1',
      'INSERT INTO t VALUES (1)',
      'DELETE FROM t WHERE id=1',
      'DROP TABLE t',
      "SELECT * FROM t INTO OUTFILE '/tmp/x'"
    ]) {
      expect(preflightWriteSql(sql, 'mysql').ok).toBe(true)
    }
  })

  it('fails closed when the dialect is unknown', () => {
    // Guard behaviour is dialect-dependent, so guessing an engine here could
    // admit SQL the real engine treats differently.
    const r = preflightWriteSql('UPDATE t SET a=1', undefined)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_INVALID_PARAM')
  })

  it('rejects oversized SQL before approval rather than after', () => {
    const r = preflightWriteSql('UPDATE t SET a=' + "'x'".repeat(30_000), 'mysql')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('E_SQL_TOO_LARGE')
  })

  it('agrees with the write tool on dialect-specific verdicts', () => {
    // PRAGMA is legal on SQLite and nonsense elsewhere; preflight must not be
    // more permissive than the tool it gates.
    expect(preflightWriteSql('PRAGMA table_info(users)', 'sqlite').ok).toBe(false)
    expect(preflightWriteSql('PRAGMA table_info(users)', 'mysql').ok).toBe(true)
  })

  it('does not echo the caller SQL in error text', () => {
    const r = preflightWriteSql('SELECT 1; DROP TABLE users', 'mysql')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorMessage).not.toContain('DROP')
  })
})
