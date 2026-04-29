import type { DatabaseTreeNode, DatabaseWorkspaceTab } from '../types'

/**
 * Seeded explorer tree used to make the first-phase database workspace feel
 * realistic. All data is local to the renderer. No real database is touched.
 */
export const mockExplorerTree: DatabaseTreeNode[] = [
  {
    id: 'group-default',
    type: 'group',
    name: 'Default Group',
    expanded: true,
    children: [
      {
        id: 'conn-local-mysql',
        type: 'connection',
        name: 'local-mysql',
        parentId: 'group-default',
        expanded: true,
        meta: { dbType: 'MySQL', host: '127.0.0.1', port: 3306 },
        children: [
          {
            id: 'db-local-mysql-chaterm',
            type: 'database',
            name: 'chaterm',
            parentId: 'conn-local-mysql',
            expanded: true,
            children: [
              {
                id: 'folder-local-mysql-chaterm-tables',
                type: 'folder',
                name: 'tables',
                parentId: 'db-local-mysql-chaterm',
                expanded: true,
                children: [
                  {
                    id: 'table-users',
                    type: 'table',
                    name: 'users',
                    parentId: 'folder-local-mysql-chaterm-tables'
                  },
                  {
                    id: 'table-sessions',
                    type: 'table',
                    name: 'sessions',
                    parentId: 'folder-local-mysql-chaterm-tables'
                  },
                  {
                    id: 'table-drms',
                    type: 'table',
                    name: 'drms',
                    parentId: 'folder-local-mysql-chaterm-tables'
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        id: 'conn-staging-pg',
        type: 'connection',
        name: 'staging-postgres',
        parentId: 'group-default',
        expanded: false,
        meta: { dbType: 'PostgreSQL', host: 'staging.db.internal', port: 5432 },
        children: [
          {
            id: 'db-staging-pg-analytics',
            type: 'database',
            name: 'analytics',
            parentId: 'conn-staging-pg',
            expanded: false,
            children: [
              {
                id: 'folder-staging-pg-analytics-tables',
                type: 'folder',
                name: 'tables',
                parentId: 'db-staging-pg-analytics',
                expanded: false,
                children: [
                  {
                    id: 'table-events',
                    type: 'table',
                    name: 'events',
                    parentId: 'folder-staging-pg-analytics-tables'
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
]

const DEFAULT_SAMPLE_ROWS: Record<string, Array<Record<string, unknown>>> = {
  users: [
    { id: 1, username: 'alice', email: 'alice@example.com', created_at: '2025-12-01 10:12:00' },
    { id: 2, username: 'bob', email: 'bob@example.com', created_at: '2025-12-02 09:45:00' },
    { id: 3, username: 'carol', email: 'carol@example.com', created_at: '2025-12-04 18:30:00' }
  ],
  sessions: [
    { id: 'sess-001', user_id: 1, ip: '10.0.0.21', expires_at: '2026-05-02 20:00:00' },
    { id: 'sess-002', user_id: 2, ip: '10.0.0.88', expires_at: '2026-05-03 07:30:00' }
  ],
  drms: [
    { id: 'drm-001', resource: 'report-weekly', owner: 'alice', updated_at: '2026-04-20 14:00:00' },
    { id: 'drm-002', resource: 'report-daily', owner: 'bob', updated_at: '2026-04-28 09:15:00' }
  ],
  events: [
    { event_id: 'evt-1', type: 'page_view', ts: '2026-04-28 11:10:00' },
    { event_id: 'evt-2', type: 'click', ts: '2026-04-28 11:10:22' }
  ]
}

const DEFAULT_COLUMNS: Record<string, string[]> = {
  users: ['id', 'username', 'email', 'created_at'],
  sessions: ['id', 'user_id', 'ip', 'expires_at'],
  drms: ['id', 'resource', 'owner', 'updated_at'],
  events: ['event_id', 'type', 'ts']
}

export function buildSampleTabFromTable(params: { tabId: string; connectionId?: string; tableName: string }): DatabaseWorkspaceTab {
  const columns = DEFAULT_COLUMNS[params.tableName] ?? ['id', 'value']
  const rows = DEFAULT_SAMPLE_ROWS[params.tableName] ?? [{ id: 1, value: 'sample' }]
  return {
    id: params.tabId,
    title: params.tableName,
    kind: 'sql',
    connectionId: params.connectionId,
    tableName: params.tableName,
    sql: `SELECT * FROM ${params.tableName} LIMIT 100;`,
    resultColumns: columns,
    resultRows: rows
  }
}

export const OVERVIEW_TAB_ID = 'tab-overview'

export function buildOverviewTab(): DatabaseWorkspaceTab {
  return {
    id: OVERVIEW_TAB_ID,
    title: 'Overview',
    kind: 'overview',
    sql: '',
    resultColumns: [],
    resultRows: []
  }
}
