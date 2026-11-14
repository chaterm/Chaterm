import Database from 'better-sqlite3'

/**
 * In-memory database with the chat tables in their final shape (baseline schema plus migrations).
 */
export function createChatDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE agent_api_conversation_history_v1 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      task_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      role TEXT NOT NULL,
      content_type TEXT,
      content_data TEXT,
      tool_use_id TEXT,
      sequence_order INTEGER,
      message_index INTEGER
    );

    CREATE TABLE agent_ui_messages_v1 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      ts INTEGER NOT NULL,
      type TEXT NOT NULL,
      ask_type TEXT,
      say_type TEXT,
      text TEXT,
      content_parts TEXT,
      reasoning TEXT,
      images TEXT,
      partial INTEGER DEFAULT 0,
      last_checkpoint_hash TEXT,
      is_checkpoint_checked_out INTEGER DEFAULT 0,
      is_operation_outside_workspace INTEGER DEFAULT 0,
      conversation_history_index INTEGER,
      conversation_history_deleted_range TEXT,
      mcp_tool_call_data TEXT,
      hosts TEXT
    );

    CREATE TABLE agent_task_metadata_v1 (
      task_id TEXT PRIMARY KEY,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      files_in_context TEXT,
      model_usage TEXT,
      hosts TEXT,
      todos TEXT,
      experience_ledger TEXT,
      title TEXT,
      favorite INTEGER DEFAULT 0,
      workspace TEXT NOT NULL DEFAULT 'server',
      db_context TEXT
    );

    CREATE TABLE agent_context_history_v1 (
      task_id TEXT PRIMARY KEY,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      context_history_data TEXT NOT NULL
    );

    CREATE TABLE agent_chat_sync_task_state (
      task_id TEXT PRIMARY KEY,
      local_change_seq INTEGER DEFAULT 0,
      acked_local_change_seq INTEGER DEFAULT 0,
      last_uploaded_hash TEXT,
      last_uploaded_hash_version INTEGER DEFAULT 0,
      last_applied_hash TEXT,
      last_applied_hash_version INTEGER DEFAULT 0,
      last_server_revision INTEGER DEFAULT 0,
      pending_upload INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      remote_deleted INTEGER DEFAULT 0,
      sync_blocked_reason TEXT,
      last_sync_status TEXT,
      last_error TEXT,
      updated_at INTEGER
    );
  `)
  return db
}
