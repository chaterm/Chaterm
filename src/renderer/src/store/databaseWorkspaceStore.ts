import { defineStore } from 'pinia'
import { toRaw } from 'vue'
import type {
  DatabaseConnectionDraft,
  DatabaseTreeNode,
  DatabaseWorkspaceTab,
  DbColumnFilter,
  DbColumnSort,
  DirtyState,
  EditOp,
  SqlResultTab
} from '@views/components/Database/types'
import { buildMutations, DB_IDENTIFIER_RE } from './helpers/dbMutationBuilder'
import { toErrorMessage } from './databaseWorkspaceStore.helpers'
import { OVERVIEW_TAB_ID, buildOverviewTab, buildSampleTabFromTable, mockExplorerTree } from '@views/components/Database/mock/data'

/**
 * DbAsset DTO shape as it comes from the main process.
 * Mirrors `DbAssetDto` in `src/preload/index.d.ts`. Kept as a loose
 * renderer-side copy so the store compiles without importing preload types.
 */
interface DbAssetDtoLike {
  id: string
  name: string
  group_id?: string | null
  group_name: string | null
  db_type: 'mysql' | 'postgresql'
  host: string
  port: number
  database_name: string | null
  schema_name?: string | null
  username: string | null
  hasPassword: boolean
  status: 'idle' | 'testing' | 'connected' | 'failed'
  environment?: string | null
  ssl_mode?: string | null
}

interface DbAssetGroupDtoLike {
  id: string
  name: string
  parent_id: string | null
  sort_order: number
}

type DbApi = {
  dbAssetGroupList?: () => Promise<DbAssetGroupDtoLike[]>
  dbAssetGroupCreate?: (payload: {
    name: string
    parent_id?: string | null
    sort_order?: number
  }) => Promise<{ ok: boolean; group?: DbAssetGroupDtoLike | null; errorMessage?: string }>
  dbAssetGroupUpdate?: (payload: {
    id: string
    patch: { name?: string; parent_id?: string | null; sort_order?: number }
  }) => Promise<{ ok: boolean; group?: DbAssetGroupDtoLike | null; errorMessage?: string }>
  dbAssetGroupDelete?: (id: string) => Promise<{ ok: boolean; errorMessage?: string }>
  dbAssetList?: () => Promise<DbAssetDtoLike[]>
  dbAssetCreate?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; asset?: DbAssetDtoLike | null; errorMessage?: string }>
  dbAssetUpdate?: (payload: {
    id: string
    patch: Record<string, unknown>
  }) => Promise<{ ok: boolean; asset?: DbAssetDtoLike | null; errorMessage?: string }>
  dbAssetDelete?: (id: string) => Promise<{ ok: boolean; errorMessage?: string }>
  dbAssetTestConnection?: (payload: Record<string, unknown>) => Promise<{
    ok: boolean
    errorCode?: string
    errorMessage?: string
    serverVersion?: string
    latencyMs?: number
  }>
  dbAssetConnect?: (id: string) => Promise<{ ok: boolean; asset?: DbAssetDtoLike | null; errorMessage?: string }>
  dbAssetDisconnect?: (id: string) => Promise<{ ok: boolean; asset?: DbAssetDtoLike | null; errorMessage?: string }>
  dbAssetListChildren?: (payload: {
    id: string
    databaseName?: string
    schemaName?: string
    objectKind?: 'tables' | 'views' | 'functions' | 'procedures'
    tableName?: string
  }) => Promise<{
    ok: boolean
    databases?: string[]
    tables?: string[]
    objects?: string[]
    columns?: string[]
    errorMessage?: string
  }>
  dbAssetListSchemas?: (payload: {
    id: string
    databaseName: string
  }) => Promise<{ ok: boolean; schemas?: Array<{ name: string; isSystem: boolean }>; errorMessage?: string }>
  dbAssetExecuteQuery?: (payload: { id: string; sql: string; databaseName?: string; schemaName?: string }) => Promise<{
    ok: boolean
    errorMessage?: string
    columns?: string[]
    rows?: Array<Record<string, unknown>>
    rowCount?: number
    durationMs?: number
  }>
  dbAssetQueryTable?: (payload: {
    id: string
    database: string
    schema?: string
    table: string
    filters?: DbColumnFilter[]
    sort?: DbColumnSort | null
    whereRaw?: string | null
    orderByRaw?: string | null
    page: number
    pageSize: number
    withTotal?: boolean
  }) => Promise<{
    ok: boolean
    errorMessage?: string
    columns?: string[]
    rows?: Array<Record<string, unknown>>
    rowCount?: number
    durationMs?: number
    total?: number | null
    knownColumns?: string[]
  }>
  dbAssetCountTable?: (payload: {
    id: string
    database: string
    schema?: string
    table: string
    filters?: DbColumnFilter[]
    whereRaw?: string | null
  }) => Promise<{ ok: boolean; total?: number; durationMs?: number; errorMessage?: string }>
  dbAssetColumnDistinct?: (payload: {
    id: string
    database: string
    schema?: string
    table: string
    column: string
    limit?: number
  }) => Promise<{ ok: boolean; values?: unknown[]; errorMessage?: string }>
  dbAssetDetectPrimaryKey?: (payload: {
    id: string
    database: string
    schema?: string
    table: string
  }) => Promise<{ ok: boolean; primaryKey: string[] | null; errorMessage?: string }>
  dbAssetExecuteMutations?: (payload: {
    id: string
    database: string
    schema?: string
    statements: Array<{ sql: string; params: unknown[] }>
  }) => Promise<{ ok: boolean; errorMessage?: string; affected?: number; durationMs?: number }>
  dbAssetTableDdl?: (payload: {
    id: string
    database: string
    schema?: string
    table: string
  }) => Promise<{ ok: true; ddl: string } | { ok: false; errorCode: 'permission' | 'other'; errorMessage: string }>
}

function getApi(): DbApi | null {
  const anyGlobal = globalThis as unknown as { window?: { api?: unknown } }
  const api = anyGlobal.window?.api
  return (api as DbApi | undefined) ?? null
}

const DEFAULT_GROUP_ID = 'group-default'

const GROUP_LABELS: Record<string, string> = {
  [DEFAULT_GROUP_ID]: 'Default Group'
}

function connectionNodeFromAsset(asset: DbAssetDtoLike): DatabaseTreeNode {
  const childrenPlaceholder: DatabaseTreeNode[] = []
  const parentId = asset.group_id || (asset.group_name ? `legacy-group-${asset.group_name}` : DEFAULT_GROUP_ID)
  return {
    id: `conn-${asset.id}`,
    type: 'connection',
    name: asset.name,
    parentId,
    expanded: false,
    children: childrenPlaceholder,
    meta: {
      assetId: asset.id,
      dbType: asset.db_type,
      host: asset.host,
      port: asset.port,
      username: asset.username,
      hasPassword: asset.hasPassword,
      status: asset.status
    }
  }
}

function buildTreeFromAssets(groups: DbAssetGroupDtoLike[], assets: DbAssetDtoLike[]): DatabaseTreeNode[] {
  const defaultGroup: DatabaseTreeNode = {
    id: DEFAULT_GROUP_ID,
    type: 'group',
    name: GROUP_LABELS[DEFAULT_GROUP_ID],
    expanded: true,
    children: []
  }

  const explicitGroups: DatabaseTreeNode[] = groups.map((group) => ({
    id: group.id,
    type: 'group' as const,
    name: group.name,
    parentId: group.parent_id ?? undefined,
    expanded: true,
    children: []
  }))
  const explicitById = new Map(explicitGroups.map((group) => [group.id, group]))
  const rootGroups: DatabaseTreeNode[] = [defaultGroup]

  for (const group of explicitGroups) {
    const parent = group.parentId ? explicitById.get(group.parentId) : null
    if (parent) {
      parent.children = [...(parent.children ?? []), group]
    } else {
      rootGroups.push(group)
    }
  }

  const legacyGroupIds = new Set<string>()
  for (const asset of assets) {
    if (!asset.group_id && asset.group_name && asset.group_name.trim()) {
      legacyGroupIds.add(`legacy-group-${asset.group_name}`)
    }
  }

  const legacyGroups: DatabaseTreeNode[] = Array.from(legacyGroupIds)
    .filter((id) => id.startsWith('legacy-group-'))
    .map((id) => ({
      id,
      type: 'group' as const,
      name: id.replace(/^legacy-group-/, ''),
      expanded: true,
      children: []
    }))

  const tree: DatabaseTreeNode[] = [...rootGroups, ...legacyGroups]
  const indexById = new Map(tree.map((n) => [n.id, n]))
  for (const group of explicitGroups) indexById.set(group.id, group)
  for (const asset of assets) {
    const groupId = asset.group_id || (asset.group_name ? `legacy-group-${asset.group_name}` : DEFAULT_GROUP_ID)
    const group = indexById.get(groupId)
    if (!group) continue
    group.children = [...(group.children ?? []), connectionNodeFromAsset(asset)]
  }
  return tree
}

function findNode(nodes: DatabaseTreeNode[], id: string): DatabaseTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

/**
 * Recursively locate a connection node by its asset id. Needed because
 * groups can nest sub-groups, so a flat one-level scan of the tree misses
 * connections that live inside nested groups.
 */
export function findConnectionByAssetId(nodes: DatabaseTreeNode[], assetId: string): DatabaseTreeNode | null {
  for (const node of nodes) {
    const nodeAssetId = (node.meta as { assetId?: string } | undefined)?.assetId
    if (node.type === 'connection' && nodeAssetId === assetId) return node
    if (node.children && node.children.length > 0) {
      const found = findConnectionByAssetId(node.children, assetId)
      if (found) return found
    }
  }
  return null
}

