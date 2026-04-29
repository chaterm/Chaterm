import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbAssetRecord } from '../../../storage/db/chaterm/db-assets'
import type { ConnectionTestResult, DatabaseDriverAdapter, ResolvedDbCredential } from '../types'

vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }))
}))

const { ConnectionManager } = await import('../connection-manager')

function makeAsset(overrides: Partial<DbAssetRecord> = {}): DbAssetRecord {
  return {
    id: 'asset-1',
    user_id: 1,
    name: 'a',
    group_name: null,
    db_type: 'mysql',
    environment: null,
    host: 'h',
    port: 3306,
    database_name: null,
    schema_name: null,
    auth_type: 'password',
    username: 'root',
    password_ciphertext: 'CIPHER',
    ssl_mode: null,
    jdbc_url: null,
    driver_name: null,
    driver_class_name: null,
    ssh_tunnel_enabled: 0,
    ssh_tunnel_asset_uuid: null,
    options_json: null,
    tags_json: null,
    status: 'idle',
    last_connected_at: null,
    last_tested_at: null,
    last_error_code: null,
    last_error_message: null,
    sort_order: 0,
    deleted_at: null,
    created_at: 'x',
    updated_at: 'x',
    ...overrides
  }
}

function makeHarness(opts: {
  testResult?: ConnectionTestResult
  connectImpl?: (input: ResolvedDbCredential) => Promise<unknown>
  disconnectImpl?: (handle: unknown) => Promise<void>
  listDatabases?: () => Promise<string[]>
  listTables?: () => Promise<string[]>
}) {
  const statusCalls: Array<[string, Record<string, unknown>]> = []
  const statusUpdater = {
    updateDbAssetStatus: vi.fn((id: string, patch: Record<string, unknown>) => {
      statusCalls.push([id, patch])
    })
  }
  const decryptSecret = vi.fn(async (c: string) => (c === 'CIPHER' ? 'secret' : 'other'))
  const adapter: DatabaseDriverAdapter = {
    testConnection: vi.fn(async (_) => opts.testResult ?? { ok: true }),
    connect: vi.fn(opts.connectImpl ?? (async () => ({ handle: true }))),
    disconnect: vi.fn(opts.disconnectImpl ?? (async () => {})),
    listDatabases: opts.listDatabases ? vi.fn(opts.listDatabases) : undefined,
    listTables: opts.listTables ? vi.fn(opts.listTables) : undefined
  }
  const mgr = new ConnectionManager({
    adapters: { mysql: adapter, postgresql: adapter },
    credentialResolver: { decryptSecret },
    statusUpdater
  })
  return { mgr, statusUpdater, statusCalls, decryptSecret, adapter }
}

