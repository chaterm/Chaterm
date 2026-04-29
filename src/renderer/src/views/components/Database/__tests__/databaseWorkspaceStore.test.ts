import { beforeEach, describe, expect, it, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDatabaseWorkspaceStore } from '@/store/databaseWorkspaceStore'
import type { DatabaseConnectionDraft } from '../types'

describe('databaseWorkspaceStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    ;(window as unknown as { api?: unknown }).api = undefined
  })

  afterEach(() => {
    ;(window as unknown as { api?: unknown }).api = undefined
  })

  it('initializes with an overview tab', () => {
    const store = useDatabaseWorkspaceStore()

    expect(store.tabs).toHaveLength(1)
    expect(store.tabs[0]).toMatchObject({
      kind: 'overview',
      title: 'Overview'
    })
    expect(store.activeTabId).toBe(store.tabs[0].id)
  })

  it('opens a sql tab when selecting a table node', () => {
    const store = useDatabaseWorkspaceStore()

    store.openSqlTab('table-drms')

    expect(store.tabs).toHaveLength(2)
    expect(store.activeTab?.kind).toBe('sql')
    expect(store.activeTab).toMatchObject({
      title: 'drms',
      tableName: 'drms'
    })
    expect(store.activeTab?.sql.toLowerCase()).toContain('select * from drms')
  })

  it('saves a new connection draft into the explorer tree', () => {
    const store = useDatabaseWorkspaceStore()
    const draft: DatabaseConnectionDraft = {
      id: 'conn-new',
      name: '@localhost',
      env: 'TEST',
      dbType: 'MySQL',
      host: 'localhost',
      port: 3306,
      authentication: 'UserAndPassword',
      user: 'root',
      password: 'secret',
      database: 'demo',
      url: 'jdbc:mysql://localhost:3306/demo'
    }

    store.saveConnection(draft)

    const rootGroup = store.tree[0]
    expect(rootGroup.children?.some((child) => child.id === 'conn-new')).toBe(true)
  })

  it('filters the explorer tree by search keyword', () => {
    const store = useDatabaseWorkspaceStore()

    store.setSearchKeyword('drms')

    expect(store.filteredTree).toHaveLength(1)
    const group = store.filteredTree[0]
    const connection = group.children?.[0]
    const database = connection?.children?.[0]
    const folder = database?.children?.[0]

    expect(folder?.children?.map((node) => node.name)).toEqual(['drms'])
  })

  it('updates the active tab explicitly', () => {
    const store = useDatabaseWorkspaceStore()

    store.openSqlTab('table-drms')
    const overviewId = store.tabs[0].id

    store.setActiveTab(overviewId)

    expect(store.activeTabId).toBe(overviewId)
    expect(store.activeTab?.kind).toBe('overview')
  })

  describe('backend integration', () => {
    it('loads assets from window.api and rebuilds the tree', async () => {
      const mockApi = {
        dbAssetList: vi.fn().mockResolvedValue([
          {
            id: 'asset-1',
            name: 'prod-mysql',
            group_name: null,
            db_type: 'mysql',
            host: '10.0.0.1',
            port: 3306,
            database_name: null,
            username: 'root',
            hasPassword: true,
            status: 'idle'
          },
          {
            id: 'asset-2',
            name: 'analytics-pg',
            group_name: null,
            db_type: 'postgresql',
            host: '10.0.0.2',
            port: 5432,
            database_name: 'analytics',
            username: 'ro',
            hasPassword: true,
            status: 'connected'
          }
        ])
      }
      ;(window as unknown as { api: unknown }).api = mockApi

      const store = useDatabaseWorkspaceStore()
      await store.loadAssetsFromBackend()

      expect(mockApi.dbAssetList).toHaveBeenCalled()
      const group = store.tree[0]
      const names = group.children?.map((c) => c.name)
      expect(names).toEqual(['prod-mysql', 'analytics-pg'])
      expect(store.connectionStatuses['asset-2']).toBe('connected')
    })

    it('saveConnection delegates to dbAssetCreate and refreshes the tree', async () => {
      const newAsset = {
        id: 'asset-new',
        name: 'prod-mysql',
        group_name: null,
        db_type: 'mysql' as const,
        host: '10.0.0.1',
        port: 3306,
        database_name: null,
        username: 'root',
        hasPassword: true,
        status: 'idle' as const
      }
      const mockApi = {
        dbAssetCreate: vi.fn().mockResolvedValue({ ok: true, asset: newAsset }),
        dbAssetList: vi.fn().mockResolvedValue([newAsset])
      }
      ;(window as unknown as { api: unknown }).api = mockApi

      const store = useDatabaseWorkspaceStore()
      store.openConnectionModal()
      const draft: DatabaseConnectionDraft = {
        ...store.connectionDraft!,
        name: 'prod-mysql',
        user: 'root',
        password: 's3cret',
        host: '10.0.0.1',
        port: 3306
      }
      await store.saveConnection(draft)

      expect(mockApi.dbAssetCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'prod-mysql',
          db_type: 'mysql',
          host: '10.0.0.1',
          port: 3306,
          username: 'root',
          password: 's3cret'
        })
      )
      expect(mockApi.dbAssetList).toHaveBeenCalled()
      expect(store.connectionModalVisible).toBe(false)
    })

    it('connectAsset updates status and triggers loadConnectedTree', async () => {
      const asset = {
        id: 'asset-1',
        name: 'a',
        group_name: null,
        db_type: 'mysql' as const,
        host: 'h',
        port: 3306,
        database_name: null,
        username: 'u',
        hasPassword: true,
        status: 'connected' as const
      }
      const mockApi = {
        dbAssetList: vi.fn().mockResolvedValue([asset]),
        dbAssetConnect: vi.fn().mockResolvedValue({ ok: true, asset }),
        dbAssetListChildren: vi.fn().mockResolvedValue({ ok: true, databases: ['db1'] })
      }
      ;(window as unknown as { api: unknown }).api = mockApi

      const store = useDatabaseWorkspaceStore()
      await store.loadAssetsFromBackend()
      await store.connectAsset('asset-1')

      expect(mockApi.dbAssetConnect).toHaveBeenCalledWith('asset-1')
      expect(mockApi.dbAssetListChildren).toHaveBeenCalledWith({ id: 'asset-1' })
      expect(store.connectionStatuses['asset-1']).toBe('connected')

      const connNode = store.tree[0].children?.[0]
      expect(connNode?.children?.[0].name).toBe('db1')
      expect(connNode?.children?.[0].type).toBe('database')
    })

    it('loadDatabaseTables populates a tables folder under the database node', async () => {
      const asset = {
        id: 'asset-1',
        name: 'a',
        group_name: null,
        db_type: 'mysql' as const,
        host: 'h',
        port: 3306,
        database_name: null,
        username: 'u',
        hasPassword: true,
        status: 'connected' as const
      }
      const mockApi = {
        dbAssetList: vi.fn().mockResolvedValue([asset]),
        dbAssetConnect: vi.fn().mockResolvedValue({ ok: true, asset }),
        dbAssetListChildren: vi.fn().mockImplementation((p: { id: string; databaseName?: string }) => {
          if (p.databaseName) return Promise.resolve({ ok: true, tables: ['t1', 't2'] })
          return Promise.resolve({ ok: true, databases: ['db1'] })
        })
      }
      ;(window as unknown as { api: unknown }).api = mockApi

      const store = useDatabaseWorkspaceStore()
      await store.loadAssetsFromBackend()
      await store.connectAsset('asset-1')
      await store.loadDatabaseTables('asset-1', 'db1')

      const connNode = store.tree[0].children?.[0]
      const dbNode = connNode?.children?.[0]
      const folder = dbNode?.children?.[0]
      expect(folder?.type).toBe('folder')
      expect(folder?.name).toBe('tables')
      expect(folder?.children?.map((c) => c.name)).toEqual(['t1', 't2'])
    })

    it('testConnectionFromDraft surfaces backend error message via lastTestResult', async () => {
      const mockApi = {
        dbAssetTestConnection: vi.fn().mockResolvedValue({
          ok: false,
          errorCode: 'ER_ACCESS',
          errorMessage: 'bad creds'
        })
      }
      ;(window as unknown as { api: unknown }).api = mockApi

      const store = useDatabaseWorkspaceStore()
      store.openConnectionModal({ user: 'x', password: 'y' })
      await store.testConnectionFromDraft(store.connectionDraft!)

      expect(store.lastTestResult?.ok).toBe(false)
      expect(store.lastTestResult?.message).toBe('bad creds')
    })
  })
})