/**
 * Depth-first collect every connection node anywhere in the tree. Used by
 * the SQL toolbar's connection picker so connections inside nested groups
 * (e.g. "Default Group > Team A > pg-prod") surface alongside root-level
 * ones. A flat `group -> connection` scan would hide them.
 */
export function collectConnections(nodes: DatabaseTreeNode[]): DatabaseTreeNode[] {
  const out: DatabaseTreeNode[] = []
  const walk = (list: DatabaseTreeNode[]): void => {
    for (const node of list) {
      if (node.type === 'connection') out.push(node)
      if (node.children && node.children.length > 0) walk(node.children)
    }
  }
  walk(nodes)
  return out
}

function findConnectionAncestor(nodes: DatabaseTreeNode[], startId: string): DatabaseTreeNode | null {
  let current = findNode(nodes, startId)
  while (current) {
    if (current.type === 'connection') return current
    const parentId = current.parentId
    current = parentId ? findNode(nodes, parentId) : null
  }
  return null
}

function findDatabaseAncestor(nodes: DatabaseTreeNode[], startId: string): DatabaseTreeNode | null {
  let current = findNode(nodes, startId)
  while (current) {
    if (current.type === 'database') return current
    const parentId = current.parentId
    current = parentId ? findNode(nodes, parentId) : null
  }
  return null
}

function filterTree(nodes: DatabaseTreeNode[], keyword: string): DatabaseTreeNode[] {
  const trimmed = keyword.trim().toLowerCase()
  if (!trimmed) return nodes
  const walk = (list: DatabaseTreeNode[]): DatabaseTreeNode[] => {
    const out: DatabaseTreeNode[] = []
    for (const node of list) {
      const matchesSelf = node.name.toLowerCase().includes(trimmed)
      const filteredChildren = node.children ? walk(node.children) : undefined
      if (matchesSelf || (filteredChildren && filteredChildren.length > 0)) {
        out.push({
          ...node,
          expanded: true,
          children: filteredChildren && filteredChildren.length > 0 ? filteredChildren : node.children
        })
      }
    }
    return out
  }
  return walk(nodes)
}

function cloneDraft(draft: DatabaseConnectionDraft): DatabaseConnectionDraft {
  return { ...draft }
}

/**
 * Build a stable rowKey from the row's primary-key values. Matches the
 * contract consumed by `dbMutationBuilder.buildMutations` — the rowKey is
 * `JSON.stringify(pk.map((c) => row[c]))` so it can be decoded back into
 * an ordered parameter array for WHERE clauses.
 */
export function computeRowKey(pk: string[] | null | undefined, row: Record<string, unknown>): string | null {
  if (!pk || pk.length === 0) return null
  const values = pk.map((col) => row[col])
  return JSON.stringify(values)
}

/**
 * Create a fresh empty dirty state. Exported for tests.
 */
export function makeEmptyDirtyState(): DirtyState {
  return {
    newRows: [],
    deletedRowKeys: new Set<string>(),
    updatedCells: new Map<string, Record<string, unknown>>(),
    originalRows: new Map<string, Record<string, unknown>>()
  }
}

function ensureDirty(tab: DatabaseWorkspaceTab): DirtyState {
  if (!tab.dirtyState) tab.dirtyState = makeEmptyDirtyState()
  return tab.dirtyState
}

function ensureUndoStack(tab: DatabaseWorkspaceTab): EditOp[] {
  if (!tab.undoStack) tab.undoStack = []
  return tab.undoStack
}

// Try to resolve an i18n message for "no primary key" warning. In tests
// vue-i18n may not be mounted, so we fall back to a plain english string.
function resolveNoPkWarning(): string {
  try {
    // Lazy require to avoid hard dependency during tests

    const mod = require('@/locales') as { default?: { global?: { t?: (k: string) => string } } }
    const t = mod?.default?.global?.t
    if (typeof t === 'function') return t('database.noPkWarning')
  } catch {
    // ignore — fall through to default
  }
  return 'This table has no primary key detected. Committing these edits may affect multiple rows unexpectedly. Continue?'
}

function confirmNoPk(): boolean {
  const g = globalThis as unknown as { window?: { confirm?: (m: string) => boolean } }
  const fn = g.window?.confirm
  if (typeof fn === 'function') return !!fn(resolveNoPkWarning())
  // No window.confirm in the current environment (SSR/test): assume user
  // accepted so the mutation path is still testable end-to-end.
  return true
}

/**
 * Quote a SQL identifier (database / schema / table / column) for the given
 * dialect. MySQL uses backticks; PostgreSQL uses double-quotes. Embedded
 * quote characters are escaped by doubling (the standard escape for both
 * dialects). Callers must still validate the identifier shape when they
 * need defense-in-depth — this helper is about producing correct syntax,
 * not about deciding whether the identifier is allowed.
 */
export function quoteIdent(name: string, dbType: 'mysql' | 'postgresql'): string {
  if (dbType === 'postgresql') {
    return `"${String(name).replace(/"/g, '""')}"`
  }
  return `\`${String(name).replace(/`/g, '``')}\``
}

/**
 * Build a fully-qualified reference for a table, including schema when the
 * dialect supports it. PG: `"schema"."table"`. MySQL: `` `table` `` (MySQL
 * has no schema layer; `databaseName` is addressed via the connection, not
 * the identifier).
 */
export function buildQualifiedTable(dbType: 'mysql' | 'postgresql', schemaName: string | undefined, tableName: string): string {
  const quotedTable = quoteIdent(tableName, dbType)
  if (dbType === 'postgresql' && schemaName) {
    return `${quoteIdent(schemaName, dbType)}.${quotedTable}`
  }
  return quotedTable
}

// Pick a sensible default schema for a PG database node in the tree after
// the user switches database in the SQL toolbar. Prefers `public` when it
// exists (PG's conventional user schema), otherwise returns undefined so
// the toolbar's Run stays disabled until the user picks one explicitly.
// Returns undefined for MySQL connections or when schemas have not loaded
// yet.
function pickDefaultSchema(tree: DatabaseTreeNode[], assetId: string | undefined, databaseName: string | undefined): string | undefined {
  if (!assetId || !databaseName) return undefined
  const conn = findConnectionByAssetId(tree, assetId)
  if (!conn) return undefined
  const meta = conn.meta as { dbType?: string } | undefined
  if (meta?.dbType !== 'postgresql') return undefined
  const db = (conn.children ?? []).find((c) => c.type === 'database' && c.name === databaseName)
  if (!db) return undefined
  const schemas = (db.children ?? []).filter((c) => c.type === 'schema')
  if (schemas.length === 0) return undefined
  const pub = schemas.find((s) => s.name === 'public')
  return pub?.name
}

interface DatabaseWorkspaceState {
  groups: DbAssetGroupDtoLike[]
  assets: DbAssetDtoLike[]
  tree: DatabaseTreeNode[]
  tabs: DatabaseWorkspaceTab[]
  activeTabId: string
  selectedNodeId: string | null
  searchKeyword: string
  connectionModalVisible: boolean
  connectionModalMode: 'create' | 'edit'
  connectionDraft: DatabaseConnectionDraft | null
  connectionStatuses: Record<string, DbAssetDtoLike['status']>
  loading: boolean
  lastError: string | null
  lastTestResult: { ok: boolean; message: string } | null
  // Monotonic allocator for SqlResultTab.seq; never decremented.
  resultSeq: number
}

