import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi, MockInstance } from 'vitest'

// Mock better-sqlite3 native dependency
vi.mock('better-sqlite3', () => ({
  default: class MockBetterSqlite3 {}
}))

// Mock uuid to ensure deterministic UUID
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-1234')
}))

// Mock SyncController to avoid triggering real incremental sync
vi.mock('../../../data_sync/core/SyncController', () => ({
  SyncController: {
    triggerIncrementalSync: vi.fn()
  }
}))

import {
  createAssetLogic,
  updateAssetLogic,
  deleteAssetLogic,
  getAssetGroupLogic,
  updateLocalAssetLabelLogic,
  updateLocalAsseFavoriteLogic,
  createOrUpdateAssetLogic
} from '../assets.mutations'

type Asset = {
  uuid: string
  label?: string
  asset_ip: string
  auth_type?: string
  port?: number
  username?: string
  password?: string
  key_chain_id?: string | number | null
  group_name?: string | null
  favorite?: number
  asset_type?: string
  need_proxy?: number
  proxy_name?: string
  created_at?: string
  updated_at?: string
  version?: number
}

type OrganizationAsset = {
  uuid: string
  organization_uuid: string
  hostname?: string
  host: string
  created_at?: string
  updated_at?: string
}

type Statement<T = unknown> = {
  run: (...args: unknown[]) => { changes: number }
  get: (...args: unknown[]) => T
  all: (...args: unknown[]) => T[]
}

type MockDb = {
  prepare: (sql: string) => Statement
  close: () => void
  _data: {
    assets: Asset[]
    orgAssets: OrganizationAsset[]
  }
}

const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase()

const extractInsertColumns = (sql: string): string[] => {
  const match = sql.match(/insert\s+into\s+t_assets\s*\(([^)]+)\)/i)
  if (!match) return []
  return match[1].split(',').map((col) => col.trim())
}

const noopRun = () => ({ changes: 0 })
const noopGet = <T>() => undefined as unknown as T
const noopAll = <T>() => [] as T[]
const createStatement = <T>(overrides: Partial<Statement<T>>): Statement<T> => ({
  run: overrides.run ?? noopRun,
  get: overrides.get ?? noopGet<T>,
  all: overrides.all ?? noopAll<T>
})

