import Database from 'better-sqlite3'

/**
 * Add database support for MCP tool state management
 * Create mcp_tool_state table to persist enabled/disabled state of each tool in each server
 */
export async function upgradeMcpToolStateSupport(db: Database.Database): Promise<void> {
  try {
    // Check if table already exists
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mcp_tool_state'").get()

    if (!tableExists) {
      console.log('Creating mcp_tool_state table...')

      db.exec(`
        CREATE TABLE mcp_tool_state (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_name TEXT NOT NULL,
          tool_name TEXT NOT NULL,
          enabled INTEGER DEFAULT 1,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          UNIQUE(server_name, tool_name)
        )
      `)

      // Create indexes to optimize query performance
      db.exec(`
        CREATE INDEX idx_mcp_tool_state_server ON mcp_tool_state(server_name);
        CREATE INDEX idx_mcp_tool_state_enabled ON mcp_tool_state(enabled);
      `)

      console.log('mcp_tool_state table created successfully')
    } else {
      console.log('mcp_tool_state table already exists, skipping migration')
    }
  } catch (error) {
    console.error('Failed to upgrade MCP tool state support:', error)
    throw error
  }
}
