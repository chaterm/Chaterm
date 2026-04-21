import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'

vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
}))

const { upgradeConnectionHistorySupport } = await import('../add-connection-history-support')

type MockDb = {
  prepare: (sql: string) => { get: () => unknown }
  exec: (sql: string) => void
}

describe('upgradeConnectionHistorySupport', () => {
  let db: MockDb
  let execCalls: string[]
  let tableExists: boolean

  beforeEach(() => {
    execCalls = []
    tableExists = false

    db = {
      prepare(sql: string) {
        const normalized = sql.trim().toLowerCase()
        if (normalized.includes('sqlite_master') && normalized.includes('t_connection_history')) {
          return {
            get: () => (tableExists ? { name: 't_connection_history' } : undefined)
          }
        }
        return { get: () => undefined }
      },
      exec(sql: string) {
        execCalls.push(sql)
      }
    }
  })

  it('should create t_connection_history table when it does not exist', async () => {
    tableExists = false

    await upgradeConnectionHistorySupport(db as unknown as Database.Database)

    expect(execCalls).toHaveLength(1)
    expect(execCalls[0]).toContain('CREATE TABLE t_connection_history')
    expect(execCalls[0]).toContain('asset_uuid TEXT NOT NULL')
    expect(execCalls[0]).toContain('asset_ip TEXT NOT NULL')
    expect(execCalls[0]).toContain('asset_label TEXT')
    expect(execCalls[0]).toContain('asset_port INTEGER DEFAULT 22')
    expect(execCalls[0]).toContain('asset_username TEXT')
    expect(execCalls[0]).toContain('asset_type TEXT NOT NULL')
    expect(execCalls[0]).toContain('organization_id TEXT')
    expect(execCalls[0]).toContain('connected_at DATETIME DEFAULT CURRENT_TIMESTAMP')
  })

  it('should skip migration when table already exists', async () => {
    tableExists = true

    await upgradeConnectionHistorySupport(db as unknown as Database.Database)

    expect(execCalls).toHaveLength(0)
  })

  it('should propagate database errors', async () => {
    const errorDb = {
      prepare() {
        throw new Error('Database connection error')
      }
    }

    await expect(upgradeConnectionHistorySupport(errorDb as unknown as Database.Database)).rejects.toThrow('Database connection error')
  })
})
