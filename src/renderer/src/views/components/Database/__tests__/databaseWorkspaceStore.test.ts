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
    it('loads groups and assets from window.api and rebuilds the tree', async () => {
      const mockApi = {
        dbAssetGroupList: vi.fn().mockResolvedValue([
          {
            id: 'group-1',
            name: 'Production',
            parent_id: null,
            sort_order: 1
          }
        ]),
        dbAssetList: vi.fn().mockResolvedValue([
          {
            id: 'asset-1',
            name: 'prod-mysql',
            group_id: 'group-1',
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

      expect(mockApi.dbAssetGroupList).toHaveBeenCalled()
      expect(mockApi.dbAssetList).toHaveBeenCalled()
      expect(store.tree.map((group) => group.name)).toContain('Production')
      const prodGroup = store.tree.find((group) => group.name === 'Production')
      expect(prodGroup?.children?.map((c) => c.name)).toEqual(['prod-mysql'])
      // Persisted asset.status is stale after a restart — the store always
      // initialises connectionStatuses to 'idle' and lets an explicit connect
      // transition it to 'connected'.
      expect(store.connectionStatuses['asset-2']).toBe('idle')
    })

    it('renders nested groups from parent_id and places connections under the child group', async () => {
      const mockApi = {
        dbAssetGroupList: vi.fn().mockResolvedValue([
          {
            id: 'group-parent',
            name: 'Parent',
            parent_id: null,
            sort_order: 0
          },
          {
            id: 'group-child',
            name: 'Child',
            parent_id: 'group-parent',
            sort_order: 0
          }
        ]),
        dbAssetList: vi.fn().mockResolvedValue([
          {
            id: 'asset-1',
            name: 'nested-mysql',
            group_id: 'group-child',
            group_name: 'Child',
            db_type: 'mysql',
            host: '10.0.0.1',
            port: 3306,
            database_name: null,
            username: 'root',
            hasPassword: true,
            status: 'idle'
          }
        ])
      }
      ;(window as unknown as { api: unknown }).api = mockApi

      const store = useDatabaseWorkspaceStore()
      await store.loadAssetsFromBackend()

      const parent = store.tree.find((group) => group.id === 'group-parent')
      const child = parent?.children?.find((node) => node.id === 'group-child')
      expect(child?.type).toBe('group')
      expect(child?.children?.map((node) => node.name)).toEqual(['nested-mysql'])
    })

    it('saveConnection delegates to dbAssetCreate with group_id and refreshes the tree', async () => {
      const newAsset = {
        id: 'asset-new',
        name: 'prod-mysql',
        group_id: 'group-1',
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
        dbAssetGroupList: vi.fn().mockResolvedValue([
          {
            id: 'group-1',
            name: 'Production',
            parent_id: null,
            sort_order: 1
          }
        ]),
        dbAssetCreate: vi.fn().mockResolvedValue({ ok: true, asset: newAsset }),
        dbAssetList: vi.fn().mockResolvedValue([newAsset])
      }
      ;(window as unknown as { api: unknown }).api = mockApi

      const store = useDatabaseWorkspaceStore()
      store.openConnectionModal()
      const draft: DatabaseConnectionDraft = {
        ...store.connectionDraft!,
        name: 'prod-mysql',
        groupId: 'group-1',
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
          group_id: 'group-1',
          host: '10.0.0.1',
          port: 3306,
          username: 'root',
          password: 's3cret'
        })
      )
      expect(mockApi.dbAssetList).toHaveBeenCalled()
      expect(store.connectionModalVisible).toBe(false)
    })

    it('createGroup delegates to dbAssetGroupCreate and reloads the tree', async () => {
      const mockApi = {
        dbAssetGroupCreate: vi.fn().mockResolvedValue({
          ok: true,
          group: { id: 'group-2', name: 'Analytics', parent_id: null, sort_order: 0 }
        }),
        dbAssetGroupList: vi.fn().mockResolvedValue([{ id: 'group-2', name: 'Analytics', parent_id: null, sort_order: 0 }]),
        dbAssetList: vi.fn().mockResolvedValue([])
      }
      ;(window as unknown as { api: unknown }).api = mockApi

      const store = useDatabaseWorkspaceStore()
      await store.createGroup('Analytics')

      expect(mockApi.dbAssetGroupCreate).toHaveBeenCalledWith({
        name: 'Analytics',
        parent_id: null,
        sort_order: 0
      })
      expect(store.tree.map((group) => group.name)).toContain('Analytics')
    })

    it('moveGroup delegates to dbAssetGroupUpdate with a parent_id patch', async () => {
      const mockApi = {
        dbAssetGroupUpdate: vi.fn().mockResolvedValue({
          ok: true,
          group: { id: 'group-child', name: 'Child', parent_id: 'group-parent', sort_order: 0 }
        }),
        dbAssetGroupList: vi.fn().mockResolvedValue([
          { id: 'group-parent', name: 'Parent', parent_id: null, sort_order: 0 },
          { id: 'group-child', name: 'Child', parent_id: 'group-parent', sort_order: 0 }
        ]),
        dbAssetList: vi.fn().mockResolvedValue([])
      }
      ;(window as unknown as { api: unknown }).api = mockApi

      const store = useDatabaseWorkspaceStore()
      await store.moveGroup('group-child', 'group-parent')

      expect(mockApi.dbAssetGroupUpdate).toHaveBeenCalledWith({
        id: 'group-child',
        patch: { parent_id: 'group-parent' }
      })
      const parent = store.tree.find((group) => group.id === 'group-parent')
      expect(parent?.children?.some((node) => node.id === 'group-child')).toBe(true)
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

    it('loadTableColumns appends column leaves to the table node', async () => {
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
        dbAssetListChildren: vi.fn().mockImplementation((p: { id: string; databaseName?: string; tableName?: string }) => {
          if (p.tableName) return Promise.resolve({ ok: true, columns: ['id', 'name', 'created_at'] })
          if (p.databaseName) return Promise.resolve({ ok: true, tables: ['users'] })
          return Promise.resolve({ ok: true, databases: ['db1'] })
        })
      }
      ;(window as unknown as { api: unknown }).api = mockApi

      const store = useDatabaseWorkspaceStore()
      await store.loadAssetsFromBackend()
      await store.connectAsset('asset-1')
      await store.loadDatabaseTables('asset-1', 'db1')

      const tableNodeId = `table-asset-1-db1-users`
      await store.loadTableColumns(tableNodeId)

      const connNode = store.tree[0].children?.[0]
      const dbNode = connNode?.children?.[0]
      const folder = dbNode?.children?.[0]
      const tableNode = folder?.children?.[0]
      expect(tableNode?.children?.map((c) => ({ name: c.name, type: c.type }))).toEqual([
        { name: 'id', type: 'column' },
        { name: 'name', type: 'column' },
        { name: 'created_at', type: 'column' }
      ])
      expect(mockApi.dbAssetListChildren).toHaveBeenCalledWith({
        id: 'asset-1',
        databaseName: 'db1',
        tableName: 'users'
      })
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

describe('runSqlOnActiveTab', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    ;(globalThis as any).window = {
      api: {
        dbAssetExecuteQuery: vi.fn(async ({ sql }: { sql: string }) => {
          if (sql.includes('BOOM')) return { ok: false, errorMessage: 'syntax error' }
          return {
            ok: true,
            columns: ['id'],
            rows: [{ id: 1 }],
            rowCount: 1,
            durationMs: 12
          }
        })
      }
    }
  })

  it('does nothing when no context (no result tab, no history)', async () => {
    const store = useDatabaseWorkspaceStore()
    store.openNewSqlTab()
    await store.runSqlOnActiveTab('all', 'SELECT 1')
    expect(store.activeTab?.resultTabs).toEqual([])
    expect(store.activeTab?.history).toEqual([])
    expect(store.lastError).toBe('sqlNoContext')
  })

  it('does nothing on empty SQL', async () => {
    const store = useDatabaseWorkspaceStore()
    store.openNewSqlTab()
    store.setSqlTabContext(store.activeTab!.id, 'a1', 'db1')
    await store.runSqlOnActiveTab('all', '   ')
    expect(store.activeTab?.resultTabs).toEqual([])
    expect(store.lastError).toBe('sqlEmpty')
  })

  it('creates a result tab, runs, and appends history on success', async () => {
    const store = useDatabaseWorkspaceStore()
    store.openNewSqlTab()
    store.setSqlTabContext(store.activeTab!.id, 'a1', 'db1')
    await store.runSqlOnActiveTab('all', 'SELECT 1')
    const tab = store.activeTab!
    expect(tab.resultTabs).toHaveLength(1)
    expect(tab.resultTabs![0]).toMatchObject({
      seq: 1,
      idx: 1,
      status: 'ok',
      rowCount: 1
    })
    expect(tab.activeResultTabId).toBe(tab.resultTabs![0].id)
    expect(tab.history).toHaveLength(1)
    expect(tab.history![0].status).toBe('ok')
  })

  it('records error status on failure', async () => {
    const store = useDatabaseWorkspaceStore()
    store.openNewSqlTab()
    store.setSqlTabContext(store.activeTab!.id, 'a1', 'db1')
    await store.runSqlOnActiveTab('all', 'SELECT BOOM')
    const tab = store.activeTab!
    expect(tab.resultTabs![0].status).toBe('error')
    expect(tab.resultTabs![0].error).toBe('syntax error')
    expect(tab.history![0].status).toBe('error')
  })

  it('increments global seq across tabs; per-sql-tab idx resets per tab', async () => {
    const store = useDatabaseWorkspaceStore()
    store.openNewSqlTab()
    store.setSqlTabContext(store.activeTab!.id, 'a1', 'db1')
    await store.runSqlOnActiveTab('all', 'SELECT 1')

    store.openNewSqlTab()
    store.setSqlTabContext(store.activeTab!.id, 'a1', 'db1')
    await store.runSqlOnActiveTab('all', 'SELECT 2')
    await store.runSqlOnActiveTab('all', 'SELECT 3')

    const secondTab = store.activeTab!
    expect(secondTab.resultTabs!.map((r) => `#${r.seq}-${r.idx}`)).toEqual(['#2-1', '#3-2'])
  })

  it('builds titles as #<seq>-<idx> <first 40 chars>', async () => {
    const store = useDatabaseWorkspaceStore()
    store.openNewSqlTab()
    store.setSqlTabContext(store.activeTab!.id, 'a1', 'db1')
    const long = 'select * from backup_lists limit 10 ' + 'x'.repeat(100)
    await store.runSqlOnActiveTab('all', long)
    const title = store.activeTab!.resultTabs![0].title
    expect(title.startsWith('#1-1 select * from backup_lists limit 10')).toBe(true)
    expect(title.length).toBeLessThanOrEqual(60)
  })
})

describe('closeResultTab / setActiveResultTab', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    ;(globalThis as any).window = {
      api: {
        dbAssetExecuteQuery: vi.fn(async () => ({
          ok: true,
          columns: [],
          rows: [],
          rowCount: 0,
          durationMs: 1
        }))
      }
    }
  })

  it('closes a result tab, falls back to previous, nullifies history link', async () => {
    const store = useDatabaseWorkspaceStore()
    store.openNewSqlTab()
    store.setSqlTabContext(store.activeTab!.id, 'a1', 'db1')
    await store.runSqlOnActiveTab('all', 'SELECT 1')
    await store.runSqlOnActiveTab('all', 'SELECT 2')
    const tab = store.activeTab!
    const secondId = tab.resultTabs![1].id
    store.closeResultTab(tab.id, secondId)
    expect(tab.resultTabs).toHaveLength(1)
    expect(tab.activeResultTabId).toBe(tab.resultTabs![0].id)
    expect(tab.history![1].resultTabId).toBeNull()
  })

  it('falls back to overview when closing the last result tab', async () => {
    const store = useDatabaseWorkspaceStore()
    store.openNewSqlTab()
    store.setSqlTabContext(store.activeTab!.id, 'a1', 'db1')
    await store.runSqlOnActiveTab('all', 'SELECT 1')
    const tab = store.activeTab!
    store.closeResultTab(tab.id, tab.resultTabs![0].id)
    expect(tab.resultTabs).toEqual([])
    expect(tab.activeResultTabId).toBe('overview')
  })

  it('setActiveResultTab accepts overview and real ids', async () => {
    const store = useDatabaseWorkspaceStore()
    store.openNewSqlTab()
    store.setSqlTabContext(store.activeTab!.id, 'a1', 'db1')
    await store.runSqlOnActiveTab('all', 'SELECT 1')
    const tab = store.activeTab!
    store.setActiveResultTab(tab.id, 'overview')
    expect(tab.activeResultTabId).toBe('overview')
    store.setActiveResultTab(tab.id, tab.resultTabs![0].id)
    expect(tab.activeResultTabId).toBe(tab.resultTabs![0].id)
  })
})

