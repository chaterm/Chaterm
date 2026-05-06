import { describe, it, expect } from 'vitest'
import { buildMutations } from '../dbMutationBuilder'

describe('dbMutationBuilder.buildMutations', () => {
  // ---- identifier validation ----

  it('rejects invalid identifiers for table/database/column', () => {
    expect(() =>
      buildMutations({
        dbType: 'mysql',
        database: 'db',
        table: 'bad-table',
        primaryKey: ['id'],
        newRows: [],
        deletedRowKeys: [],
        updatedCells: [],
        originalRows: new Map(),
        knownColumns: ['id']
      })
    ).toThrow(/Invalid SQL identifier/i)

    expect(() =>
      buildMutations({
        dbType: 'mysql',
        database: 'db',
        table: 'users',
        primaryKey: ['id'],
        newRows: [{ tmpId: 't1', values: { 'bad col': 1 } }],
        deletedRowKeys: [],
        updatedCells: [],
        originalRows: new Map(),
        knownColumns: ['id']
      })
    ).toThrow(/Invalid SQL identifier/i)
  })

  // ---- INSERT ----

  it('generates MySQL INSERT with ? placeholders and filters all-null rows', () => {
    const stmts = buildMutations({
      dbType: 'mysql',
      database: 'db',
      table: 'users',
      primaryKey: ['id'],
      newRows: [
        { tmpId: 't1', values: { name: 'alice', age: 30 } },
        { tmpId: 't2', values: { name: null, age: null } } // dropped
      ],
      deletedRowKeys: [],
      updatedCells: [],
      originalRows: new Map(),
      knownColumns: ['id', 'name', 'age']
    })
    expect(stmts.length).toBe(1)
    expect(stmts[0].sql).toBe('INSERT INTO `db`.`users` (`name`, `age`) VALUES (?, ?)')
    expect(stmts[0].params).toEqual(['alice', 30])
  })

  it('generates PostgreSQL INSERT with $N placeholders', () => {
    const stmts = buildMutations({
      dbType: 'postgresql',
      database: 'pub',
      schema: 'pub',
      table: 'users',
      primaryKey: ['id'],
      newRows: [{ tmpId: 't1', values: { a: 1, b: 'x', c: null } }],
      deletedRowKeys: [],
      updatedCells: [],
      originalRows: new Map(),
      knownColumns: ['id', 'a', 'b', 'c']
    })
    expect(stmts[0].sql).toBe('INSERT INTO "pub"."users" ("a", "b", "c") VALUES ($1, $2, $3)')
    expect(stmts[0].params).toEqual([1, 'x', null])
  })

  // ---- DELETE ----

  it('generates MySQL DELETE with pk WHERE', () => {
    const rowKey = JSON.stringify([42])
    const stmts = buildMutations({
      dbType: 'mysql',
      database: 'db',
      table: 'users',
      primaryKey: ['id'],
      newRows: [],
      deletedRowKeys: [rowKey],
      updatedCells: [],
      originalRows: new Map([[rowKey, { id: 42, name: 'a' }]]),
      knownColumns: ['id', 'name']
    })
    expect(stmts[0].sql).toBe('DELETE FROM `db`.`users` WHERE `id` = ?')
    expect(stmts[0].params).toEqual([42])
  })

  it('generates MySQL DELETE with composite pk WHERE', () => {
    const rowKey = JSON.stringify(['us', 7])
    const stmts = buildMutations({
      dbType: 'mysql',
      database: 'db',
      table: 't',
      primaryKey: ['region', 'shard'],
      newRows: [],
      deletedRowKeys: [rowKey],
      updatedCells: [],
      originalRows: new Map(),
      knownColumns: ['region', 'shard']
    })
    expect(stmts[0].sql).toBe('DELETE FROM `db`.`t` WHERE `region` = ? AND `shard` = ?')
    expect(stmts[0].params).toEqual(['us', 7])
  })

  it('DELETE with no primary key uses full-column WHERE + LIMIT 1 (MySQL)', () => {
    const rowKey = JSON.stringify([{ a: 1, b: null }])
    const stmts = buildMutations({
      dbType: 'mysql',
      database: 'db',
      table: 't',
      primaryKey: null,
      newRows: [],
      deletedRowKeys: [rowKey],
      updatedCells: [],
      originalRows: new Map([[rowKey, { a: 1, b: null, c: 'x' }]]),
      knownColumns: ['a', 'b', 'c']
    })
    expect(stmts[0].sql).toBe('DELETE FROM `db`.`t` WHERE `a` = ? AND `b` IS NULL AND `c` = ? LIMIT 1')
    expect(stmts[0].params).toEqual([1, 'x'])
  })

  it('DELETE with no primary key uses ctid subquery (PostgreSQL)', () => {
    const rowKey = '__no_pk__0'
    const stmts = buildMutations({
      dbType: 'postgresql',
      database: 'pub',
      schema: 'pub',
      table: 't',
      primaryKey: null,
      newRows: [],
      deletedRowKeys: [rowKey],
      updatedCells: [],
      originalRows: new Map([[rowKey, { a: 1, b: 2 }]]),
      knownColumns: ['a', 'b']
    })
    expect(stmts[0].sql).toBe('DELETE FROM "pub"."t" WHERE ctid = (SELECT ctid FROM "pub"."t" WHERE "a" = $1 AND "b" = $2 LIMIT 1)')
    expect(stmts[0].params).toEqual([1, 2])
  })

  // ---- UPDATE ----

  it('generates MySQL UPDATE with pk WHERE', () => {
    const rowKey = JSON.stringify([7])
    const stmts = buildMutations({
      dbType: 'mysql',
      database: 'db',
      table: 'users',
      primaryKey: ['id'],
      newRows: [],
      deletedRowKeys: [],
      updatedCells: [[rowKey, { name: 'bob', age: 25 }]],
      originalRows: new Map([[rowKey, { id: 7, name: 'alice', age: 30 }]]),
      knownColumns: ['id', 'name', 'age']
    })
    expect(stmts[0].sql).toBe('UPDATE `db`.`users` SET `name` = ?, `age` = ? WHERE `id` = ?')
    expect(stmts[0].params).toEqual(['bob', 25, 7])
  })

  it('UPDATE with no primary key uses full-column WHERE + LIMIT 1 (MySQL)', () => {
    const rowKey = '__no_pk__0'
    const stmts = buildMutations({
      dbType: 'mysql',
      database: 'db',
      table: 't',
      primaryKey: null,
      newRows: [],
      deletedRowKeys: [],
      updatedCells: [[rowKey, { a: 10 }]],
      originalRows: new Map([[rowKey, { a: 1, b: null }]]),
      knownColumns: ['a', 'b']
    })
    expect(stmts[0].sql).toBe('UPDATE `db`.`t` SET `a` = ? WHERE `a` = ? AND `b` IS NULL LIMIT 1')
    expect(stmts[0].params).toEqual([10, 1])
  })

  it('UPDATE with no primary key uses ctid subquery (PostgreSQL)', () => {
    const rowKey = '__no_pk__0'
    const stmts = buildMutations({
      dbType: 'postgresql',
      database: 'pub',
      schema: 'pub',
      table: 't',
      primaryKey: null,
      newRows: [],
      deletedRowKeys: [],
      updatedCells: [[rowKey, { a: 99 }]],
      originalRows: new Map([[rowKey, { a: 1, b: 'x' }]]),
      knownColumns: ['a', 'b']
    })
    expect(stmts[0].sql).toBe('UPDATE "pub"."t" SET "a" = $1 WHERE ctid = (SELECT ctid FROM "pub"."t" WHERE "a" = $2 AND "b" = $3 LIMIT 1)')
    expect(stmts[0].params).toEqual([99, 1, 'x'])
  })

  // ---- ORDER ----

  it('emits DELETE -> UPDATE -> INSERT in order', () => {
    const delKey = JSON.stringify([1])
    const updKey = JSON.stringify([2])
    const stmts = buildMutations({
      dbType: 'mysql',
      database: 'db',
      table: 't',
      primaryKey: ['id'],
      newRows: [{ tmpId: 't1', values: { name: 'new' } }],
      deletedRowKeys: [delKey],
      updatedCells: [[updKey, { name: 'changed' }]],
      originalRows: new Map([
        [delKey, { id: 1, name: 'old' }],
        [updKey, { id: 2, name: 'orig' }]
      ]),
      knownColumns: ['id', 'name']
    })
    expect(stmts.length).toBe(3)
    expect(stmts[0].sql.startsWith('DELETE')).toBe(true)
    expect(stmts[1].sql.startsWith('UPDATE')).toBe(true)
    expect(stmts[2].sql.startsWith('INSERT')).toBe(true)
  })

  // ---- parameter ordering ----

  it('UPDATE params are SET-values first, then WHERE-values', () => {
    const rowKey = JSON.stringify([5])
    const stmts = buildMutations({
      dbType: 'mysql',
      database: 'db',
      table: 'users',
      primaryKey: ['id'],
      newRows: [],
      deletedRowKeys: [],
      updatedCells: [[rowKey, { a: 'A', b: 'B' }]],
      originalRows: new Map([[rowKey, { id: 5, a: 'x', b: 'y' }]]),
      knownColumns: ['id', 'a', 'b']
    })
    expect(stmts[0].params).toEqual(['A', 'B', 5])
  })

  // ---- empty rows ----

  it('filters out all-null new rows', () => {
    const stmts = buildMutations({
      dbType: 'mysql',
      database: 'db',
      table: 't',
      primaryKey: ['id'],
      newRows: [
        { tmpId: 't1', values: { a: null, b: null } },
        { tmpId: 't2', values: {} }
      ],
      deletedRowKeys: [],
      updatedCells: [],
      originalRows: new Map(),
      knownColumns: ['id', 'a', 'b']
    })
    expect(stmts.length).toBe(0)
  })
})
