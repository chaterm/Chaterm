import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { getMcpTarget, listMcpTargets } from '../mcp-targets'

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
    db.close()
  })
})
