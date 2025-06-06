import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
// 定义数据库路径
const USER_DATA_PATH = app.getPath('userData')
const COMPLETE_DB_PATH = join(USER_DATA_PATH, 'databases/complete_data.db')
const Chaterm_DB_PATH = join(USER_DATA_PATH, 'databases/chaterm_data.db')
const INIT_DB_PATH = join(__dirname, '../../src/renderer/src/assets/db/init_data.db')
const INIT_CDB_PATH = join(__dirname, '../../src/renderer/src/assets/db/init_chaterm.db')

export async function initDatabase(): Promise<Database.Database> {
  try {
    // 检查目标数据库是否存在
    if (!fs.existsSync(COMPLETE_DB_PATH)) {
      // 确保 init_data.db 存在
      if (!fs.existsSync(INIT_DB_PATH)) {
        throw new Error('Initial database (init_data.db) not found')
      }
      const sourceDb = new Database(INIT_DB_PATH, { readonly: true })
      const dir = path.dirname(COMPLETE_DB_PATH)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      await sourceDb.backup(COMPLETE_DB_PATH)
      sourceDb.close()
    } else {
      console.log('Target database already exists, skipping initialization')
    }

    // 返回数据库实例
    const db = new Database(COMPLETE_DB_PATH)
    console.log('Database connection established')
    return db
  } catch (error) {
    console.error('Database initialization failed:', error)
    throw error
  }
}

export async function initChatermDatabase(): Promise<Database.Database> {
  try {
    const dbDir = path.dirname(Chaterm_DB_PATH)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }

    if (!fs.existsSync(INIT_CDB_PATH)) {
      throw new Error(`Initial database (init_chaterm.db) not found at ${INIT_CDB_PATH}`)
    }

    const targetDbExists = fs.existsSync(Chaterm_DB_PATH)

    if (!targetDbExists) {
      console.log('Target Chaterm database does not exist. Copying from initial database.')
      const sourceDb = new Database(INIT_CDB_PATH, { readonly: true, fileMustExist: true })
      try {
        await sourceDb.backup(Chaterm_DB_PATH)
        console.log('Chaterm database successfully copied.')
      } finally {
        sourceDb.close()
      }
    } else {
      console.log('Target Chaterm database exists. Attempting schema synchronization.')
      let mainDb: Database.Database | null = null
      let initDb: Database.Database | null = null
      try {
        mainDb = new Database(Chaterm_DB_PATH)
        initDb = new Database(INIT_CDB_PATH, { readonly: true, fileMustExist: true })

        const initTables = initDb
          .prepare(
            "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
          )
          .all() as { name: string; sql: string }[]

        for (const initTable of initTables) {
          const tableName = initTable.name
          const createTableSql = initTable.sql

          const tableExists = mainDb
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
            .get(tableName)

          if (!tableExists) {
            console.log(`Table ${tableName} not found in target DB. Creating table.`)
            mainDb.exec(createTableSql)
          } else {
            console.log(`Table ${tableName} found in target DB. Checking for missing columns.`)
            const initTableInfo = initDb.pragma(`table_info(${tableName})`) as {
              name: string
              type: string
              notnull: number
              dflt_value: any
              pk: number
            }[]
            const mainTableInfo = mainDb.pragma(`table_info(${tableName})`) as { name: string }[]
            const mainTableColumnNames = new Set(mainTableInfo.map((col) => col.name))

            for (const initColumn of initTableInfo) {
              if (!mainTableColumnNames.has(initColumn.name)) {
                let addColumnSql = `ALTER TABLE ${tableName} ADD COLUMN ${initColumn.name} ${initColumn.type}`

                if (initColumn.dflt_value !== null) {
                  let defaultValueFormatted
                  if (typeof initColumn.dflt_value === 'string') {
                    // PRAGMA dflt_value is already SQL-literal like for strings (e.g. 'text' or "'text'")
                    defaultValueFormatted = initColumn.dflt_value
                  } else {
                    defaultValueFormatted = initColumn.dflt_value
                  }
                  addColumnSql += ` DEFAULT ${defaultValueFormatted}`
                }

                if (initColumn.notnull) {
                  // 1 if NOT NULL, 0 otherwise
                  if (initColumn.dflt_value !== null) {
                    addColumnSql += ' NOT NULL'
                  } else {
                    console.warn(
                      `Column '${initColumn.name}' in table '${tableName}' is defined as NOT NULL without a default value in the initial schema. Adding it as nullable to the existing table to avoid errors. Manual schema adjustment might be needed if strict NOT NULL is required and the table contains data.`
                    )
                  }
                }
                try {
                  console.log(
                    `Attempting to add column ${initColumn.name} to table ${tableName} with SQL: ${addColumnSql}`
                  )
                  mainDb.exec(addColumnSql)
                  console.log(`Successfully added column ${initColumn.name} to table ${tableName}.`)
                } catch (e: any) {
                  console.error(
                    `Failed to add column ${initColumn.name} to table ${tableName}: ${e.message}. SQL: ${addColumnSql}`
                  )
                }
              }
            }
          }
        }
        console.log('Chaterm database schema synchronization attempt complete.')
      } catch (syncError: any) {
        console.error('Error during Chaterm database schema synchronization:', syncError.message)
        // Rethrow if we want the entire init to fail.
        // throw syncError;
      } finally {
        if (mainDb && mainDb.open) mainDb.close()
        if (initDb && initDb.open) initDb.close()
      }
    }

    // Return the database instance (always from Chaterm_DB_PATH)
    const finalDb = new Database(Chaterm_DB_PATH)
    console.log('Chaterm database connection established. Path: ' + Chaterm_DB_PATH)
    return finalDb
  } catch (error: any) {
    console.error('Chaterm database initialization/synchronization failed:', error.message)
    throw error
  }
}

