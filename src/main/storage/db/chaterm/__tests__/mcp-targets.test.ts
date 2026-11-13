import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { findMcpTargetsByHost, getMcpTarget, listMcpTargets } from '../mcp-targets'

describe('MCP target catalog', () => {
  it('lists managed targets without mutating the database or exposing credentials', () => {
    const db = new Database(':memory:')
    db.exec(`CREATE TABLE t_assets (uuid TEXT, asset_ip TEXT, asset_type TEXT, label TEXT, port INTEGER, username TEXT, password TEXT);
      CREATE TABLE t_organization_assets (uuid TEXT, organization_uuid TEXT, host TEXT, hostname TEXT, jump_server_type TEXT);`)
    db.prepare('INSERT INTO t_assets VALUES (?, ?, ?, ?, ?, ?, ?)').run('a1', '10.0.0.1', 'person', 'api', 22, 'root', 'secret')
    const before = db.prepare('SELECT COUNT(*) AS count FROM t_assets').get() as { count: number }
    const targets = listMcpTargets(db, '', 50, 0)
    const after = db.prepare('SELECT COUNT(*) AS count FROM t_assets').get() as { count: number }
    expect(targets).toEqual([{ target_id: 'a1', name: 'api', host: '10.0.0.1', port: 22, connection_type: 'ssh', group: null }])
    expect(after).toEqual(before)
    expect(JSON.stringify(targets)).not.toContain('secret')
    expect(getMcpTarget(db, 'a1')?.target_id).toBe('a1')
    expect(getMcpTarget(db, 'missing')).toBeNull()
    db.close()
  })

  it('finds targets by exact host, including assets behind different bastions', () => {
    const db = new Database(':memory:')
    db.exec(`CREATE TABLE t_assets (uuid TEXT, asset_ip TEXT, asset_type TEXT, label TEXT, port INTEGER, username TEXT, password TEXT);
      CREATE TABLE t_organization_assets (uuid TEXT, organization_uuid TEXT, host TEXT, hostname TEXT, jump_server_type TEXT);`)
    const insertAsset = db.prepare('INSERT INTO t_assets VALUES (?, ?, ?, ?, ?, ?, ?)')
    insertAsset.run('p1', '10.0.0.1', 'person', 'api', 22, 'root', 'secret')
    insertAsset.run('p2', '10.0.0.10', 'person', 'db', 22, 'root', 'secret')
    insertAsset.run('b1', '192.168.1.1', 'organization', 'bastion-a', 22, 'ops', 'secret')
    insertAsset.run('b2', '192.168.1.2', 'organization-qizhi', 'bastion-b', 22, 'ops', 'secret')
    const insertChild = db.prepare('INSERT INTO t_organization_assets VALUES (?, ?, ?, ?, ?)')
    insertChild.run('c1', 'b1', '10.0.0.1', 'api-via-a', '')
    insertChild.run('c2', 'b2', '10.0.0.1', 'api-via-b', '')

    expect(findMcpTargetsByHost(db, '10.0.0.10').map((t) => t.target_id)).toEqual(['p2'])
    const shared = findMcpTargetsByHost(db, '10.0.0.1')
    expect(shared.map((t) => t.target_id)).toEqual(['c1', 'c2', 'p1'])
    expect(shared.find((t) => t.target_id === 'c2')).toMatchObject({ connection_type: 'qizhi', group: 'bastion-b' })
    expect(findMcpTargetsByHost(db, '10.0.0')).toEqual([])
    expect(JSON.stringify(shared)).not.toContain('secret')
    db.close()
  })
})
