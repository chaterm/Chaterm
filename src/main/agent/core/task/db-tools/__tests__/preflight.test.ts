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

  it('admits locking reads so they reach the approval prompt', () => {
    for (const sql of ['SELECT * FROM t FOR UPDATE', 'SELECT * FROM t FOR SHARE', 'SELECT * FROM t LOCK IN SHARE MODE']) {
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
    // PRAGMA is a read-only whitelisted statement on SQLite, so the write tool
    // is the wrong tool for it.
    const onSqlite = preflightWriteSql('PRAGMA table_info(users)', 'sqlite')
    expect(onSqlite.ok).toBe(false)
    if (!onSqlite.ok) expect(onSqlite.errorCode).toBe('E_INVALID_PARAM')

    // On MySQL it is neither read-only nor a recognized MySQL verb, so it is
    // refused outright instead of raising an approval prompt for a statement
    // the engine would reject anyway.
    const onMysql = preflightWriteSql('PRAGMA table_info(users)', 'mysql')
    expect(onMysql.ok).toBe(false)
    if (!onMysql.ok) expect(onMysql.errorCode).toBe('E_SQL_UNVERIFIABLE')
  })

  it('does not echo the caller SQL in error text', () => {
    const r = preflightWriteSql('SELECT 1; DROP TABLE users', 'mysql')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorMessage).not.toContain('DROP')
  })
})
