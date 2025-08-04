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
  id INTEGER PRIMARY KEY AUTOINCREMENT,                -- 新增自增主键
  created_at INTEGER DEFAULT (strftime('%s', 'now')),  -- 写入时间戳
  task_id TEXT NOT NULL,                               -- 会话任务ID
  ts INTEGER NOT NULL,                                 -- 消息时间戳
  role TEXT NOT NULL,                                  -- 角色
  content_type TEXT,                                   -- 内容类型
  content_data TEXT,                                   -- 内容数据
  tool_use_id TEXT,                                    -- 工具使用ID
  sequence_order INTEGER                               -- 消息顺序
);
CREATE INDEX IF NOT EXISTS idx_task_time ON agent_api_conversation_history_v1(task_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_time_desc ON agent_api_conversation_history_v1(ts DESC);

CREATE TABLE IF NOT EXISTS agent_ui_messages_v1 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,                -- 新增自增主键
  task_id TEXT NOT NULL,                               -- 会话任务ID
  created_at INTEGER DEFAULT (strftime('%s', 'now')),  -- 写入时间戳
  ts INTEGER NOT NULL,                                 -- 消息时间戳
  type TEXT NOT NULL,                                  -- 消息类型
  ask_type TEXT,
  say_type TEXT,
  text TEXT,
  reasoning TEXT,
  images TEXT,
  partial INTEGER DEFAULT 0,
  last_checkpoint_hash TEXT,
  is_checkpoint_checked_out INTEGER DEFAULT 0,
  is_operation_outside_workspace INTEGER DEFAULT 0,
  conversation_history_index INTEGER,
  conversation_history_deleted_range TEXT
);
CREATE INDEX IF NOT EXISTS idx_task_ts ON agent_ui_messages_v1(task_id, ts ASC);
CREATE INDEX IF NOT EXISTS idx_ts_desc ON agent_ui_messages_v1(ts DESC);
CREATE INDEX IF NOT EXISTS idx_created_at ON agent_ui_messages_v1(created_at DESC);

CREATE TABLE IF NOT EXISTS agent_task_metadata_v1 (
  task_id TEXT PRIMARY KEY,                          -- 任务ID (主键)
  created_at INTEGER DEFAULT (strftime('%s', 'now')), -- 写入时间戳
  updated_at INTEGER DEFAULT (strftime('%s', 'now')), -- 更新时间戳
  files_in_context TEXT,                             -- 文件上下文元数据 (JSON格式)
  model_usage TEXT,                                  -- 模型使用记录 (JSON格式)
  hosts TEXT                                         -- 主机信息 (JSON格式)
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

CREATE TABLE IF NOT EXISTS user_snippet_v1 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,                -- 新增自增主键
  created_at INTEGER DEFAULT (strftime('%s', 'now')),  -- 写入时间戳
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),  -- 更新时间戳
  snippet_name TEXT NOT NULL,                           -- 快捷命令名称
  snippet_content TEXT NOT NULL                        -- 快捷命令内容
);
CREATE TABLE IF NOT EXISTS t_organization_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,             -- 资源ID
  organization_uuid TEXT,                           -- 组织UUID
  hostname TEXT,                                    -- 主机名
  host TEXT,                                        -- 主机IP
  jump_server_type TEXT,                            -- 跳板机类型
  favorite INTEGER DEFAULT 2,                       -- 是否收藏
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,    -- 创建时间
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP     -- 更新时间
);

CREATE TABLE IF NOT EXISTS login_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,             -- 自增主键
  username TEXT,                                    -- 用户名
  email TEXT,                                       -- 邮箱
  ip_address TEXT,                                  -- IP地址
  mac_address TEXT,                                 -- MAC地址
  login_method TEXT,                                -- 登录方式（邮箱验证码、Github、Google、QQ、账号密码等）
  status TEXT DEFAULT 'success',                    -- 登录状态（success、failed）
  user_agent TEXT,                                  -- 用户代理
  platform TEXT,                                   -- 平台信息
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP     -- 登录时间
);
CREATE INDEX IF NOT EXISTS idx_login_log_created_at ON login_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_log_email ON login_log(email);

CREATE TABLE IF NOT EXISTS operation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,             -- 自增主键
  username TEXT,                                    -- 用户名
  ip TEXT,                                          -- 主机或IP
  command_input TEXT,                               -- 命令输入
  command_output TEXT,                              -- 命令输出
  status TEXT DEFAULT 'success',                    -- 执行状态（success、failed、timeout）
  session_id TEXT,                                  -- SSH会话ID
  task_id TEXT,                                     -- 任务ID
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP     -- 操作时间
);
CREATE INDEX IF NOT EXISTS idx_operation_log_created_at ON operation_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_log_ip ON operation_log(ip);
CREATE INDEX IF NOT EXISTS idx_operation_log_command ON operation_log(command_input);
CREATE INDEX IF NOT EXISTS idx_operation_log_username ON operation_log(username);
`)

console.log('数据库创建成功，表已创建')

// 查询数据以验证
const count = db.prepare('SELECT COUNT(*) as count FROM t_assets').get()
console.log(`数据库中共有 ${count.count} 条命令记录`)

// 验证新创建的对话历史表
const conversationCount = db.prepare('SELECT COUNT(*) as count FROM agent_api_conversation_history_v1').get()
console.log(`对话历史表中共有 ${conversationCount.count} 条记录`)

// 验证新创建的UI消息表
const uiMessageCount = db.prepare('SELECT COUNT(*) as count FROM agent_ui_messages_v1').get()
console.log(`UI消息表中共有 ${uiMessageCount.count} 条记录`)

// 验证新创建的任务元数据表
const metadataCount = db.prepare('SELECT COUNT(*) as count FROM agent_task_metadata_v1').get()
console.log(`任务元数据表中共有 ${metadataCount.count} 条记录`)

// 验证新创建的上下文历史表
const contextHistoryCount = db.prepare('SELECT COUNT(*) as count FROM agent_context_history_v1').get()
console.log(`上下文历史表中共有 ${contextHistoryCount.count} 条记录`)

// 验证新创建的快捷命令表
const snippetCount = db.prepare('SELECT COUNT(*) as count FROM user_snippet_v1').get()
console.log(`快捷命令表中共有 ${snippetCount.count} 条记录`)

// 关闭数据库连接
db.close()