export const useDatabaseWorkspaceStore = defineStore('databaseWorkspace', {
  state: (): DatabaseWorkspaceState => ({
    groups: [],
    assets: [],
    tree: mockExplorerTree,
    tabs: [buildOverviewTab()],
    activeTabId: OVERVIEW_TAB_ID,
    selectedNodeId: null,
    searchKeyword: '',
    connectionModalVisible: false,
    connectionModalMode: 'create',
    connectionDraft: null,
    connectionStatuses: {},
    loading: false,
    lastError: null,
    lastTestResult: null,
    resultSeq: 0
  }),
  getters: {
    filteredTree(state): DatabaseTreeNode[] {
      return filterTree(state.tree, state.searchKeyword)
    },
    activeTab(state): DatabaseWorkspaceTab | undefined {
      return state.tabs.find((tab) => tab.id === state.activeTabId)
    }
  },
  actions: {
    setSearchKeyword(keyword: string) {
      this.searchKeyword = keyword
    },
    setSelectedNode(id: string | null) {
      this.selectedNodeId = id
    },
    async loadAssetsFromBackend() {
      const api = getApi()
      if (!api?.dbAssetList) return
      this.loading = true
      this.lastError = null
      try {
        const [groups, assets] = await Promise.all([api.dbAssetGroupList ? api.dbAssetGroupList() : Promise.resolve([]), api.dbAssetList()])
        this.applyAssets(groups ?? [], assets ?? [])
      } catch (e) {
        this.lastError = (e as Error).message
      } finally {
        this.loading = false
      }
    },
    applyAssets(groups: DbAssetGroupDtoLike[], assets: DbAssetDtoLike[]) {
      this.groups = groups
      this.assets = assets
      this.tree = buildTreeFromAssets(groups, assets)
      // Persisted asset.status is stale after a restart — the main process has
      // no live connections yet. Preserve any in-memory statuses set during
      // this session (e.g. from an ongoing connect) and default the rest to
      // 'idle' so the UI reflects the actual runtime state.
      const statuses: Record<string, DbAssetDtoLike['status']> = {}
      for (const a of assets) {
        statuses[a.id] = this.connectionStatuses[a.id] ?? 'idle'
      }
      this.connectionStatuses = statuses
    },
    openNewSqlTab() {
      // Derive the next "Query N" number from currently open SQL tabs.
      // Using max-existing-index + 1 (not tabs.length) keeps new titles
      // unique even after the user closes an earlier Query tab.
      const existingQueryNums = this.tabs
        .filter((t) => t.kind === 'sql')
        .map((t) => /^Query (\d+)$/.exec(t.title)?.[1])
        .filter((n): n is string => typeof n === 'string')
        .map((n) => parseInt(n, 10))
        .filter((n) => !Number.isNaN(n))
      const nextN = existingQueryNums.length === 0 ? 1 : Math.max(...existingQueryNums) + 1

      // Context inheritance: active tab first, then the selected tree node.
      let assetId: string | undefined
      let databaseName: string | undefined
      let connectionId: string | undefined
      const active = this.activeTab
      const inheritedFromActive = !!(active && active.kind !== 'overview')
      if (inheritedFromActive) {
        assetId = active!.assetId
        databaseName = active!.databaseName
        connectionId = active!.connectionId
      }
      if (!inheritedFromActive && this.selectedNodeId) {
        const connNode = findConnectionAncestor(this.tree, this.selectedNodeId)
        const dbNode = findDatabaseAncestor(this.tree, this.selectedNodeId)
        const meta = connNode?.meta as { assetId?: string } | undefined
        assetId = meta?.assetId
        databaseName = dbNode?.name
        connectionId = connNode?.id
      }

      const tab: DatabaseWorkspaceTab = {
        id: `tab-sql-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: `Query ${nextN}`,
        kind: 'sql',
        connectionId,
        assetId,
        databaseName,
        sql: '',
        resultColumns: [],
        resultRows: [],
        resultTabs: [],
        activeResultTabId: 'overview',
        history: []
      }
      this.tabs.push(tab)
      this.activeTabId = tab.id
    },
    /**
     * Overwrite the connection + database context of an existing SQL tab.
     * Noop for non-sql tabs or unknown tabIds.
     */
    setSqlTabContext(tabId: string, assetId: string | undefined, databaseName: string | undefined) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'sql') return
      const prevAsset = tab.assetId
      const prevDb = tab.databaseName
      tab.assetId = assetId
      tab.databaseName = databaseName
      // When the connection or database changes, reset the PG schema to a
      // sensible default ('public' when it exists in the freshly-loaded
      // schema list, otherwise undefined). No-op for MySQL tabs since they
      // never carry a schemaName.
      if (prevAsset !== assetId || prevDb !== databaseName) {
        tab.schemaName = pickDefaultSchema(this.tree, assetId, databaseName)
      }
    },
    // Update just the PG schema on a SQL tab. Trust the caller's value
    // (including undefined to clear). Noop for non-sql tabs.
    setSqlTabSchema(tabId: string, schemaName: string | undefined) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'sql') return
      tab.schemaName = schemaName
    },
    /**
     * Switch which result panel is visible within a SQL tab.
     * Accepts the sentinel string 'overview' or the id of a live result tab.
     * Noop for non-sql tabs or unknown result tabs.
     */
    setActiveResultTab(tabId: string, resultTabId: string) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'sql') return
      if (resultTabId === 'overview' || (tab.resultTabs ?? []).some((r) => r.id === resultTabId)) {
        tab.activeResultTabId = resultTabId
      }
    },
    /**
     * Close a result tab from a SQL tab. The Overview sentinel cannot be closed.
     * If the closed tab was active, fall back to the previous result tab, then
     * the next, else the Overview sentinel. The matching history entry's
     * `resultTabId` is nulled so Overview rows can render as disabled.
     */
    closeResultTab(tabId: string, resultTabId: string) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'sql' || resultTabId === 'overview') return
      const list = tab.resultTabs ?? []
      const index = list.findIndex((r) => r.id === resultTabId)
      if (index === -1) return
      list.splice(index, 1)
      if (tab.activeResultTabId === resultTabId) {
        const fallback = list[index - 1] ?? list[index]
        tab.activeResultTabId = fallback ? fallback.id : 'overview'
      }
      for (const h of tab.history ?? []) {
        if (h.resultTabId === resultTabId) h.resultTabId = null
      }
    },
    /**
     * Run SQL on the currently active SQL tab. The `mode` is informational;
     * the caller has already resolved the actual SQL text from its editor
     * (full text / selection / up-to-cursor). This action owns the lifecycle
     * of the matching result tab: it creates the tab in 'running' state,
     * dispatches the query via the main-process driver, then patches the
     * same tab by id when the result arrives. Concurrent runs each get their
     * own result tab; id-anchored patching means ordering of completions
     * does not matter.
     *
     * Context-missing and empty-SQL cases set lastError and do NOT create a
     * result tab or history entry.
     */

    async runSqlOnActiveTab(_mode: 'all' | 'selection' | 'toCursor' | 'currentStatement' | 'explain', sqlText: string) {
      const tab = this.activeTab
      if (!tab || tab.kind !== 'sql') return
      if (!tab.assetId || !tab.databaseName) {
        this.lastError = 'sqlNoContext'
        return
      }
      if (!sqlText || sqlText.trim().length === 0) {
        this.lastError = 'sqlEmpty'
        return
      }
      const api = getApi()
      if (!api?.dbAssetExecuteQuery) {
        this.lastError = 'not connected'
        return
      }

      const seq = ++this.resultSeq
      const idx = (tab.resultTabs?.length ?? 0) + 1
      const preview = sqlText.replace(/\s+/g, ' ').trim().slice(0, 40)
      const startedAt = Date.now()
      const resultTabId = `res-${seq}`
      const initial: SqlResultTab = {
        id: resultTabId,
        seq,
        idx,
        title: `#${seq}-${idx} ${preview}`,
        sql: sqlText,
        status: 'running',
        columns: [],
        rows: [],
        rowCount: 0,
        durationMs: 0,
        error: null,
        startedAt
      }
      if (!tab.resultTabs) tab.resultTabs = []
      if (!tab.history) tab.history = []
      tab.resultTabs.push(initial)
      tab.activeResultTabId = resultTabId

      // Helper: replace the result tab by id with a fresh object so Vue's
      // reactive proxy picks up the whole mutation. We intentionally avoid
      // field-level writes via a local variable — those would target the
      // raw object that predates the proxy wrap and the UI would not
      // re-render until an unrelated re-render refreshed the reference.
      const patchResultTab = (patch: Partial<SqlResultTab>) => {
        const list = tab.resultTabs ?? []
        const i = list.findIndex((r) => r.id === resultTabId)
        if (i === -1) return
        list[i] = { ...list[i], ...patch }
      }

      let result
      try {
        // For PG, pass the selected schema down so the main-process handler
        // can issue `SET search_path` on the same session before the user
        // SQL. Non-PG connections simply ignore schemaName.
        result = await api.dbAssetExecuteQuery({
          id: String(tab.assetId),
          sql: String(sqlText),
          databaseName: String(tab.databaseName),
          schemaName: tab.schemaName ? String(tab.schemaName) : undefined
        })
      } catch (err) {
        // Defensive extraction: drivers occasionally throw non-Error values
        const message = toErrorMessage(err)
        patchResultTab({ status: 'error', error: message })
        tab.history.push({
          resultTabId,
          seq,
          idx,
          sql: sqlText,
          status: 'error',
          message: `failure: ${message}`,
          durationMs: 0,
          startedAt
        })
        return
      }

      // Defend against silent IPC failures: the main process handler always
      // intends to return `{ ok, ... }`, but if the renderer-side bridge or a
      // future refactor lets `undefined` through, we must NOT crash here and
      // leave the result tab stuck in 'running'. Treat it as an error.
      if (!result || typeof result !== 'object') {
        const message = 'ipc error: empty response'
        patchResultTab({ status: 'error', error: message })
        tab.history.push({
          resultTabId,
          seq,
          idx,
          sql: sqlText,
          status: 'error',
          message: `failure: ${message}`,
          durationMs: 0,
          startedAt
        })
        return
      }

      if (result.ok) {
        const columns = result.columns ?? []
        const rows = result.rows ?? []
        const rowCount = result.rowCount ?? rows.length
        const durationMs = result.durationMs ?? 0
        patchResultTab({ status: 'ok', columns, rows, rowCount, durationMs })
        tab.history.push({
          resultTabId,
          seq,
          idx,
          sql: sqlText,
          status: 'ok',
          message: rowCount > 0 ? `successful: Affected rows ${rowCount}` : 'successful',
          durationMs,
          startedAt,
          rowCount
        })
      } else {
        const message = result.errorMessage ?? 'query failed'
        patchResultTab({ status: 'error', error: message })
        tab.history.push({
          resultTabId,
          seq,
          idx,
          sql: sqlText,
          status: 'error',
          message: `failure: ${message}`,
          durationMs: 0,
          startedAt
        })
      }
    },
    openSqlTab(nodeId: string) {
      const node = findNode(this.tree, nodeId)
      if (!node || node.type !== 'table') return
      const tabId = `tab-table-${node.id}`
      const existing = this.tabs.find((tab) => tab.id === tabId)
      if (existing) {
        this.activeTabId = existing.id
        return
      }
      const connectionNode = findConnectionAncestor(this.tree, node.id)
      const tab = buildSampleTabFromTable({
        tabId,
        connectionId: connectionNode?.id,
        tableName: node.name
      })
      this.tabs.push(tab)
      this.activeTabId = tab.id
    },
    /**
     * Open a "table data" tab and run a first-page query against the real
     * backend. No SQL editor — this is the default behavior when a user
     * double-clicks a table in the explorer.
     */
    async openTableDataTab(tableNodeId: string) {
      const node = findNode(this.tree, tableNodeId)
      if (!node || node.type !== 'table') return
      const tabId = `tab-data-${node.id}`
      const existing = this.tabs.find((tab) => tab.id === tabId)
      if (existing) {
        this.activeTabId = existing.id
        return
      }
      const connectionNode = findConnectionAncestor(this.tree, node.id)
      const databaseNode = findDatabaseAncestor(this.tree, node.id)
      const assetMeta = connectionNode?.meta as { assetId?: string } | undefined
      const assetId = assetMeta?.assetId
      const databaseName = databaseNode?.name
      // Schema is populated on PG table nodes during loadSchemaObjects; MySQL
      // table nodes leave it undefined.
      const tableMeta = node.meta as { schemaName?: string } | undefined
      const schemaName = tableMeta?.schemaName

      const tab: DatabaseWorkspaceTab = {
        id: tabId,
        title: node.name,
        kind: 'data',
        connectionId: connectionNode?.id,
        assetId,
        databaseName,
        schemaName,
        tableName: node.name,
        sql: '',
        resultColumns: [],
        resultRows: [],
        loading: true,
        error: null,
        page: 1,
        pageSize: 100,
        filters: [],
        sort: null,
        whereRaw: null,
        orderByRaw: null,
        total: null,
        knownColumns: [],
        // Editing state — initialised so reactive props stay defined for the UI.
        primaryKey: null,
        dirtyState: {
          newRows: [],
          deletedRowKeys: new Set<string>(),
          updatedCells: new Map<string, Record<string, unknown>>(),
          originalRows: new Map<string, Record<string, unknown>>()
        },
        undoStack: [],
        selectedRowKey: null
      }
      this.tabs.push(tab)
      this.activeTabId = tab.id
      // Detect the primary key in parallel with the first data load so the
      // toolbar can enable editing as soon as the table opens.
      await Promise.all([this.reloadTableData(tab.id), this.detectPrimaryKey(tab.id)])
    },
    /**
     * Run the table query for a `kind: 'data'` tab using its current
     * page/pageSize/filters/sort state. Call this after any of those
     * change. The total-row COUNT(*) query is only sent when `withTotal`
     * is true — users trigger it explicitly by clicking the Total label.
     */
    async reloadTableData(tabId: string, withTotal = false) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'data') return
      const api = getApi()
      if (!api?.dbAssetQueryTable || !tab.assetId || !tab.databaseName || !tab.tableName) {
        tab.loading = false
        tab.error = 'not connected'
        return
      }
      tab.loading = true
      tab.error = null
      let result
      try {
        // Electron IPC uses structured clone; Vue reactive Proxies are not
        // cloneable. Build a fully plain payload by (1) pulling raw values
        // out of reactive refs with `toRaw`, and (2) spreading them into
        // primitives / fresh arrays / fresh objects. Do NOT pass tab.filters
        // or tab.sort directly even after toRaw — Pinia re-wraps nested
        // objects on read in some cases, so reconstruct them.
        const rawFilters = toRaw(tab.filters) ?? []
        const rawSort = toRaw(tab.sort) ?? null
        const plainFilters = rawFilters.map((f) => ({
          column: String(f.column),
          operator: f.operator,
          value: f.value == null ? undefined : String(f.value),
          values: f.values ? f.values.map((v) => String(v)) : undefined
        }))
        const plainSort = rawSort ? { column: String(rawSort.column), direction: rawSort.direction } : null
        const payload = {
          id: String(tab.assetId),
          database: String(tab.databaseName),
          schema: tab.schemaName ? String(tab.schemaName) : undefined,
          table: String(tab.tableName),
          filters: plainFilters,
          sort: plainSort,
          whereRaw: tab.whereRaw == null ? null : String(tab.whereRaw),
          orderByRaw: tab.orderByRaw == null ? null : String(tab.orderByRaw),
          page: Number(tab.page ?? 1),
          pageSize: Number(tab.pageSize ?? 100),
          withTotal: !!withTotal
        }
        result = await api.dbAssetQueryTable(payload)
      } catch (err) {
        tab.loading = false
        tab.error = toErrorMessage(err)
        return
      }
      if (result.ok) {
        tab.resultColumns = result.columns ?? []
        tab.resultRows = result.rows ?? []
        tab.rowCount = result.rowCount ?? tab.resultRows.length
        tab.durationMs = result.durationMs
        if (result.knownColumns && result.knownColumns.length > 0) tab.knownColumns = result.knownColumns
        if (withTotal) tab.total = result.total ?? null
        // Snapshot the freshly loaded rows so UPDATE/DELETE can diff against
        // stable originals. Must run AFTER resultRows is assigned.
        this.loadOriginalRows(tabId)
      } else {
        tab.error = result.errorMessage ?? 'query failed'
        tab.resultColumns = []
        tab.resultRows = []
      }
      tab.loading = false
    },
    /**
     * Update only the total row-count for a data tab. Does NOT re-fetch the
     * current page or touch `tab.loading`; the table stays exactly as it is.
     * Users trigger this by clicking the "Total" label in the toolbar.
     */
    async refreshTableTotal(tabId: string) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'data') return
      const api = getApi()
      if (!api?.dbAssetCountTable || !tab.assetId || !tab.databaseName || !tab.tableName) return
      const rawFilters = toRaw(tab.filters) ?? []
      const plainFilters = rawFilters.map((f) => ({
        column: String(f.column),
        operator: f.operator,
        value: f.value == null ? undefined : String(f.value),
        values: f.values ? f.values.map((v) => String(v)) : undefined
      }))
      try {
        const result = await api.dbAssetCountTable({
          id: String(tab.assetId),
          database: String(tab.databaseName),
          schema: tab.schemaName ? String(tab.schemaName) : undefined,
          table: String(tab.tableName),
          filters: plainFilters,
          whereRaw: tab.whereRaw == null ? null : String(tab.whereRaw)
        })
        if (result.ok) tab.total = result.total ?? null
        else this.lastError = result.errorMessage ?? 'count failed'
      } catch (err) {
        this.lastError = toErrorMessage(err)
      }
    },
    /**
     * Fetch distinct values for one column of the data tab's table. Used by
     * the column-filter popover (chat2db-style discrete value picker).
     */
    async loadColumnDistinct(tabId: string, column: string, limit = 1000): Promise<string[]> {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'data') return []
      const api = getApi()
      if (!api?.dbAssetColumnDistinct || !tab.assetId || !tab.databaseName || !tab.tableName) return []
      try {
        const result = await api.dbAssetColumnDistinct({
          id: String(tab.assetId),
          database: String(tab.databaseName),
          schema: tab.schemaName ? String(tab.schemaName) : undefined,
          table: String(tab.tableName),
          column: String(column),
          limit
        })
        if (!result.ok) {
          this.lastError = result.errorMessage ?? null
          return []
        }
        return (result.values ?? []).map((v) => (v === null || v === undefined ? '' : String(v)))
      } catch (err) {
        this.lastError = toErrorMessage(err)
        return []
      }
    },
    setTablePage(tabId: string, page: number) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'data') return
      tab.page = Math.max(1, Math.floor(page))
      this.reloadTableData(tabId)
    },
    setTablePageSize(tabId: string, pageSize: number) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'data') return
      tab.pageSize = pageSize
      tab.page = 1
      this.reloadTableData(tabId)
    },
    setTableSort(tabId: string, column: string, direction: 'asc' | 'desc' | null) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'data') return
      tab.sort = direction ? { column, direction } : null
      tab.page = 1
      this.reloadTableData(tabId)
    },
    setTableFilter(tabId: string, filter: DbColumnFilter | null, forColumn: string) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'data') return
      const existing = tab.filters ?? []
      const without = existing.filter((f) => f.column !== forColumn)
      tab.filters = filter ? [...without, filter] : without
      tab.page = 1
      this.reloadTableData(tabId)
    },
    setTableWhereRaw(tabId: string, whereRaw: string | null) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'data') return
      tab.whereRaw = whereRaw
      tab.page = 1
      this.reloadTableData(tabId)
    },
    setTableOrderByRaw(tabId: string, orderByRaw: string | null) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'data') return
      tab.orderByRaw = orderByRaw
      tab.page = 1
      this.reloadTableData(tabId)
    },
    // --- Editing / undo / commit (data tabs only) ---

    /**
     * Detect the primary key for this data tab's table. Called when the tab
     * is opened. Result is stashed on the tab so commit can choose the
     * pk-based or no-pk fallback strategy without re-detecting. A null
     * result means "no primary key detected" and is not an error.
     */
    async detectPrimaryKey(tabId: string) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'data') return
      const api = getApi()
      if (!api?.dbAssetDetectPrimaryKey || !tab.assetId || !tab.databaseName || !tab.tableName) {
        tab.primaryKey = null
        return
      }
      try {
        const result = await api.dbAssetDetectPrimaryKey({
          id: String(tab.assetId),
          database: String(tab.databaseName),
          schema: tab.schemaName ? String(tab.schemaName) : undefined,
          table: String(tab.tableName)
        })
        if (result.ok) {
          tab.primaryKey = result.primaryKey ?? null
        } else {
          tab.primaryKey = null
          this.lastError = result.errorMessage ?? null
        }
      } catch (err) {
        tab.primaryKey = null
        this.lastError = toErrorMessage(err)
      }
    },

    /**
     * Snapshot the current page of rows into `dirtyState.originalRows`.
     * Called after each successful page/filter/sort reload so that UPDATE/
     * DELETE can build WHERE clauses against a stable original value set.
     * Does not clear dirty edits — callers who want to discard edits should
     * invoke `clearDirty` separately.
     */
    loadOriginalRows(tabId: string) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'data') return
      const dirty = ensureDirty(tab)
      const next = new Map<string, Record<string, unknown>>()
      const pk = tab.primaryKey ?? null
      for (const row of tab.resultRows) {
        const key = computeRowKey(pk, row)
        if (key !== null) next.set(key, { ...row })
      }
      dirty.originalRows = next
    },

    /**
     * Append an empty row to the end of the displayed page. Records an
     * 'add' op on the undo stack keyed by the generated tmpId so it can
     * later be popped.
     */
    addNewRow(tabId: string): string | null {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'data') return null
      const dirty = ensureDirty(tab)
      const undoStack = ensureUndoStack(tab)
      const tmpId = `__tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const columns = (tab.knownColumns && tab.knownColumns.length > 0 ? tab.knownColumns : tab.resultColumns) ?? []
      const values: Record<string, unknown> = {}
      for (const c of columns) values[c] = null
      dirty.newRows.push({ tmpId, values })
      undoStack.push({ kind: 'add', tmpId })
      return tmpId
    },

    /**
     * Delete either a new (locally-added) row by tmpId, or an existing row
     * identified by its rowKey. New-row deletion is symmetrical with
     * `addNewRow` and rewinds the undo stack (no delete op is recorded for
     * a row that never existed server-side). Existing-row deletion is
     * recorded as a 'delete' op with a snapshot so it can be restored.
     */
    deleteRow(tabId: string, rowKeyOrTmpId: string) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'data') return
      const dirty = ensureDirty(tab)
      const undoStack = ensureUndoStack(tab)

      // Case 1: tmpId of a locally-added row -> remove it and its matching
      // 'add' op from the undo stack. No persisted delete op necessary.
      const newIdx = dirty.newRows.findIndex((r) => r.tmpId === rowKeyOrTmpId)
      if (newIdx !== -1) {
        dirty.newRows.splice(newIdx, 1)
        const addOpIdx = undoStack.findIndex((op) => op.kind === 'add' && op.tmpId === rowKeyOrTmpId)
        if (addOpIdx !== -1) undoStack.splice(addOpIdx, 1)
        return
      }

      // Case 2: rowKey of an existing (server-side) row
      if (dirty.deletedRowKeys.has(rowKeyOrTmpId)) return
      const snapshot = dirty.originalRows.get(rowKeyOrTmpId)
      if (!snapshot) return
      dirty.deletedRowKeys.add(rowKeyOrTmpId)
      // Drop any in-flight cell edits for this row — the whole row is gone.
      dirty.updatedCells.delete(rowKeyOrTmpId)
      undoStack.push({ kind: 'delete', rowKey: rowKeyOrTmpId, snapshot: { ...snapshot } })
    },

    /**
     * Update a single cell of an existing (server-side) row. Records the
     * inverse in the undo stack so undo can restore `oldVal`. If the user
     * edits the same cell back to its original value we remove it from
     * `updatedCells` to avoid spurious UPDATEs.
     */
    updateCell(tabId: string, rowKey: string, col: string, newVal: unknown) {
      if (!DB_IDENTIFIER_RE.test(col)) {
        this.lastError = `Invalid column identifier: ${col}`
        return
      }
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'data') return
      const dirty = ensureDirty(tab)
      const undoStack = ensureUndoStack(tab)
      const snapshot = dirty.originalRows.get(rowKey)
      if (!snapshot) return
      const oldVal = Object.prototype.hasOwnProperty.call(dirty.updatedCells.get(rowKey) ?? {}, col)
        ? (dirty.updatedCells.get(rowKey) as Record<string, unknown>)[col]
        : snapshot[col]
      if (oldVal === newVal) return
      const pending = dirty.updatedCells.get(rowKey) ?? {}
      const nextPending = { ...pending, [col]: newVal }
      // If new value matches original snapshot, drop the column entirely.
      if (newVal === snapshot[col]) {
        delete nextPending[col]
      }
      if (Object.keys(nextPending).length === 0) {
        dirty.updatedCells.delete(rowKey)
      } else {
        dirty.updatedCells.set(rowKey, nextPending)
      }
      undoStack.push({ kind: 'update', rowKey, col, oldVal, newVal })
    },

    /**
     * Edit a cell of a locally-added (not yet committed) row. Does NOT go
     * through the undo stack — undo on a never-committed row restores the
     * row via the 'add' op's inverse (remove row entirely).
     */
    updateNewRowCell(tabId: string, tmpId: string, col: string, newVal: unknown) {
      if (!DB_IDENTIFIER_RE.test(col)) {
        this.lastError = `Invalid column identifier: ${col}`
        return
      }
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'data') return
      const dirty = ensureDirty(tab)
      const row = dirty.newRows.find((r) => r.tmpId === tmpId)
      if (!row) return
      row.values = { ...row.values, [col]: newVal }
    },

    /**
     * Pop the last edit op and invert it. No-op on empty stack.
     */
    undo(tabId: string) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'data') return
      const dirty = ensureDirty(tab)
      const undoStack = ensureUndoStack(tab)
      const op = undoStack.pop()
      if (!op) return
      if (op.kind === 'add') {
        const idx = dirty.newRows.findIndex((r) => r.tmpId === op.tmpId)
        if (idx !== -1) dirty.newRows.splice(idx, 1)
        return
      }
      if (op.kind === 'delete') {
        dirty.deletedRowKeys.delete(op.rowKey)
        return
      }
      if (op.kind === 'update') {
        const snapshot = dirty.originalRows.get(op.rowKey)
        if (!snapshot) return
        const pending = dirty.updatedCells.get(op.rowKey) ?? {}
        const nextPending = { ...pending }
        if (op.oldVal === snapshot[op.col]) {
          delete nextPending[op.col]
        } else {
          nextPending[op.col] = op.oldVal
        }
        if (Object.keys(nextPending).length === 0) {
          dirty.updatedCells.delete(op.rowKey)
        } else {
          dirty.updatedCells.set(op.rowKey, nextPending)
        }
      }
    },

    selectRow(tabId: string, rowKey: string | null) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'data') return
      tab.selectedRowKey = rowKey
    },

    /**
     * Discard all pending edits for this tab. Keeps the originalRows
     * snapshot intact so subsequent edits still have a baseline.
     */
    clearDirty(tabId: string) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'data') return
      const originalRows = tab.dirtyState?.originalRows ?? new Map()
      tab.dirtyState = {
        newRows: [],
        deletedRowKeys: new Set<string>(),
        updatedCells: new Map<string, Record<string, unknown>>(),
        originalRows
      }
      tab.undoStack = []
    },

    /**
     * Produce the SQL mutation list for the current dirty state. Exposed
     * as a public action so the UI / tests can preview what's about to be
     * executed. Throws if identifiers are invalid — caller is expected to
     * surface `lastError` to the user.
     */
    buildDirtyMutations(tabId: string): Array<{ sql: string; params: unknown[] }> {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'data') return []
      if (!tab.assetId || !tab.databaseName || !tab.tableName) return []
      const dirty = tab.dirtyState
      if (!dirty) return []
      const connNode = findConnectionAncestor(this.tree, tab.connectionId ?? '')
      const dbType = ((connNode?.meta as { dbType?: string } | undefined)?.dbType ?? 'mysql') as 'mysql' | 'postgresql'
      return buildMutations({
        dbType,
        database: tab.databaseName,
        schema: tab.schemaName,
        table: tab.tableName,
        primaryKey: tab.primaryKey ?? null,
        newRows: dirty.newRows,
        deletedRowKeys: Array.from(dirty.deletedRowKeys),
        updatedCells: Array.from(dirty.updatedCells.entries()),
        originalRows: dirty.originalRows,
        knownColumns: tab.knownColumns ?? tab.resultColumns ?? []
      })
    },

    /**
     * Translate the dirty state into parametrized SQL and dispatch it to the
     * main-process driver. On success, clear the dirty state and reload the
     * current page. On failure, preserve the dirty state so the user can
     * inspect / retry. If no primary key is detected, prompt the user
     * first — committing without a PK is potentially dangerous.
     */
    async commitDirty(tabId: string) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'data') return { ok: false as const, errorMessage: 'no-data-tab' }
      const api = getApi()
      if (!api?.dbAssetExecuteMutations || !tab.assetId || !tab.databaseName || !tab.tableName) {
        return { ok: false as const, errorMessage: 'not connected' }
      }
      const pk = tab.primaryKey ?? null
      if (pk === null) {
        if (!confirmNoPk()) return { ok: false as const, errorMessage: 'cancelled' }
      }
      let statements: Array<{ sql: string; params: unknown[] }>
      try {
        statements = this.buildDirtyMutations(tabId)
      } catch (err) {
        this.lastError = toErrorMessage(err)
        return { ok: false as const, errorMessage: toErrorMessage(err) }
      }
      if (statements.length === 0) {
        return { ok: true as const, affected: 0 }
      }
      try {
        const result = await api.dbAssetExecuteMutations({
          id: String(tab.assetId),
          database: String(tab.databaseName),
          schema: tab.schemaName ? String(tab.schemaName) : undefined,
          statements
        })
        if (result.ok) {
          this.clearDirty(tabId)
          await this.reloadTableData(tabId)
          this.loadOriginalRows(tabId)
          return { ok: true as const, affected: result.affected ?? statements.length, durationMs: result.durationMs }
        }
        // Preserve dirty state on failure so the user can retry.
        this.lastError = result.errorMessage ?? 'commit failed'
        return { ok: false as const, errorMessage: result.errorMessage ?? 'commit failed' }
      } catch (err) {
        this.lastError = toErrorMessage(err)
        return { ok: false as const, errorMessage: toErrorMessage(err) }
      }
    },

    // --- Legacy SQL-tab helpers (kept for existing tests and the sql kind) ---
    async runQueryForTab(tabId: string) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab) return
      const api = getApi()
      if (!api?.dbAssetExecuteQuery || !tab.assetId) {
        tab.loading = false
        tab.error = 'not connected'
        return
      }
      tab.loading = true
      tab.error = null
      const result = await api.dbAssetExecuteQuery({
        id: tab.assetId,
        sql: tab.sql,
        databaseName: tab.databaseName
      })
      if (result.ok) {
        tab.resultColumns = result.columns ?? []
        tab.resultRows = result.rows ?? []
        tab.rowCount = result.rowCount ?? tab.resultRows.length
        tab.durationMs = result.durationMs
      } else {
        tab.error = result.errorMessage ?? 'query failed'
        tab.resultColumns = []
        tab.resultRows = []
      }
      tab.loading = false
    },
    setActiveTab(tabId: string) {
      if (this.tabs.some((tab) => tab.id === tabId)) {
        this.activeTabId = tabId
      }
    },
    closeTab(tabId: string) {
      if (tabId === OVERVIEW_TAB_ID) return
      const index = this.tabs.findIndex((tab) => tab.id === tabId)
      if (index === -1) return
      this.tabs.splice(index, 1)
      if (this.activeTabId === tabId) {
        const fallback = this.tabs[index] ?? this.tabs[index - 1] ?? this.tabs[0]
        this.activeTabId = fallback ? fallback.id : OVERVIEW_TAB_ID
      }
    },
    openConnectionModal(draft?: Partial<DatabaseConnectionDraft>) {
      this.connectionModalMode = 'create'
      this.connectionModalVisible = true
      this.lastTestResult = null
      // Default port follows the chosen dbType so users don't have to change
      // it when switching between MySQL (3306) and PostgreSQL (5432). An
      // explicit port in the incoming draft still wins.
      const dbType = draft?.dbType ?? 'MySQL'
      const defaultPort = dbType === 'PostgreSQL' ? 5432 : 3306
      this.connectionDraft = {
        id: draft?.id ?? `conn-${Date.now()}`,
        name: draft?.name ?? '',
        groupId: draft?.groupId,
        env: draft?.env ?? 'Development',
        dbType,
        host: draft?.host ?? '127.0.0.1',
        port: draft?.port ?? defaultPort,
        authentication: draft?.authentication ?? 'UserAndPassword',
        user: draft?.user ?? '',
        password: draft?.password ?? '',
        database: draft?.database ?? '',
        url: draft?.url ?? '',
        sslMode: draft?.sslMode
      }
    },
    /**
     * Populate the connection modal in edit mode with fields from an existing
     * asset. The draft's `id` is the real asset id (not a synthesized
     * `conn-*`) so `saveConnection` can address the correct row via
     * `dbAssetUpdate`. The password is intentionally left blank so save
     * paths can distinguish "keep existing password" (blank) from "set a new
     * password" (non-empty).
     */
    openEditConnectionModal(assetId: string) {
      const asset = this.assets.find((a) => a.id === assetId)
      if (!asset) return
      const draft: DatabaseConnectionDraft = {
        id: asset.id,
        name: asset.name,
        groupId: asset.group_id ?? undefined,
        env: asset.environment ?? 'Development',
        dbType: asset.db_type === 'mysql' ? 'MySQL' : 'PostgreSQL',
        host: asset.host,
        port: asset.port,
        authentication: 'UserAndPassword',
        user: asset.username ?? '',
        password: '',
        database: asset.database_name ?? '',
        url: '',
        sslMode: asset.ssl_mode ?? undefined
      }
      this.connectionDraft = draft
      this.connectionModalVisible = true
      this.connectionModalMode = 'edit'
      this.lastTestResult = null
    },
    closeConnectionModal() {
      this._resetConnectionModal()
      this.lastTestResult = null
    },
    _resetConnectionModal() {
      this.connectionModalVisible = false
      this.connectionModalMode = 'create'
      this.connectionDraft = null
    },
    updateConnectionDraft(patch: Partial<DatabaseConnectionDraft>) {
      if (!this.connectionDraft) return
      this.connectionDraft = { ...this.connectionDraft, ...patch }
    },
    validateDraft(draft: DatabaseConnectionDraft | null): { valid: boolean; errors: string[] } {
      const errors: string[] = []
      if (!draft) return { valid: false, errors: ['Draft is empty'] }
      if (!draft.name.trim()) errors.push('name')
      if (!draft.host.trim()) errors.push('host')
      if (!draft.port || draft.port <= 0) errors.push('port')
      if (!draft.user.trim()) errors.push('user')
      return { valid: errors.length === 0, errors }
    },
    draftToPayload(draft: DatabaseConnectionDraft) {
      // JSON round-trip to strip any Vue reactive proxy wrapping — Electron
      // IPC structured-clone rejects Pinia-tracked values.
      return JSON.parse(
        JSON.stringify({
          name: draft.name,
          db_type: draft.dbType === 'MySQL' ? 'mysql' : 'postgresql',
          group_id: draft.groupId || null,
          host: draft.host,
          port: draft.port,
          username: draft.user || null,
          password: draft.password || null,
          database_name: draft.database || null,
          environment: draft.env || null,
          ssl_mode: draft.sslMode || null
        })
      )
    },
    async testConnectionFromDraft(draft: DatabaseConnectionDraft) {
      const api = getApi()
      if (!api?.dbAssetTestConnection) {
        this.lastTestResult = { ok: true, message: 'validated-locally' }
        return { ok: true }
      }
      const result = await api.dbAssetTestConnection(this.draftToPayload(draft))
      this.lastTestResult = {
        ok: !!result.ok,
        message: result.ok ? (result.serverVersion ?? 'ok') : (result.errorMessage ?? 'failed')
      }
      return result
    },
    /**
     * Save the current draft. If the main-process API is available, persist
     * through it and refresh the tree. Otherwise fall back to adding a local
     * mock node so renderer-only tests and demos still work.
     *
     * In edit mode the draft's id points at the real asset; we dispatch an
     * update via `dbAssetUpdate` and omit the password field when the user
     * left it blank so the stored credential is preserved.
     */
    async saveConnection(draft: DatabaseConnectionDraft) {
      const api = getApi()
      if (this.connectionModalMode === 'edit') {
        if (api?.dbAssetUpdate) {
          const patch = this.draftToPayload(draft) as Record<string, unknown>
          // Blank password means "do not change" — strip it from the patch so
          // the backend retains the existing credential.
          if (!draft.password) {
            delete patch.password
          }
          const result = await api.dbAssetUpdate({ id: draft.id, patch })
          if (!result.ok) {
            this.lastError = result.errorMessage ?? 'update failed'
            return cloneDraft(draft)
          }
          await this.loadAssetsFromBackend()
          this._resetConnectionModal()
          return cloneDraft(draft)
        }
        // Fallback when the IPC is unavailable: patch the in-memory tree
        // node so renderer-only tests see the update.
        const connNode = findConnectionByAssetId(this.tree, draft.id)
        if (connNode) {
          connNode.name = draft.name || connNode.name
          connNode.meta = {
            ...(connNode.meta ?? {}),
            dbType: draft.dbType === 'MySQL' ? 'mysql' : 'postgresql',
            host: draft.host,
            port: draft.port,
            username: draft.user
          }
        }
        this._resetConnectionModal()
        return cloneDraft(draft)
      }
      if (api?.dbAssetCreate) {
        const result = await api.dbAssetCreate(this.draftToPayload(draft))
        if (!result.ok) {
          this.lastError = result.errorMessage ?? 'create failed'
          return cloneDraft(draft)
        }
        await this.loadAssetsFromBackend()
        this._resetConnectionModal()
        return cloneDraft(draft)
      }
      // Fallback for tests and renderer-only demos.
      const node: DatabaseTreeNode = {
        id: draft.id,
        type: 'connection',
        name: draft.name || 'new-connection',
        parentId: draft.groupId || DEFAULT_GROUP_ID,
        expanded: false,
        meta: { dbType: draft.dbType, host: draft.host, port: draft.port },
        children: []
      }
      const group = this.tree.find((n) => n.id === (draft.groupId || DEFAULT_GROUP_ID))
      if (group) {
        group.children = [...(group.children ?? []), node]
        group.expanded = true
      } else {
        this.tree = [...this.tree, node]
      }
      this._resetConnectionModal()
      return cloneDraft(draft)
    },
    async createGroup(name: string, parentId: string | null = null): Promise<string | undefined> {
      const api = getApi()
      if (!api?.dbAssetGroupCreate) return undefined
      const result = await api.dbAssetGroupCreate({
        name,
        parent_id: parentId,
        sort_order: 0
      })
      if (!result.ok) {
        this.lastError = result.errorMessage ?? 'create group failed'
        return undefined
      }
      await this.loadAssetsFromBackend()
      return result.group?.id
    },
    async moveGroup(id: string, parentId: string | null) {
      const api = getApi()
      if (!api?.dbAssetGroupUpdate) return
      const result = await api.dbAssetGroupUpdate({
        id,
        patch: { parent_id: parentId }
      })
      if (!result.ok) {
        this.lastError = result.errorMessage ?? 'move group failed'
        return
      }
      await this.loadAssetsFromBackend()
    },
    async renameGroup(id: string, name: string) {
      const api = getApi()
      if (!api?.dbAssetGroupUpdate) return
      const result = await api.dbAssetGroupUpdate({
        id,
        patch: { name }
      })
      if (!result.ok) {
        this.lastError = result.errorMessage ?? 'rename group failed'
        return
      }
      await this.loadAssetsFromBackend()
    },
    async deleteGroup(id: string) {
      const api = getApi()
      if (!api?.dbAssetGroupDelete) return
      const result = await api.dbAssetGroupDelete(id)
      if (!result.ok) {
        this.lastError = result.errorMessage ?? 'delete group failed'
        return
      }
      await this.loadAssetsFromBackend()
    },
    async deleteAsset(assetId: string) {
      const api = getApi()
      if (!api?.dbAssetDelete) return
      const result = await api.dbAssetDelete(assetId)
      if (result.ok) await this.loadAssetsFromBackend()
    },
    async connectAsset(assetId: string) {
      const api = getApi()
      if (!api?.dbAssetConnect) return { ok: false }
      this.connectionStatuses = { ...this.connectionStatuses, [assetId]: 'testing' }
      const result = await api.dbAssetConnect(assetId)
      if (result.ok && result.asset) {
        this.connectionStatuses = { ...this.connectionStatuses, [assetId]: result.asset.status }
        await this.loadConnectedTree(assetId)
      } else {
        this.connectionStatuses = { ...this.connectionStatuses, [assetId]: 'failed' }
        this.lastError = result.errorMessage ?? null
      }
      return result
    },
    async disconnectAsset(assetId: string) {
      const api = getApi()
      if (!api?.dbAssetDisconnect) return
      const result = await api.dbAssetDisconnect(assetId)
      if (result.ok) {
        this.connectionStatuses = { ...this.connectionStatuses, [assetId]: 'idle' }
        // Remove loaded schema children so reconnect reloads a fresh tree.
        const connNode = findConnectionByAssetId(this.tree, assetId)
        if (connNode) connNode.children = []
      }
    },
    async loadConnectedTree(assetId: string) {
      const api = getApi()
      if (!api?.dbAssetListChildren) return
      const connNode = findConnectionByAssetId(this.tree, assetId)
      if (!connNode) return
      const dbResult = await api.dbAssetListChildren({ id: assetId })
      if (!dbResult.ok) {
        this.lastError = dbResult.errorMessage ?? null
        return
      }
      const databases = dbResult.databases ?? []
      connNode.children = databases.map((name) => ({
        id: `db-${assetId}-${name}`,
        type: 'database' as const,
        name,
        parentId: connNode.id,
        expanded: false,
        children: []
      }))
      connNode.expanded = true
    },
    async loadDatabaseTables(assetId: string, databaseName: string) {
      const api = getApi()
      if (!api?.dbAssetListChildren) return
      const connNode = findConnectionByAssetId(this.tree, assetId)
      if (!connNode) return
      const dbNode = (connNode.children ?? []).find((d) => d.name === databaseName)
      if (!dbNode) return

      // Postgres: databases contain schemas; each schema exposes four object
      // folders (tables/views/functions/procedures). MySQL has no schema
      // layer, so it stays on the legacy database -> tables path below.
      const dbType = (connNode.meta as { dbType?: string } | undefined)?.dbType
      if (dbType === 'postgresql' && api?.dbAssetListSchemas) {
        const schemaResult = await api.dbAssetListSchemas({ id: assetId, databaseName })
        if (!schemaResult.ok) {
          this.lastError = schemaResult.errorMessage ?? null
          return
        }
        const kinds: Array<'tables' | 'views' | 'functions' | 'procedures'> = ['tables', 'views', 'functions', 'procedures']
        dbNode.children = (schemaResult.schemas ?? []).map((schema) => {
          const schemaNodeId = `schema-${assetId}-${databaseName}-${schema.name}`
          return {
            id: schemaNodeId,
            type: 'schema' as const,
            name: schema.name,
            parentId: dbNode.id,
            expanded: false,
            children: kinds.map((kind) => ({
              id: `${schemaNodeId}-${kind}`,
              type: 'folder' as const,
              name: kind,
              parentId: schemaNodeId,
              expanded: false,
              children: [],
              meta: { assetId, databaseName, schemaName: schema.name, objectKind: kind, loaded: false }
            })),
            meta: { assetId, databaseName, schemaName: schema.name, isSystem: schema.isSystem }
          }
        })
        dbNode.expanded = true
        return
      }

      const result = await api.dbAssetListChildren({ id: assetId, databaseName })
      if (!result.ok) {
        this.lastError = result.errorMessage ?? null
        return
      }
      const tableFolderId = `${dbNode.id}-tables`
      dbNode.children = [
        {
          id: tableFolderId,
          type: 'folder' as const,
          name: 'tables',
          parentId: dbNode.id,
          expanded: true,
          children: (result.tables ?? []).map((t) => ({
            id: `table-${assetId}-${databaseName}-${t}`,
            type: 'table' as const,
            name: t,
            parentId: tableFolderId,
            expanded: false,
            children: [],
            meta: { assetId, databaseName }
          }))
        }
      ]
      dbNode.expanded = true
    },
    /**
     * Lazy-load objects (tables/views/functions/procedures) for a PG schema
     * folder on first expand. The folder node's meta carries the asset id,
     * database name, schema name, and object kind.
     */
    async loadSchemaObjects(folderNodeId: string) {
      const folderNode = findNode(this.tree, folderNodeId)
      if (!folderNode || folderNode.type !== 'folder') return
      const meta = folderNode.meta as
        | {
            assetId?: string
            databaseName?: string
            schemaName?: string
            objectKind?: 'tables' | 'views' | 'functions' | 'procedures'
            loaded?: boolean
          }
        | undefined
      if (!meta?.assetId || !meta.databaseName || !meta.schemaName || !meta.objectKind) return
      if (meta.loaded) return
      const api = getApi()
      if (!api?.dbAssetListChildren) return
      const result = await api.dbAssetListChildren({
        id: meta.assetId,
        databaseName: meta.databaseName,
        schemaName: meta.schemaName,
        objectKind: meta.objectKind
      })
      if (!result.ok) {
        this.lastError = result.errorMessage ?? null
        return
      }
      const names = result.objects ?? []
      if (meta.objectKind === 'tables' || meta.objectKind === 'views') {
        folderNode.children = names.map((t) => ({
          id: `${folderNode.id}-${t}`,
          type: 'table' as const,
          name: t,
          parentId: folderNode.id,
          expanded: false,
          children: [],
          meta: { assetId: meta.assetId, databaseName: meta.databaseName, schemaName: meta.schemaName }
        }))
      } else {
        // Functions/procedures are rendered as leaf nodes with no children.
        folderNode.children = names.map((n) => ({
          id: `${folderNode.id}-${n}`,
          type: 'column' as const,
          name: n,
          parentId: folderNode.id,
          meta: { assetId: meta.assetId, databaseName: meta.databaseName, schemaName: meta.schemaName, kind: meta.objectKind }
        }))
      }
      folderNode.meta = { ...meta, loaded: true }
    },
    /**
     * Lazy-load columns for a table node on first expand. Columns are
     * rendered as flat leaves directly under the table. The meta on the
     * table node (populated when the table was built in loadDatabaseTables)
     * supplies the assetId/databaseName needed for the IPC call.
     */
    async loadTableColumns(tableNodeId: string) {
      const tableNode = findNode(this.tree, tableNodeId)
      if (!tableNode || tableNode.type !== 'table') return
      const meta = tableNode.meta as { assetId?: string; databaseName?: string; schemaName?: string } | undefined
      const assetId = meta?.assetId
      const databaseName = meta?.databaseName
      if (!assetId || !databaseName) return
      const api = getApi()
      if (!api?.dbAssetListChildren) return
      const result = await api.dbAssetListChildren({
        id: assetId,
        databaseName,
        schemaName: meta?.schemaName,
        tableName: tableNode.name
      })
      if (!result.ok) {
        this.lastError = result.errorMessage ?? null
        return
      }
      tableNode.children = (result.columns ?? []).map((col) => ({
        id: `col-${assetId}-${databaseName}-${tableNode.name}-${col}`,
        type: 'column' as const,
        name: col,
        parentId: tableNode.id
      }))
    },

    // --- Connection context-menu actions ---

    /**
     * Open a new SQL tab bound to the targeted connection. Reuses
     * `openNewSqlTab` to preserve the Query-N numbering and blank SQL
     * scaffolding, then overwrites the tab's connection context to the
     * explicitly requested asset so the new tab doesn't inherit from the
     * currently active unrelated tab.
     */
    async openQueryConsole(connectionId: string) {
      const asset = this.assets.find((a) => a.id === connectionId)
      if (!asset) return
      this.openNewSqlTab()
      const last = this.tabs[this.tabs.length - 1]
      if (last?.kind === 'sql') {
        last.assetId = connectionId
        last.connectionId = `conn-${connectionId}`
        last.databaseName = asset.database_name ?? undefined
      }
    },

    /**
     * Execute a raw CREATE DATABASE statement via the existing query IPC.
     * Refreshes the connection's child nodes on success so the new database
     * becomes visible without reloading the entire asset list.
     */
    async createDatabase(connectionId: string, sql: string): Promise<{ ok: boolean; errorMessage?: string }> {
      const api = getApi()
      if (!api?.dbAssetExecuteQuery) return { ok: false, errorMessage: 'not connected' }
      const result = await api.dbAssetExecuteQuery({ id: connectionId, sql })
      if (!result?.ok) return { ok: false, errorMessage: result?.errorMessage ?? 'execute failed' }
      await this.refreshConnectionChildren(connectionId)
      return { ok: true }
    },

    /**
     * Return just the connection's display name for clipboard copy.
     */
    copyConnectionName(connectionId: string): string {
      return this.assets.find((x) => x.id === connectionId)?.name ?? ''
    },

    /**
     * Move a connection to a different group (or to root when targetGroupId
     * is null). Reloads the full asset list on success so the tree reflects
     * the new placement.
     */
    async moveConnectionToGroup(connectionId: string, targetGroupId: string | null) {
      const api = getApi()
      if (!api?.dbAssetUpdate) return { ok: false as const, errorMessage: 'not connected' }
      const result = await api.dbAssetUpdate({ id: connectionId, patch: { group_id: targetGroupId } })
      if (result?.ok) {
        await this.loadAssetsFromBackend()
      } else if (result?.errorMessage) {
        this.lastError = result.errorMessage
      }
      return result
    },

    /**
     * Drop the cached children under the connection node and, if it is
     * currently expanded, re-trigger the lazy loader so fresh data is
     * fetched. Leaves the node collapsed state alone otherwise — the next
     * user expansion will trigger a fresh load via the regular path.
     */
    async refreshConnectionChildren(connectionId: string) {
      const connNode = findConnectionByAssetId(this.tree, connectionId)
      if (!connNode) return
      const wasExpanded = connNode.expanded === true
      connNode.children = []
      if (wasExpanded) {
        await this.loadConnectedTree(connectionId)
      }
    },

    /**
     * Delete the connection. Closes any workspace tabs bound to the asset
     * first so stale context cannot linger, then fixes `activeTabId` so it
     * points at a surviving tab, then calls the delete IPC and reloads.
     */
    async removeConnection(connectionId: string) {
      // Close any open tabs bound to this asset.
      this.tabs = this.tabs.filter((t) => t.assetId !== connectionId)
      if (!this.tabs.some((t) => t.id === this.activeTabId)) {
        this.activeTabId = this.tabs[0]?.id ?? OVERVIEW_TAB_ID
      }
      const api = getApi()
      if (!api?.dbAssetDelete) return { ok: false as const, errorMessage: 'not connected' }
      const result = await api.dbAssetDelete(connectionId)
      if (result?.ok) {
        await this.loadAssetsFromBackend()
      } else if (result?.errorMessage) {
        this.lastError = result.errorMessage
      }
      return result
    },

    // --- Table context-menu actions -----------------------------------------

    /**
     * Open a new SQL tab pre-populated with `SELECT * FROM <table> LIMIT 100`
     * bound to the targeted connection + database. Intended for the "Query
     * console" entry of the table context menu — the user gets an editable
     * query they can tweak rather than the read-only data grid.
     */
    openSqlTabWithSelect(ctx: { assetId: string; dbType: 'mysql' | 'postgresql'; databaseName: string; schemaName?: string; tableName: string }) {
      this.openNewSqlTab()
      const last = this.tabs[this.tabs.length - 1]
      if (!last || last.kind !== 'sql') return
      last.assetId = ctx.assetId
      last.connectionId = `conn-${ctx.assetId}`
      last.databaseName = ctx.databaseName
      last.schemaName = ctx.schemaName
      const qualified = buildQualifiedTable(ctx.dbType, ctx.schemaName, ctx.tableName)
      last.sql = `SELECT * FROM ${qualified} LIMIT 100`
    },

    /**
     * Fetch the DDL statement for a single table via the backend. Resolves a
     * discriminated union so callers can distinguish permission errors from
     * generic failures without parsing the error message.
     */
    async fetchTableDdl(ctx: {
      assetId: string
      databaseName: string
      schemaName?: string
      tableName: string
    }): Promise<{ ok: true; ddl: string } | { ok: false; errorCode: 'permission' | 'other'; errorMessage: string }> {
      const api = getApi()
      if (!api?.dbAssetTableDdl) {
        return { ok: false, errorCode: 'other', errorMessage: 'not connected' }
      }
      try {
        const result = await api.dbAssetTableDdl({
          id: String(ctx.assetId),
          database: String(ctx.databaseName),
          schema: ctx.schemaName ? String(ctx.schemaName) : undefined,
          table: String(ctx.tableName)
        })
        if (!result) {
          return { ok: false, errorCode: 'other', errorMessage: 'ipc error: empty response' }
        }
        return result
      } catch (err) {
        const message = toErrorMessage(err)
        return { ok: false, errorCode: 'other', errorMessage: message }
      }
    },

    /**
     * Open a read-only SQL tab showing the DDL for the table. Reuses the SQL
     * workspace scaffolding; the title is prefixed with "DDL:" so it is
     * visually distinct from user-authored queries. Failure is surfaced to
     * the caller so the UI can render a message.
     */
    async openDdlTab(ctx: {
      assetId: string
      dbType: 'mysql' | 'postgresql'
      databaseName: string
      schemaName?: string
      tableName: string
    }): Promise<{ ok: true } | { ok: false; errorCode: 'permission' | 'other'; errorMessage: string }> {
      const result = await this.fetchTableDdl(ctx)
      if (!result.ok) return result
      this.openNewSqlTab()
      const last = this.tabs[this.tabs.length - 1]
      if (!last || last.kind !== 'sql') return { ok: true }
      last.assetId = ctx.assetId
      last.connectionId = `conn-${ctx.assetId}`
      last.databaseName = ctx.databaseName
      last.schemaName = ctx.schemaName
      last.tableName = ctx.tableName
      last.title = `DDL: ${ctx.tableName}`
      last.sql = result.ddl
      return { ok: true }
    },

    async _executeTableMutation(
      ctx: { assetId: string; databaseName: string; sql: string },
      defaultErrorMessage: string
    ): Promise<{ ok: boolean; errorMessage?: string }> {
      const api = getApi()
      if (!api?.dbAssetExecuteQuery) return { ok: false, errorMessage: 'not connected' }
      try {
        const result = await api.dbAssetExecuteQuery({
          id: String(ctx.assetId),
          sql: ctx.sql,
          databaseName: String(ctx.databaseName)
        })
        if (!result?.ok) return { ok: false, errorMessage: result?.errorMessage ?? defaultErrorMessage }
        return { ok: true }
      } catch (err) {
        return { ok: false, errorMessage: toErrorMessage(err) }
      }
    },

    /**
     * Run `TRUNCATE TABLE <qualified>` against the connection. On success,
     * reload every open data tab that references the same (assetId, database,
     * schema, table) tuple so the grid reflects the empty table.
     */
    async truncateTable(ctx: {
      assetId: string
      dbType: 'mysql' | 'postgresql'
      databaseName: string
      schemaName?: string
      tableName: string
    }): Promise<{ ok: boolean; errorMessage?: string }> {
      const qualified = buildQualifiedTable(ctx.dbType, ctx.schemaName, ctx.tableName)
      const res = await this._executeTableMutation(
        { assetId: ctx.assetId, databaseName: ctx.databaseName, sql: `TRUNCATE TABLE ${qualified}` },
        'truncate failed'
      )
      if (!res.ok) return res
      const affectedTabs = this.tabs.filter(
        (t) =>
          t.kind === 'data' &&
          t.assetId === ctx.assetId &&
          t.databaseName === ctx.databaseName &&
          (t.schemaName ?? undefined) === (ctx.schemaName ?? undefined) &&
          t.tableName === ctx.tableName
      )
      for (const tab of affectedTabs) {
        await this.reloadTableData(tab.id)
      }
      return { ok: true }
    },

    /**
     * Run `DROP TABLE <qualified>` against the connection. On success, close
     * every open tab (both data and sql) that references the dropped table
     * and refresh the schema subtree so the explorer no longer lists it.
     */
    async dropTable(ctx: {
      assetId: string
      dbType: 'mysql' | 'postgresql'
      databaseName: string
      schemaName?: string
      tableName: string
    }): Promise<{ ok: boolean; errorMessage?: string }> {
      const qualified = buildQualifiedTable(ctx.dbType, ctx.schemaName, ctx.tableName)
      const res = await this._executeTableMutation(
        { assetId: ctx.assetId, databaseName: ctx.databaseName, sql: `DROP TABLE ${qualified}` },
        'drop failed'
      )
      if (!res.ok) return res
      const survivors = this.tabs.filter(
        (t) =>
          !(
            t.assetId === ctx.assetId &&
            t.databaseName === ctx.databaseName &&
            (t.schemaName ?? undefined) === (ctx.schemaName ?? undefined) &&
            t.tableName === ctx.tableName
          )
      )
      this.tabs = survivors
      if (!this.tabs.some((t) => t.id === this.activeTabId)) {
        this.activeTabId = this.tabs[0]?.id ?? OVERVIEW_TAB_ID
      }
      // Reuse the existing lazy loader instead of a bespoke "reload-only-this-schema"
      // path — cheap and keeps one source of truth for subtree state.
      await this.refreshConnectionChildren(ctx.assetId)
      return { ok: true }
    }
  }
})
