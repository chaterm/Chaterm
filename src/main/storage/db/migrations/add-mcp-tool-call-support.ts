import Database from 'better-sqlite3'
const logger = createLogger('db')

/**
 * Add database support for MCP tool call information
 * Add mcp_tool_call_data field to agent_ui_messages_v1 table
 * Used to store detailed information of MCP tool calls (server name, tool name, parameters)
 */
export async function upgradeMcpToolCallSupport(db: Database.Database): Promise<void> {
  try {
    // Check if mcp_tool_call_data field already exists
    const tableInfo = db.prepare('PRAGMA table_info(agent_ui_messages_v1)').all()
    const mcpToolCallColumnExists = tableInfo.some((col: any) => col.name === 'mcp_tool_call_data')

    if (!mcpToolCallColumnExists) {
      logger.info('Adding mcp_tool_call_data column to agent_ui_messages_v1 table...')
      db.exec('ALTER TABLE agent_ui_messages_v1 ADD COLUMN mcp_tool_call_data TEXT')
      logger.info('mcp_tool_call_data column added successfully')
    } else {
      logger.info('mcp_tool_call_data column already exists, skipping migration')
    }
  } catch (error) {
    logger.error('Failed to upgrade MCP tool call support', { error: error })
    throw error
  }
}
