export type DatabaseTreeNodeType = 'group' | 'connection' | 'database' | 'folder' | 'table'

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

export type DatabaseType = 'MySQL' | 'PostgreSQL'
export type DatabaseAuthentication = 'UserAndPassword'

export interface DatabaseConnectionDraft {
  id: string
  name: string
  env: string
  dbType: DatabaseType
  host: string
  port: number
  authentication: DatabaseAuthentication
  user: string
  password: string
  database?: string
  url?: string
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
}
