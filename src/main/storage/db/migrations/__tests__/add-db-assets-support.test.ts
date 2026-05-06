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

type MockDb = {
  prepare: (sql: string) => { get: () => unknown }
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
        if (normalized.includes("'db_assets'")) {
          return { get: () => (dbAssetsExists ? { name: 'db_assets' } : undefined) }
        }
        if (normalized.includes("'db_connection_sessions'")) {
          return { get: () => (sessionsExists ? { name: 'db_connection_sessions' } : undefined) }
        }
        if (normalized.includes("'db_asset_groups'")) {
          return { get: () => (groupsExists ? { name: 'db_asset_groups' } : undefined) }
        }
        return { get: () => undefined }
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
