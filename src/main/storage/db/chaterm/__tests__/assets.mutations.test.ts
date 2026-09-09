import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import type Database from 'better-sqlite3'

const triggerSync = vi.hoisted(() => vi.fn())

vi.mock('better-sqlite3', () => ({
  default: class {}
}))

vi.mock('../../../data_sync/core/SyncController', () => ({
  SyncController: {
    triggerIncrementalSync: triggerSync
  }
}))

interface FakeStmt {
  get?: (uuid: string) => { asset_type: string } | undefined
  run: (uuid: string) => { changes: number }
}

const createDb = (failOnUuid?: string) => {
  const assets = new Map<string, { asset_type: string }>()
  let orgAssets: Array<{ organization_uuid: string; host: string }> = []

  const prepare = (sql: string): FakeStmt => {
    if (sql.includes('SELECT asset_type FROM t_assets')) {
      return {
        run: () => ({ changes: 0 }),
        get: (uuid: string) => assets.get(uuid)
      }
    }

    if (sql.includes('DELETE FROM t_organization_assets')) {
      return {
        run: (uuid: string) => {
          const before = orgAssets.length
          orgAssets = orgAssets.filter((row) => row.organization_uuid !== uuid)
          return { changes: before - orgAssets.length }
        }
      }
    }

    if (sql.includes('DELETE FROM t_assets')) {
      return {
        run: (uuid: string) => {
          if (uuid === failOnUuid) throw new Error('Delete failed')
          const existed = assets.delete(uuid)
          return { changes: existed ? 1 : 0 }
        }
      }
    }

    throw new Error(`Unexpected SQL: ${sql}`)
  }

  return {
    prepare,
    transaction:
      <T>(fn: () => T) =>
      () => {
        const savedAssets = new Map(assets)
        const savedOrgAssets = [...orgAssets]
        try {
          return fn()
        } catch (error) {
          assets.clear()
          savedAssets.forEach((asset, uuid) => assets.set(uuid, asset))
          orgAssets = savedOrgAssets
          throw error
        }
      },
    assets,
    orgAssets: () => orgAssets
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  triggerSync.mockClear()
})

afterEach(async () => {
  await vi.runAllTimersAsync()
  vi.useRealTimers()
})

describe('deleteAssetLogic', () => {
  it('removes organization child assets for plugin-based bastion types', async () => {
    const { deleteAssetLogic } = await import('../assets.mutations')
    const db = createDb()

    db.assets.set('org-1', { asset_type: 'organization-custom' })
    db.orgAssets().push({ organization_uuid: 'org-1', host: '10.0.0.1' })

    deleteAssetLogic(db as any, 'org-1')

    const remaining = db.orgAssets().filter((row) => row.organization_uuid === 'org-1')
    expect(remaining.length).toBe(0)
  })
})

describe('batchDeleteAssetsLogic', () => {
  it('deletes only selected configurations and their organization child assets, then syncs once', async () => {
    const { batchDeleteAssetsLogic } = await import('../assets.mutations')
    const db = createDb()
    db.assets.set('host-1', { asset_type: 'person' })
    db.assets.set('switch-1', { asset_type: 'switch' })
    db.assets.set('org-1', { asset_type: 'organization' })
    db.assets.set('org-2', { asset_type: 'organization-custom' })
    db.assets.set('keep', { asset_type: 'person' })
    db.orgAssets().push(
      { organization_uuid: 'org-1', host: 'first-child' },
      { organization_uuid: 'org-2', host: 'second-child' },
      { organization_uuid: 'other-org', host: 'keep-child' }
    )

    const result = batchDeleteAssetsLogic(db as unknown as Database.Database, ['host-1', 'switch-1', 'org-1', 'org-2'])

    expect(result).toEqual({ data: { message: 'success', changes: 4, requested: 4 } })
    expect([...db.assets.keys()]).toEqual(['keep'])
    expect(db.orgAssets()).toEqual([{ organization_uuid: 'other-org', host: 'keep-child' }])
    await vi.runAllTimersAsync()
    expect(triggerSync).toHaveBeenCalledTimes(1)
  })

  it('deduplicates UUIDs and counts only configurations that still exist', async () => {
    const { batchDeleteAssetsLogic } = await import('../assets.mutations')
    const db = createDb()
    db.assets.set('host-1', { asset_type: 'person' })

    const result = batchDeleteAssetsLogic(db as unknown as Database.Database, ['host-1', 'host-1', 'missing'])

    expect(result).toEqual({ data: { message: 'success', changes: 1, requested: 2 } })
    expect(db.assets.size).toBe(0)
  })

  it('succeeds without triggering sync when all requested configurations are already absent', async () => {
    const { batchDeleteAssetsLogic } = await import('../assets.mutations')
    const db = createDb()

    const result = batchDeleteAssetsLogic(db as unknown as Database.Database, ['missing'])

    expect(result).toEqual({ data: { message: 'success', changes: 0, requested: 1 } })
    await vi.runAllTimersAsync()
    expect(triggerSync).not.toHaveBeenCalled()
  })

  it.each([undefined, null, [], '', [''], ['host-1', ' '], ['host-1', 1]])('rejects invalid UUID selections: %j', async (uuids) => {
    const { batchDeleteAssetsLogic } = await import('../assets.mutations')
    const db = createDb()
    db.assets.set('host-1', { asset_type: 'person' })

    const result = batchDeleteAssetsLogic(db as unknown as Database.Database, uuids as string[])

    expect(result.data).toMatchObject({ message: 'failed', changes: 0, requested: 0 })
    expect(db.assets.has('host-1')).toBe(true)
    await vi.runAllTimersAsync()
    expect(triggerSync).not.toHaveBeenCalled()
  })

  it('rolls back all configurations and organization child assets if any delete fails', async () => {
    const { batchDeleteAssetsLogic } = await import('../assets.mutations')
    const db = createDb('org-1')
    db.assets.set('host-1', { asset_type: 'person' })
    db.assets.set('org-1', { asset_type: 'organization-custom' })
    db.orgAssets().push({ organization_uuid: 'org-1', host: 'child' })

    expect(() => batchDeleteAssetsLogic(db as unknown as Database.Database, ['host-1', 'org-1'])).toThrow('Delete failed')

    expect([...db.assets.keys()]).toEqual(['host-1', 'org-1'])
    expect(db.orgAssets()).toEqual([{ organization_uuid: 'org-1', host: 'child' }])
    await vi.runAllTimersAsync()
    expect(triggerSync).not.toHaveBeenCalled()
  })
})