describe('ConnectionManager', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('testConnection returns ok and stamps idle status on success', async () => {
    const { mgr, statusCalls } = makeHarness({ testResult: { ok: true, serverVersion: '8.0' } })
    const asset = makeAsset()
    const result = await mgr.testConnection(asset)
    expect(result.ok).toBe(true)
    expect(result.serverVersion).toBe('8.0')
    const statuses = statusCalls.map(([, p]) => p.status)
    expect(statuses).toEqual(['testing', 'idle'])
  })

  it('testConnection stamps failed status and error fields on adapter failure', async () => {
    const { mgr, statusCalls } = makeHarness({
      testResult: { ok: false, errorCode: 'ER_ACCESS', errorMessage: 'bad creds' }
    })
    const result = await mgr.testConnection(makeAsset())
    expect(result.ok).toBe(false)
    const last = statusCalls[statusCalls.length - 1][1]
    expect(last.status).toBe('failed')
    expect(last.last_error_code).toBe('ER_ACCESS')
    expect(last.last_error_message).toBe('bad creds')
  })

  it('testConnection catches thrown adapter errors and marks failed', async () => {
    const { mgr, statusCalls } = makeHarness({})
    const asset = makeAsset()
    const boom: DatabaseDriverAdapter = {
      testConnection: async () => {
        throw Object.assign(new Error('boom'), { code: 'E_BOOM' })
      },
      connect: async () => ({}),
      disconnect: async () => {}
    }
    // Swap in a throwing adapter
    ;(mgr as unknown as { opts: { adapters: Record<string, DatabaseDriverAdapter> } }).opts.adapters.mysql = boom
    const result = await mgr.testConnection(asset)
    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('E_BOOM')
    const last = statusCalls[statusCalls.length - 1][1]
    expect(last.status).toBe('failed')
  })

  it('connect stores a session and marks connected', async () => {
    const { mgr, statusCalls, adapter } = makeHarness({})
    const asset = makeAsset()
    const session = await mgr.connect(asset)
    expect(session.assetId).toBe(asset.id)
    expect(session.dbType).toBe('mysql')
    expect(mgr.isConnected(asset.id)).toBe(true)
    expect(adapter.connect).toHaveBeenCalledTimes(1)
    expect(statusCalls[statusCalls.length - 1][1].status).toBe('connected')
  })

  it('connect is idempotent: second call returns the same session without reconnecting', async () => {
    const { mgr, adapter } = makeHarness({})
    const asset = makeAsset()
    const s1 = await mgr.connect(asset)
    const s2 = await mgr.connect(asset)
    expect(s2).toBe(s1)
    expect(adapter.connect).toHaveBeenCalledTimes(1)
  })

  it('disconnect clears the session and marks idle', async () => {
    const { mgr, adapter, statusCalls } = makeHarness({})
    const asset = makeAsset()
    await mgr.connect(asset)
    await mgr.disconnect(asset.id)
    expect(mgr.isConnected(asset.id)).toBe(false)
    expect(adapter.disconnect).toHaveBeenCalledTimes(1)
    expect(statusCalls[statusCalls.length - 1][1].status).toBe('idle')
  })

  it('disconnect on unknown asset is a no-op', async () => {
    const { mgr, adapter } = makeHarness({})
    await mgr.disconnect('nope')
    expect(adapter.disconnect).not.toHaveBeenCalled()
  })

  it('listDatabases throws when not connected', async () => {
    const { mgr } = makeHarness({})
    await expect(mgr.listDatabases('x')).rejects.toThrow(/not connected/)
  })

  it('listDatabases delegates to adapter when connected', async () => {
    const { mgr } = makeHarness({ listDatabases: async () => ['db1', 'db2'] })
    await mgr.connect(makeAsset())
    const dbs = await mgr.listDatabases('asset-1')
    expect(dbs).toEqual(['db1', 'db2'])
  })

  it('listTables delegates to adapter when connected', async () => {
    const { mgr } = makeHarness({ listTables: async () => ['t1', 't2'] })
    await mgr.connect(makeAsset())
    const tables = await mgr.listTables('asset-1', 'db1')
    expect(tables).toEqual(['t1', 't2'])
  })

  it('shutdown disconnects all active sessions', async () => {
    const { mgr, adapter } = makeHarness({})
    await mgr.connect(makeAsset({ id: 'a1' }))
    await mgr.connect(makeAsset({ id: 'a2' }))
    expect(mgr.isConnected('a1')).toBe(true)
    expect(mgr.isConnected('a2')).toBe(true)
    await mgr.shutdown()
    expect(mgr.isConnected('a1')).toBe(false)
    expect(mgr.isConnected('a2')).toBe(false)
    expect(adapter.disconnect).toHaveBeenCalledTimes(2)
  })

  it('uses the decrypted password when calling the adapter', async () => {
    const { mgr, adapter, decryptSecret } = makeHarness({})
    await mgr.testConnection(makeAsset())
    expect(decryptSecret).toHaveBeenCalledWith('CIPHER')
    const callArg = (adapter.testConnection as ReturnType<typeof vi.fn>).mock.calls[0][0] as ResolvedDbCredential
    expect(callArg.password).toBe('secret')
  })

  it('passes null password when asset has no ciphertext', async () => {
    const { mgr, adapter, decryptSecret } = makeHarness({})
    await mgr.testConnection(makeAsset({ password_ciphertext: null }))
    expect(decryptSecret).not.toHaveBeenCalled()
    const callArg = (adapter.testConnection as ReturnType<typeof vi.fn>).mock.calls[0][0] as ResolvedDbCredential
    expect(callArg.password).toBeNull()
  })
})

