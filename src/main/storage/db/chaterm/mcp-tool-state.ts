import Database from 'better-sqlite3'

export interface McpToolState {
  id: number
  server_name: string
  tool_name: string
  enabled: number
  created_at: string
  updated_at: string
}

/**
 * 获取单个工具的状态
 * @param db 数据库实例
 * @param serverName MCP服务器名称
 * @param toolName 工具名称
 * @returns 工具状态，如果不存在则返回null（默认为启用）
 */
export function getToolStateLogic(db: Database.Database, serverName: string, toolName: string): McpToolState | null {
  try {
    const stmt = db.prepare(`
      SELECT * FROM mcp_tool_state 
      WHERE server_name = ? AND tool_name = ?
    `)
    const result = stmt.get(serverName, toolName) as McpToolState | undefined
    return result || null
  } catch (error) {
    console.error('Failed to get tool state:', error)
    throw error
  }
}

/**
 * 设置工具的启用/禁用状态
 * @param db 数据库实例
 * @param serverName MCP服务器名称
 * @param toolName 工具名称
 * @param enabled 是否启用（true/false）
 */
export function setToolStateLogic(db: Database.Database, serverName: string, toolName: string, enabled: boolean): void {
  try {
    const enabledValue = enabled ? 1 : 0
    const stmt = db.prepare(`
      INSERT INTO mcp_tool_state (server_name, tool_name, enabled, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(server_name, tool_name) 
      DO UPDATE SET enabled = ?, updated_at = datetime('now')
    `)
    stmt.run(serverName, toolName, enabledValue, enabledValue)
    console.log(`Tool state updated: ${serverName}:${toolName} = ${enabled}`)
  } catch (error) {
    console.error('Failed to set tool state:', error)
    throw error
  }
}

/**
 * 获取指定服务器所有工具的状态
 * @param db 数据库实例
 * @param serverName MCP服务器名称
 * @returns 工具状态列表
 */
export function getServerToolStatesLogic(db: Database.Database, serverName: string): McpToolState[] {
  try {
    const stmt = db.prepare(`
      SELECT * FROM mcp_tool_state 
      WHERE server_name = ?
      ORDER BY tool_name
    `)
    return stmt.all(serverName) as McpToolState[]
  } catch (error) {
    console.error('Failed to get server tool states:', error)
    throw error
  }
}

/**
 * 获取所有工具的状态
 * @param db 数据库实例
 * @returns 所有工具状态的Map，key为 "serverName:toolName"
 */
export function getAllToolStatesLogic(db: Database.Database): Record<string, boolean> {
  try {
    const stmt = db.prepare(`
      SELECT server_name, tool_name, enabled 
      FROM mcp_tool_state
    `)
    const rows = stmt.all() as Array<{ server_name: string; tool_name: string; enabled: number }>

    const statesMap: Record<string, boolean> = {}
    rows.forEach((row) => {
      const key = `${row.server_name}:${row.tool_name}`
      statesMap[key] = row.enabled === 1
    })

    return statesMap
  } catch (error) {
    console.error('Failed to get all tool states:', error)
    throw error
  }
}

/**
 * 删除指定服务器的所有工具状态（当服务器被删除时使用）
 * @param db 数据库实例
 * @param serverName MCP服务器名称
 */
export function deleteServerToolStatesLogic(db: Database.Database, serverName: string): void {
  try {
    const stmt = db.prepare(`
      DELETE FROM mcp_tool_state WHERE server_name = ?
    `)
    stmt.run(serverName)
    console.log(`All tool states for server ${serverName} deleted`)
  } catch (error) {
    console.error('Failed to delete server tool states:', error)
    throw error
  }
}