describe('connection-menu actions', () => {
  // Shared baseline asset used by most cases to avoid repeating the full DTO.
  const baseAsset = {
    id: 'a1',
    name: 'conn-1',
    group_id: null,
    group_name: null,
    db_type: 'mysql' as const,
    host: '10.0.0.1',
    port: 3306,
    database_name: 'demo',
    schema_name: null,
    environment: 'Dev',
    ssl_mode: null,
    username: 'root',
    hasPassword: true,
    status: 'connected' as const
  }

  let mockApi: {
    dbAssetConnect: ReturnType<typeof vi.fn>
    dbAssetDisconnect: ReturnType<typeof vi.fn>
    dbAssetUpdate: ReturnType<typeof vi.fn>
    dbAssetDelete: ReturnType<typeof vi.fn>
    dbAssetExecuteQuery: ReturnType<typeof vi.fn>
    dbAssetList: ReturnType<typeof vi.fn>
    dbAssetGroupList: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    mockApi = {
      dbAssetConnect: vi.fn().mockResolvedValue({ ok: true }),
      dbAssetDisconnect: vi.fn().mockResolvedValue({ ok: true }),
      dbAssetUpdate: vi.fn().mockResolvedValue({ ok: true, asset: { ...baseAsset, group_id: 'g2' } }),
      dbAssetDelete: vi.fn().mockResolvedValue({ ok: true }),
      dbAssetExecuteQuery: vi.fn().mockResolvedValue({ ok: true }),
      dbAssetList: vi.fn().mockResolvedValue([baseAsset]),
      dbAssetGroupList: vi.fn().mockResolvedValue([])
    }
    ;(window as unknown as { api: unknown }).api = mockApi
  })

  afterEach(() => {
    ;(window as unknown as { api?: unknown }).api = undefined
  })

  it('openQueryConsole creates a new SQL tab bound to the targeted connection', async () => {
    const store = useDatabaseWorkspaceStore()
    store.applyAssets([], [baseAsset])
    await store.openQueryConsole('a1')
    const sqlTabs = store.tabs.filter((t) => t.kind === 'sql')
    expect(sqlTabs).toHaveLength(1)
    const last = store.tabs[store.tabs.length - 1]
    expect(last.kind).toBe('sql')
    expect(last.assetId).toBe('a1')
    expect(last.connectionId).toBe('conn-a1')
    expect(last.databaseName).toBe('demo')
  })

  it('openQueryConsole is a no-op when the asset cannot be found', async () => {
    const store = useDatabaseWorkspaceStore()
    const beforeCount = store.tabs.length
    await store.openQueryConsole('unknown')
    expect(store.tabs.length).toBe(beforeCount)
  })

  it('createDatabase executes SQL then calls refreshConnectionChildren on success', async () => {
    const store = useDatabaseWorkspaceStore()
    store.applyAssets([], [{ ...baseAsset, db_type: 'postgresql' }])
    const refreshSpy = vi.spyOn(store, 'refreshConnectionChildren').mockResolvedValue(undefined)
    const res = await store.createDatabase('a1', 'CREATE DATABASE "x";')
    expect(mockApi.dbAssetExecuteQuery).toHaveBeenCalledWith({ id: 'a1', sql: 'CREATE DATABASE "x";' })
    expect(refreshSpy).toHaveBeenCalledWith('a1')
    expect(res.ok).toBe(true)
  })

  it('createDatabase returns errorMessage on failure and does not refresh', async () => {
    const store = useDatabaseWorkspaceStore()
    store.applyAssets([], [baseAsset])
    mockApi.dbAssetExecuteQuery.mockResolvedValueOnce({ ok: false, errorMessage: 'syntax error' })
    const refreshSpy = vi.spyOn(store, 'refreshConnectionChildren').mockResolvedValue(undefined)
    const res = await store.createDatabase('a1', 'BAD SQL')
    expect(res.ok).toBe(false)
    expect(res.errorMessage).toBe('syntax error')
    expect(refreshSpy).not.toHaveBeenCalled()
  })

  it('copyConnectionName returns the asset name', () => {
    const store = useDatabaseWorkspaceStore()
    store.applyAssets([], [baseAsset])
    expect(store.copyConnectionName('a1')).toBe('conn-1')
    expect(store.copyConnectionName('missing')).toBe('')
  })

  it('moveConnectionToGroup calls dbAssetUpdate with group_id and reloads assets on success', async () => {
    const store = useDatabaseWorkspaceStore()
    store.applyAssets([], [baseAsset])
    const res = await store.moveConnectionToGroup('a1', 'g2')
    expect(mockApi.dbAssetUpdate).toHaveBeenCalledWith({ id: 'a1', patch: { group_id: 'g2' } })
    expect(mockApi.dbAssetList).toHaveBeenCalled()
    expect(res?.ok).toBe(true)
  })

  it('moveConnectionToGroup accepts null to move to root', async () => {
    const store = useDatabaseWorkspaceStore()
    store.applyAssets([], [baseAsset])
    await store.moveConnectionToGroup('a1', null)
    expect(mockApi.dbAssetUpdate).toHaveBeenCalledWith({ id: 'a1', patch: { group_id: null } })
  })

  it('refreshConnectionChildren clears cached children and re-triggers lazy load when expanded', async () => {
    const store = useDatabaseWorkspaceStore()
    store.applyAssets([], [baseAsset])
    // Connection node gets seeded with some stale children and is marked expanded.
    const connNode = store.tree.flatMap((g) => g.children ?? []).find((n) => n.type === 'connection')
    expect(connNode).toBeTruthy()
    connNode!.children = [{ id: 'stale', type: 'database', name: 'stale', parentId: connNode!.id, expanded: false, children: [] }]
    connNode!.expanded = true
    const loadSpy = vi.spyOn(store, 'loadConnectedTree').mockResolvedValue(undefined)
    await store.refreshConnectionChildren('a1')
    expect(connNode!.children).toEqual([])
    expect(loadSpy).toHaveBeenCalledWith('a1')
  })

  it('refreshConnectionChildren does NOT re-trigger lazy load when not expanded', async () => {
    const store = useDatabaseWorkspaceStore()
    store.applyAssets([], [baseAsset])
    const connNode = store.tree.flatMap((g) => g.children ?? []).find((n) => n.type === 'connection')
    connNode!.children = [{ id: 'stale', type: 'database', name: 'stale', parentId: connNode!.id, expanded: false, children: [] }]
    connNode!.expanded = false
    const loadSpy = vi.spyOn(store, 'loadConnectedTree').mockResolvedValue(undefined)
    await store.refreshConnectionChildren('a1')
    expect(connNode!.children).toEqual([])
    expect(loadSpy).not.toHaveBeenCalled()
  })

  it('removeConnection closes tabs bound to the asset, fixes activeTabId, calls dbAssetDelete, reloads', async () => {
    const store = useDatabaseWorkspaceStore()
    store.applyAssets([], [baseAsset])
    // Seed two sql tabs bound to a1 and make one of them active.
    await store.openQueryConsole('a1')
    const firstTabId = store.tabs[store.tabs.length - 1].id
    await store.openQueryConsole('a1')
    const secondTabId = store.tabs[store.tabs.length - 1].id
    store.setActiveTab(secondTabId)
    expect(store.activeTabId).toBe(secondTabId)

    mockApi.dbAssetList.mockResolvedValueOnce([]) // after delete: asset gone
    await store.removeConnection('a1')

    expect(mockApi.dbAssetDelete).toHaveBeenCalledWith('a1')
    expect(store.tabs.some((t) => t.assetId === 'a1')).toBe(false)
    // The two SQL tabs bound to a1 must be gone; Overview tab remains.
    expect(store.tabs.some((t) => t.id === firstTabId)).toBe(false)
    expect(store.tabs.some((t) => t.id === secondTabId)).toBe(false)
    // activeTabId must point at a surviving tab (the Overview tab).
    expect(store.tabs.some((t) => t.id === store.activeTabId)).toBe(true)
  })
})

