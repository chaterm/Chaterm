import type Database from 'better-sqlite3'
import type { McpTarget } from '../../../../shared/external-mcp'

// Deliberately read-only: the UI's getUserHosts also deletes orphaned assets.
export function listMcpTargets(db: Database.Database, search: string, limit: number, offset: number): McpTarget[] {
  return db
    .prepare(
      `
    SELECT * FROM (
      SELECT uuid AS target_id, COALESCE(NULLIF(label, ''), asset_ip) AS name,
        asset_ip AS host, COALESCE(port, 22) AS port, 'ssh' AS connection_type, NULL AS "group"
      FROM t_assets WHERE asset_type IN ('person', 'person-switch-cisco', 'person-switch-huawei')
      UNION ALL
      SELECT oa.uuid AS target_id, COALESCE(NULLIF(oa.hostname, ''), oa.host) AS name,
        oa.host, COALESCE(a.port, 22) AS port,
        COALESCE(NULLIF(oa.jump_server_type, ''), CASE WHEN a.asset_type = 'organization' THEN 'jumpserver'
          ELSE SUBSTR(a.asset_type, 14) END) AS connection_type,
        COALESCE(NULLIF(a.label, ''), a.asset_ip) AS "group"
      FROM t_organization_assets oa JOIN t_assets a ON a.uuid = oa.organization_uuid
      WHERE a.asset_type = 'organization' OR a.asset_type LIKE 'organization-%'
    ) WHERE name LIKE ? OR host LIKE ? OR "group" LIKE ?
    ORDER BY target_id LIMIT ? OFFSET ?
  `
    )
    .all(`%${search}%`, `%${search}%`, `%${search}%`, limit, offset) as McpTarget[]
}

export function getMcpTarget(db: Database.Database, targetId: string): McpTarget | null {
  return (
    (db
      .prepare(
        `
    SELECT * FROM (
      SELECT uuid AS target_id, COALESCE(NULLIF(label, ''), asset_ip) AS name,
        asset_ip AS host, COALESCE(port, 22) AS port, 'ssh' AS connection_type, NULL AS "group"
      FROM t_assets WHERE asset_type IN ('person', 'person-switch-cisco', 'person-switch-huawei')
      UNION ALL
      SELECT oa.uuid AS target_id, COALESCE(NULLIF(oa.hostname, ''), oa.host) AS name,
        oa.host, COALESCE(a.port, 22) AS port,
        COALESCE(NULLIF(oa.jump_server_type, ''), CASE WHEN a.asset_type = 'organization' THEN 'jumpserver'
          ELSE SUBSTR(a.asset_type, 14) END) AS connection_type,
        COALESCE(NULLIF(a.label, ''), a.asset_ip) AS "group"
      FROM t_organization_assets oa JOIN t_assets a ON a.uuid = oa.organization_uuid
      WHERE a.asset_type = 'organization' OR a.asset_type LIKE 'organization-%'
    ) WHERE target_id = ?
  `
      )
      .get(targetId) as McpTarget | undefined) || null
  )
}
