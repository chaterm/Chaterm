import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }))
}))

const { MysqlDriverAdapter, fetchMysqlTableDdl } = await import('../drivers/mysql-driver')

/**
 * Build a fake mysql2 connection whose `query` method returns pre-canned
 * results in order and records every invocation.
 */
function makeFakeConn(queue: Array<[unknown, unknown]>) {
  const calls: Array<{ sql: string; params?: unknown[] }> = []
  const conn = {
    async query(sql: string, params?: unknown[]) {
      calls.push({ sql, params })
      const next = queue.shift()
      if (!next) return [[], []]
      return next
    },
    async end() {
      // no-op for tests
    }
  }
  return { conn, calls }
}

describe('MysqlDriverAdapter - quoteIdentifier', () => {
  const a = new MysqlDriverAdapter()

  it('wraps identifier in backticks', () => {
    expect(a.quoteIdentifier('users')).toBe('`users`')
  })

  it('escapes embedded backticks by doubling them', () => {
    expect(a.quoteIdentifier('we`ird')).toBe('`we``ird`')
  })

  it('handles empty string safely', () => {
    expect(a.quoteIdentifier('')).toBe('``')
  })
})

describe('MysqlDriverAdapter - placeholder', () => {
  const a = new MysqlDriverAdapter()

  it('always returns ? regardless of index', () => {
    expect(a.placeholder(1)).toBe('?')
    expect(a.placeholder(7)).toBe('?')
    expect(a.placeholder(42)).toBe('?')
  })
})

describe('MysqlDriverAdapter - detectPrimaryKey', () => {
  let adapter: InstanceType<typeof MysqlDriverAdapter>

  beforeEach(() => {
    adapter = new MysqlDriverAdapter()
  })

  it('returns ordered column names when PK exists', async () => {
    const { conn, calls } = makeFakeConn([[[{ COLUMN_NAME: 'tenant_id' }, { COLUMN_NAME: 'id' }], []]])
    const pk = await adapter.detectPrimaryKey(conn, 'app', 'orders')
    expect(pk).toEqual(['tenant_id', 'id'])
    expect(calls).toHaveLength(1)
    expect(calls[0].sql).toContain('KEY_COLUMN_USAGE')
    expect(calls[0].params).toEqual(['app', 'orders', 'PRIMARY'])
  })

  it('returns null when table has no primary key', async () => {
    const { conn } = makeFakeConn([[[], []]])
    const pk = await adapter.detectPrimaryKey(conn, 'app', 'logs')
    expect(pk).toBeNull()
  })

  it('tolerates lowercase column_name field from some driver modes', async () => {
    const { conn } = makeFakeConn([[[{ column_name: 'id' }], []]])
    const pk = await adapter.detectPrimaryKey(conn, 'app', 'orders')
    expect(pk).toEqual(['id'])
  })
})

describe('MysqlDriverAdapter - transactions', () => {
  it('issues BEGIN / COMMIT / ROLLBACK as plain statements', async () => {
    const adapter = new MysqlDriverAdapter()
    const { conn, calls } = makeFakeConn([
      [[], []],
      [[], []],
      [[], []]
    ])
    await adapter.beginTransaction(conn)
    await adapter.commitTransaction(conn)
    await adapter.rollbackTransaction(conn)
    expect(calls.map((c) => c.sql)).toEqual(['BEGIN', 'COMMIT', 'ROLLBACK'])
  })
})

describe('fetchMysqlTableDdl', () => {
  it('returns DDL from SHOW CREATE TABLE second column', async () => {
    const { conn, calls } = makeFakeConn([
      [[], []], // USE `appdb`
      [[{ Table: 'orders', 'Create Table': 'CREATE TABLE `orders` (...)' }], []]
    ])
    const ddl = await fetchMysqlTableDdl(conn, 'appdb', 'orders')
    expect(ddl).toBe('CREATE TABLE `orders` (...)')
    expect(calls).toHaveLength(2)
    expect(calls[0].sql).toBe('USE `appdb`')
    expect(calls[1].sql).toBe('SHOW CREATE TABLE `orders`')
  })

  it('strips embedded backticks to prevent identifier injection', async () => {
    const { conn, calls } = makeFakeConn([
      [[], []],
      [[{ Table: 't', 'Create Table': 'CREATE TABLE `t`' }], []]
    ])
    await fetchMysqlTableDdl(conn, 'ap`pdb', 'or`ders')
    expect(calls[0].sql).toBe('USE `appdb`')
    expect(calls[1].sql).toBe('SHOW CREATE TABLE `orders`')
  })

  it('returns empty string when rows array is empty', async () => {
    const { conn } = makeFakeConn([
      [[], []],
      [[], []]
    ])
    const ddl = await fetchMysqlTableDdl(conn, 'appdb', 'missing')
    expect(ddl).toBe('')
  })

  it('throws code=permission when errno 1142 is raised (table access denied)', async () => {
    const conn = {
      async query(sql: string) {
        if (sql.startsWith('USE')) return [[], []]
        throw Object.assign(new Error("SELECT command denied to user 'u'@'h' for table 'orders'"), {
          errno: 1142,
          code: 'ER_TABLEACCESS_DENIED_ERROR'
        })
      },
      async end() {
        /* noop */
      }
    }
    await expect(fetchMysqlTableDdl(conn, 'appdb', 'orders')).rejects.toMatchObject({
      code: 'permission'
    })
  })

  it('throws code=permission when errno 1227 is raised (global access denied)', async () => {
    const conn = {
      async query(sql: string) {
        if (sql.startsWith('USE')) return [[], []]
        throw Object.assign(new Error('Access denied; you need (at least one of) the SUPER privilege(s)'), {
          errno: 1227
        })
      },
      async end() {
        /* noop */
      }
    }
    await expect(fetchMysqlTableDdl(conn, 'appdb', 'orders')).rejects.toMatchObject({
      code: 'permission'
    })
  })

  it('rethrows non-permission errors unchanged', async () => {
    const conn = {
      async query(sql: string) {
        if (sql.startsWith('USE')) return [[], []]
        throw Object.assign(new Error("Table 'appdb.ghost' doesn't exist"), { errno: 1146 })
      },
      async end() {
        /* noop */
      }
    }
    await expect(fetchMysqlTableDdl(conn, 'appdb', 'ghost')).rejects.toThrow("doesn't exist")
  })
})