function createMockDb(): MockDb {
  const assets: Asset[] = []
  const orgAssets: OrganizationAsset[] = []

  const findAsset = (uuid: string) => assets.find((item) => item.uuid === uuid)

  return {
    prepare(sql: string): Statement {
      const normalized = normalizeSql(sql)

      // Duplicate asset detection
      if (normalized.startsWith('select uuid, label, created_at from t_assets where asset_ip')) {
        return createStatement({
          get(...args: unknown[]) {
            const [asset_ip, username, port, label, asset_type] = args as [string, string, number, string, string]
            const asset = assets.find(
              (item) =>
                item.asset_ip === asset_ip &&
                item.username === username &&
                item.port === port &&
                item.label === label &&
                (item.asset_type || 'person') === asset_type
            )
            if (!asset) return undefined
            return { uuid: asset.uuid, label: asset.label, created_at: asset.created_at }
          }
        })
      }

      // Insert asset with flexible column order
      if (normalized.startsWith('insert into t_assets')) {
        const columns = extractInsertColumns(sql)
        return createStatement({
          run: (...params: unknown[]) => {
            const asset: Asset = {
              uuid: '',
              asset_ip: ''
            }
            columns.forEach((col, index) => {
              const key = col as keyof Asset
              const assetRecord = asset as Record<string, unknown>
              assetRecord[key] = params[index] as Asset[keyof Asset]
            })
            asset.favorite = asset.favorite ?? 2
            asset.asset_type = asset.asset_type ?? 'person'
            asset.version = asset.version ?? 1
            asset.need_proxy = asset.need_proxy ?? 0
            asset.created_at = asset.created_at ?? new Date().toISOString()
            asset.updated_at = asset.updated_at ?? asset.created_at
            assets.push(asset)
            return { changes: 1 }
          }
        })
      }

      // Update asset on duplicate (createOrUpdate branch)
      if (normalized.startsWith('update t_assets set label = ?') && normalized.includes('version = version + 1')) {
        return createStatement({
          run(...args: unknown[]) {
            const [label, auth_type, password, key_chain_id, group_name, asset_type, need_proxy, proxy_name, updated_at, uuid] = args as [
              string,
              string | undefined,
              string | undefined,
              string | number | null | undefined,
              string | null | undefined,
              string | undefined,
              number | undefined,
              string | undefined,
              string | undefined,
              string
            ]
            const asset = findAsset(uuid)
            if (!asset) return { changes: 0 }
            Object.assign(asset, {
              label,
              auth_type,
              password,
              key_chain_id,
              group_name,
              asset_type,
              need_proxy,
              proxy_name,
              updated_at,
              version: (asset.version ?? 1) + 1
            })
            return { changes: 1 }
          }
        })
      }

      // Full asset update
      if (normalized.startsWith('update t_assets set label = ?, asset_ip')) {
        return createStatement({
          run(...args: unknown[]) {
            const [label, asset_ip, auth_type, port, username, password, key_chain_id, group_name, need_proxy, proxy_name, updated_at, uuid] =
              args as [
                string | undefined,
                string,
                string | undefined,
                number | undefined,
                string | undefined,
                string | undefined,
                string | number | null | undefined,
                string | null | undefined,
                number | undefined,
                string | undefined,
                string | undefined,
                string
              ]
            const asset = findAsset(uuid)
            if (!asset) return { changes: 0 }
            Object.assign(asset, {
              label,
              asset_ip,
              auth_type,
              port,
              username,
              password,
              key_chain_id,
              group_name,
              need_proxy,
              proxy_name,
              updated_at
            })
            return { changes: 1 }
          }
        })
      }

      // Update label
      if (normalized.startsWith('update t_assets set label = ?') && normalized.includes('updated_at') && !normalized.includes('asset_ip')) {
        return createStatement({
          run(...args: unknown[]) {
            const [label, updated_at, uuid] = args as [string, string, string]
            const asset = findAsset(uuid)
            if (!asset) return { changes: 0 }
            asset.label = label
            asset.updated_at = updated_at
            return { changes: 1 }
          }
        })
      }

      // Update favorite flag
      if (normalized.startsWith('update t_assets set favorite')) {
        return createStatement({
          run(...args: unknown[]) {
            const [favorite, updated_at, uuid] = args as [number, string, string]
            const asset = findAsset(uuid)
            if (!asset) return { changes: 0 }
            asset.favorite = favorite
            asset.updated_at = updated_at
            return { changes: 1 }
          }
        })
      }

      // Delete organization assets
      if (normalized.startsWith('delete from t_organization_assets')) {
        return createStatement({
          run(...args: unknown[]) {
            const [organization_uuid] = args as [string]
            const before = orgAssets.length
            for (let i = orgAssets.length - 1; i >= 0; i--) {
              if (orgAssets[i].organization_uuid === organization_uuid) {
                orgAssets.splice(i, 1)
              }
            }
            return { changes: before - orgAssets.length }
          }
        })
      }

      // Delete asset
      if (normalized.startsWith('delete from t_assets')) {
        return createStatement({
          run(...args: unknown[]) {
            const [uuid] = args as [string]
            const index = assets.findIndex((item) => item.uuid === uuid)
            if (index === -1) return { changes: 0 }
            assets.splice(index, 1)
            return { changes: 1 }
          }
        })
      }

      // Query asset type
      if (normalized.startsWith('select asset_type from t_assets where uuid = ?')) {
        return createStatement<{ asset_type: string } | undefined>({
          get(...args: unknown[]) {
            const [uuid] = args as [string]
            const asset = findAsset(uuid)
            return asset ? { asset_type: asset.asset_type ?? 'person' } : undefined
          }
        })
      }

      // Query distinct groups
      if (normalized.startsWith('select distinct group_name from t_assets')) {
        return createStatement({
          all() {
            const groups = Array.from(
              new Set(assets.filter((item) => item.group_name !== null && item.group_name !== undefined).map((item) => item.group_name as string))
            ).sort()
            return groups.map((group_name) => ({ group_name }))
          }
        })
      }

      // Query organization assets
      if (normalized.startsWith('select * from t_organization_assets where organization_uuid = ?')) {
        return createStatement({
          all(...args: unknown[]) {
            const [organization_uuid] = args as [string]
            return orgAssets.filter((item) => item.organization_uuid === organization_uuid)
          }
        })
      }

      // Query asset by UUID (generic)
      if (normalized.includes('from t_assets') && normalized.includes('where uuid = ?')) {
        return createStatement({
          get(...args: unknown[]) {
            const [uuid] = args as [string]
            return findAsset(uuid)
          },
          all(...args: unknown[]) {
            const [uuid] = args as [string]
            const asset = findAsset(uuid)
            return asset ? [asset] : []
          }
        })
      }

      // Insert organization asset
      if (normalized.startsWith('insert into t_organization_assets')) {
        const columns = (sql.match(/insert\s+into\s+t_organization_assets\s*\(([^)]+)\)/i)?.[1] || '').split(',').map((c) => c.trim())
        return createStatement({
          run: (...params: unknown[]) => {
            const record: OrganizationAsset = { uuid: '', organization_uuid: '', host: '' }
            columns.forEach((col, idx) => {
              const target = record as Record<string, unknown>
              target[col] = params[idx] as OrganizationAsset[keyof OrganizationAsset]
            })
            orgAssets.push(record)
            return { changes: 1 }
          }
        })
      }

      return createStatement({})
    },
    close() {
      // no-op for mock
    },
    _data: { assets, orgAssets }
  }
}

