import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const projectRequire = createRequire(join(process.cwd(), 'package.json'))
const Database = projectRequire('better-sqlite3') as typeof import('better-sqlite3')

;(globalThis as unknown as { createLogger: unknown }).createLogger = () => ({
  info: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined
})

type DriverContext = {
  dir: string
  file: string
  SqliteDriverAdapter: typeof import('../../src/main/services/database/drivers/sqlite-driver').SqliteDriverAdapter
  fetchSqliteTableDdl: typeof import('../../src/main/services/database/drivers/sqlite-driver').fetchSqliteTableDdl
}

function credential(filePath: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    dbType: 'sqlite',
    host: null,
    port: null,
    username: null,
    password: null,
    database: 'main',
    sslMode: null,
    filePath,
    connectionMode: 'readwrite',
    ...overrides
  }
}

async function withDriverDatabase(run: (ctx: DriverContext) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'chaterm-sqlite-driver-'))
  const file = join(dir, 'app.sqlite3')
  const db = new Database(file)
  try {
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE orders (user_id INTEGER NOT NULL, seq INTEGER NOT NULL, total REAL, PRIMARY KEY (user_id, seq));
      INSERT INTO users (name) VALUES ('Ada'), ('Linus');
    `)
    const { SqliteDriverAdapter, fetchSqliteTableDdl } = await import('../../src/main/services/database/drivers/sqlite-driver')
    await run({ dir, file, SqliteDriverAdapter, fetchSqliteTableDdl })
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

async function testSqliteConnection(): Promise<void> {
  await withDriverDatabase(async ({ dir, file, SqliteDriverAdapter }) => {
    const adapter = new SqliteDriverAdapter()
    const ok = await adapter.testConnection(credential(file) as never)
    assert.equal(ok.ok, true)
    assert.match(String(ok.serverVersion), /^\d+\.\d+/)

    const missing = await adapter.testConnection(credential(join(dir, 'missing.sqlite3')) as never)
    assert.equal(missing.ok, false)
  })
}

async function testSqliteMetadata(): Promise<void> {
  await withDriverDatabase(async ({ file, SqliteDriverAdapter }) => {
    const adapter = new SqliteDriverAdapter()
    const handle = await adapter.connect(credential(file) as never)
    try {
      assert.deepEqual(await adapter.listDatabases(handle), ['main'])
      assert.deepEqual(await adapter.listTables(handle, 'main'), ['orders', 'users'])
      assert.deepEqual(await adapter.listColumns(handle, 'main', 'users'), ['id', 'name'])
      assert.deepEqual(await adapter.detectPrimaryKey(handle, 'main', 'users'), ['id'])
      assert.deepEqual(await adapter.detectPrimaryKey(handle, 'main', 'orders'), ['user_id', 'seq'])
    } finally {
      await adapter.disconnect(handle)
    }
  })
}

async function testSqliteExecute(): Promise<void> {
  await withDriverDatabase(async ({ file, SqliteDriverAdapter }) => {
    const adapter = new SqliteDriverAdapter()
    const handle = await adapter.connect(credential(file) as never)
    try {
      const rows = await adapter.executeQuery(handle, 'SELECT id, name FROM users ORDER BY id')
      assert.deepEqual(rows.columns, ['id', 'name'])
      assert.equal(rows.rows.length, 2)

      const inserted = await adapter.executeQuery(handle, 'INSERT INTO users (name) VALUES (?)', ['Grace'])
      assert.equal(inserted.rowCount, 1)
      const count = await adapter.executeQuery(handle, 'SELECT COUNT(*) AS n FROM users')
      assert.equal(count.rows[0].n, 3)
    } finally {
      await adapter.disconnect(handle)
    }
  })
}

async function testSqliteRollbackAndDdl(): Promise<void> {
  await withDriverDatabase(async ({ file, SqliteDriverAdapter, fetchSqliteTableDdl }) => {
    const adapter = new SqliteDriverAdapter()
    const handle = await adapter.connect(credential(file) as never)
    try {
      await adapter.beginTransaction(handle)
      await adapter.executeQuery(handle, 'INSERT INTO users (name) VALUES (?)', ['Rollback'])
      await adapter.rollbackTransaction(handle)
      const count = await adapter.executeQuery(handle, "SELECT COUNT(*) AS n FROM users WHERE name = 'Rollback'")
      assert.equal(count.rows[0].n, 0)
      const ddl = await fetchSqliteTableDdl(handle, 'main', 'users')
      assert.match(ddl, /CREATE TABLE users/)
    } finally {
      await adapter.disconnect(handle)
    }
  })
}

async function testDbAssetsLegacyRebuild(): Promise<void> {
  const { upgradeDbAssetsSupport } = await import('../../src/main/storage/db/migrations/add-db-assets-support')
  const realDb = new Database(':memory:')
  try {
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

    await upgradeDbAssetsSupport(realDb as never)

    const cols = realDb.prepare("PRAGMA table_info('db_assets')").all() as Array<{ name: string; notnull: number }>
    const byName = new Map(cols.map((col) => [col.name, col]))
    assert.equal(byName.get('host')?.notnull, 0)
    assert.equal(byName.get('port')?.notnull, 0)
    assert.equal(byName.has('file_path'), true)
    assert.equal(byName.has('connection_mode'), true)

    const row = realDb.prepare('SELECT name, host, port, connection_mode FROM db_assets WHERE id = ?').get('a1') as {
      name: string
      host: string
      port: number
      connection_mode: string
    }
    assert.deepEqual(row, { name: 'legacy', host: '127.0.0.1', port: 3306, connection_mode: 'readwrite' })
  } finally {
    realDb.close()
  }
}

const cases: Record<string, () => Promise<void>> = {
  'sqlite-driver:test-connection': testSqliteConnection,
  'sqlite-driver:metadata': testSqliteMetadata,
  'sqlite-driver:execute': testSqliteExecute,
  'sqlite-driver:rollback-ddl': testSqliteRollbackAndDdl,
  'db-assets:legacy-rebuild': testDbAssetsLegacyRebuild
}

async function main(): Promise<void> {
  const name = process.argv[2]
  const run = cases[name]
  if (!run) throw new Error(`unknown native sqlite test case: ${String(name)}`)
  await run()
  console.log(`__NATIVE_SQLITE_RESULT__${JSON.stringify({ ok: true, name })}`)
}

main().catch((error) => {
  console.error(error)
  console.log(
    `__NATIVE_SQLITE_RESULT__${JSON.stringify({
      ok: false,
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }
    })}`
  )
  process.exitCode = 1
})