describe('runSqlOnActiveTab — IPC resilience', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('marks the result tab as error when the IPC call resolves to undefined', async () => {
    // Simulates the bug: IPC main-process silently returns undefined on
    // the 3rd concurrent query (e.g. driver queue drop). Prior to the fix,
    // `if (result.ok)` threw a TypeError outside try/catch and left the
    // result tab stuck on 'running' forever.
    let call = 0
    ;(globalThis as any).window = {
      api: {
        dbAssetExecuteQuery: vi.fn(async () => {
          call++
          if (call === 3) return undefined
          return { ok: true, columns: ['id'], rows: [{ id: call }], rowCount: 1, durationMs: 5 }
        })
      }
    }
    const store = useDatabaseWorkspaceStore()
    store.openNewSqlTab()
    store.setSqlTabContext(store.activeTab!.id, 'a1', 'db1')

    await store.runSqlOnActiveTab('all', 'SELECT 1')
    await store.runSqlOnActiveTab('all', 'SELECT 2')
    await store.runSqlOnActiveTab('all', 'SELECT 3')

    const tab = store.activeTab!
    expect(tab.resultTabs).toHaveLength(3)
    const third = tab.resultTabs![2]
    expect(third.status).toBe('error')
    expect(third.error).toBeTruthy()
    expect(tab.history).toHaveLength(3)
    expect(tab.history![2].status).toBe('error')
  })

  it('marks the result tab as error when the IPC call throws a non-Error value', async () => {
    ;(globalThis as any).window = {
      api: {
        dbAssetExecuteQuery: vi.fn(async () => {
          throw 'boom-string'
        })
      }
    }
    const store = useDatabaseWorkspaceStore()
    store.openNewSqlTab()
    store.setSqlTabContext(store.activeTab!.id, 'a1', 'db1')

    await store.runSqlOnActiveTab('all', 'SELECT 1')

    const tab = store.activeTab!
    expect(tab.resultTabs![0].status).toBe('error')
    expect(tab.resultTabs![0].error).toBe('boom-string')
  })
})

