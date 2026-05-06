export type DatabaseTreeNodeType = 'group' | 'connection' | 'database' | 'schema' | 'folder' | 'table' | 'column'

export interface DatabaseTreeNode {
  id: string
  type: DatabaseTreeNodeType
  name: string
  icon?: string
  parentId?: string
  expanded?: boolean
  children?: DatabaseTreeNode[]
  meta?: Record<string, unknown>
}

export type DatabaseType =
  | 'MySQL'
  | 'Oracle'
  | 'PostgreSQL'
  | 'SQLServer'
  | 'SQLite'
  | 'MariaDB'
  | 'ClickHouse'
  | 'DM'
  | 'Presto'
  | 'DB2'
  | 'OceanBase'
  | 'Hive'
  | 'KingBase'
  | 'MongoDB'
  | 'Timeplus'
  | 'H2'
export type DatabaseAuthentication = 'UserAndPassword'

export interface DatabaseConnectionDraft {
  id: string
  name: string
  groupId?: string
  env: string
  dbType: DatabaseType
  host: string
  port: number
  authentication: DatabaseAuthentication
  user: string
  password: string
  database?: string
  url?: string
  // Postgres-only today: SSL mode (disable | require | verify-ca | verify-full).
  // MySQL driver accepts the same key but the UI only exposes it for PG.
  sslMode?: string
}

export type DatabaseWorkspaceTabKind = 'overview' | 'data' | 'sql'

export type DbFilterOperator = 'eq' | 'neq' | 'like' | 'in' | 'isnull' | 'notnull'

export interface DbColumnFilter {
  column: string
  operator: DbFilterOperator
  value?: string
  values?: string[]
}

export interface DbColumnSort {
  column: string
  direction: 'asc' | 'desc'
}

// Edit operation recorded for the undo stack of a data tab. Only applies to
// kind='data' tabs. Each op is the inverse-applicable record of a single
// user-driven change so undo() can walk the stack and revert.
export type EditOp =
  | { kind: 'add'; tmpId: string }
  | { kind: 'delete'; rowKey: string; snapshot: Record<string, unknown> }
  | { kind: 'update'; rowKey: string; col: string; oldVal: unknown; newVal: unknown }

// Per-tab dirty state. `newRows` are rows the user added locally and have not
// yet been committed. `deletedRowKeys` are rowKeys (JSON.stringify of pk
// values) of original rows marked for deletion. `updatedCells` maps a rowKey
// to the partial object of changed columns. `originalRows` stores snapshots
// of the current page keyed by rowKey so that commit can build WHERE clauses
// (especially the no-primary-key fallback path).
export interface DirtyState {
  newRows: Array<{ tmpId: string; values: Record<string, unknown> }>
  deletedRowKeys: Set<string>
  updatedCells: Map<string, Record<string, unknown>>
  originalRows: Map<string, Record<string, unknown>>
}

export interface DatabaseWorkspaceTab {
  id: string
  title: string
  kind: DatabaseWorkspaceTabKind
  connectionId?: string
  assetId?: string
  databaseName?: string
  /** Schema the table lives in (Postgres only). Undefined for MySQL tabs. */
  schemaName?: string
  tableName?: string
  sql: string
  resultColumns: string[]
  resultRows: Array<Record<string, unknown>>
  loading?: boolean
  error?: string | null
  durationMs?: number
  rowCount?: number

  // Server-side paging / sort / filter state (only populated for kind='data')
  knownColumns?: string[]
  filters?: DbColumnFilter[]
  sort?: DbColumnSort | null
  whereRaw?: string | null
  orderByRaw?: string | null
  page?: number
  pageSize?: number
  total?: number | null

  // Editing state (only populated for kind='data')
  primaryKey?: string[] | null
  dirtyState?: DirtyState
  undoStack?: EditOp[]
  selectedRowKey?: string | null
  resultTabs?: SqlResultTab[]
  activeResultTabId?: string | null
  history?: SqlExecutionHistoryEntry[]
}

/**
 * A single SQL execution result attached to a `kind: 'sql'` workspace tab.
 * - `seq` is monotonic store-wide (allocated from `DatabaseWorkspaceState.resultSeq`),
 *   while `idx` is the 1-based display ordinal within the owning tab.
 * - `status` includes a `'running'` state because the result tab is created
 *   up-front and exists while the query is in flight.
 * - `error: string | null` is always present; it is null unless `status === 'error'`.
 */
export interface SqlResultTab {
  id: string
  seq: number
  idx: number
  title: string
  sql: string
  status: 'running' | 'ok' | 'error'
  columns: string[]
  rows: Array<Record<string, unknown>>
  rowCount: number
  durationMs: number
  error: string | null
  startedAt: number
}

/**
 * A single entry in the per-tab SQL execution history. Records terminal
 * states only (`status: 'ok' | 'error'`, never `'running'`).
 * `resultTabId` is nulled when the corresponding result tab is closed.
 */
export interface SqlExecutionHistoryEntry {
  resultTabId: string | null
  seq: number
  idx: number
  sql: string
  status: 'ok' | 'error'
  message: string
  durationMs: number
  startedAt: number
  rowCount?: number
}

/**
 * Action kinds emitted by the connection (data source) right-click context menu.
 * Handled centrally in the sidebar and routed to the corresponding store action.
 */
export type ConnectionMenuAction =
  | 'openConnection'
  | 'closeConnection'
  | 'queryConsole'
  | 'createDatabase'
  | 'editorSource'
  | 'copyName'
  | 'moveTo'
  | 'refresh'
  | 'remove'

/**
 * Optional payload accompanying a connection-menu action. Currently used only
 * by the `moveTo` action to carry the destination group id. `null` denotes the
 * root (no group).
 */
export interface ConnectionMenuPayload {
  targetGroupId?: string | null
}

/**
 * A single entry in the flattened Move-to submenu. `id` is `null` when the
 * target is the root (no group); otherwise it is the destination group id.
 * `label` is the user-facing path (e.g. "GroupA/SubB") or "Root node".
 */
export interface MoveToTarget {
  id: string | null
  label: string
}
