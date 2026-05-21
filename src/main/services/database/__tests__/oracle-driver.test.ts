import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResolvedDbCredential } from '../types'

vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }))
}))

const { __testing } = await import('../drivers/oracle-driver')

type OracleDriverForInit = Parameters<typeof __testing.ensureOracleClientInitialized>[0]

function credential(overrides: Partial<ResolvedDbCredential> = {}): ResolvedDbCredential {
  return {
    dbType: 'oracle',
    host: 'db.example.test',
    port: 1521,
    username: 'hr',
    password: 'secret',
    database: 'ORCLPDB1',
    schemaName: 'HR',
    jdbcUrl: null,
    sslMode: null,
    options: null,
    ...overrides
  }
}

describe('OracleDriverAdapter helpers', () => {
  beforeEach(() => {
    __testing.resetOracleClientInitForTests()
  })

  it('builds EZ Connect from host, port, and service name', () => {
    expect(__testing.buildConnectString(credential())).toBe('db.example.test:1521/ORCLPDB1')
  })

  it('normalizes JDBC, oracle://, and // connect strings', () => {
    expect(__testing.normalizeConnectString('jdbc:oracle:thin:@//host:1521/pdb')).toBe('host:1521/pdb')
    expect(__testing.normalizeConnectString('jdbc:oracle:thin:@host:1521/pdb')).toBe('host:1521/pdb')
    expect(__testing.normalizeConnectString('oracle://host:1521/pdb')).toBe('host:1521/pdb')
    expect(__testing.normalizeConnectString('//host:1521/pdb')).toBe('host:1521/pdb')
  })

  it('prefers options.connectString over jdbcUrl and host fields', () => {
    const input = credential({
      host: 'ignored.example.test',
      jdbcUrl: 'jdbc:oracle:thin:@//ignored-url:1521/pdb',
      options: { connectString: 'jdbc:oracle:thin:@//chosen.example.test:1521/ORCLPDB1' }
    })
    expect(__testing.buildConnectString(input)).toBe('chosen.example.test:1521/ORCLPDB1')
  })

  it('uses jdbcUrl when host is omitted', () => {
    const input = credential({ host: null, port: null, jdbcUrl: 'jdbc:oracle:thin:@//url.example.test:1521/ORCLPDB1' })
    expect(__testing.buildConnectString(input)).toBe('url.example.test:1521/ORCLPDB1')
  })

  it('strips trailing semicolons from SQL but preserves PL/SQL blocks', () => {
    expect(__testing.sanitizeSql('SELECT * FROM dual;')).toBe('SELECT * FROM dual')
    expect(__testing.sanitizeSql('BEGIN NULL; END;')).toBe('BEGIN NULL; END;')
  })

  it('quotes Oracle identifiers by doubling embedded double quotes', () => {
    expect(__testing.quoteOracleIdentifier('HR')).toBe('"HR"')
    expect(__testing.quoteOracleIdentifier('A"B')).toBe('"A""B"')
  })

  it('initializes thick client once when repeated settings match', () => {
    const driver = { initOracleClient: vi.fn() } as unknown as OracleDriverForInit

    __testing.ensureOracleClientInitialized(driver, { libDir: '/opt/oracle', configDir: '/etc/oracle' })
    __testing.ensureOracleClientInitialized(driver, { libDir: '/opt/oracle', configDir: '/etc/oracle' })

    expect(driver.initOracleClient).toHaveBeenCalledTimes(1)
    expect(driver.initOracleClient).toHaveBeenCalledWith({
      libDir: '/opt/oracle',
      configDir: '/etc/oracle',
      driverName: 'Chaterm'
    })
  })

  it('rejects conflicting thick-client initialization settings', () => {
    const driver = { initOracleClient: vi.fn() } as unknown as OracleDriverForInit

    __testing.ensureOracleClientInitialized(driver, { libDir: '/opt/oracle-a', configDir: '/etc/oracle' })

    expect(() => __testing.ensureOracleClientInitialized(driver, { libDir: '/opt/oracle-b', configDir: '/etc/oracle' })).toThrow(
      /already initialized/i
    )
    expect(driver.initOracleClient).toHaveBeenCalledTimes(1)
  })
})