describe('edit connection mode', () => {
  // Shared fixture: a minimal asset suitable for edit-mode assertions.
  const editAsset = {
    id: 'asset-42',
    name: 'prod-mysql',
    group_id: 'g-1',
    group_name: null,
    db_type: 'mysql' as const,
    host: '10.0.0.5',
    port: 3307,
    database_name: 'orders',
    schema_name: null,
    environment: 'Production',
    ssl_mode: 'require',
    username: 'app_user',
    hasPassword: true,
    status: 'idle' as const
  }

  let mockApi: {
    dbAssetUpdate: ReturnType<typeof vi.fn>
    dbAssetList: ReturnType<typeof vi.fn>
    dbAssetGroupList: ReturnType<typeof vi.fn>
    dbAssetCreate: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    mockApi = {
      dbAssetUpdate: vi.fn().mockResolvedValue({ ok: true }),
      dbAssetList: vi.fn().mockResolvedValue([]),
      dbAssetGroupList: vi.fn().mockResolvedValue([]),
      dbAssetCreate: vi.fn().mockResolvedValue({ ok: true })
    }
    ;(window as unknown as { api: unknown }).api = mockApi
  })

  afterEach(() => {
    ;(window as unknown as { api?: unknown }).api = undefined
  })

  it('openEditConnectionModal populates draft from asset', () => {
    const store = useDatabaseWorkspaceStore()
    store.applyAssets([], [editAsset])

    store.openEditConnectionModal('asset-42')

    expect(store.connectionModalVisible).toBe(true)
    expect(store.connectionModalMode).toBe('edit')
    const draft = store.connectionDraft
    expect(draft).not.toBeNull()
    expect(draft!.id).toBe('asset-42')
    expect(draft!.name).toBe('prod-mysql')
    expect(draft!.groupId).toBe('g-1')
    expect(draft!.env).toBe('Production')
    expect(draft!.dbType).toBe('MySQL')
    expect(draft!.host).toBe('10.0.0.5')
    expect(draft!.port).toBe(3307)
    expect(draft!.authentication).toBe('UserAndPassword')
    expect(draft!.user).toBe('app_user')
    // Password must NOT be prefilled with any existing credential.
    expect(draft!.password).toBe('')
    expect(draft!.database).toBe('orders')
    expect(draft!.sslMode).toBe('require')
  })

  it('saveConnection in edit mode calls dbAssetUpdate not dbAssetCreate', async () => {
    const store = useDatabaseWorkspaceStore()
    store.applyAssets([], [editAsset])
    store.openEditConnectionModal('asset-42')
    const draft = store.connectionDraft!
    // Simulate the user typing a new password before saving.
    store.updateConnectionDraft({ password: 'new-secret', host: '10.0.0.6' })

    await store.saveConnection(store.connectionDraft!)

    expect(mockApi.dbAssetUpdate).toHaveBeenCalledTimes(1)
    expect(mockApi.dbAssetCreate).not.toHaveBeenCalled()
    const call = mockApi.dbAssetUpdate.mock.calls[0][0]
    expect(call.id).toBe('asset-42')
    expect(call.patch).toMatchObject({
      host: '10.0.0.6',
      password: 'new-secret',
      name: draft.name
    })
    // Modal should be closed and mode reset on success.
    expect(store.connectionModalVisible).toBe(false)
    expect(store.connectionModalMode).toBe('create')
  })

  it('saveConnection in edit mode omits password from patch when blank', async () => {
    const store = useDatabaseWorkspaceStore()
    store.applyAssets([], [editAsset])
    store.openEditConnectionModal('asset-42')
    // Leave password blank so the backend retains the stored credential.
    store.updateConnectionDraft({ name: 'prod-mysql-renamed' })

    await store.saveConnection(store.connectionDraft!)

    expect(mockApi.dbAssetUpdate).toHaveBeenCalledTimes(1)
    const call = mockApi.dbAssetUpdate.mock.calls[0][0]
    expect(call.id).toBe('asset-42')
    expect(call.patch.name).toBe('prod-mysql-renamed')
    expect(Object.prototype.hasOwnProperty.call(call.patch, 'password')).toBe(false)
  })
})