interface CommandResult {
  command: string
}

interface AssetNode {
  key: string
  title: string
  favorite: boolean
  ip: string
  uuid: string
  group_name?: string
  label?: string
  auth_type?: string
  port?: number
  username?: string
  key_chain_id?: number
  organization_id?: string
}

interface RouterNode {
  key: string
  title: string
  children: AssetNode[]
}

interface QueryResult {
  code: number
  data: {
    routers: RouterNode[]
  }
  ts: string
}

interface EvictConfig {
  evict_type: string
  evict_value: number
  evict_current_value: number
}

export class ChatermDatabaseService {
  private static instance: ChatermDatabaseService
  private db: Database.Database

  private constructor(db: Database.Database) {
    this.db = db
  }

  public static async getInstance(): Promise<ChatermDatabaseService> {
    if (!ChatermDatabaseService.instance) {
      const db = await initChatermDatabase()
      ChatermDatabaseService.instance = new ChatermDatabaseService(db)
    }
    return ChatermDatabaseService.instance
  }

  getLocalAssetRoute(searchType: string, params: any[] = []): any {
    try {
      console.log('Chaterm database query params:', params)
      const result: QueryResult = {
        code: 200,
        data: {
          routers: []
        },
        ts: new Date().toString()
      }
      if (searchType !== 'assetConfig') {
        const favoritesStmt = this.db.prepare(`
        SELECT label, asset_ip, uuid, group_name,label,auth_type,port,username,password,key_chain_id
        FROM t_assets
        WHERE favorite = 1
        ORDER BY created_at
      `)
        const favorites = favoritesStmt.all() || []

        if (favorites && favorites.length > 0) {
          result.data.routers.push({
            key: 'favorite',
            title: '收藏栏',
            children: favorites.map((item: any) => ({
              key: `favorite_${item.asset_ip || ''}`,
              title: item.label || item.asset_ip || '',
              favorite: true,
              ip: item.asset_ip || '',
              uuid: item.uuid || '',
              group_name: item.group_name || '',
              label: item.label || '',
              authType: item.auth_type || '',
              port: item.port || 22,
              username: item.username || '',
              password: item.password || '',
              key_chain_id: item.key_chain_id || 0,
              organizationId: 'personal'
            }))
          })
        }
      }

      const groupsStmt = this.db.prepare(`
        SELECT DISTINCT group_name
        FROM t_assets
        WHERE group_name IS NOT NULL
        ORDER BY group_name
      `)
      const groups = groupsStmt.all() || []

      for (const group of groups) {
        if (!group || !group.group_name) continue
        const assetsStmt = this.db.prepare(`
          SELECT label, asset_ip, uuid, favorite,group_name,label,auth_type,port,username,password,key_chain_id
          FROM t_assets
          WHERE group_name = ?
          ORDER BY created_at
        `)
        const assets = assetsStmt.all(group.group_name) || []

        if (assets && assets.length > 0) {
          result.data.routers.push({
            key: group.group_name,
            title: group.group_name,
            children: assets.map((item: any) => ({
              key: `${group.group_name}_${item.asset_ip || ''}`,
              title: item.label || item.asset_ip || '',
              favorite: item.favorite === 1,
              ip: item.asset_ip || '',
              uuid: item.uuid || '',
              group_name: item.group_name || '',
              label: item.label || '',
              auth_type: item.auth_type || '',
              port: item.port || 22,
              username: item.username || '',
              password: item.password || '',
              key_chain_id: item.key_chain_id || 0,
              organizationId: 'personal'
            }))
          })
        }
      }

      return result
    } catch (error) {
      console.error('Chaterm database query error:', error)
      throw error
    }
  }

