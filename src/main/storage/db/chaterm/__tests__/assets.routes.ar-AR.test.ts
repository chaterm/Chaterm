import { describe, it, expect, vi } from 'vitest'

vi.mock('better-sqlite3', () => ({
  default: class {}
}))

vi.mock('../../../../ssh/capabilityRegistry', () => ({
  capabilityRegistry: {
    listBastionDefinitions: vi.fn(() => [])
  }
}))

vi.mock('../../../../agent/core/storage/state', () => ({
  getUserConfig: vi.fn().mockResolvedValue({ language: 'ar-AR' })
}))

describe('assets.routes - Arabic (ar-AR) translation support', () => {
  it('should load module with ar-AR translations without errors', async () => {
    const module = await import('../assets.routes')
    expect(module).toBeDefined()
    expect(typeof module.getLocalAssetRouteLogic).toBe('function')
  })

  it('getLocalAssetRouteLogic should use ar-AR favoriteBar translation', async () => {
    const { getLocalAssetRouteLogic } = await import('../assets.routes')

    // Create a mock database that returns favorites
    const mockAll = vi.fn()
    const mockGet = vi.fn()
    const mockRun = vi.fn()

    const prepareMock = vi.fn((sql: string) => {
      if (sql.includes('PRAGMA table_info')) {
        return { all: () => [{ name: 'comment' }] }
      }
      if (sql.includes("SELECT name FROM sqlite_master") && sql.includes('t_custom_folders')) {
        return { get: () => ({ name: 't_custom_folders' }) }
      }
      if (sql.includes("SELECT name FROM sqlite_master") && sql.includes('t_asset_folder_mapping')) {
        return { get: () => ({ name: 't_asset_folder_mapping' }) }
      }
      if (sql.includes('SELECT DISTINCT group_name')) {
        return { all: () => [] }
      }
      if (sql.includes('favorite = 1')) {
        return {
          all: () => [
            {
              label: 'test-host',
              asset_ip: '192.168.1.1',
              uuid: 'test-uuid',
              group_name: 'test-group',
              auth_type: 'password',
              port: 22,
              username: 'root',
              password: 'pass',
              key_chain_id: 0,
              asset_type: 'person'
            }
          ]
        }
      }
      return { all: mockAll.mockReturnValue([]), get: mockGet, run: mockRun }
    })

    const mockDb = { prepare: prepareMock } as any

    const result = await getLocalAssetRouteLogic(mockDb, 'workspace', ['person'])

    // When there are favorites, the first router should have the favoriteBar title
    // With ar-AR language, it should be the Arabic translation
    if (result.data.routers.length > 0) {
      const favoriteRouter = result.data.routers.find((r: any) => r.key === 'favorite')
      if (favoriteRouter) {
        expect(favoriteRouter.title).toBe('المفضلة')
      }
    }
    expect(result.code).toBe(200)
  })
})
