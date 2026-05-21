import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'

vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
}))

const { upgradeDbAssetsSupport } = await import('../add-db-assets-support')

type MockStatement = {
  get: () => unknown
  all: () => unknown[]
}

type MockDb = {
  prepare: (sql: string) => MockStatement
  exec: (sql: string) => void
}

describe('upgradeDbAssetsSupport', () => {
  let db: MockDb
  let execCalls: string[]
  let dbAssetsExists: boolean
  let sessionsExists: boolean
  let groupsExists: boolean

  beforeEach(() => {
    execCalls = []
    dbAssetsExists = false
    sessionsExists = false
    groupsExists = false

    db = {
      prepare(sql: string) {
        const normalized = sql.trim().toLowerCase()
        const emptyStatement: MockStatement = { get: () => undefined, all: () => [] }
        if (normalized.startsWith('pragma table_info')) {
          return {
            get: () => undefined,
            all: () => [
              { name: 'id', type: 'TEXT', notnull: 0, pk: 1 },
              { name: 'user_id', type: 'INTEGER', notnull: 1, pk: 0 },
              { name: 'name', type: 'TEXT', notnull: 1, pk: 0 },
              { name: 'db_type', type: 'TEXT', notnull: 1, pk: 0 },
              { name: 'host', type: 'TEXT', notnull: 0, pk: 0 },
              { name: 'port', type: 'INTEGER', notnull: 0, pk: 0 },
              { name: 'file_path', type: 'TEXT', notnull: 0, pk: 0 },
              { name: 'connection_mode', type: 'TEXT', notnull: 0, dflt_value: "'readwrite'", pk: 0 },
              { name: 'created_at', type: 'TEXT', notnull: 1, pk: 0 },
              { name: 'updated_at', type: 'TEXT', notnull: 1, pk: 0 }
            ]
          }
        }
        if (normalized.includes("'db_assets'")) {
          return { ...emptyStatement, get: () => (dbAssetsExists ? { name: 'db_assets' } : undefined) }
        }
        if (normalized.includes("'db_connection_sessions'")) {
          return { ...emptyStatement, get: () => (sessionsExists ? { name: 'db_connection_sessions' } : undefined) }
        }
        if (normalized.includes("'db_asset_groups'")) {
          return { ...emptyStatement, get: () => (groupsExists ? { name: 'db_asset_groups' } : undefined) }
        }
        return emptyStatement
      },
      exec(sql: string) {
        execCalls.push(sql)
      }
    }
  })

  it('creates db_assets, db_asset_groups and db_connection_sessions when neither exists', async () => {
    await upgradeDbAssetsSupport(db as unknown as Database.Database)

    const createStatements = execCalls.filter((sql) => sql.includes('CREATE TABLE'))
    expect(createStatements.length).toBe(3)
    const joined = execCalls.join('\n')
    expect(joined).toContain('CREATE TABLE db_assets')
    expect(joined).toContain('group_id TEXT')
    expect(joined).toContain('db_type TEXT NOT NULL')
    expect(joined).toContain('host TEXT')
    expect(joined).toContain('port INTEGER')
    expect(joined).toContain('file_path TEXT')
    expect(joined).toContain("connection_mode TEXT DEFAULT 'readwrite'")
    expect(joined).toContain('password_ciphertext TEXT')
    expect(joined).toContain('status TEXT')
    expect(joined).toContain('CREATE TABLE db_asset_groups')
    expect(joined).toContain('parent_id TEXT')
    expect(joined).toContain('CREATE TABLE db_connection_sessions')
    expect(joined).toContain('session_status TEXT NOT NULL')
  })

  it('creates all recommended indexes for db_assets', async () => {
    await upgradeDbAssetsSupport(db as unknown as Database.Database)

    const joined = execCalls.join('\n')
    expect(joined).toContain('idx_db_assets_user_id')
    expect(joined).toContain('idx_db_assets_type')
    expect(joined).toContain('idx_db_assets_group_name')
    expect(joined).toContain('idx_db_assets_group_id')
    expect(joined).toContain('idx_db_assets_status')
    expect(joined).toContain('idx_db_assets_user_deleted')
    expect(joined).toContain('idx_db_asset_groups_user_id')
    expect(joined).toContain('idx_db_asset_groups_parent_id')
  })

  it('reserves ssh tunnel and options fields for future extension', async () => {
    await upgradeDbAssetsSupport(db as unknown as Database.Database)

    const joined = execCalls.join('\n')
    expect(joined).toContain('ssh_tunnel_enabled INTEGER')
    expect(joined).toContain('ssh_tunnel_asset_uuid TEXT')
    expect(joined).toContain('options_json TEXT')
    expect(joined).toContain('tags_json TEXT')
  })

  it('rebuilds legacy db_assets to relax host/port and add sqlite fields', async () => {
    const realDb = new Database(':memory:')
    realDb.exec(`
      CREATE TABLE db_assets (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        group_name TEXT,
        db_type TEXT NOT NULL,
        environment TEXT,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        database_name TEXT,
        schema_name TEXT,
        auth_type TEXT NOT NULL DEFAULT 'password',
        username TEXT,
        password_ciphertext TEXT,
        ssl_mode TEXT,
        jdbc_url TEXT,
        driver_name TEXT,
        driver_class_name TEXT,
        ssh_tunnel_enabled INTEGER DEFAULT 0,
        ssh_tunnel_asset_uuid TEXT,
        options_json TEXT,
        tags_json TEXT,
        status TEXT DEFAULT 'idle',
        last_connected_at TEXT,
        last_tested_at TEXT,
        last_error_code TEXT,
        last_error_message TEXT,
        sort_order INTEGER DEFAULT 0,
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO db_assets (id, user_id, name, group_name, db_type, host, port, created_at, updated_at)
      VALUES ('a1', 1, 'legacy', NULL, 'mysql', '127.0.0.1', 3306, 'x', 'x');
    `)

    await upgradeDbAssetsSupport(realDb)

    const cols = realDb.prepare("PRAGMA table_info('db_assets')").all() as Array<{ name: string; notnull: number }>
    const byName = new Map(cols.map((col) => [col.name, col]))
    expect(byName.get('host')?.notnull).toBe(0)
    expect(byName.get('port')?.notnull).toBe(0)
    expect(byName.has('file_path')).toBe(true)
    expect(byName.has('connection_mode')).toBe(true)
    const row = realDb.prepare('SELECT name, host, port, connection_mode FROM db_assets WHERE id = ?').get('a1') as {
      name: string
      host: string
      port: number
      connection_mode: string
    }
    expect(row).toMatchObject({ name: 'legacy', host: '127.0.0.1', port: 3306, connection_mode: 'readwrite' })
    realDb.close()
  })

  it('skips table creation when db_assets already exists', async () => {
    dbAssetsExists = true

    await upgradeDbAssetsSupport(db as unknown as Database.Database)

    const createStatements = execCalls.filter((sql) => sql.includes('CREATE TABLE db_assets'))
    expect(createStatements).toHaveLength(0)
  })

  it('skips sessions creation when db_connection_sessions already exists', async () => {
    sessionsExists = true

    await upgradeDbAssetsSupport(db as unknown as Database.Database)

    const createStatements = execCalls.filter((sql) => sql.includes('CREATE TABLE db_connection_sessions'))
    expect(createStatements).toHaveLength(0)
  })

  it('skips group table creation when db_asset_groups already exists', async () => {
    groupsExists = true

    await upgradeDbAssetsSupport(db as unknown as Database.Database)

    const createStatements = execCalls.filter((sql) => sql.includes('CREATE TABLE db_asset_groups'))
    expect(createStatements).toHaveLength(0)
  })

  it('propagates database errors', async () => {
    const errorDb = {
      prepare() {
        throw new Error('Database connection error')
      }
    }

    await expect(upgradeDbAssetsSupport(errorDb as unknown as Database.Database)).rejects.toThrow('Database connection error')
  })
})
