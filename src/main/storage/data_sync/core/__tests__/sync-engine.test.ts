import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SyncEngine } from '../SyncEngine'

const table = 't_assets_sync'

function makeChange(id: number, uuid: string, op: 'INSERT' | 'UPDATE' | 'DELETE', data: any = {}) {
  return {
    id: String(id),
    table_name: table,
    record_uuid: uuid,
    operation_type: op,
    change_data: data,
    created_at: new Date().toISOString(),
    sync_status: 'pending',
    retry_count: 0
  }
}

describe('SyncEngine.incrementalSync', () => {
  let db: any
  let api: any

  beforeEach(() => {
    db = {
      getPendingChanges: vi.fn(),
      markChangesSynced: vi.fn(),
      markChangesConflict: vi.fn(),
      setVersion: vi.fn(),
      getTotalPendingChangesCount: vi.fn()
    }
    api = {
      incrementalSync: vi.fn()
    }
  })

  it('should mark success and conflicts separately, and increment version for successful UPDATE', async () => {
    const changes = [makeChange(1, 'u1', 'UPDATE', { version: 3, label: 'A' }), makeChange(2, 'u2', 'INSERT', { label: 'B' })]
    db.getPendingChanges.mockReturnValue(changes)

    api.incrementalSync.mockResolvedValue({
      success: true,
      message: 'ok',
      conflicts: [{ table_name: table, uuid: 'u2', reason: 'dup' }]
    })

    const engine = new SyncEngine(db, api)
    const res = await engine.incrementalSync(table)

    expect(res.success).toBe(false)
    expect(res.synced_count).toBe(1)
    expect(res.failed_count).toBe(1)

    expect(db.markChangesSynced).toHaveBeenCalledWith(['1'])
    expect(db.markChangesConflict).toHaveBeenCalledWith(['2'], 'u2:dup')
    expect(db.setVersion).toHaveBeenCalledWith(table, 'u1', 4)
  })

  it('should return success 0/0 when no pending changes', async () => {
    db.getPendingChanges.mockReturnValue([])
    const engine = new SyncEngine(db, api)
    const res = await engine.incrementalSync(table)
    expect(res).toEqual({ success: true, message: 'No pending changes to sync', synced_count: 0, failed_count: 0 })
    expect(api.incrementalSync).not.toHaveBeenCalled()
  })
})

describe('SyncEngine.incrementalSyncSmart', () => {
  it('should call incrementalSync for small data volume', async () => {
    const db = {
      getPendingChanges: vi.fn().mockReturnValue([makeChange(1, 'u1', 'INSERT', {})]),
      getTotalPendingChangesCount: vi.fn().mockReturnValue(1),
      markChangesSynced: vi.fn(),
      markChangesConflict: vi.fn(),
      setVersion: vi.fn()
    }
    const api = { incrementalSync: vi.fn().mockResolvedValue({ success: true, message: 'ok', synced_count: 1, failed_count: 0 }) }
    const engine = new SyncEngine(db as any, api as any)

    const spy = vi.spyOn(engine, 'incrementalSync')
    const res = await engine.incrementalSyncSmart(table)
    expect(spy).toHaveBeenCalled()
    expect(res.success).toBe(true)
    expect(res.synced_count).toBe(1)
  })
})
