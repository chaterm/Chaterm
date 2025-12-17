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
 * Get state of a single tool
 * @param db Database instance
 * @param serverName MCP server name
 * @param toolName Tool name
 * @returns Tool state, returns null if not exists (defaults to enabled)
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
 * Set tool enabled/disabled state
 * @param db Database instance
 * @param serverName MCP server name
 * @param toolName Tool name
 * @param enabled Whether enabled (true/false)
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
 * Get states of all tools for specified server
 * @param db Database instance
 * @param serverName MCP server name
 * @returns List of tool states
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
 * Get states of all tools
 * @param db Database instance
 * @returns Map of all tool states, key is "serverName:toolName"
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
 * Delete all tool states for specified server (used when server is deleted)
 * @param db Database instance
 * @param serverName MCP server name
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
