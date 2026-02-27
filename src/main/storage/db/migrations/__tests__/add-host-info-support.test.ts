import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'

// Mock logger before importing the migration module
vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
}))

const { upgradeHostInfoSupport } = await import('../add-host-info-support')

type Statement = {
  run: (...args: unknown[]) => { changes: number }
  all: () => Array<{ name?: string }>
}

type MockDb = {
  prepare: (sql: string) => Statement
  exec: (sql: string) => void
}

describe('upgradeHostInfoSupport', () => {
  let db: MockDb
  let tableColumns: Array<{ name?: string }>
  let execCalls: string[]

  beforeEach(() => {
    tableColumns = []
    execCalls = []

    db = {
      prepare(sql: string): Statement {
        const normalized = sql.trim().toLowerCase()

        if (normalized.includes('pragma table_info(agent_ui_messages_v1)')) {
          return {
            run: () => ({ changes: 0 }),
            all: () => tableColumns
          }
        }

        return {
          run: () => ({ changes: 0 }),
          all: () => []
        }
      },
      exec(sql: string) {
        execCalls.push(sql)
      }
    }
  })

  it('should add hosts column when it does not exist', async () => {
    // Simulate table without hosts column
    tableColumns = [{ name: 'task_id' }, { name: 'ts' }, { name: 'type' }, { name: 'text' }]

    await upgradeHostInfoSupport(db as unknown as Database.Database)

    expect(execCalls).toHaveLength(1)
    expect(execCalls[0]).toContain('ALTER TABLE agent_ui_messages_v1 ADD COLUMN hosts TEXT')
  })

  it('should skip migration when hosts column already exists', async () => {
    // Simulate table with hosts column already present
    tableColumns = [{ name: 'task_id' }, { name: 'ts' }, { name: 'type' }, { name: 'text' }, { name: 'hosts' }]

    await upgradeHostInfoSupport(db as unknown as Database.Database)

    expect(execCalls).toHaveLength(0)
  })

  it('should handle database errors gracefully', async () => {
    const errorDb = {
      prepare() {
        throw new Error('Database connection error')
      }
    }

    await expect(upgradeHostInfoSupport(errorDb as unknown as Database.Database)).rejects.toThrow('Database connection error')
  })

  it('should check for correct column name (case-sensitive)', async () => {
    // Ensure the check is case-sensitive and looks for 'hosts'
    tableColumns = [{ name: 'task_id' }, { name: 'HOSTS' }] // wrong case

    await upgradeHostInfoSupport(db as unknown as Database.Database)

    // Should add column because 'hosts' (lowercase) doesn't exist
    expect(execCalls).toHaveLength(1)
  })
})
