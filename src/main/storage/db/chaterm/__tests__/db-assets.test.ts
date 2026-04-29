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

const { upgradeDbAssetsSupport } = await import('../../migrations/add-db-assets-support')
const { listDbAssetsLogic, getDbAssetLogic, createDbAssetLogic, updateDbAssetLogic, softDeleteDbAssetLogic, updateDbAssetStatusLogic } =
  await import('../db-assets')

const USER_ID = 42

async function makeDb() {
  const db = new Database(':memory:')
  await upgradeDbAssetsSupport(db)
  return db
}

describe('db-assets storage', () => {
  let db: Database.Database

  beforeEach(async () => {
    db = await makeDb()
  })

  it('creates a mysql asset and reads it back', () => {
    const created = createDbAssetLogic(db, USER_ID, {
      name: 'local-mysql',
      db_type: 'mysql',
      host: '127.0.0.1',
      port: 3306,
      username: 'root',
      password_ciphertext: 'CIPHER1'
    })
    expect(created.id).toBeTruthy()
    expect(created.status).toBe('idle')
    expect(created.auth_type).toBe('password')

    const list = listDbAssetsLogic(db, USER_ID)
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('local-mysql')
    expect(list[0].password_ciphertext).toBe('CIPHER1')
  })

  it('rejects invalid port and empty name', () => {
    expect(() =>
      createDbAssetLogic(db, USER_ID, {
        name: '',
        db_type: 'mysql',
        host: 'x',
        port: 3306
      })
    ).toThrow(/name/)
    expect(() =>
      createDbAssetLogic(db, USER_ID, {
        name: 'a',
        db_type: 'mysql',
        host: 'x',
        port: 0
      })
    ).toThrow(/port/)
    expect(() =>
      createDbAssetLogic(db, USER_ID, {
        name: 'a',
        db_type: 'mysql',
        host: 'x',
        port: 70000
      })
    ).toThrow(/port/)
  })

  it('scopes reads by user_id', () => {
    createDbAssetLogic(db, USER_ID, {
      name: 'mine',
      db_type: 'mysql',
      host: 'h',
      port: 3306
    })
    createDbAssetLogic(db, 99, {
      name: 'theirs',
      db_type: 'postgresql',
      host: 'h',
      port: 5432
    })
    const mine = listDbAssetsLogic(db, USER_ID)
    expect(mine).toHaveLength(1)
    expect(mine[0].name).toBe('mine')
  })

  it('updates partial fields and bumps updated_at', async () => {
    const created = createDbAssetLogic(db, USER_ID, {
      name: 'a',
      db_type: 'mysql',
      host: 'h',
      port: 3306
    })
    await new Promise((r) => setTimeout(r, 5))
    const updated = updateDbAssetLogic(db, USER_ID, created.id, {
      name: 'a2',
      port: 3307
    })
    expect(updated.name).toBe('a2')
    expect(updated.port).toBe(3307)
    expect(updated.host).toBe('h')
    expect(updated.updated_at).not.toBe(created.updated_at)
  })

  it('soft-deletes: row is hidden from list/get but still in DB', () => {
    const created = createDbAssetLogic(db, USER_ID, {
      name: 'a',
      db_type: 'mysql',
      host: 'h',
      port: 3306
    })
    const ok = softDeleteDbAssetLogic(db, USER_ID, created.id)
    expect(ok).toBe(true)

    expect(getDbAssetLogic(db, USER_ID, created.id)).toBeNull()
    expect(listDbAssetsLogic(db, USER_ID)).toHaveLength(0)

    const row = db.prepare('SELECT deleted_at FROM db_assets WHERE id = ?').get(created.id) as { deleted_at: string }
    expect(row.deleted_at).toBeTruthy()
  })

  it('updateDbAssetStatus patches only provided fields', () => {
    const created = createDbAssetLogic(db, USER_ID, {
      name: 'a',
      db_type: 'mysql',
      host: 'h',
      port: 3306
    })
    updateDbAssetStatusLogic(db, USER_ID, created.id, {
      status: 'connected',
      last_connected_at: '2026-04-29T12:00:00Z'
    })
    const refreshed = getDbAssetLogic(db, USER_ID, created.id)
    expect(refreshed?.status).toBe('connected')
    expect(refreshed?.last_connected_at).toBe('2026-04-29T12:00:00Z')
    expect(refreshed?.last_error_message).toBeNull()
  })

  it('updateDbAssetStatus is a no-op when asset does not exist', () => {
    expect(() => updateDbAssetStatusLogic(db, USER_ID, 'does-not-exist', { status: 'failed' })).not.toThrow()
  })
})