  updateLocalAssetLabel(uuid: string, label: string): any {
    try {
      const stmt = this.db.prepare(`
        UPDATE t_assets
        SET label = ?
        WHERE uuid = ?
      `)
      const result = stmt.run(label, uuid)
      return {
        data: {
          message: result.changes > 0 ? 'success' : 'failed'
        }
      }
    } catch (error) {
      console.error('Chaterm database get error:', error)
      throw error
    }
  }

  updateLocalAsseFavorite(uuid: string, status: number): any {
    try {
      const stmt = this.db.prepare(`
        UPDATE t_assets
        SET favorite = ?
        WHERE uuid = ?
      `)
      const result = stmt.run(status, uuid)
      return {
        data: {
          message: result.changes > 0 ? 'success' : 'failed'
        }
      }
    } catch (error) {
      console.error('Chaterm database get error:', error)
      throw error
    }
  }

  getAssetGroup(): any {
    try {
      const stmt = this.db.prepare(`
        SELECT DISTINCT group_name
        FROM t_assets
        WHERE group_name IS NOT NULL
        ORDER BY group_name
      `)
      const results = stmt.all() || []

      return {
        data: {
          groups: results.map((item: any) => item.group_name)
        }
      }
    } catch (error) {
      console.error('Chaterm database get error:', error)
      throw error
    }
  }

  // 获取密钥链选项
  getKeyChainSelect(): any {
    try {
      const stmt = this.db.prepare(`
        SELECT key_chain_id, chain_name
        FROM t_asset_chains
        ORDER BY created_at
      `)
      const results = stmt.all() || []

      return {
        data: {
          keyChain: results.map((item: any) => ({
            key: item.key_chain_id,
            label: item.chain_name
          }))
        }
      }
    } catch (error) {
      console.error('Chaterm database get keychain error:', error)
      throw error
    }
  }
  createKeyChain(params: any): any {
    try {
      const form = params
      if (!form) {
        throw new Error('No keychain data provided')
      }
      const insertStmt = this.db.prepare(`
        INSERT INTO t_asset_chains (chain_name, chain_private_key, chain_public_key, chain_type, passphrase) VALUES (?, ?, ?, ?, ?)
      `)
      const result = insertStmt.run(
        form.chain_name,
        form.private_key,
        form.public_key,
        form.chain_type,
        form.passphrase
      )
      return {
        data: {
          message: result.changes > 0 ? 'success' : 'failed'
        }
      }
    } catch (error) {
      console.error('Chaterm database create keychain error:', error)
      throw error
    }
  }

  deleteKeyChain(id: number): any {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM t_asset_chains
        WHERE key_chain_id = ?
      `)
      const result = stmt.run(id)
      return {
        data: {
          message: result.changes > 0 ? 'success' : 'failed'
        }
      }
    } catch (error) {
      console.error('Chaterm database delete keychain error:', error)
      throw error
    }
  }
  getKeyChainInfo(id: number): any {
    try {
      const stmt = this.db.prepare(`
        SELECT key_chain_id, chain_name, chain_private_key as private_key, chain_public_key as public_key, chain_type, passphrase
        FROM t_asset_chains
        WHERE key_chain_id = ?
      `)
      const result = stmt.get(id)
      return result
    } catch (error) {
      console.error('Chaterm database get keychain error:', error)
      throw error
    }
  }
  updateKeyChain(params: any): any {
    try {
      const form = params
      if (!form) {
        throw new Error('No keychain data provided')
      }
      const stmt = this.db.prepare(`
        UPDATE t_asset_chains
        SET chain_name = ?,
            chain_private_key = ?,
            chain_public_key = ?,
            chain_type = ?,
            passphrase = ?
        WHERE key_chain_id = ?
      `)
      const result = stmt.run(
        form.chain_name,
        form.private_key,
        form.public_key,
        form.chain_type,
        form.passphrase,
        form.key_chain_id
      )
      return {
        data: {
          message: result.changes > 0 ? 'success' : 'failed'
        }
      }
    } catch (error) {
      console.error('Chaterm database update keychain error:', error)
      throw error
    }
  }

  createAsset(params: any): any {
    try {
      const form = params
      if (!form) {
        throw new Error('No asset data provided')
      }

      // 生成UUID
      const uuid = uuidv4()

      // 准备插入语句
      const insertStmt = this.db.prepare(`
        INSERT INTO t_assets (
          label,
          asset_ip,
          uuid,
          auth_type,
          port,
          username,
          password,
          key_chain_id,
          group_name,
          favorite
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      // 执行插入
      const result = insertStmt.run(
        form.label || form.ip,
        form.ip,
        uuid,
        form.auth_type,
        form.port,
        form.username,
        form.password,
        form.keyChain,
        form.group_name,
        2
      )

      return {
        data: {
          message: result.changes > 0 ? 'success' : 'failed',
          uuid: uuid
        }
      }
    } catch (error) {
      console.error('Chaterm database create asset error:', error)
      throw error
    }
  }

