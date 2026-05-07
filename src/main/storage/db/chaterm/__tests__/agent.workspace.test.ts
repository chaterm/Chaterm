// Copyright (c) 2025-present, chaterm.ai  All rights reserved.
// This source code is licensed under the GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the global logger used inside agent.ts.
vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
}))

const { getTaskMetadataLogic, saveTaskMetadataLogic } = await import('../agent')

type CapturedInsert = {
  sql: string
  args: unknown[]
}

/**
 * Minimal fake `better-sqlite3` Database double that captures every
 * prepared-statement invocation. We only test branches that operate on the
 * statement bindings, so we skip real SQL execution entirely.
 */
function createMockDb(opts: { selectRow?: Record<string, unknown> | undefined } = {}) {
  const captures: CapturedInsert[] = []
  const mockDb = {
    prepare(sql: string) {
      return {
        get(_taskId: string) {
          if (sql.includes('SELECT files_in_context')) {
            return opts.selectRow ?? undefined
          }
          return undefined
        },
        run(...args: unknown[]) {
          captures.push({ sql, args })
          return { changes: 1 }
        }
      }
    }
  }
  return { db: mockDb as any, captures }
}

describe('agent.ts - saveTaskMetadataLogic workspace handling', () => {
  let db: ReturnType<typeof createMockDb>['db']
  let captures: CapturedInsert[]

  beforeEach(() => {
    const created = createMockDb()
    db = created.db
    captures = created.captures
  })

  it('omits workspace/db_context when caller does not provide them (provided flags are 0)', async () => {
    await saveTaskMetadataLogic(db, 'task-1', {
      files_in_context: [],
      model_usage: [],
      hosts: [],
      todos: [],
      experience_ledger: []
    })

    expect(captures).toHaveLength(1)
    const args = captures[0].args
    // Positional binding order:
    //  1 taskId, 2 files_in_context, 3 model_usage, 4 hosts,
    //  5 todos, 6 experience_ledger, 7 title, 8 favorite,
    //  9 workspaceValue, 10 dbContextValue,
    //  11 workspaceProvided, 12 dbContextProvided
    expect(args[0]).toBe('task-1')
    expect(args[8]).toBeNull() // workspaceValue
    expect(args[9]).toBeNull() // dbContextValue
    expect(args[10]).toBe(0) // workspaceProvided
    expect(args[11]).toBe(0) // dbContextProvided
  })

  it('persists workspace="database" and serialised db_context when both provided', async () => {
    await saveTaskMetadataLogic(db, 'task-2', {
      files_in_context: [],
      model_usage: [],
      hosts: [],
      todos: [],
      experience_ledger: [],
      workspace: 'database',
      db_context: { assetId: 'ast-1', dbType: 'postgresql', databaseName: 'app' }
    })

    expect(captures).toHaveLength(1)
    const args = captures[0].args
    expect(args[8]).toBe('database')
    expect(typeof args[9]).toBe('string')
    const parsed = JSON.parse(args[9] as string)
    expect(parsed.assetId).toBe('ast-1')
    expect(parsed.dbType).toBe('postgresql')
    expect(args[10]).toBe(1)
    expect(args[11]).toBe(1)
  })

  it('db_context null counts as "provided" so callers can explicitly clear it', async () => {
    await saveTaskMetadataLogic(db, 'task-3', {
      files_in_context: [],
      model_usage: [],
      hosts: [],
      todos: [],
      experience_ledger: [],
      workspace: 'server',
      db_context: null
    })

    const args = captures[0].args
    expect(args[8]).toBe('server')
    expect(args[9]).toBeNull()
    expect(args[10]).toBe(1)
    expect(args[11]).toBe(1)
  })

  it('rejects invalid workspace strings (not "server" or "database")', async () => {
    await saveTaskMetadataLogic(db, 'task-4', {
      files_in_context: [],
      model_usage: [],
      hosts: [],
      todos: [],
      experience_ledger: [],
      workspace: 'bogus'
    })

    const args = captures[0].args
    expect(args[8]).toBeNull()
    expect(args[10]).toBe(0) // not provided -> preserve existing
  })
})

describe('agent.ts - getTaskMetadataLogic workspace reads', () => {
  it('returns workspace="server" when row omits the column (legacy compatibility)', async () => {
    const { db } = createMockDb({
      selectRow: {
        files_in_context: '[]',
        model_usage: '[]',
        hosts: '[]',
        todos: '[]',
        experience_ledger: '[]',
        title: null,
        favorite: 0
        // workspace / db_context intentionally absent
      }
    })
    const result = await getTaskMetadataLogic(db, 'task-legacy')
    expect(result.workspace).toBe('server')
    expect(result.db_context).toBeUndefined()
  })

  it('returns workspace="database" and parsed db_context when stored', async () => {
    const { db } = createMockDb({
      selectRow: {
        files_in_context: '[]',
        model_usage: '[]',
        hosts: '[]',
        todos: '[]',
        experience_ledger: '[]',
        title: null,
        favorite: 0,
        workspace: 'database',
        db_context: JSON.stringify({ assetId: 'ast-1', dbType: 'mysql' })
      }
    })
    const result = await getTaskMetadataLogic(db, 'task-db')
    expect(result.workspace).toBe('database')
    expect(result.db_context).toEqual({ assetId: 'ast-1', dbType: 'mysql' })
  })

  it('ignores malformed db_context JSON without throwing', async () => {
    const { db } = createMockDb({
      selectRow: {
        files_in_context: '[]',
        model_usage: '[]',
        hosts: '[]',
        todos: '[]',
        experience_ledger: '[]',
        title: null,
        favorite: 0,
        workspace: 'database',
        db_context: '{not-json'
      }
    })
    const result = await getTaskMetadataLogic(db, 'task-bad-json')
    expect(result.workspace).toBe('database')
    expect(result.db_context).toBeUndefined()
  })

  it('returns safe defaults when no row exists', async () => {
    const { db } = createMockDb()
    const result = await getTaskMetadataLogic(db, 'task-missing')
    expect(result.workspace).toBe('server')
    expect(result.db_context).toBeUndefined()
    expect(result.files_in_context).toEqual([])
  })
})
