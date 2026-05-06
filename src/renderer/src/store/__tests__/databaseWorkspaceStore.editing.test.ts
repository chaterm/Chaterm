/**
 * Tests for the edit/undo/commit surface added to databaseWorkspaceStore.
 * Exercises addNewRow/deleteRow/updateCell/undo/commitDirty with a mocked
 * window.api so we don't need a running main process.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDatabaseWorkspaceStore, computeRowKey, makeEmptyDirtyState } from '../databaseWorkspaceStore'
import type { DatabaseWorkspaceTab } from '@views/components/Database/types'

interface MockApi {
  dbAssetDetectPrimaryKey: ReturnType<typeof vi.fn>
  dbAssetExecuteMutations: ReturnType<typeof vi.fn>
  dbAssetQueryTable: ReturnType<typeof vi.fn>
  dbAssetCountTable?: ReturnType<typeof vi.fn>
}

function installMockApi(overrides: Partial<MockApi> = {}): MockApi {
  const api: MockApi = {
    dbAssetDetectPrimaryKey: vi.fn().mockResolvedValue({ ok: true, primaryKey: ['id'] }),
    dbAssetExecuteMutations: vi.fn().mockResolvedValue({ ok: true, affected: 1, durationMs: 1 }),
    dbAssetQueryTable: vi.fn().mockResolvedValue({
      ok: true,
      columns: ['id', 'name'],
      rows: [
        { id: 1, name: 'alice' },
        { id: 2, name: 'bob' }
      ],
      rowCount: 2,
      durationMs: 1,
      knownColumns: ['id', 'name']
    }),
    ...overrides
  }
  const g = globalThis as unknown as { window: { api: MockApi; confirm?: (m: string) => boolean } }
  if (!g.window) (g as unknown as { window: unknown }).window = {}
  g.window.api = api
  g.window.confirm = () => true
  return api
}

function setupDataTab(store: ReturnType<typeof useDatabaseWorkspaceStore>, opts: { pk?: string[] | null } = {}): string {
  const tabId = 'tab-data-1'
  const tab: DatabaseWorkspaceTab = {
    id: tabId,
    title: 't',
    kind: 'data',
    connectionId: 'conn-1',
    assetId: 'asset-1',
    databaseName: 'db',
    tableName: 'users',
    sql: '',
    resultColumns: ['id', 'name'],
    resultRows: [
      { id: 1, name: 'alice' },
      { id: 2, name: 'bob' }
    ],
    knownColumns: ['id', 'name'],
    primaryKey: opts.pk === undefined ? ['id'] : opts.pk,
    page: 1,
    pageSize: 100,
    filters: [],
    sort: null,
    whereRaw: null,
    orderByRaw: null,
    total: null
  }
  store.tabs.push(tab)
  // Seed a minimal tree so buildDirtyMutations can resolve dbType via the
  // connection ancestor meta.
  store.tree = [
    {
      id: 'group-default',
      type: 'group',
      name: 'Default',
      children: [
        {
          id: 'conn-1',
          type: 'connection',
          name: 'c',
          parentId: 'group-default',
          meta: { dbType: 'mysql', assetId: 'asset-1' }
        }
      ]
    }
  ]
  store.loadOriginalRows(tabId)
  return tabId
}

describe('databaseWorkspaceStore editing', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('computeRowKey returns null when no primary key', () => {
    expect(computeRowKey(null, { id: 1 })).toBeNull()
    expect(computeRowKey([], { id: 1 })).toBeNull()
  })

  it('computeRowKey encodes pk values as JSON array', () => {
    expect(computeRowKey(['id'], { id: 7 })).toBe('[7]')
    expect(computeRowKey(['region', 'shard'], { region: 'us', shard: 3 })).toBe('["us",3]')
  })

  it('makeEmptyDirtyState returns fresh collections', () => {
    const d1 = makeEmptyDirtyState()
    const d2 = makeEmptyDirtyState()
    expect(d1.newRows).toEqual([])
    expect(d1.deletedRowKeys.size).toBe(0)
    expect(d1.newRows).not.toBe(d2.newRows)
  })

  it('loadOriginalRows snapshots current page by rowKey', () => {
    installMockApi()
    const store = useDatabaseWorkspaceStore()
    const tabId = setupDataTab(store)
    const tab = store.tabs.find((t) => t.id === tabId)!
    expect(tab.dirtyState?.originalRows.size).toBe(2)
    expect(tab.dirtyState?.originalRows.get(JSON.stringify([1]))).toEqual({ id: 1, name: 'alice' })
  })

  it('addNewRow appends a row and records an add op', () => {
    installMockApi()
    const store = useDatabaseWorkspaceStore()
    const tabId = setupDataTab(store)
    const tmpId = store.addNewRow(tabId)
    expect(tmpId).toBeTruthy()
    const tab = store.tabs.find((t) => t.id === tabId)!
    expect(tab.dirtyState!.newRows.length).toBe(1)
    expect(tab.undoStack!.length).toBe(1)
    expect(tab.undoStack![0].kind).toBe('add')
  })

  it('undo removes a new row that was just added', () => {
    installMockApi()
    const store = useDatabaseWorkspaceStore()
    const tabId = setupDataTab(store)
    store.addNewRow(tabId)
    store.undo(tabId)
    const tab = store.tabs.find((t) => t.id === tabId)!
    expect(tab.dirtyState!.newRows.length).toBe(0)
    expect(tab.undoStack!.length).toBe(0)
  })

  it('updateCell records a reversible update op', () => {
    installMockApi()
    const store = useDatabaseWorkspaceStore()
    const tabId = setupDataTab(store)
    const rowKey = JSON.stringify([1])
    store.updateCell(tabId, rowKey, 'name', 'ALICE')
    const tab = store.tabs.find((t) => t.id === tabId)!
    expect(tab.dirtyState!.updatedCells.get(rowKey)).toEqual({ name: 'ALICE' })
    store.undo(tabId)
    expect(tab.dirtyState!.updatedCells.has(rowKey)).toBe(false)
  })

  it('updateCell editing back to original value removes the dirty entry', () => {
    installMockApi()
    const store = useDatabaseWorkspaceStore()
    const tabId = setupDataTab(store)
    const rowKey = JSON.stringify([1])
    store.updateCell(tabId, rowKey, 'name', 'X')
    store.updateCell(tabId, rowKey, 'name', 'alice')
    const tab = store.tabs.find((t) => t.id === tabId)!
    expect(tab.dirtyState!.updatedCells.has(rowKey)).toBe(false)
  })

  it('deleteRow on existing row pushes a delete op', () => {
    installMockApi()
    const store = useDatabaseWorkspaceStore()
    const tabId = setupDataTab(store)
    const rowKey = JSON.stringify([2])
    store.deleteRow(tabId, rowKey)
    const tab = store.tabs.find((t) => t.id === tabId)!
    expect(tab.dirtyState!.deletedRowKeys.has(rowKey)).toBe(true)
    store.undo(tabId)
    expect(tab.dirtyState!.deletedRowKeys.has(rowKey)).toBe(false)
  })

  it('deleteRow on new (tmpId) row removes it and its add op', () => {
    installMockApi()
    const store = useDatabaseWorkspaceStore()
    const tabId = setupDataTab(store)
    const tmpId = store.addNewRow(tabId)!
    store.deleteRow(tabId, tmpId)
    const tab = store.tabs.find((t) => t.id === tabId)!
    expect(tab.dirtyState!.newRows.length).toBe(0)
    expect(tab.undoStack!.length).toBe(0)
  })

  it('selectRow sets selectedRowKey', () => {
    installMockApi()
    const store = useDatabaseWorkspaceStore()
    const tabId = setupDataTab(store)
    store.selectRow(tabId, 'abc')
    const tab = store.tabs.find((t) => t.id === tabId)!
    expect(tab.selectedRowKey).toBe('abc')
  })

  it('clearDirty wipes edits but keeps originalRows snapshot', () => {
    installMockApi()
    const store = useDatabaseWorkspaceStore()
    const tabId = setupDataTab(store)
    store.addNewRow(tabId)
    store.updateCell(tabId, JSON.stringify([1]), 'name', 'X')
    store.clearDirty(tabId)
    const tab = store.tabs.find((t) => t.id === tabId)!
    expect(tab.dirtyState!.newRows.length).toBe(0)
    expect(tab.dirtyState!.updatedCells.size).toBe(0)
    expect(tab.dirtyState!.originalRows.size).toBe(2)
    expect(tab.undoStack!.length).toBe(0)
  })

  it('buildDirtyMutations produces parametrized SQL for mysql tab', () => {
    installMockApi()
    const store = useDatabaseWorkspaceStore()
    const tabId = setupDataTab(store)
    store.updateCell(tabId, JSON.stringify([1]), 'name', 'A2')
    const stmts = store.buildDirtyMutations(tabId)
    expect(stmts.length).toBe(1)
    expect(stmts[0].sql).toContain('UPDATE `db`.`users`')
    expect(stmts[0].params).toEqual(['A2', 1])
  })

  it('detectPrimaryKey stashes result on the tab', async () => {
    const api = installMockApi()
    api.dbAssetDetectPrimaryKey.mockResolvedValue({ ok: true, primaryKey: ['id'] })
    const store = useDatabaseWorkspaceStore()
    const tabId = setupDataTab(store, { pk: null })
    await store.detectPrimaryKey(tabId)
    const tab = store.tabs.find((t) => t.id === tabId)!
    expect(tab.primaryKey).toEqual(['id'])
  })

  it('commitDirty success path clears dirty and reloads', async () => {
    const api = installMockApi()
    const store = useDatabaseWorkspaceStore()
    const tabId = setupDataTab(store)
    store.updateCell(tabId, JSON.stringify([1]), 'name', 'ALICE')
    const result = await store.commitDirty(tabId)
    expect(result.ok).toBe(true)
    expect(api.dbAssetExecuteMutations).toHaveBeenCalledTimes(1)
    const tab = store.tabs.find((t) => t.id === tabId)!
    expect(tab.dirtyState!.updatedCells.size).toBe(0)
    expect(api.dbAssetQueryTable).toHaveBeenCalled()
  })

  it('commitDirty failure preserves dirty state', async () => {
    const api = installMockApi({
      dbAssetExecuteMutations: vi.fn().mockResolvedValue({ ok: false, errorMessage: 'boom' })
    })
    const store = useDatabaseWorkspaceStore()
    const tabId = setupDataTab(store)
    store.updateCell(tabId, JSON.stringify([1]), 'name', 'ALICE')
    const result = await store.commitDirty(tabId)
    expect(result.ok).toBe(false)
    expect(result.errorMessage).toBe('boom')
    expect(api.dbAssetQueryTable).not.toHaveBeenCalled()
    const tab = store.tabs.find((t) => t.id === tabId)!
    expect(tab.dirtyState!.updatedCells.size).toBe(1)
  })

  it('commitDirty with no primary key prompts and aborts on cancel', async () => {
    const api = installMockApi()
    // Override window.confirm to return false.
    const g = globalThis as unknown as { window: { confirm: (m: string) => boolean } }
    g.window.confirm = () => false
    const store = useDatabaseWorkspaceStore()
    const tabId = setupDataTab(store, { pk: null })
    store.addNewRow(tabId)
    const result = await store.commitDirty(tabId)
    expect(result.ok).toBe(false)
    expect(result.errorMessage).toBe('cancelled')
    expect(api.dbAssetExecuteMutations).not.toHaveBeenCalled()
  })

  it('commitDirty with no pending statements returns ok:true without IPC', async () => {
    const api = installMockApi()
    const store = useDatabaseWorkspaceStore()
    const tabId = setupDataTab(store)
    const result = await store.commitDirty(tabId)
    expect(result.ok).toBe(true)
    expect(api.dbAssetExecuteMutations).not.toHaveBeenCalled()
  })

  it('updateCell rejects invalid column identifier', () => {
    installMockApi()
    const store = useDatabaseWorkspaceStore()
    const tabId = setupDataTab(store)
    store.updateCell(tabId, JSON.stringify([1]), 'bad-col', 'x')
    expect(store.lastError).toMatch(/Invalid column identifier/)
  })
})
