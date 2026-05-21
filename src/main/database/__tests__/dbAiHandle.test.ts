import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() }
}))

vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }))
}))

vi.mock('../../services/database-ai', () => ({
  createDbAiService: vi.fn(() => ({ run: vi.fn(), cancel: vi.fn() }))
}))

vi.mock('../../services/database-ai/db-session', () => ({
  closeSessionsOwnedBy: vi.fn()
}))

vi.mock('../../services/database', () => ({
  getConnectionManager: vi.fn()
}))

const { __testing } = await import('../dbAiHandle')

describe('dbAiHandle validateRequest', () => {
  function validRequest(targetDialect: string) {
    return {
      reqId: 'req-12345678',
      action: 'convert',
      context: { assetId: 'asset-1', dbType: 'oracle' },
      input: { sql: 'SELECT * FROM employees', targetDialect }
    }
  }

  it('accepts Oracle as a target dialect', () => {
    const parsed = __testing.validateRequest(validRequest('oracle'))

    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.req.input.targetDialect).toBe('oracle')
  })

  it('still rejects unsupported target dialects', () => {
    const parsed = __testing.validateRequest(validRequest('mssql'))

    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.errorMessage).toBe('invalid targetDialect')
  })
})
