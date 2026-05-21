import { describe, expect, it } from 'vitest'
import { allDialects, getDialectInfo, normalizeDialect } from '../dialect'

describe('database-ai dialect metadata', () => {
  it('includes Oracle as a supported SQL dialect', () => {
    expect(allDialects()).toContain('oracle')
    expect(getDialectInfo('oracle')).toMatchObject({ displayName: 'Oracle', identifierQuote: '"' })
  })

  it('normalizes common Oracle aliases', () => {
    expect(normalizeDialect('oracle')).toBe('oracle')
    expect(normalizeDialect('oracledb')).toBe('oracle')
    expect(normalizeDialect('ora')).toBe('oracle')
    expect(normalizeDialect('plsql')).toBe('oracle')
  })
})
