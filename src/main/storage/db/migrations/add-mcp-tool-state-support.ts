import Database from 'better-sqlite3'

/**
 * 为MCP工具状态管理添加数据库支持
 * 创建 mcp_tool_state 表用于持久化每个服务器中每个工具的启用/禁用状态
 */
export async function upgradeMcpToolStateSupport(db: Database.Database): Promise<void> {
  try {
    // 检查表是否已存在
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

      // 创建索引以优化查询性能
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
