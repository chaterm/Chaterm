import Database from 'better-sqlite3'

/**
 * 为 MCP 工具调用信息添加数据库支持
 * 在 agent_ui_messages_v1 表中添加 mcp_tool_call_data 字段
 * 用于存储 MCP 工具调用的详细信息（服务器名、工具名、参数）
 */
export async function upgradeMcpToolCallSupport(db: Database.Database): Promise<void> {
  try {
    // 检查 mcp_tool_call_data 字段是否已存在
    const tableInfo = db.prepare('PRAGMA table_info(agent_ui_messages_v1)').all()
    const mcpToolCallColumnExists = tableInfo.some((col: any) => col.name === 'mcp_tool_call_data')

    if (!mcpToolCallColumnExists) {
      console.log('Adding mcp_tool_call_data column to agent_ui_messages_v1 table...')
      db.exec('ALTER TABLE agent_ui_messages_v1 ADD COLUMN mcp_tool_call_data TEXT')
      console.log('mcp_tool_call_data column added successfully')
    } else {
      console.log('mcp_tool_call_data column already exists, skipping migration')
    }
  } catch (error) {
    console.error('Failed to upgrade MCP tool call support:', error)
    throw error
  }
}