  deleteAsset(uuid: string): any {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM t_assets
        WHERE uuid = ?
      `)
      const result = stmt.run(uuid)
      return {
        data: {
          message: result.changes > 0 ? 'success' : 'failed'
        }
      }
    } catch (error) {
      console.error('Chaterm database delete asset error:', error)
      throw error
    }
  }

  updateAsset(params: any): any {
    try {
      const form = params
      if (!form || !form.uuid) {
        throw new Error('No asset data or UUID provided')
      }

      const stmt = this.db.prepare(`
        UPDATE t_assets
        SET label = ?,
            asset_ip = ?,
            auth_type = ?,
            port = ?,
            username = ?,
            password = ?,
            key_chain_id = ?,
            group_name = ?
        WHERE uuid = ?
      `)

      const result = stmt.run(
        form.label || form.ip,
        form.ip,
        form.auth_type,
        form.port,
        form.username,
        form.password,
        form.keyChain,
        form.group_name,
        form.uuid
      )

      return {
        data: {
          message: result.changes > 0 ? 'success' : 'failed'
        }
      }
    } catch (error) {
      console.error('Chaterm database update asset error:', error)
      throw error
    }
  }

  getKeyChainList(): any {
    try {
      const stmt = this.db.prepare(`
        SELECT key_chain_id, chain_name, chain_type
        FROM t_asset_chains
        ORDER BY created_at
      `)
      const results = stmt.all() || []

      return {
        data: {
          keyChain: results.map((item: any) => ({
            key_chain_id: item.key_chain_id,
            chain_name: item.chain_name,
            chain_type: item.chain_type
          }))
        }
      }
    } catch (error) {
      console.error('Chaterm database get keychain error:', error)
      throw error
    }
  }
  connectAssetInfo(uuid: string): any {
    try {
      const stmt = this.db.prepare(`
        SELECT asset_ip, auth_type, port, username, password, key_chain_id
        FROM t_assets
        WHERE uuid = ?
      `)
      const result = stmt.get(uuid)
      if (result && result.auth_type === 'keyBased') {
        const keyChainStmt = this.db.prepare(`
          SELECT chain_private_key as privateKey, passphrase
          FROM t_asset_chains
          WHERE key_chain_id = ?
        `)
        result.key_chain_id
        const keyChainResult = keyChainStmt.get(result.key_chain_id)
        if (keyChainResult) {
          result.privateKey = keyChainResult.privateKey
          result.passphrase = keyChainResult.passphrase
        }
      }
      result.host = result.asset_ip
      return result
    } catch (error) {
      console.error('Chaterm database get asset error:', error)
      throw error
    }
  }
  // @获取用户主机列表
  getUserHosts(search: string): any {
    try {
      const safeSearch = search ?? '';
      const stmt = this.db.prepare(`
        SELECT asset_ip, uuid
        FROM t_assets
        WHERE asset_ip LIKE '${safeSearch}%'
        GROUP BY asset_ip
        LIMIT 10
      `)
      const results = stmt.all() || []
      return results.map((item: any) => ({
        host: item.asset_ip,
        uuid: item.uuid
      }))
    } catch (error) {
      console.error('Chaterm database get user hosts error:', error)
      throw error
    }
  }

  // 事务处理
  transaction(fn: () => void): any {
    return this.db.transaction(fn)()
  }

  // Agent API对话历史相关方法

 async deleteChatermHistoryByTaskId(taskId: string): Promise<void> {
    try {
      this.db.prepare(`DELETE FROM agent_api_conversation_history_v1 WHERE task_id = ?`).run(taskId)
      this.db.prepare(`DELETE FROM agent_ui_messages_v1 WHERE task_id = ?`).run(taskId)
      this.db.prepare(`DELETE FROM agent_task_metadata_v1 WHERE task_id = ?`).run(taskId)
      this.db.prepare(`DELETE FROM agent_context_history_v1 WHERE task_id = ?`).run(taskId)
    } catch (error) {
      console.error('Failed to delete API conversation history:', error)
    }
  }

  async getApiConversationHistory(taskId: string): Promise<any[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT content_data, role, content_type, tool_use_id, sequence_order
        FROM agent_api_conversation_history_v1 
        WHERE task_id = ? 
        ORDER BY sequence_order ASC
      `)
      const rows = stmt.all(taskId)