describe('databaseWorkspaceStore sql workspace — state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('initializes resultSeq at 0', () => {
    const store = useDatabaseWorkspaceStore()
    expect(store.resultSeq).toBe(0)
  })
})

describe('openNewSqlTab', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('inherits context from the active data tab and increments Query titles', () => {
    const store = useDatabaseWorkspaceStore()
    store.tabs.push({
      id: 'tab-data-users',
      title: 'users',
      kind: 'data',
      connectionId: 'conn-asset-1',
      assetId: 'asset-1',
      databaseName: 'db_cloud',
      tableName: 'users',
      sql: '',
      resultColumns: [],
      resultRows: []
    })
    store.setActiveTab('tab-data-users')

    store.openNewSqlTab()

    expect(store.activeTab).toMatchObject({
      kind: 'sql',
      title: 'Query 1',
      assetId: 'asset-1',
      databaseName: 'db_cloud',
      activeResultTabId: 'overview'
    })
    expect(store.activeTab?.resultTabs).toEqual([])
    expect(store.activeTab?.history).toEqual([])

    store.openNewSqlTab()
    expect(store.activeTab?.title).toBe('Query 2')
  })

  it('uses max existing Query index + 1 so closed tabs do not cause duplicates', () => {
    const store = useDatabaseWorkspaceStore()
    store.openNewSqlTab() // Query 1
    store.openNewSqlTab() // Query 2
    const firstId = store.tabs.find((t) => t.title === 'Query 1')!.id
    store.closeTab(firstId)
    store.openNewSqlTab()
    expect(store.activeTab?.title).toBe('Query 3')
  })

  it('opens a blank SQL tab when no context is available', () => {
    const store = useDatabaseWorkspaceStore()
    store.openNewSqlTab()
    expect(store.activeTab).toMatchObject({ kind: 'sql', title: 'Query 1' })
    expect(store.activeTab?.assetId).toBeUndefined()
    expect(store.activeTab?.databaseName).toBeUndefined()
  })

  it('does NOT fall back to selectedNodeId when active tab is a non-overview tab without assetId', () => {
    const store = useDatabaseWorkspaceStore()
    // Active tab is a blank SQL tab created with no context
    store.openNewSqlTab()
    // Simulate the user picking a tree node after opening the blank tab.
    // Seed a tree with a connection + database and select the database.
    store.tree = [
      {
        id: 'group-default',
        type: 'group',
        name: 'Default Group',
        expanded: true,
        children: [
          {
            id: 'conn-asset-9',
            type: 'connection',
            name: 'ctm9',
            parentId: 'group-default',
            expanded: true,
            meta: { assetId: 'asset-9' },
            children: [
              {
                id: 'db-asset-9-main',
                type: 'database',
                name: 'main',
                parentId: 'conn-asset-9',
                expanded: false,
                children: []
              }
            ]
          }
        ]
      }
    ]
    store.setSelectedNode('db-asset-9-main')
    store.openNewSqlTab() // active tab is the previous blank SQL tab
    // New tab must remain blank because the previous tab, though blank, was a
    // non-overview tab — tree fallback should not run.
    expect(store.activeTab?.assetId).toBeUndefined()
    expect(store.activeTab?.databaseName).toBeUndefined()
  })
})
