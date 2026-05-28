import { describe, it, expect } from 'vitest'
import { autoCompleteDatabaseService } from '../autocomplete.service'

interface MockStatement {
  all: (...args: unknown[]) => unknown[]
}

interface MockDb {
  prepare: (sql: string) => MockStatement
}

function createServiceWithDb(db: MockDb): autoCompleteDatabaseService {
  const service = Object.create(autoCompleteDatabaseService.prototype) as autoCompleteDatabaseService
  ;(service as any).db = db
  return service
}

function createMockDb(commonRows: Array<{ command: string }>): MockDb {
  return {
    prepare(sql: string) {
      if (sql.includes('FROM linux_commands_history') && sql.includes('command LIKE') && sql.includes('ip = ?')) {
        return { all: () => [] }
      }
      if (sql.includes('FROM linux_commands_history') && sql.includes('command LIKE') && sql.includes('ip != ?')) {
        return { all: () => [] }
      }
      if (sql.includes('FROM linux_commands_common')) {
        return { all: () => commonRows }
      }
      if (sql.includes('FROM linux_commands_history') && sql.includes('ORDER BY count DESC LIMIT 500')) {
        return { all: () => [] }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    }
  }
}

describe('autoCompleteDatabaseService.queryCommand', () => {
  it('should not fallback to linux_commands_common when history has no matches', () => {
    const db = createMockDb([{ command: 'git status' }])

    const service = createServiceWithDb(db)
    const result = service.queryCommand('git', '10.0.0.1')

    expect(result).toEqual([])
  })
})
