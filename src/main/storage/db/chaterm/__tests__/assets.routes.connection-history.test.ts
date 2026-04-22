import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('better-sqlite3', () => ({
  default: class {}
}))

vi.mock('../../../../ssh/capabilityRegistry', () => ({
  capabilityRegistry: {
    listBastionDefinitions: vi.fn(() => [])
  }
}))

vi.mock('../../../../agent/core/storage/state', () => ({
  getUserConfig: vi.fn().mockResolvedValue({ language: 'zh-CN' })
}))

describe('recordConnectionLogic', () => {
  it('should insert connection record with all fields', async () => {
    const { recordConnectionLogic } = await import('../assets.routes')

    const runFn = vi.fn(() => ({ changes: 1 }))
    const cleanupRunFn = vi.fn(() => ({ changes: 0 }))

    const prepareMock = vi.fn((sql: string) => {
      if (sql.includes('INSERT INTO t_connection_history')) {
        return { run: runFn }
      }
      if (sql.includes('DELETE FROM t_connection_history')) {
        return { run: cleanupRunFn }
      }
      return { run: vi.fn(), all: vi.fn(() => []) }
    })

    const mockDb = { prepare: prepareMock } as any

    recordConnectionLogic(mockDb, {
      assetUuid: 'uuid-123',
      assetIp: '192.168.1.1',
      assetLabel: 'test-host',
      assetPort: 22,
      assetUsername: 'root',
      assetType: 'person',
      organizationId: 'personal'
    })

    expect(runFn).toHaveBeenCalledWith('uuid-123', '192.168.1.1', 'test-host', 22, 'root', 'person', 'personal')
    // Cleanup should also be called
    expect(cleanupRunFn).toHaveBeenCalled()
  })

  it('should use default values for optional fields', async () => {
    const { recordConnectionLogic } = await import('../assets.routes')

    const runFn = vi.fn(() => ({ changes: 1 }))

    const prepareMock = vi.fn((sql: string) => {
      if (sql.includes('INSERT INTO t_connection_history')) {
        return { run: runFn }
      }
      if (sql.includes('DELETE FROM t_connection_history')) {
        return { run: vi.fn(() => ({ changes: 0 })) }
      }
      return { run: vi.fn(), all: vi.fn(() => []) }
    })

    const mockDb = { prepare: prepareMock } as any

    recordConnectionLogic(mockDb, {
      assetUuid: 'uuid-456',
      assetIp: '10.0.0.1',
      assetType: 'organization'
    })

    // assetLabel -> null, assetPort -> 22, assetUsername -> null, organizationId -> 'personal'
    expect(runFn).toHaveBeenCalledWith('uuid-456', '10.0.0.1', null, 22, null, 'organization', 'personal')
  })

  it('should not throw when database error occurs', async () => {
    const { recordConnectionLogic } = await import('../assets.routes')

    const prepareMock = vi.fn(() => {
      throw new Error('DB error')
    })

    const mockDb = { prepare: prepareMock } as any

    // Should not throw - errors are caught internally
    expect(() =>
      recordConnectionLogic(mockDb, {
        assetUuid: 'uuid-789',
        assetIp: '10.0.0.1',
        assetType: 'person'
      })
    ).not.toThrow()
  })

  it('should run cleanup after insert', async () => {
    const { recordConnectionLogic } = await import('../assets.routes')

    const callOrder: string[] = []
    const prepareMock = vi.fn((sql: string) => {
      if (sql.includes('INSERT INTO t_connection_history')) {
        return {
          run: vi.fn(() => {
            callOrder.push('insert')
            return { changes: 1 }
          })
        }
      }
      if (sql.includes('DELETE FROM t_connection_history')) {
        return {
          run: vi.fn(() => {
            callOrder.push('cleanup')
            return { changes: 0 }
          })
        }
      }
      return { run: vi.fn(), all: vi.fn(() => []) }
    })

    const mockDb = { prepare: prepareMock } as any

    recordConnectionLogic(mockDb, {
      assetUuid: 'uuid-abc',
      assetIp: '10.0.0.1',
      assetType: 'person'
    })

    expect(callOrder).toEqual(['insert', 'cleanup'])
  })
})

