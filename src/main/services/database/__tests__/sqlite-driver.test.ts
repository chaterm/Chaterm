import { describe, it } from 'vitest'
import { runElectronNativeSqliteCase } from '../../../test-utils/electron-native-sqlite'

describe('SqliteDriverAdapter', () => {
  it('tests an existing sqlite file without creating missing files', async () => {
    await runElectronNativeSqliteCase('sqlite-driver:test-connection')
  })

  it('lists database aliases, tables, columns and primary keys', async () => {
    await runElectronNativeSqliteCase('sqlite-driver:metadata')
  })

  it('executes SELECT and write statements through the worker', async () => {
    await runElectronNativeSqliteCase('sqlite-driver:execute')
  })

  it('supports rollback and ddl lookup', async () => {
    await runElectronNativeSqliteCase('sqlite-driver:rollback-ddl')
  })
})
