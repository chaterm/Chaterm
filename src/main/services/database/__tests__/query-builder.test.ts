import { describe, it, expect } from 'vitest'
import { buildTableQuery } from '../query-builder'
import type { ColumnFilter, ColumnSort } from '../query-builder'

const KNOWN = ['id', 'name', 'created_at']

describe('buildTableQuery', () => {
  it('builds a basic mysql query with LIMIT/OFFSET', () => {
    const q = buildTableQuery({
      dbType: 'mysql',
      database: 'mydb',
      table: 'users',
      knownColumns: KNOWN,
      filters: [],
      sort: null,
      page: 1,
      pageSize: 100
    })
    expect(q.sql).toBe('SELECT * FROM `mydb`.`users` LIMIT 100 OFFSET 0')
    expect(q.params).toEqual([])
    expect(q.countSql).toBe('SELECT COUNT(*) AS total FROM `mydb`.`users`')
    expect(q.countParams).toEqual([])
  })

  it('quotes identifiers for postgres with $N placeholders', () => {
    const q = buildTableQuery({
      dbType: 'postgresql',
      database: 'analytics',
      table: 'events',
      knownColumns: KNOWN,
      filters: [{ column: 'id', operator: 'eq', value: '42' }],
      sort: { column: 'created_at', direction: 'desc' },
      page: 2,
      pageSize: 50
    })
    expect(q.sql).toBe('SELECT * FROM "events" WHERE "id" = $1 ORDER BY "created_at" DESC LIMIT $2 OFFSET $3')
    expect(q.params).toEqual(['42', 50, 50])
  })

  it('does not qualify with database name for postgres', () => {
    const q = buildTableQuery({
      dbType: 'postgresql',
      database: 'mydb',
      table: 'users',
      knownColumns: KNOWN,
      filters: [],
      sort: null,
      page: 1,
      pageSize: 10
    })
    expect(q.sql.startsWith('SELECT * FROM "users"')).toBe(true)
  })

  it('supports multiple structured filters with AND', () => {
    const q = buildTableQuery({
      dbType: 'mysql',
      database: 'db',
      table: 't',
      knownColumns: KNOWN,
      filters: [
        { column: 'id', operator: 'neq', value: '1' },
        { column: 'name', operator: 'like', value: 'a%' }
      ],
      sort: null,
      page: 1,
      pageSize: 10
    })
    expect(q.sql).toContain('WHERE `id` <> ? AND `name` LIKE ?')
    expect(q.sql).toContain('LIMIT 10 OFFSET 0')
    expect(q.params).toEqual(['1', 'a%'])
  })

  it('supports IN operator with multiple values', () => {
    const q = buildTableQuery({
      dbType: 'mysql',
      database: 'db',
      table: 't',
      knownColumns: KNOWN,
      filters: [{ column: 'id', operator: 'in', values: ['1', '2', '3'] }],
      sort: null,
      page: 1,
      pageSize: 10
    })
    expect(q.sql).toContain('`id` IN (?, ?, ?)')
    expect(q.sql).toContain('LIMIT 10 OFFSET 0')
    expect(q.params).toEqual(['1', '2', '3'])
  })

  it('produces an always-false clause for empty IN list', () => {
    const q = buildTableQuery({
      dbType: 'mysql',
      database: 'db',
      table: 't',
      knownColumns: KNOWN,
      filters: [{ column: 'id', operator: 'in', values: [] }],
      sort: null,
      page: 1,
      pageSize: 10
    })
    expect(q.sql).toContain('WHERE 1 = 0')
  })

  it('isnull / notnull do not consume parameters', () => {
    const q = buildTableQuery({
      dbType: 'postgresql',
      database: 'db',
      table: 't',
      knownColumns: KNOWN,
      filters: [
        { column: 'id', operator: 'isnull' },
        { column: 'name', operator: 'notnull' }
      ],
      sort: null,
      page: 1,
      pageSize: 10
    })
    expect(q.sql).toContain('"id" IS NULL AND "name" IS NOT NULL')
    // Postgres still binds LIMIT/OFFSET via $1/$2.
    expect(q.params).toEqual([10, 0])
  })

  it('rejects unknown columns in filters', () => {
    expect(() =>
      buildTableQuery({
        dbType: 'mysql',
        database: 'db',
        table: 't',
        knownColumns: KNOWN,
        filters: [{ column: 'evil', operator: 'eq', value: 'x' }],
        sort: null,
        page: 1,
        pageSize: 10
      })
    ).toThrow(/unknown filter column/)
  })

  it('rejects identifiers containing unsafe characters', () => {
    expect(() =>
      buildTableQuery({
        dbType: 'mysql',
        database: 'db',
        table: 't; DROP TABLE users',
        knownColumns: KNOWN,
        filters: [],
        sort: null,
        page: 1,
        pageSize: 10
      })
    ).toThrow(/unsafe/)
  })

  it('whereRaw overrides structured filters', () => {
    const filters: ColumnFilter[] = [{ column: 'id', operator: 'eq', value: '1' }]
    const q = buildTableQuery({
      dbType: 'mysql',
      database: 'db',
      table: 't',
      knownColumns: KNOWN,
      filters,
      whereRaw: "name LIKE '%a%'",
      sort: null,
      page: 1,
      pageSize: 10
    })
    expect(q.sql).toContain("WHERE name LIKE '%a%'")
    expect(q.sql).not.toContain('`id` = ?')
    // mysql inlines LIMIT/OFFSET so no params at all when whereRaw has no placeholders.
    expect(q.params).toEqual([])
  })

  it('orderByRaw overrides structured sort', () => {
    const sort: ColumnSort = { column: 'id', direction: 'asc' }
    const q = buildTableQuery({
      dbType: 'mysql',
      database: 'db',
      table: 't',
      knownColumns: KNOWN,
      filters: [],
      sort,
      orderByRaw: 'name DESC, id ASC',
      page: 1,
      pageSize: 10
    })
    expect(q.sql).toContain('ORDER BY name DESC, id ASC')
    expect(q.sql).not.toContain('`id` ASC')
  })

  it('clamps page and pageSize to sensible bounds', () => {
    const q = buildTableQuery({
      dbType: 'mysql',
      database: 'db',
      table: 't',
      knownColumns: KNOWN,
      filters: [],
      sort: null,
      page: 0,
      pageSize: 99999
    })
    expect(q.sql).toContain('LIMIT 10000 OFFSET 0')
    expect(q.params).toEqual([])
  })

  it('computes correct offset for page 3 pageSize 50', () => {
    const q = buildTableQuery({
      dbType: 'mysql',
      database: 'db',
      table: 't',
      knownColumns: KNOWN,
      filters: [],
      sort: null,
      page: 3,
      pageSize: 50
    })
    expect(q.sql).toContain('LIMIT 50 OFFSET 100')
    expect(q.params).toEqual([])
  })
})