describe('getLocalAssetRouteLogic - recent connections', () => {
  let prepareMock: ReturnType<typeof vi.fn>

  const recentConnectionRow = {
    asset_uuid: 'recent-uuid',
    asset_ip: '10.0.0.5',
    asset_label: 'recent-host',
    asset_port: 22,
    asset_username: 'admin',
    asset_type: 'person',
    organization_id: 'personal',
    last_connected: '2026-04-20 10:00:00'
  }

  beforeEach(() => {
    prepareMock = vi.fn((sql: string) => {
      // Migration checks
      if (sql.includes('PRAGMA table_info')) {
        return { all: () => [{ name: 'comment' }] }
      }
      if (sql.includes('SELECT name FROM sqlite_master') && sql.includes('t_custom_folders')) {
        return { get: () => ({ name: 't_custom_folders' }) }
      }
      if (sql.includes('SELECT name FROM sqlite_master') && sql.includes('t_asset_folder_mapping')) {
        return { get: () => ({ name: 't_asset_folder_mapping' }) }
      }
      // Recent connections query
      if (sql.includes('t_connection_history') && sql.includes("organization_id = 'personal'")) {
        return { all: () => [recentConnectionRow] }
      }
      if (sql.includes('t_connection_history') && sql.includes("organization_id != 'personal'")) {
        return { all: () => [] }
      }
      // Favorites
      if (sql.includes('favorite = 1')) {
        return { all: () => [] }
      }
      // Groups
      if (sql.includes('SELECT DISTINCT group_name')) {
        return { all: () => [] }
      }
      return { all: () => [], get: () => undefined, run: () => ({ changes: 0 }) }
    })
  })

  it('should include recent connections node before favorites for personal workspace', async () => {
    const { getLocalAssetRouteLogic } = await import('../assets.routes')
    const mockDb = { prepare: prepareMock } as any

    const result = await getLocalAssetRouteLogic(mockDb, 'tree', ['person'])

    expect(result.code).toBe(200)

    const recentRouter = result.data.routers.find((r: any) => r.key === 'recent_connections')
    expect(recentRouter).toBeDefined()
    expect(recentRouter.asset_type).toBe('recent_connections')
    expect(recentRouter.children).toHaveLength(1)

    const child = recentRouter.children[0]
    expect(child.title).toBe('recent-host')
    expect(child.ip).toBe('10.0.0.5')
    expect(child.uuid).toBe('recent-uuid')
    expect(child.port).toBe(22)
    expect(child.username).toBe('admin')
    expect(child.asset_type).toBe('person')
    expect(child.organizationId).toBe('personal')
  })

  it('should place recent connections before favorites', async () => {
    // Override prepareMock to also return favorites
    prepareMock = vi.fn((sql: string) => {
      if (sql.includes('PRAGMA table_info')) {
        return { all: () => [{ name: 'comment' }] }
      }
      if (sql.includes('SELECT name FROM sqlite_master') && sql.includes('t_custom_folders')) {
        return { get: () => ({ name: 't_custom_folders' }) }
      }
      if (sql.includes('SELECT name FROM sqlite_master') && sql.includes('t_asset_folder_mapping')) {
        return { get: () => ({ name: 't_asset_folder_mapping' }) }
      }
      if (sql.includes('t_connection_history') && sql.includes("organization_id = 'personal'")) {
        return { all: () => [recentConnectionRow] }
      }
      if (sql.includes('favorite = 1')) {
        return {
          all: () => [
            {
              label: 'fav-host',
              asset_ip: '192.168.1.1',
              uuid: 'fav-uuid',
              group_name: 'default',
              auth_type: 'password',
              port: 22,
              username: 'root',
              password: '',
              key_chain_id: 0,
              asset_type: 'person'
            }
          ]
        }
      }
      if (sql.includes('SELECT DISTINCT group_name')) {
        return { all: () => [] }
      }
      return { all: () => [], get: () => undefined, run: () => ({ changes: 0 }) }
    })

    const { getLocalAssetRouteLogic } = await import('../assets.routes')
    const mockDb = { prepare: prepareMock } as any

    const result = await getLocalAssetRouteLogic(mockDb, 'tree', ['person'])

    // Recent connections should be first, favorites second
    expect(result.data.routers.length).toBeGreaterThanOrEqual(2)
    expect(result.data.routers[0].key).toBe('recent_connections')
    expect(result.data.routers[1].key).toBe('favorite')
  })

  it('should not include recent connections when history is empty', async () => {
    const emptyPrepareMock = vi.fn((sql: string) => {
      if (sql.includes('PRAGMA table_info')) {
        return { all: () => [{ name: 'comment' }] }
      }
      if (sql.includes('SELECT name FROM sqlite_master') && sql.includes('t_custom_folders')) {
        return { get: () => ({ name: 't_custom_folders' }) }
      }
      if (sql.includes('SELECT name FROM sqlite_master') && sql.includes('t_asset_folder_mapping')) {
        return { get: () => ({ name: 't_asset_folder_mapping' }) }
      }
      if (sql.includes('t_connection_history')) {
        return { all: () => [] }
      }
      if (sql.includes('favorite = 1')) {
        return { all: () => [] }
      }
      if (sql.includes('SELECT DISTINCT group_name')) {
        return { all: () => [] }
      }
      return { all: () => [], get: () => undefined, run: () => ({ changes: 0 }) }
    })

    const { getLocalAssetRouteLogic } = await import('../assets.routes')
    const mockDb = { prepare: emptyPrepareMock } as any

    const result = await getLocalAssetRouteLogic(mockDb, 'tree', ['person'])

    const recentRouter = result.data.routers.find((r: any) => r.key === 'recent_connections')
    expect(recentRouter).toBeUndefined()
  })

  it('should not include recent connections for assetConfig search type', async () => {
    const { getLocalAssetRouteLogic } = await import('../assets.routes')
    const mockDb = { prepare: prepareMock } as any

    const result = await getLocalAssetRouteLogic(mockDb, 'assetConfig', ['person'])

    const recentRouter = result.data.routers.find((r: any) => r.key === 'recent_connections')
    expect(recentRouter).toBeUndefined()
  })

  it('should use zh-CN translation for recent connections title', async () => {
    const { getLocalAssetRouteLogic } = await import('../assets.routes')
    const mockDb = { prepare: prepareMock } as any

    const result = await getLocalAssetRouteLogic(mockDb, 'tree', ['person'])

    const recentRouter = result.data.routers.find((r: any) => r.key === 'recent_connections')
    expect(recentRouter).toBeDefined()
    expect(recentRouter.title).toBe('最近连接')
  })

  it('should use asset_ip as fallback title when asset_label is missing', async () => {
    const noLabelPrepareMock = vi.fn((sql: string) => {
      if (sql.includes('PRAGMA table_info')) {
        return { all: () => [{ name: 'comment' }] }
      }
      if (sql.includes('SELECT name FROM sqlite_master') && sql.includes('t_custom_folders')) {
        return { get: () => ({ name: 't_custom_folders' }) }
      }
      if (sql.includes('SELECT name FROM sqlite_master') && sql.includes('t_asset_folder_mapping')) {
        return { get: () => ({ name: 't_asset_folder_mapping' }) }
      }
      if (sql.includes('t_connection_history') && sql.includes("organization_id = 'personal'")) {
        return {
          all: () => [
            {
              asset_uuid: 'uuid-no-label',
              asset_ip: '172.16.0.1',
              asset_label: null,
              asset_port: 2222,
              asset_username: null,
              asset_type: 'person',
              organization_id: 'personal',
              last_connected: '2026-04-20 10:00:00'
            }
          ]
        }
      }
      if (sql.includes('favorite = 1')) {
        return { all: () => [] }
      }
      if (sql.includes('SELECT DISTINCT group_name')) {
        return { all: () => [] }
      }
      return { all: () => [], get: () => undefined, run: () => ({ changes: 0 }) }
    })

    const { getLocalAssetRouteLogic } = await import('../assets.routes')
    const mockDb = { prepare: noLabelPrepareMock } as any

    const result = await getLocalAssetRouteLogic(mockDb, 'tree', ['person'])

    const recentRouter = result.data.routers.find((r: any) => r.key === 'recent_connections')
    expect(recentRouter).toBeDefined()
    const child = recentRouter.children[0]
    expect(child.title).toBe('172.16.0.1')
    expect(child.port).toBe(2222)
    expect(child.username).toBe('')
  })

  it('should gracefully handle t_connection_history table not existing', async () => {
    const errorPrepareMock = vi.fn((sql: string) => {
      if (sql.includes('PRAGMA table_info')) {
        return { all: () => [{ name: 'comment' }] }
      }
      if (sql.includes('SELECT name FROM sqlite_master') && sql.includes('t_custom_folders')) {
        return { get: () => ({ name: 't_custom_folders' }) }
      }
      if (sql.includes('SELECT name FROM sqlite_master') && sql.includes('t_asset_folder_mapping')) {
        return { get: () => ({ name: 't_asset_folder_mapping' }) }
      }
      if (sql.includes('t_connection_history')) {
        throw new Error('no such table: t_connection_history')
      }
      if (sql.includes('favorite = 1')) {
        return { all: () => [] }
      }
      if (sql.includes('SELECT DISTINCT group_name')) {
        return { all: () => [] }
      }
      return { all: () => [], get: () => undefined, run: () => ({ changes: 0 }) }
    })

    const { getLocalAssetRouteLogic } = await import('../assets.routes')
    const mockDb = { prepare: errorPrepareMock } as any

    // Should not throw - the error is caught silently
    const result = await getLocalAssetRouteLogic(mockDb, 'tree', ['person'])
    expect(result.code).toBe(200)

    const recentRouter = result.data.routers.find((r: any) => r.key === 'recent_connections')
    expect(recentRouter).toBeUndefined()
  })
})
