const Database = require('better-sqlite3')
const fs = require('fs')
const path = require('path')

// 初始化数据库文件名，固定在当前文件目录
const dbPath = path.join(__dirname, 'init_chaterm.db')

// 如果数据库已存在则删除，保证初始化版本干净
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath)
  console.log(`已删除旧的 ${dbPath}`)
}

// 创建物理文件并连接
const db = new Database(dbPath)

db.exec(`
CREATE TABLE IF NOT EXISTS t_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,             -- 模型ID
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,    -- 创建时间
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,    -- 更新时间
  label TEXT,                                       -- 名称
  asset_ip TEXT,                                    -- 服务器IP
  group_name TEXT,                                  -- 分组名称
  uuid TEXT UNIQUE,                                 -- 唯一ID
  auth_type TEXT,                                   -- 认证方式
  port INTEGER,                                     -- 端口
  username TEXT,                                    -- 用户名
  password TEXT,                                    -- 密码
  key_chain_id INTEGER,                             -- 密钥链ID
  favorite  INTEGER                                 -- 是否收藏
);

CREATE TABLE IF NOT EXISTS t_asset_chains (
  key_chain_id INTEGER PRIMARY KEY AUTOINCREMENT,   -- 秘钥ID
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,    -- 创建时间
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,    -- 更新时间
  chain_name TEXT,                                  -- 秘钥链名称
  chain_type TEXT,                                  -- 秘钥链类型
  chain_private_key TEXT,                           -- 私钥
  chain_public_key TEXT,                            -- 公钥
  passphrase TEXT                                   -- 密码
);

CREATE TABLE IF NOT EXISTS agent_api_conversation_history_v1 (
  created_at INTEGER DEFAULT (strftime('%s', 'now')), -- 写入时间戳 (新增)
  task_id TEXT PRIMARY KEY,                           -- 会话任务ID (主键)
  ts INTEGER NOT NULL,                              -- 消息时间戳 (毫秒级)
  role TEXT NOT NULL,                               -- 角色 (user/assistant)
  content_type TEXT,                                -- 内容类型 (text/tool_use/tool_result)
  content_data TEXT,                                -- 内容数据 (JSON格式)
  tool_use_id TEXT,                                 -- 工具使用ID
  sequence_order INTEGER                            -- 消息顺序
);
CREATE INDEX IF NOT EXISTS idx_task_time ON agent_api_conversation_history_v1(task_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_time_desc ON agent_api_conversation_history_v1(ts DESC);

CREATE TABLE IF NOT EXISTS agent_ui_messages_v1 (
  task_id TEXT PRIMARY KEY,                          -- 会话任务ID (主键)
  created_at INTEGER DEFAULT (strftime('%s', 'now')), -- 写入时间戳 (新增)
  ts INTEGER NOT NULL,                              -- 消息时间戳 (毫秒级)
  type TEXT NOT NULL,                               -- 消息类型 ("ask" | "say")
  ask_type TEXT,                                    -- ask类型 (ClineAsk)
  say_type TEXT,                                    -- say类型 (ClineSay)
  text TEXT,                                        -- 文本内容
  reasoning TEXT,                                   -- 推理内容
  images TEXT,                                      -- 图片数组 (JSON格式)
  partial INTEGER DEFAULT 0,                        -- 是否部分消息 (boolean as 0/1)
  last_checkpoint_hash TEXT,                        -- 最后检查点哈希
  is_checkpoint_checked_out INTEGER DEFAULT 0,      -- 是否检查点已检出 (boolean as 0/1)
  is_operation_outside_workspace INTEGER DEFAULT 0, -- 是否工作区外操作 (boolean as 0/1)
  conversation_history_index INTEGER,               -- 对话历史索引
  conversation_history_deleted_range TEXT           -- 删除范围 (JSON格式 [number, number])
);
CREATE INDEX IF NOT EXISTS idx_ts_desc ON agent_ui_messages_v1(ts DESC);
CREATE INDEX IF NOT EXISTS idx_created_at ON agent_ui_messages_v1(created_at DESC);

CREATE TABLE IF NOT EXISTS agent_task_metadata_v1 (
  task_id TEXT PRIMARY KEY,                         -- 任务ID (主键)
  created_at INTEGER DEFAULT (strftime('%s', 'now')), -- 写入时间戳
  updated_at INTEGER DEFAULT (strftime('%s', 'now')), -- 更新时间戳
  files_in_context TEXT,                             -- 文件上下文元数据 (JSON格式)
  model_usage TEXT                                   -- 模型使用记录 (JSON格式)
);
CREATE INDEX IF NOT EXISTS idx_created_at_meta ON agent_task_metadata_v1(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_updated_at_meta ON agent_task_metadata_v1(updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_context_history_v1 (
  task_id TEXT PRIMARY KEY,                         -- 任务ID (主键)
  created_at INTEGER DEFAULT (strftime('%s', 'now')), -- 创建时间戳
  updated_at INTEGER DEFAULT (strftime('%s', 'now')), -- 更新时间戳
  context_history_data TEXT NOT NULL               -- 完整上下文历史 (JSON格式)
);
CREATE INDEX IF NOT EXISTS idx_context_created_at ON agent_context_history_v1(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_context_updated_at ON agent_context_history_v1(updated_at DESC);
`)

console.log('数据库创建成功，表已创建')

// 查询数据以验证
const count = db.prepare('SELECT COUNT(*) as count FROM t_assets').get()
console.log(`数据库中共有 ${count.count} 条命令记录`)

// 验证新创建的对话历史表
const conversationCount = db
  .prepare('SELECT COUNT(*) as count FROM agent_api_conversation_history_v1')
  .get()
console.log(`对话历史表中共有 ${conversationCount.count} 条记录`)

// 验证新创建的UI消息表
const uiMessageCount = db.prepare('SELECT COUNT(*) as count FROM agent_ui_messages_v1').get()
console.log(`UI消息表中共有 ${uiMessageCount.count} 条记录`)

// 验证新创建的任务元数据表
const metadataCount = db.prepare('SELECT COUNT(*) as count FROM agent_task_metadata_v1').get()
console.log(`任务元数据表中共有 ${metadataCount.count} 条记录`)

// 验证新创建的上下文历史表
const contextHistoryCount = db
  .prepare('SELECT COUNT(*) as count FROM agent_context_history_v1')
  .get()
console.log(`上下文历史表中共有 ${contextHistoryCount.count} 条记录`)

// 关闭数据库连接
db.close()