describe('ConnectionManager - detectPrimaryKey / executeMutations', () => {
  function makeTxHarness() {
    const statusUpdater = { updateDbAssetStatus: vi.fn() }
    const beginTransaction = vi.fn(async () => {})
    const commitTransaction = vi.fn(async () => {})
    const rollbackTransaction = vi.fn(async () => {})
    const executeQuery = vi.fn(async () => ({ columns: [], rows: [], rowCount: 1, durationMs: 0 }))
    const detectPrimaryKey = vi.fn(async () => ['id'])
    const adapter: DatabaseDriverAdapter = {
      testConnection: async () => ({ ok: true }),
      connect: async () => ({ fake: true }),
      disconnect: async () => {},
      executeQuery,
      beginTransaction,
      commitTransaction,
      rollbackTransaction,
      detectPrimaryKey
    }
    const mgr = new ConnectionManager({
      adapters: { mysql: adapter, postgresql: adapter },
      credentialResolver: { decryptSecret: async () => '' },
      statusUpdater
    })
    return { mgr, adapter, beginTransaction, commitTransaction, rollbackTransaction, executeQuery, detectPrimaryKey }
  }

  it('detectPrimaryKey throws when not connected', async () => {
    const { mgr } = makeTxHarness()
    await expect(mgr.detectPrimaryKey('missing', 'db', 't')).rejects.toThrow(/not connected/)
  })

  it('detectPrimaryKey delegates to adapter when session exists', async () => {
    const { mgr, detectPrimaryKey } = makeTxHarness()
    await mgr.connect(makeAsset())
    const pk = await mgr.detectPrimaryKey('asset-1', 'db', 'users')
    expect(pk).toEqual(['id'])
    expect(detectPrimaryKey).toHaveBeenCalledWith(expect.anything(), 'db', 'users')
  })

  it('executeMutations wraps statements in BEGIN/COMMIT and returns ok with affected counts', async () => {
    const { mgr, beginTransaction, commitTransaction, rollbackTransaction, executeQuery } = makeTxHarness()
    await mgr.connect(makeAsset())
    const statements = [
      { sql: 'UPDATE t SET v=? WHERE id=?', params: ['a', 1] },
      { sql: 'DELETE FROM t WHERE id=?', params: [2] }
    ]
    const res = await mgr.executeMutations('asset-1', statements)
    expect(res.ok).toBe(true)
    expect(res.affected).toEqual([1, 1])
    expect(beginTransaction).toHaveBeenCalledTimes(1)
    expect(commitTransaction).toHaveBeenCalledTimes(1)
    expect(rollbackTransaction).not.toHaveBeenCalled()
    expect(executeQuery).toHaveBeenCalledTimes(2)
  })

  it('executeMutations rolls back on first failure and returns ok=false', async () => {
    const { mgr, beginTransaction, commitTransaction, rollbackTransaction, executeQuery } = makeTxHarness()
    await mgr.connect(makeAsset())
    ;(executeQuery as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => ({
      columns: [],
      rows: [],
      rowCount: 1,
      durationMs: 0
    }))
    ;(executeQuery as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw new Error('constraint violation')
    })
    const statements = [
      { sql: 'UPDATE t SET v=? WHERE id=?', params: ['a', 1] },
      { sql: 'UPDATE t SET v=? WHERE id=?', params: ['b', 2] }
    ]
    const res = await mgr.executeMutations('asset-1', statements)
    expect(res.ok).toBe(false)
    expect(res.errorMessage).toContain('constraint violation')
    expect(beginTransaction).toHaveBeenCalledTimes(1)
    expect(commitTransaction).not.toHaveBeenCalled()
    expect(rollbackTransaction).toHaveBeenCalledTimes(1)
  })

  it('executeMutations returns ok=false when adapter lacks transaction support', async () => {
    const statusUpdater = { updateDbAssetStatus: vi.fn() }
    const noTxAdapter: DatabaseDriverAdapter = {
      testConnection: async () => ({ ok: true }),
      connect: async () => ({ fake: true }),
      disconnect: async () => {}
    }
    const mgr = new ConnectionManager({
      adapters: { mysql: noTxAdapter, postgresql: noTxAdapter },
      credentialResolver: { decryptSecret: async () => '' },
      statusUpdater
    })
    await mgr.connect(makeAsset())
    const res = await mgr.executeMutations('asset-1', [{ sql: 'UPDATE t SET v=1', params: [] }])
    expect(res.ok).toBe(false)
    expect(res.errorMessage).toMatch(/does not support mutations/)
  })
})
