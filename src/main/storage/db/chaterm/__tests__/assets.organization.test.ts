import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { createRequire, Module } from 'module'

vi.mock('better-sqlite3', () => ({
  default: class MockBetterSqlite3 {}
}))

const require = createRequire(import.meta.url)
const electronPath = require.resolve('electron')
const mockElectronModule = new Module(electronPath)
mockElectronModule.filename = electronPath
mockElectronModule.loaded = true
mockElectronModule.exports = {
  app: { getAppPath: () => '/tmp' },
  ipcMain: { handle: vi.fn(), on: vi.fn(), once: vi.fn(), removeAllListeners: vi.fn() }
}
require.cache[electronPath] = mockElectronModule

vi.mock('electron', () => ({
  app: { getAppPath: () => '/tmp' },
  ipcMain: { handle: vi.fn(), on: vi.fn(), once: vi.fn(), removeAllListeners: vi.fn() }
}))

let jumpServerAssets: Array<{ name: string; address: string; description?: string }> = []
vi.mock('../../../../ssh/jumpserver/asset', () => ({
  default: class JumpServerClientMock {
    async getAllAssets() {
      return jumpServerAssets
    }
    close() {
      return undefined
    }
  }
}))

const { getBastion } = vi.hoisted(() => ({
  getBastion: vi.fn()
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-1234')
}))

let refreshOrganizationAssetsLogic: typeof import('../assets.organization').refreshOrganizationAssetsLogic
let capabilityRegistry: typeof import('../../../../ssh/capabilityRegistry').capabilityRegistry

type Statement<T = unknown> = {
  run: (...args: unknown[]) => { changes: number }
  get: (...args: unknown[]) => T
  all: (...args: unknown[]) => T[]
}

type MockDb = {
  prepare: (sql: string) => Statement
}

type OrgAssetRow = {
  host: string
  hostname?: string
  uuid?: string
  favorite?: number
}

type Capture = {
  insertArgs?: unknown[]
  updateArgs?: unknown[]
}

const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase()

const noopRun = () => ({ changes: 0 })
const noopGet = <T>() => undefined as unknown as T
const noopAll = <T>() => [] as T[]

const createStatement = <T>(overrides: Partial<Statement<T>>): Statement<T> => ({
  run: overrides.run ?? noopRun,
  get: overrides.get ?? noopGet<T>,
  all: overrides.all ?? noopAll<T>
})

function createMockDb(options: { assetType: string; existingAssets?: OrgAssetRow[]; capture: Capture }): MockDb {
  const { assetType, existingAssets = [], capture } = options

  return {
    prepare(sql: string): Statement {
      const normalized = normalizeSql(sql)

      if (normalized.includes('select asset_type from t_assets')) {
        return createStatement({ get: () => ({ asset_type: assetType }) })
      }

      if (normalized.includes('select host, hostname, uuid, favorite from t_organization_assets')) {
        return createStatement({ all: () => existingAssets })
      }

      if (normalized.includes('update t_organization_assets')) {
        return createStatement({
          run: (...args: unknown[]) => {
            capture.updateArgs = args
            return { changes: 1 }
          }
        })
      }

      if (normalized.includes('insert into t_organization_assets')) {
        return createStatement({
          run: (...args: unknown[]) => {
            capture.insertArgs = args
            return { changes: 1 }
          }
        })
      }

      return createStatement({ run: () => ({ changes: 1 }) })
    }
  }
}

describe('refreshOrganizationAssetsLogic', () => {
  beforeAll(async () => {
    vi.resetModules()
    const registryModule = await import('../../../../ssh/capabilityRegistry')
    capabilityRegistry = registryModule.capabilityRegistry
    capabilityRegistry.getBastion = getBastion as typeof capabilityRegistry.getBastion
    ;({ refreshOrganizationAssetsLogic } = await import('../assets.organization'))
  })

  beforeEach(() => {
    vi.clearAllMocks()
    capabilityRegistry.getBastion = getBastion as typeof capabilityRegistry.getBastion
    jumpServerAssets = []
  })

  it('updates jump_server_type to qizhi for existing qizhi assets', async () => {
    const TEST_HOST = '47.83.117.241'
    const TEST_NAME = 'node-1'

    getBastion.mockReturnValue({
      refreshAssets: vi.fn(async () => ({
        success: true,
        assets: [{ hostname: TEST_NAME, host: TEST_HOST, name: TEST_NAME, address: TEST_HOST }]
      }))
    })

    const capture: Capture = {}
    const db = createMockDb({
      assetType: 'organization-qizhi',
      existingAssets: [
        {
          host: TEST_HOST,
          hostname: TEST_NAME,
          uuid: 'asset-1',
          favorite: 0
        }
      ],
      capture
    })

    await refreshOrganizationAssetsLogic(db as any, 'org-1', {
      host: '127.0.0.1',
      port: 22,
      username: 'admin',
      password: 'secret'
    })

    expect(capture.updateArgs).toBeDefined()
    expect(capture.updateArgs?.[2]).toBe('qizhi')
  })

  it('persists plugin asset comment for update and insert', async () => {
    const comment1 = 'ext-asset-1(10.30.5.14:22|Linux_10.30.5.14)'
    const comment2 = 'ext-asset-2(10.30.5.15:22|Linux_10.30.5.15)'

    getBastion.mockReturnValue({
      refreshAssets: vi.fn(async () => ({
        success: true,
        assets: [
          { hostname: 'Linux_10.30.5.14', host: '10.30.5.14', comment: comment1 },
          { hostname: 'Linux_10.30.5.15', host: '10.30.5.15', comment: comment2 }
        ]
      }))
    })

    const capture: Capture = {}
    const db = createMockDb({
      assetType: 'organization-tencent',
      existingAssets: [
        {
          host: '10.30.5.14',
          hostname: 'Linux_10.30.5.14',
          uuid: 'asset-1',
          favorite: 0
        }
      ],
      capture
    })

    await refreshOrganizationAssetsLogic(db as any, 'org-1', {
      host: '127.0.0.1',
      port: 22,
      username: 'admin',
      password: 'secret'
    })

    expect(capture.updateArgs).toBeDefined()
    expect(capture.insertArgs).toBeDefined()
    expect(capture.updateArgs).toContain(comment1)
    expect(capture.insertArgs).toContain(comment2)
  })

  it('persists jumpserver asset comment for update and insert', async () => {
    jumpServerAssets = [
      { name: 'Linux_10.30.5.14', address: '10.30.5.14', description: 'comment-1' },
      { name: 'Linux_10.30.5.15', address: '10.30.5.15', description: 'comment-2' }
    ]

    const capture: Capture = {}
    const db = createMockDb({
      assetType: 'organization',
      existingAssets: [
        {
          host: '10.30.5.14',
          hostname: 'Linux_10.30.5.14',
          uuid: 'asset-1',
          favorite: 0
        }
      ],
      capture
    })

    await refreshOrganizationAssetsLogic(db as any, 'org-1', {
      host: '127.0.0.1',
      port: 22,
      username: 'admin',
      password: 'secret'
    })

    expect(capture.updateArgs).toBeDefined()
    expect(capture.insertArgs).toBeDefined()
    expect(capture.updateArgs).toContain('comment-1')
    expect(capture.insertArgs).toContain('comment-2')
  })
})