describe('table context-menu actions', () => {
  const asset = {
    id: 'a1',
    name: 'conn-1',
    group_id: null,
    group_name: null,
    db_type: 'mysql' as const,
    host: 'h',
    port: 3306,
    database_name: 'demo',
    schema_name: null,
    username: 'u',
    hasPassword: false,
    status: 'idle' as const
  }

  let mockApi: {
    dbAssetExecuteQuery: ReturnType<typeof vi.fn>
    dbAssetTableDdl: ReturnType<typeof vi.fn>
    dbAssetList: ReturnType<typeof vi.fn>
    dbAssetGroupList: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    mockApi = {
      dbAssetExecuteQuery: vi.fn().mockResolvedValue({ ok: true }),
      dbAssetTableDdl: vi.fn().mockResolvedValue({ ok: true, ddl: 'CREATE TABLE `t` (...)' }),
      dbAssetList: vi.fn().mockResolvedValue([asset]),
      dbAssetGroupList: vi.fn().mockResolvedValue([])
    }
    ;(window as unknown as { api: unknown }).api = mockApi
  })

  afterEach(() => {
    ;(window as unknown as { api?: unknown }).api = undefined
  })

  it('openSqlTabWithSelect opens a new SQL tab with SELECT * FROM <quoted> LIMIT 100 and proper context', () => {
    const store = useDatabaseWorkspaceStore()
    store.applyAssets([], [asset])

    store.openSqlTabWithSelect({
      assetId: 'a1',
      dbType: 'mysql',
      databaseName: 'demo',
      tableName: 'users'
    })

    const sqlTabs = store.tabs.filter((t) => t.kind === 'sql')
    expect(sqlTabs).toHaveLength(1)
    const last = store.tabs[store.tabs.length - 1]
    expect(last.kind).toBe('sql')
    expect(last.assetId).toBe('a1')
    expect(last.connectionId).toBe('conn-a1')
    expect(last.databaseName).toBe('demo')
    expect(last.sql).toBe('SELECT * FROM `users` LIMIT 100')
  })

  it('openSqlTabWithSelect qualifies PostgreSQL tables with schema and uses double-quotes', () => {
    const store = useDatabaseWorkspaceStore()
    store.applyAssets([], [{ ...asset, db_type: 'postgresql' }])

    store.openSqlTabWithSelect({
      assetId: 'a1',
      dbType: 'postgresql',
      databaseName: 'demo',
      schemaName: 'public',
      tableName: 'users'
    })

    const last = store.tabs[store.tabs.length - 1]
    expect(last.kind).toBe('sql')
    expect(last.sql).toBe('SELECT * FROM "public"."users" LIMIT 100')
    expect(last.schemaName).toBe('public')
  })

  it('truncateTable runs TRUNCATE TABLE via executeQuery and resolves ok on success', async () => {
    const store = useDatabaseWorkspaceStore()
    store.applyAssets([], [asset])

    const res = await store.truncateTable({
      assetId: 'a1',
      dbType: 'mysql',
      databaseName: 'demo',
      tableName: 'users'
    })

    expect(mockApi.dbAssetExecuteQuery).toHaveBeenCalledWith({
      id: 'a1',
      sql: 'TRUNCATE TABLE `users`',
      databaseName: 'demo'
    })
    expect(res.ok).toBe(true)
  })

  it('truncateTable surfaces errorMessage when the backend fails', async () => {
    const store = useDatabaseWorkspaceStore()
    store.applyAssets([], [asset])
    mockApi.dbAssetExecuteQuery.mockResolvedValueOnce({ ok: false, errorMessage: 'perm denied' })

    const res = await store.truncateTable({
      assetId: 'a1',
      dbType: 'mysql',
      databaseName: 'demo',
      tableName: 'users'
    })

    expect(res.ok).toBe(false)
    expect(res.errorMessage).toBe('perm denied')
  })

  it('dropTable closes open tabs referencing the dropped table and refreshes the connection children', async () => {
    const store = useDatabaseWorkspaceStore()
    store.applyAssets([], [asset])

    // Seed an SQL tab unrelated to the dropped table, plus a data-kind tab
    // bound to the exact table that will be dropped.
    await store.openQueryConsole('a1')
    const siblingSqlTabId = store.tabs[store.tabs.length - 1].id
    const droppedTabId = 'tab-data-users'
    store.tabs.push({
      id: droppedTabId,
      title: 'users',
      kind: 'data',
      assetId: 'a1',
      connectionId: 'conn-a1',
      databaseName: 'demo',
      tableName: 'users',
      sql: '',
      resultColumns: [],
      resultRows: []
    })
    store.setActiveTab(droppedTabId)

    const refreshSpy = vi.spyOn(store, 'refreshConnectionChildren').mockResolvedValue(undefined)

    const res = await store.dropTable({
      assetId: 'a1',
      dbType: 'mysql',
      databaseName: 'demo',
      tableName: 'users'
    })

    expect(mockApi.dbAssetExecuteQuery).toHaveBeenCalledWith({
      id: 'a1',
      sql: 'DROP TABLE `users`',
      databaseName: 'demo'
    })
    expect(res.ok).toBe(true)
    // Data tab bound to the dropped table must be gone; unrelated SQL tab stays.
    expect(store.tabs.some((t) => t.id === droppedTabId)).toBe(false)
    expect(store.tabs.some((t) => t.id === siblingSqlTabId)).toBe(true)
    // activeTabId must point at a surviving tab (the refresh should also fire).
    expect(store.tabs.some((t) => t.id === store.activeTabId)).toBe(true)
    expect(refreshSpy).toHaveBeenCalledWith('a1')
  })

  it('dropTable surfaces errorMessage on failure and does not drop tabs', async () => {
    const store = useDatabaseWorkspaceStore()
    store.applyAssets([], [asset])
    mockApi.dbAssetExecuteQuery.mockResolvedValueOnce({ ok: false, errorMessage: 'still referenced' })

    const tabCountBefore = store.tabs.length
    const res = await store.dropTable({
      assetId: 'a1',
      dbType: 'mysql',
      databaseName: 'demo',
      tableName: 'users'
    })

    expect(res.ok).toBe(false)
    expect(res.errorMessage).toBe('still referenced')
    expect(store.tabs.length).toBe(tabCountBefore)
  })

  it('fetchTableDdl returns the ddl string on success and forwards permission errors unchanged', async () => {
    const store = useDatabaseWorkspaceStore()
    store.applyAssets([], [asset])

    const okRes = await store.fetchTableDdl({
      assetId: 'a1',
      databaseName: 'demo',
      tableName: 'users'
    })
    expect(okRes.ok).toBe(true)
    if (okRes.ok) expect(okRes.ddl).toBe('CREATE TABLE `t` (...)')

    mockApi.dbAssetTableDdl.mockResolvedValueOnce({ ok: false, errorCode: 'permission', errorMessage: 'need CREATE FUNCTION' })
    const failRes = await store.fetchTableDdl({
      assetId: 'a1',
      databaseName: 'demo',
      tableName: 'users'
    })
    expect(failRes.ok).toBe(false)
    if (!failRes.ok) {
      expect(failRes.errorCode).toBe('permission')
      expect(failRes.errorMessage).toContain('CREATE FUNCTION')
    }
  })

  it('openDdlTab opens a new SQL tab titled "DDL: <table>" containing the ddl text', async () => {
    const store = useDatabaseWorkspaceStore()
    store.applyAssets([], [asset])

    const res = await store.openDdlTab({
      assetId: 'a1',
      dbType: 'mysql',
      databaseName: 'demo',
      tableName: 'users'
    })

    expect(res.ok).toBe(true)
    const last = store.tabs[store.tabs.length - 1]
    expect(last.kind).toBe('sql')
    expect(last.title).toBe('DDL: users')
    expect(last.sql).toBe('CREATE TABLE `t` (...)')
  })
})