describe('Assets Mutations', () => {
  let db: MockDb
  let setImmediateSpy: MockInstance
  let consoleErrorSpy: MockInstance

  beforeAll(() => {
    setImmediateSpy = vi.spyOn(global, 'setImmediate').mockImplementation(() => {
      // Skip async incremental sync to avoid real dependency
      return 1 as unknown as NodeJS.Immediate
    })
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterAll(() => {
    setImmediateSpy?.mockRestore()
    consoleErrorSpy?.mockRestore()
  })

  beforeEach(() => {
    db = createMockDb()
  })

  afterEach(() => {
    db.close()
  })

  describe('createAssetLogic', () => {
    it('should create a new asset successfully', () => {
      const params = {
        ip: '192.168.1.100',
        label: 'Test Server',
        auth_type: 'password',
        port: 22,
        username: 'root',
        password: 'secret',
        keyChain: null,
        group_name: 'Production',
        asset_type: 'person',
        needProxy: false,
        proxyName: ''
      }

      const result = createAssetLogic(db, params)

      expect(result.data.message).toBe('success')
      expect(result.data.uuid).toBe('test-uuid-1234')

      // Verify record in mock DB
      const record = db.prepare('SELECT * FROM t_assets WHERE uuid = ?').get('test-uuid-1234') as Asset | undefined
      expect(record).toBeDefined()
      if (!record) {
        throw new Error('record not found')
      }
      expect(record.label).toBe('Test Server')
      expect(record.asset_ip).toBe('192.168.1.100')
      expect(record.username).toBe('root')
    })

    it('should detect duplicate asset and return duplicate', () => {
      const params = {
        ip: '192.168.1.100',
        label: 'Test Server',
        auth_type: 'password',
        port: 22,
        username: 'root',
        password: 'secret',
        asset_type: 'person'
      }

      // Create an asset first
      // Create an asset first
      createAssetLogic(db, params)

      // Try creating the same asset again
      const result = createAssetLogic(db, params)

      expect(result.data.message).toBe('duplicate')
      expect(result.data.uuid).toBe('test-uuid-1234')
    })

    it('should throw when params are null', () => {
      expect(() => createAssetLogic(db, null)).toThrow('No asset data provided')
    })
  })

  describe('updateAssetLogic', () => {
    it('should update asset successfully', () => {
      // Create an asset first
      db.prepare(
        `
        INSERT INTO t_assets (uuid, label, asset_ip, auth_type, port, username, password, group_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        'existing-uuid',
        'Old Label',
        '192.168.1.1',
        'password',
        22,
        'root',
        'old_pass',
        'Dev',
        new Date().toISOString(),
        new Date().toISOString()
      )

      const updateParams = {
        uuid: 'existing-uuid',
        ip: '192.168.1.100',
        label: 'Updated Server',
        auth_type: 'keyBased',
        port: 2222,
        username: 'admin',
        password: 'new_pass',
        keyChain: 1,
        group_name: 'Production',
        needProxy: true,
        proxyName: 'my-proxy'
      }

      const result = updateAssetLogic(db, updateParams)

      expect(result.data.message).toBe('success')

      // Verify updated data
      const record = db.prepare('SELECT * FROM t_assets WHERE uuid = ?').get('existing-uuid') as Asset | undefined
      expect(record).toBeDefined()
      if (!record) {
        throw new Error('record not found')
      }
      expect(record.label).toBe('Updated Server')
      expect(record.asset_ip).toBe('192.168.1.100')
      expect(record.port).toBe(2222)
      expect(record.need_proxy).toBe(1)
    })

    it('should return failed when UUID does not exist', () => {
      const result = updateAssetLogic(db, {
        uuid: 'non-existent-uuid',
        ip: '192.168.1.1',
        label: 'Test'
      })

      expect(result.data.message).toBe('failed')
    })

    it('should throw when UUID is missing', () => {
      expect(() => updateAssetLogic(db, { ip: '192.168.1.1' })).toThrow('No asset data or UUID provided')
    })
  })

  describe('deleteAssetLogic', () => {
    it('should delete personal asset successfully', () => {
      db.prepare(
        `
        INSERT INTO t_assets (uuid, label, asset_ip, asset_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run('to-delete-uuid', 'To Delete', '192.168.1.1', 'person', new Date().toISOString(), new Date().toISOString())

      const result = deleteAssetLogic(db, 'to-delete-uuid')

      expect(result.data.message).toBe('success')

      // Verify record removed
      const record = db.prepare('SELECT * FROM t_assets WHERE uuid = ?').get('to-delete-uuid')
      expect(record).toBeUndefined()
    })

    it('should cascade delete related organization assets', () => {
      // Create organization-type asset
      db.prepare(
        `
        INSERT INTO t_assets (uuid, label, asset_ip, asset_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run('org-uuid', 'Organization', '10.0.0.1', 'organization', new Date().toISOString(), new Date().toISOString())

      // Create related organization child assets
      db.prepare(
        `
        INSERT INTO t_organization_assets (uuid, organization_uuid, hostname, host, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run('child-uuid-1', 'org-uuid', 'server1', '10.0.0.10', new Date().toISOString(), new Date().toISOString())

      db.prepare(
        `
        INSERT INTO t_organization_assets (uuid, organization_uuid, hostname, host, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run('child-uuid-2', 'org-uuid', 'server2', '10.0.0.11', new Date().toISOString(), new Date().toISOString())

      const result = deleteAssetLogic(db, 'org-uuid')

      expect(result.data.message).toBe('success')

      // Verify organization asset removed
      const orgRecord = db.prepare('SELECT * FROM t_assets WHERE uuid = ?').get('org-uuid')
      expect(orgRecord).toBeUndefined()

      // Verify related child assets removed
      const childRecords = db.prepare('SELECT * FROM t_organization_assets WHERE organization_uuid = ?').all('org-uuid')
      expect(childRecords).toHaveLength(0)
    })

    it('should return failed when deleting non-existent asset', () => {
      const result = deleteAssetLogic(db, 'non-existent-uuid')

      expect(result.data.message).toBe('failed')
    })
  })

  describe('getAssetGroupLogic', () => {
    it('should return all unique group names', () => {
      // Create multiple assets with some duplicate groups
      db.prepare(`INSERT INTO t_assets (uuid, label, asset_ip, group_name) VALUES (?, ?, ?, ?)`).run('uuid-1', 'Server1', '192.168.1.1', 'Production')
      db.prepare(`INSERT INTO t_assets (uuid, label, asset_ip, group_name) VALUES (?, ?, ?, ?)`).run('uuid-2', 'Server2', '192.168.1.2', 'Production')
      db.prepare(`INSERT INTO t_assets (uuid, label, asset_ip, group_name) VALUES (?, ?, ?, ?)`).run(
        'uuid-3',
        'Server3',
        '192.168.1.3',
        'Development'
      )
      db.prepare(`INSERT INTO t_assets (uuid, label, asset_ip, group_name) VALUES (?, ?, ?, ?)`).run('uuid-4', 'Server4', '192.168.1.4', 'Staging')

      const result = getAssetGroupLogic(db)

      expect(result.data.groups).toHaveLength(3)
      expect(result.data.groups).toContain('Production')
      expect(result.data.groups).toContain('Development')
      expect(result.data.groups).toContain('Staging')
    })

    it('should return empty array when no group exists', () => {
      const result = getAssetGroupLogic(db)

      expect(result.data.groups).toEqual([])
    })
  })

  describe('updateLocalAssetLabelLogic', () => {
    it('should update asset label successfully', () => {
      db.prepare(`INSERT INTO t_assets (uuid, label, asset_ip) VALUES (?, ?, ?)`).run('uuid-1', 'Old Label', '192.168.1.1')

      const result = updateLocalAssetLabelLogic(db, 'uuid-1', 'New Label')

      expect(result.data.message).toBe('success')

      const record = db.prepare('SELECT label FROM t_assets WHERE uuid = ?').get('uuid-1') as Asset | undefined
      expect(record).toBeDefined()
      if (!record) {
        throw new Error('record not found')
      }
      expect(record.label).toBe('New Label')
    })

    it('should return failed when UUID does not exist', () => {
      const result = updateLocalAssetLabelLogic(db, 'non-existent', 'New Label')

      expect(result.data.message).toBe('failed')
    })
  })

  describe('updateLocalAsseFavoriteLogic', () => {
    it('should update favorite to starred', () => {
      db.prepare(`INSERT INTO t_assets (uuid, label, asset_ip, favorite) VALUES (?, ?, ?, ?)`).run('uuid-1', 'Server', '192.168.1.1', 2)

      const result = updateLocalAsseFavoriteLogic(db, 'uuid-1', 1)

      expect(result.data.message).toBe('success')

      const record = db.prepare('SELECT favorite FROM t_assets WHERE uuid = ?').get('uuid-1') as Asset | undefined
      expect(record).toBeDefined()
      if (!record) {
        throw new Error('record not found')
      }
      expect(record.favorite).toBe(1)
    })

    it('should unstar successfully', () => {
      db.prepare(`INSERT INTO t_assets (uuid, label, asset_ip, favorite) VALUES (?, ?, ?, ?)`).run('uuid-1', 'Server', '192.168.1.1', 1)

      const result = updateLocalAsseFavoriteLogic(db, 'uuid-1', 2)

      expect(result.data.message).toBe('success')

      const record = db.prepare('SELECT favorite FROM t_assets WHERE uuid = ?').get('uuid-1') as Asset | undefined
      expect(record).toBeDefined()
      if (!record) {
        throw new Error('record not found')
      }
      expect(record.favorite).toBe(2)
    })
  })

  describe('createOrUpdateAssetLogic', () => {
    it('should create new asset when no duplicate exists', () => {
      const params = {
        ip: '192.168.1.100',
        label: 'New Server',
        auth_type: 'password',
        port: 22,
        username: 'root',
        password: 'secret',
        asset_type: 'person'
      }

      const result = createOrUpdateAssetLogic(db, params)

      expect(result.data.message).toBe('success')
      expect(result.data.action).toBe('created')
    })

    it('should update existing asset when duplicate found', () => {
      // Create an asset first
      db.prepare(
        `
        INSERT INTO t_assets (uuid, label, asset_ip, auth_type, port, username, password, asset_type, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        'existing-uuid',
        'Server',
        '192.168.1.100',
        'password',
        22,
        'root',
        'old_pass',
        'person',
        1,
        new Date().toISOString(),
        new Date().toISOString()
      )

      const params = {
        ip: '192.168.1.100',
        label: 'Server',
        auth_type: 'keyBased',
        port: 22,
        username: 'root',
        password: 'new_pass',
        asset_type: 'person'
      }

      const result = createOrUpdateAssetLogic(db, params)

      expect(result.data.message).toBe('updated')
      expect(result.data.action).toBe('updated')
      expect(result.data.uuid).toBe('existing-uuid')

      // Verify version increments
      const record = db.prepare('SELECT version, auth_type FROM t_assets WHERE uuid = ?').get('existing-uuid') as Asset | undefined
      expect(record).toBeDefined()
      if (!record) {
        throw new Error('record not found')
      }
      expect(record.version).toBe(2)
      expect(record.auth_type).toBe('keyBased')
    })
  })
})