      // 重构为Anthropic.MessageParam格式
      const messages: any[] = []
      const messageMap = new Map()

      for (const row of rows) {
        const contentData = JSON.parse(row.content_data)

        if (row.role === 'user' || row.role === 'assistant') {
          const messageKey = `${row.role}_${row.sequence_order}`
          let existingMessage = messageMap.get(messageKey)

          if (!existingMessage) {
            existingMessage = { role: row.role, content: [] }
            messageMap.set(messageKey, existingMessage)
            messages.push(existingMessage)
          }

          if (row.content_type === 'text') {
            existingMessage.content.push({ type: 'text', text: contentData.text })
          } else if (row.content_type === 'tool_use') {
            existingMessage.content.push({
              type: 'tool_use',
              id: row.tool_use_id,
              name: contentData.name,
              input: contentData.input
            })
          } else if (row.content_type === 'tool_result') {
            existingMessage.content.push({
              type: 'tool_result',
              tool_use_id: row.tool_use_id,
              content: contentData.content,
              is_error: contentData.is_error
            })
          }
        }
      }

      return messages
    } catch (error) {
      console.error('Failed to get API conversation history:', error)
      return []
    }
  }

  async saveApiConversationHistory(taskId: string, apiConversationHistory: any[]): Promise<void> {
    try {
      // 首先清除现有记录（事务之外）
      const deleteStmt = this.db.prepare(
        'DELETE FROM agent_api_conversation_history_v1 WHERE task_id = ?'
      )
      deleteStmt.run(taskId)

      // 然后在一个新事务中插入所有记录
      this.db.transaction(() => {
        const insertStmt = this.db.prepare(`
          INSERT INTO agent_api_conversation_history_v1 
          (task_id, ts, role, content_type, content_data, tool_use_id, sequence_order)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)

        let sequenceOrder = 0
        const now = Date.now()

        for (const message of apiConversationHistory) {
          if (Array.isArray(message.content)) {
            for (const content of message.content) {
              const contentType = content.type
              let contentData = {}
              let toolUseId = null

              if (content.type === 'text') {
                contentData = { text: content.text }
              } else if (content.type === 'tool_use') {
                contentData = { name: content.name, input: content.input }
                toolUseId = content.id
              } else if (content.type === 'tool_result') {
                contentData = { content: content.content, is_error: content.is_error }
                toolUseId = content.tool_use_id
              }

              insertStmt.run(
                taskId,
                now,
                message.role,
                contentType,
                JSON.stringify(contentData),
                toolUseId,
                sequenceOrder++
              )
            }
          } else {
            // 处理简单文本消息
            insertStmt.run(
              taskId,
              now,
              message.role,
              'text',
              JSON.stringify({ text: message.content }),
              null,
              sequenceOrder++
            )
          }
        }
      })()
    } catch (error) {
      console.error('Failed to save API conversation history:', error)
      throw error // Re-throw the error to be caught by the IPC handler
    }
  }

  // Agent UI消息相关方法
  async getSavedChatermMessages(taskId: string): Promise<any[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT ts, type, ask_type, say_type, text, reasoning, images, partial, 
               last_checkpoint_hash, is_checkpoint_checked_out, is_operation_outside_workspace,
               conversation_history_index, conversation_history_deleted_range
        FROM agent_ui_messages_v1 
        WHERE task_id = ? 
        ORDER BY ts ASC
      `)
      const rows = stmt.all(taskId)

      return rows.map((row) => ({
        ts: row.ts,
        type: row.type,
        ask: row.ask_type,
        say: row.say_type,
        text: row.text,
        reasoning: row.reasoning,
        images: row.images ? JSON.parse(row.images) : undefined,
        partial: row.partial === 1,
        lastCheckpointHash: row.last_checkpoint_hash,
        isCheckpointCheckedOut: row.is_checkpoint_checked_out === 1,
        isOperationOutsideWorkspace: row.is_operation_outside_workspace === 1,
        conversationHistoryIndex: row.conversation_history_index,
        conversationHistoryDeletedRange: row.conversation_history_deleted_range
          ? JSON.parse(row.conversation_history_deleted_range)
          : undefined
      }))
    } catch (error) {
      console.error('Failed to get Cline messages:', error)
      return []
    }
  }

  async saveChatermMessages(taskId: string, uiMessages: any[]): Promise<void> {
    try {
      this.db.transaction(() => {
        // 清除现有记录
        const deleteStmt = this.db.prepare('DELETE FROM agent_ui_messages_v1 WHERE task_id = ?')
        deleteStmt.run(taskId)

        // 插入新记录
        const insertStmt = this.db.prepare(`
          INSERT INTO agent_ui_messages_v1 
          (task_id, ts, type, ask_type, say_type, text, reasoning, images, partial,
           last_checkpoint_hash, is_checkpoint_checked_out, is_operation_outside_workspace,
           conversation_history_index, conversation_history_deleted_range)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        for (const message of uiMessages) {
          insertStmt.run(
            taskId,
            message.ts,
            message.type,
            message.ask || null,
            message.say || null,
            message.text || null,
            message.reasoning || null,
            message.images ? JSON.stringify(message.images) : null,
            message.partial ? 1 : 0,
            message.lastCheckpointHash || null,
            message.isCheckpointCheckedOut ? 1 : 0,
            message.isOperationOutsideWorkspace ? 1 : 0,
            message.conversationHistoryIndex || null,
            message.conversationHistoryDeletedRange
              ? JSON.stringify(message.conversationHistoryDeletedRange)
              : null
          )
        }
      })()
    } catch (error) {
      console.error('Failed to save Cline messages:', error)
    }
  }

  // Agent任务元数据相关方法
  async getTaskMetadata(taskId: string): Promise<any> {
    try {
      const stmt = this.db.prepare(`
        SELECT files_in_context, model_usage, hosts
        FROM agent_task_metadata_v1 
        WHERE task_id = ?
      `)
      const row = stmt.get(taskId)

      if (row) {
        return {
          files_in_context: JSON.parse(row.files_in_context),
          model_usage: JSON.parse(row.model_usage),
          hosts: JSON.parse(row.hosts)
        }
      }

      return { files_in_context: [], model_usage: [], hosts: [] }
    } catch (error) {
      console.error('Failed to get task metadata:', error)
      return { files_in_context: [], model_usage: [], hosts: [] }
    }
  }

  async saveTaskMetadata(taskId: string, metadata: any): Promise<void> {
    try {
      const upsertStmt = this.db.prepare(`
        INSERT INTO agent_task_metadata_v1 (task_id, files_in_context, model_usage, hosts, updated_at)
        VALUES (?, ?, ?, ?, strftime('%s', 'now'))
        ON CONFLICT(task_id) DO UPDATE SET
          files_in_context = excluded.files_in_context,
          model_usage = excluded.model_usage,
          hosts = excluded.hosts,
          updated_at = strftime('%s', 'now')
      `)

      upsertStmt.run(
        taskId,
        JSON.stringify(metadata.files_in_context),
        JSON.stringify(metadata.model_usage),
        JSON.stringify(metadata.hosts)
      )
    } catch (error) {
      console.error('Failed to save task metadata:', error)
    }
  }

  // Agent上下文历史相关方法
  async getContextHistory(taskId: string): Promise<any> {
    try {
      const stmt = this.db.prepare(`
        SELECT context_history_data
        FROM agent_context_history_v1 
        WHERE task_id = ?
      `)
      const row = stmt.get(taskId)

      if (row) {
        return JSON.parse(row.context_history_data)
      }

      return null
    } catch (error) {
      console.error('Failed to get context history:', error)
      return null
    }
  }

  async saveContextHistory(taskId: string, contextHistory: any): Promise<void> {
    console.log('[saveContextHistory] Attempting to save. Task ID:', taskId, 'Type:', typeof taskId)
    let jsonDataString: string | undefined
    try {
      jsonDataString = JSON.stringify(contextHistory)
      console.log(
        '[saveContextHistory] JSON.stringify successful. Data:',
        jsonDataString,
        'Type:',
        typeof jsonDataString
      )
    } catch (stringifyError) {
      console.error('[saveContextHistory] Error during JSON.stringify:', stringifyError)
      console.error(
        '[saveContextHistory] Original contextHistory object that caused error:',
        contextHistory
      )
      if (stringifyError instanceof Error) {
        throw new Error(`Failed to stringify contextHistory: ${stringifyError.message}`)
      } else {
        throw new Error(`Failed to stringify contextHistory: ${String(stringifyError)}`)
      }
    }

    if (typeof jsonDataString !== 'string') {
      console.error(
        '[saveContextHistory] jsonDataString is not a string after stringify. Value:',
        jsonDataString
      )
      throw new Error('jsonDataString is not a string after JSON.stringify')
    }

    try {
      const upsertStmt = this.db.prepare(`
        INSERT INTO agent_context_history_v1 (task_id, context_history_data, updated_at)
        VALUES (?, ?, strftime('%s', 'now'))
        ON CONFLICT(task_id) DO UPDATE SET
          context_history_data = excluded.context_history_data,
          updated_at = strftime('%s', 'now')
      `)

      console.log(
        '[saveContextHistory] Executing upsert. Task ID:',
        taskId,
        'Data:',
        jsonDataString
      )
      upsertStmt.run(taskId, jsonDataString)
      console.log('[saveContextHistory] Upsert successful for Task ID:', taskId)
    } catch (error) {
      console.error(
        '[saveContextHistory] Failed to save context history to DB. Task ID:',
        taskId,
        'Error:',
        error
      )
      console.error('[saveContextHistory] Data that caused error:', jsonDataString)
      throw error
    }
  }
}

export class autoCompleteDatabaseService {
  private static instance: autoCompleteDatabaseService
  private db: Database.Database
  private commandCount: number = 0
  private lastEvictTime: number = 0

  private constructor(db: Database.Database) {
    this.db = db
    this.initEvictSystem()
  }
  private async initEvictSystem() {
    // 初始化淘汰配置
    const timeConfig = this.db
      .prepare(
        'SELECT evict_value, evict_current_value FROM linux_commands_evict WHERE evict_type = ?'
      )
      .get('time') as EvictConfig

    // 获取当前命令总数
    const currentCount = this.db
      .prepare('SELECT COUNT(*) as count FROM linux_commands_history')
      .get() as { count: number }
    this.commandCount = currentCount.count
    this.lastEvictTime = timeConfig.evict_current_value

    // 检查是否需要执行淘汰
    await this.checkAndEvict()
  }

  private async checkAndEvict() {
    const countConfig = this.db
      .prepare('SELECT evict_value FROM linux_commands_evict WHERE evict_type = ?')
      .get('count') as EvictConfig

    const timeConfig = this.db
      .prepare('SELECT evict_value FROM linux_commands_evict WHERE evict_type = ?')
      .get('time') as EvictConfig

    // 检查时间阈值
    const now = Math.floor(Date.now() / 1000)
    // 检查数量阈值
    if (this.commandCount >= countConfig.evict_value) {
      await this.evictCommands('count')
    } else if (now - this.lastEvictTime >= timeConfig.evict_value) {
      await this.evictCommands('time')
    }
  }

  /**
    删除逻辑是：
    满足任一条件的记录都会被删除：
    条件1：不在使用频率最高的(阈值-10000)条记录中
    条件2：符合时间淘汰规则（低频且旧 或 非常旧）
    具体来说，一条记录会被删除，如果它：
    不是最常用的(阈值-10000)条记录之一
    或者 使用次数少于2次且超过两个月没使用
    或者 超过一年没有使用
   */
  private async evictCommands(evictType: 'count' | 'time') {
    console.log(`Starting command eviction by ${evictType}`)
    this.db.transaction(() => {
      const secondMonthsAgo = Math.floor(Date.now() / 1000) - 60 * 24 * 60 * 60
      const oneYearAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60

      const deleteStmt = this.db.prepare(`
      DELETE FROM linux_commands_history
      WHERE id NOT IN (
          SELECT id FROM linux_commands_history
          ORDER BY count DESC, update_time DESC
          LIMIT (
              SELECT evict_value - 10000
              FROM linux_commands_evict
              WHERE evict_type = 'count'
          )
      )
      OR (
          (count < 2 AND CAST(strftime('%s', update_time) AS INTEGER) < ?)
          OR (CAST(strftime('%s', update_time) AS INTEGER) < ?)
      ) `)

      const result = deleteStmt.run(secondMonthsAgo, oneYearAgo)
      // 获取删除后的命令总数
      const currentCount = this.db
        .prepare('SELECT COUNT(*) as count FROM linux_commands_history')
        .get() as { count: number }
      this.commandCount = currentCount.count
      this.lastEvictTime = Math.floor(Date.now() / 1000)
      // 更新淘汰配置表
      this.db
        .prepare('UPDATE linux_commands_evict SET evict_current_value = ? WHERE evict_type = ?')
        .run(this.commandCount, 'count')

      this.db
        .prepare('UPDATE linux_commands_evict SET evict_current_value = ? WHERE evict_type = ?')
        .run(this.lastEvictTime, 'time')

      console.log(`Evicted ${result.changes} commands. Current count: ${this.commandCount}`)
    })()
  }

  public static async getInstance(): Promise<autoCompleteDatabaseService> {
    if (!autoCompleteDatabaseService.instance) {
      const db = await initDatabase()
      autoCompleteDatabaseService.instance = new autoCompleteDatabaseService(db)
    }
    return autoCompleteDatabaseService.instance
  }

  private isValidCommand(command: string): boolean {
    // 去除首尾空格
    command = command.trim()

    // 空命令
    if (!command) return false

    // 命令长度限制 (1-255字符)
    if (command.length < 1 || command.length > 255) return false

    // 不允许以数字开头
    if (/^\d/.test(command)) return false

    // 不允许以这些特殊字符开头
    const invalidStartChars = /^[!@#$%^&*()+=\-[\]{};:'"\\|,.<>?~`]/
    if (invalidStartChars.test(command)) return false
    // 不允许起始位置有连续三个及以上相同的字符
    if (/^(.)\1{2,}/.test(command)) return false

    // 不允许包含这些危险字符组合
    const dangerousPatterns = [
      /rm\s+-rf\s+\//, // 删除根目录
      />[>&]?\/dev\/sd[a-z]/, // 写入磁盘设备（保留必要转义）
      /mkfs\./, // 格式化命令（保留必要转义）
      /dd\s+if=.*of=\/dev\/sd[a-z]/, // DD写入磁盘
      /:\(\)\{\s*:\|:&\s*\};:/ // Fork炸弹
    ]

    if (dangerousPatterns.some((pattern) => pattern.test(command))) return false

    // 基本的命令格式验证
    const validCommandFormat = /^[a-zA-Z_][a-zA-Z0-9_\-./\s]*$/ // 移除了不必要的转义字符
    if (!validCommandFormat.test(command)) return false

    return true
  }

  queryCommand(command: string, ip: string) {
    // 对于输入命令长度小于2的情况，直接返回空数组
    if (command.length < 2) {
      return []
    }
    command = command + '%'
    let results: CommandResult[] = []
    const limit = 6
    // 首先查询 linux_commands_history 当前IP的历史记录
    const historyStmt = this.db.prepare(
      'SELECT DISTINCT command FROM linux_commands_history WHERE command LIKE ? AND ip = ? ORDER BY count DESC LIMIT ?'
    )
    const historyResults = historyStmt.all(command, ip, limit) as CommandResult[]
    results = results.concat(historyResults)

    if (results.length < limit) {
      const remainingLimit = limit - results.length
      // 查询其他IP的历史记录
      const otherIpStmt = this.db.prepare(
        'SELECT DISTINCT command FROM linux_commands_history WHERE command LIKE ? AND ip != ? ORDER BY count DESC LIMIT ?'
      )
      const otherIpResults = otherIpStmt.all(command, ip, remainingLimit) as CommandResult[]
      results = results.concat(otherIpResults)
    }

    // 如果仍然少于limit条，查询通用命令
    if (results.length < limit) {
      const finalLimit = limit - results.length
      const commonStmt = this.db.prepare(
        'SELECT command FROM linux_commands_common WHERE command LIKE ? LIMIT ?'
      )
      const commonResults = commonStmt.all(command, finalLimit) as CommandResult[]
      results = results.concat(commonResults)
    }
    // 提取命令列表并去重
    return [...new Set(results.map((r) => r.command))]
  }

  insertCommand(command: string, ip: string) {
    if (!this.isValidCommand(command)) {
      return {}
    }

    const result = this.db.transaction(() => {
      const selectStmt = this.db.prepare(
        'SELECT id, count FROM linux_commands_history WHERE command = ? AND ip = ?'
      )
      const existing = selectStmt.get(command, ip)

      let insertResult: any
      if (existing) {
        const updateStmt = this.db.prepare(
          'UPDATE linux_commands_history SET count = count + 1, update_time = CURRENT_TIMESTAMP WHERE id = ?'
        )
        insertResult = updateStmt.run(existing.id)
      } else {
        const insertStmt = this.db.prepare(
          'INSERT INTO linux_commands_history (command, cmd_length, ip) VALUES (?, ?, ?)'
        )
        const cmdLength = command.length
        insertResult = insertStmt.run(command, cmdLength, ip)
        this.commandCount++
      }

      // 检查是否需要执行淘汰
      this.checkAndEvict()
      return insertResult
    })()
    return result
  }
}

// 导出连接资产信息的便捷函数
export async function connectAssetInfo(uuid: string): Promise<any> {
  const service = await ChatermDatabaseService.getInstance()
  return service.connectAssetInfo(uuid)
}
