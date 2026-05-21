import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SqliteDriverAdapter, fetchSqliteTableDdl } from '../drivers/sqlite-driver'
import type { ResolvedDbCredential } from '../types'

vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }))
}))

describe('SqliteDriverAdapter', () => {
  let dir = ''
  let file = ''
  let adapter: SqliteDriverAdapter

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'chaterm-sqlite-driver-'))
    file = join(dir, 'app.sqlite3')
    const db = new Database(file)
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE orders (user_id INTEGER NOT NULL, seq INTEGER NOT NULL, total REAL, PRIMARY KEY (user_id, seq));
      INSERT INTO users (name) VALUES ('Ada'), ('Linus');
    `)
    db.close()
    adapter = new SqliteDriverAdapter()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function credential(overrides: Partial<ResolvedDbCredential> = {}): ResolvedDbCredential {
    return {
      dbType: 'sqlite',
      host: null,
      port: null,
      username: null,
      password: null,
      database: 'main',
      sslMode: null,
      filePath: file,
      connectionMode: 'readwrite',
      ...overrides
    }
  }

  it('tests an existing sqlite file without creating missing files', async () => {
    const ok = await adapter.testConnection(credential())
    expect(ok.ok).toBe(true)
    expect(ok.serverVersion).toMatch(/^\d+\.\d+/)

    const missing = await adapter.testConnection(credential({ filePath: join(dir, 'missing.sqlite3') }))
    expect(missing.ok).toBe(false)
  })

  it('lists database aliases, tables, columns and primary keys', async () => {
    const handle = await adapter.connect(credential())
    try {
      await expect(adapter.listDatabases(handle)).resolves.toContain('main')
      await expect(adapter.listTables(handle, 'main')).resolves.toEqual(['orders', 'users'])
      await expect(adapter.listColumns(handle, 'main', 'users')).resolves.toEqual(['id', 'name'])
      await expect(adapter.detectPrimaryKey(handle, 'main', 'users')).resolves.toEqual(['id'])
      await expect(adapter.detectPrimaryKey(handle, 'main', 'orders')).resolves.toEqual(['user_id', 'seq'])
    } finally {
      await adapter.disconnect(handle)
    }
  })

  it('executes SELECT and write statements through the worker', async () => {
    const handle = await adapter.connect(credential())
    try {
      const rows = await adapter.executeQuery(handle, 'SELECT id, name FROM users ORDER BY id')
      expect(rows.columns).toEqual(['id', 'name'])
      expect(rows.rows).toHaveLength(2)

      const inserted = await adapter.executeQuery(handle, 'INSERT INTO users (name) VALUES (?)', ['Grace'])
      expect(inserted.rowCount).toBe(1)
      const count = await adapter.executeQuery(handle, 'SELECT COUNT(*) AS n FROM users')
      expect(count.rows[0].n).toBe(3)
    } finally {
      await adapter.disconnect(handle)
    }
  })

  it('supports rollback and ddl lookup', async () => {
    const handle = await adapter.connect(credential())
    try {
      await adapter.beginTransaction(handle)
      await adapter.executeQuery(handle, 'INSERT INTO users (name) VALUES (?)', ['Rollback'])
      await adapter.rollbackTransaction(handle)
      const count = await adapter.executeQuery(handle, "SELECT COUNT(*) AS n FROM users WHERE name = 'Rollback'")
      expect(count.rows[0].n).toBe(0)
      const ddl = await fetchSqliteTableDdl(handle, 'main', 'users')
      expect(ddl).toContain('CREATE TABLE users')
    } finally {
      await adapter.disconnect(handle)
    }
  })
})
