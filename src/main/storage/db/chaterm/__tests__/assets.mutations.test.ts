import { describe, it, expect, vi } from 'vitest'

vi.mock('better-sqlite3', () => ({
  default: class {}
}))

vi.mock('../../../data_sync/core/SyncController', () => ({
  SyncController: {
    triggerIncrementalSync: vi.fn()
  }
}))

interface FakeStmt {
  get?: (uuid: string) => { asset_type: string } | undefined
  run: (uuid: string) => { changes: number }
}

const createDb = () => {
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
          const existed = assets.delete(uuid)
          return { changes: existed ? 1 : 0 }
        }
      }
    }

    throw new Error(`Unexpected SQL: ${sql}`)
  }

  return {
    prepare,
    assets,
    orgAssets: () => orgAssets
  }
}

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
