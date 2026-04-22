import Database from 'better-sqlite3'
import type { TaskListItem } from '../../../agent/core/context/context-tracking/ContextTrackerTypes'
import type { ChatermMessage, ChatermMessagesPage } from '../../../agent/shared/ExtensionMessage'
const logger = createLogger('db')

interface HistoryPageOptions {
  beforeCursor?: number | null
  limit?: number
}

export async function deleteChatermHistoryByTaskIdLogic(db: Database.Database, taskId: string): Promise<void> {
  try {
    db.prepare(`DELETE FROM agent_api_conversation_history_v1 WHERE task_id = ?`).run(taskId)
    db.prepare(`DELETE FROM agent_ui_messages_v1 WHERE task_id = ?`).run(taskId)
    db.prepare(`DELETE FROM agent_task_metadata_v1 WHERE task_id = ?`).run(taskId)
    db.prepare(`DELETE FROM agent_context_history_v1 WHERE task_id = ?`).run(taskId)
  } catch (error) {
    logger.error('Failed to delete API conversation history', { error: error })
  }
}

export async function getApiConversationHistoryLogic(db: Database.Database, taskId: string): Promise<any[]> {
  try {
    const stmt = db.prepare(`
        SELECT content_data, role, content_type, tool_use_id, sequence_order, message_index
        FROM agent_api_conversation_history_v1 
        WHERE task_id = ? 
        ORDER BY sequence_order ASC
      `)
    const rows = stmt.all(taskId)

    // Refactor to Anthropic.MessageParam format
    const messages: any[] = []
    const messageMap = new Map()

    for (const row of rows) {
      const contentData = JSON.parse(row.content_data)

      if (row.role === 'user' || row.role === 'assistant') {
        // Use message_index to group content blocks of the same message
        // Fall back to sequence_order for backward compatibility with old data
        const msgIdx = row.message_index ?? row.sequence_order
        const messageKey = `${row.role}_${msgIdx}`
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
    logger.error('Failed to get API conversation history', { error: error })
    return []
  }
}

export async function saveApiConversationHistoryLogic(db: Database.Database, taskId: string, apiConversationHistory: any[]): Promise<void> {
  try {
    // First clear existing records (outside transaction)
    const deleteStmt = db.prepare('DELETE FROM agent_api_conversation_history_v1 WHERE task_id = ?')
    deleteStmt.run(taskId)

    // Then insert all records in a new transaction
    db.transaction(() => {
      const insertStmt = db.prepare(`
          INSERT INTO agent_api_conversation_history_v1 
          (task_id, ts, role, content_type, content_data, tool_use_id, sequence_order, message_index)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)

      let sequenceOrder = 0
      let messageIndex = 0
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

            // message_index groups content blocks of the same message
            insertStmt.run(taskId, now, message.role, contentType, JSON.stringify(contentData), toolUseId, sequenceOrder++, messageIndex)
          }
        } else {
          // Handle simple text messages
          insertStmt.run(taskId, now, message.role, 'text', JSON.stringify({ text: message.content }), null, sequenceOrder++, messageIndex)
        }
        messageIndex++
      }
    })()
  } catch (error) {
    logger.error('Failed to save API conversation history', { error: error })
    throw error // Re-throw the error to be caught by the IPC handler
  }
}

// Agent UI message related methods
export async function getSavedChatermMessagesLogic(db: Database.Database, taskId: string): Promise<any[]> {
  try {
    const stmt = db.prepare(`
        SELECT ts, type, ask_type, say_type, text, content_parts, reasoning, images, partial,
               last_checkpoint_hash, is_checkpoint_checked_out, is_operation_outside_workspace,
               conversation_history_index, conversation_history_deleted_range, mcp_tool_call_data,
               hosts
        FROM agent_ui_messages_v1
        WHERE task_id = ?
        ORDER BY ts ASC
      `)
    const rows = stmt.all(taskId)

    return getSavedChatermMessagesLogicFromRows(rows)
  } catch (error) {
    logger.error('Failed to get Cline messages', { error: error })
    return []
  }
}

export async function getSavedChatermMessagesPageLogic(
  db: Database.Database,
  taskId: string,
  options: HistoryPageOptions = {}
): Promise<ChatermMessagesPage> {
  const limit = Math.max(1, Math.min(options.limit ?? 40, 200))
  const beforeCursor = typeof options.beforeCursor === 'number' ? options.beforeCursor : null

  try {
    const baseQuery = `
      SELECT id, ts, type, ask_type, say_type, text, content_parts, reasoning, images, partial,
             last_checkpoint_hash, is_checkpoint_checked_out, is_operation_outside_workspace,
             conversation_history_index, conversation_history_deleted_range, mcp_tool_call_data,
             hosts
      FROM agent_ui_messages_v1
      WHERE task_id = ?
    `
    const paginationClause = beforeCursor != null ? 'AND id < ?' : ''
    const orderAndLimitClause = 'ORDER BY id DESC LIMIT ?'
    const stmt = db.prepare(`${baseQuery} ${paginationClause} ${orderAndLimitClause}`)
    const rows = beforeCursor != null ? stmt.all(taskId, beforeCursor, limit + 1) : stmt.all(taskId, limit + 1)

    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows
    const oldestRow = pageRows[pageRows.length - 1] as { id?: number } | undefined
    const nextCursor = hasMore && typeof oldestRow?.id === 'number' ? oldestRow.id : null

    const messages = (await getSavedChatermMessagesLogicFromRows(pageRows)).reverse()

    return {
      messages,
      nextCursor,
      hasMore
    }
  } catch (error) {
    logger.error('Failed to get paged Cline messages', { error: error })
    return {
      messages: [],
      nextCursor: null,
      hasMore: false
    }
  }
}

async function getSavedChatermMessagesLogicFromRows(rows: Array<Record<string, any>>): Promise<ChatermMessage[]> {
  return rows.map((row) => {
    let hosts: any[] | undefined = undefined
    if (row.hosts) {
      try {
        const parsed = JSON.parse(row.hosts)
        if (Array.isArray(parsed)) {
          hosts = parsed
        }
      } catch (e) {
        const hostStrings = row.hosts.split(',').filter(Boolean)
        hosts = hostStrings.map((ip: string) => ({
          host: ip.trim(),
          uuid: ip.trim(),
          connection: 'personal'
        }))
      }
    }

    return {
      ts: row.ts,
      type: row.type,
      ask: row.ask_type,
      say: row.say_type,
      text: row.text,
      contentParts: row.content_parts ? JSON.parse(row.content_parts) : undefined,
      reasoning: row.reasoning,
      images: row.images ? JSON.parse(row.images) : undefined,
      partial: row.partial === 1,
      lastCheckpointHash: row.last_checkpoint_hash,
      isCheckpointCheckedOut: row.is_checkpoint_checked_out === 1,
      isOperationOutsideWorkspace: row.is_operation_outside_workspace === 1,
      conversationHistoryIndex: row.conversation_history_index,
      conversationHistoryDeletedRange: row.conversation_history_deleted_range ? JSON.parse(row.conversation_history_deleted_range) : undefined,
      mcpToolCall: row.mcp_tool_call_data ? JSON.parse(row.mcp_tool_call_data) : undefined,
      hosts
    }
  })
}

export async function saveChatermMessagesLogic(db: Database.Database, taskId: string, uiMessages: any[]): Promise<void> {
  try {
    db.transaction(() => {
      // Clear existing records
      const deleteStmt = db.prepare('DELETE FROM agent_ui_messages_v1 WHERE task_id = ?')
      deleteStmt.run(taskId)

      // Insert new records
      const insertStmt = db.prepare(`
          INSERT INTO agent_ui_messages_v1
          (task_id, ts, type, ask_type, say_type, text, content_parts, reasoning, images, partial,
           last_checkpoint_hash, is_checkpoint_checked_out, is_operation_outside_workspace,
           conversation_history_index, conversation_history_deleted_range, mcp_tool_call_data,
           hosts)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

      for (const message of uiMessages) {
        // Serialize hosts array to JSON string to store complete Host objects
        const hostsStr = message.hosts && message.hosts.length > 0 ? JSON.stringify(message.hosts) : null

        insertStmt.run(
          taskId,
          message.ts,
          message.type,
          message.ask || null,
          message.say || null,
          message.text ?? null,
          message.contentParts ? JSON.stringify(message.contentParts) : null,
          message.reasoning || null,
          message.images ? JSON.stringify(message.images) : null,
          message.partial ? 1 : 0,
          message.lastCheckpointHash || null,
          message.isCheckpointCheckedOut ? 1 : 0,
          message.isOperationOutsideWorkspace ? 1 : 0,
          message.conversationHistoryIndex || null,
          message.conversationHistoryDeletedRange ? JSON.stringify(message.conversationHistoryDeletedRange) : null,
          message.mcpToolCall ? JSON.stringify(message.mcpToolCall) : null,
          hostsStr
        )
      }
    })()
  } catch (error) {
    logger.error('Failed to save Cline messages', { error: error })
    throw error
  }
}

// Agent task metadata related methods
export async function getTaskMetadataLogic(db: Database.Database, taskId: string): Promise<any> {
  try {
    const stmt = db.prepare(`
        SELECT files_in_context, model_usage, hosts, todos, experience_ledger, title, favorite
        FROM agent_task_metadata_v1
        WHERE task_id = ?
      `)
    const row = stmt.get(taskId)

    if (row) {
      return {
        files_in_context: JSON.parse(row.files_in_context || '[]'),
        model_usage: JSON.parse(row.model_usage || '[]'),
        hosts: JSON.parse(row.hosts || '[]'),
        todos: row.todos ? JSON.parse(row.todos) : [],
        experience_ledger: row.experience_ledger ? JSON.parse(row.experience_ledger) : [],
        title: row.title || undefined,
        favorite: row.favorite === 1
      }
    }

    return { files_in_context: [], model_usage: [], hosts: [], todos: [], experience_ledger: [], title: undefined, favorite: false }
  } catch (error) {
    logger.error('Failed to get task metadata', { error: error })
    return { files_in_context: [], model_usage: [], hosts: [], todos: [], experience_ledger: [], title: undefined, favorite: false }
  }
}

export async function saveTaskMetadataLogic(db: Database.Database, taskId: string, metadata: any): Promise<void> {
  try {
    const upsertStmt = db.prepare(`
        INSERT INTO agent_task_metadata_v1 (task_id, files_in_context, model_usage, hosts, todos, experience_ledger, title, favorite)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET
          files_in_context = excluded.files_in_context,
          model_usage = excluded.model_usage,
          hosts = excluded.hosts,
          todos = excluded.todos,
          experience_ledger = excluded.experience_ledger,
          title = CASE WHEN excluded.title IS NOT NULL THEN excluded.title ELSE agent_task_metadata_v1.title END,
          favorite = CASE WHEN excluded.favorite IS NOT NULL THEN excluded.favorite ELSE agent_task_metadata_v1.favorite END
      `)

    upsertStmt.run(
      taskId,
      JSON.stringify(metadata.files_in_context || []),
      JSON.stringify(metadata.model_usage || []),
      JSON.stringify(metadata.hosts || []),
      JSON.stringify(metadata.todos || []),
      JSON.stringify(metadata.experience_ledger || []),
      metadata.title !== undefined ? metadata.title : null,
      metadata.favorite !== undefined ? (metadata.favorite ? 1 : 0) : null
    )
  } catch (error) {
    logger.error('Failed to save task metadata', { error: error })
  }
}

export async function saveTaskTitleLogic(db: Database.Database, taskId: string, title: string): Promise<void> {
  try {
    const nowSec = Math.floor(Date.now() / 1000)
    const result = db
      .prepare(
        `
      UPDATE agent_task_metadata_v1
      SET title = ?, updated_at = ?
      WHERE task_id = ?
    `
      )
      .run(title, nowSec, taskId)

    if (result.changes === 0) {
      logger.warn('saveTaskTitle skipped: metadata row not found', { taskId })
    }
  } catch (error) {
    logger.error('Failed to save task title', { error })
  }
}

// Favorite toggle should not change conversation ordering timestamp.
export async function saveTaskFavoriteLogic(db: Database.Database, taskId: string, favorite: boolean): Promise<void> {
  try {
    const result = db
      .prepare(
        `
      UPDATE agent_task_metadata_v1
      SET favorite = ?
      WHERE task_id = ?
    `
      )
      .run(favorite ? 1 : 0, taskId)

    if (result.changes === 0) {
      logger.warn('saveTaskFavorite skipped: metadata row not found', { taskId })
    }
  } catch (error) {
    logger.error('Failed to save task favorite', { error })
  }
}

// Task list query - replaces global_taskHistory as data source
export async function getTaskListLogic(db: Database.Database): Promise<TaskListItem[]> {
  try {
    const rows = db
      .prepare(
        `
      SELECT task_id, title, favorite, created_at, updated_at, hosts
      FROM agent_task_metadata_v1
      ORDER BY updated_at DESC
    `
      )
      .all() as Array<{
      task_id: string
      title: string | null
      favorite: number
      created_at: number
      updated_at: number
      hosts: string | null
    }>

    return rows.map((row) => {
      let hosts: Array<{ host: string; uuid: string; connection: string }> = []
      if (row.hosts) {
        try {
          const parsed = JSON.parse(row.hosts)
          if (Array.isArray(parsed)) {
            hosts = parsed
          }
        } catch {
          // Backward compatibility: comma-separated IP strings
          const hostStrings = row.hosts.split(',').filter(Boolean)
          hosts = hostStrings.map((ip: string) => ({
            host: ip.trim(),
            uuid: '',
            connection: ''
          }))
        }
      }
      return {
        id: row.task_id,
        title: row.title || null,
        favorite: row.favorite === 1,
        // DB stores seconds; renderer Date() expects milliseconds
        createdAt: row.created_at * 1000,
        updatedAt: row.updated_at * 1000,
        hosts
      }
    })
  } catch (error) {
    logger.error('Failed to get task list', { error })
    return []
  }
}

// Ensure metadata row exists on task creation with initial title.
// Uses UPSERT instead of INSERT OR IGNORE: if touchTaskUpdatedAt races ahead
// and creates a title-less row, this will still fill in the initial title.
export async function ensureTaskMetadataExistsLogic(db: Database.Database, taskId: string, initialTitle?: string): Promise<void> {
  try {
    db.prepare(
      `
      INSERT INTO agent_task_metadata_v1 (task_id, title, updated_at)
      VALUES (?, ?, strftime('%s', 'now'))
      ON CONFLICT(task_id) DO UPDATE SET
        title = CASE
          WHEN agent_task_metadata_v1.title IS NULL OR agent_task_metadata_v1.title = ''
          THEN excluded.title
          ELSE agent_task_metadata_v1.title
        END
    `
    ).run(taskId, initialTitle || null)
  } catch (error) {
    logger.error('Failed to ensure task metadata exists', { error })
  }
}

// Keep conversation ordering fresh by bumping metadata.updated_at on message save.
export async function touchTaskUpdatedAtLogic(db: Database.Database, taskId: string): Promise<void> {
  try {
    db.prepare(
      `
      INSERT INTO agent_task_metadata_v1 (task_id, updated_at)
      VALUES (?, strftime('%s', 'now'))
      ON CONFLICT(task_id) DO UPDATE SET
        updated_at = strftime('%s', 'now')
    `
    ).run(taskId)
  } catch (error) {
    logger.error('Failed to touch task updated_at', { error })
  }
}

// Agent context history related methods
export async function getContextHistoryLogic(db: Database.Database, taskId: string): Promise<any> {
  try {
    const stmt = db.prepare(`
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
    logger.error('Failed to get context history', { error: error })
    return null
  }
}

export async function saveContextHistoryLogic(db: Database.Database, taskId: string, contextHistory: any): Promise<void> {
  logger.info('[saveContextHistory] Attempting to save', { taskId, type: typeof taskId })
  let jsonDataString: string | undefined
  try {
    jsonDataString = JSON.stringify(contextHistory)
    logger.info('[saveContextHistory] JSON.stringify successful', { dataLength: jsonDataString?.length, type: typeof jsonDataString })
  } catch (stringifyError) {
    logger.error('[saveContextHistory] Error during JSON.stringify', {
      error: stringifyError
    })
    logger.error('[saveContextHistory] Original contextHistory object that caused error', {
      error: contextHistory
    })
    if (stringifyError instanceof Error) {
      throw new Error(`Failed to stringify contextHistory: ${stringifyError.message}`)
    } else {
      throw new Error(`Failed to stringify contextHistory: ${String(stringifyError)}`)
    }
  }

  if (typeof jsonDataString !== 'string') {
    logger.error('[saveContextHistory] jsonDataString is not a string after stringify', { value: String(jsonDataString) })
    throw new Error('jsonDataString is not a string after JSON.stringify')
  }

  try {
    const upsertStmt = db.prepare(`
        INSERT INTO agent_context_history_v1 (task_id, context_history_data, updated_at)
        VALUES (?, ?, strftime('%s', 'now'))
        ON CONFLICT(task_id) DO UPDATE SET
          context_history_data = excluded.context_history_data,
          updated_at = strftime('%s', 'now')
      `)

    logger.info('[saveContextHistory] Executing upsert', { taskId })
    upsertStmt.run(taskId, jsonDataString)
    logger.info('[saveContextHistory] Upsert successful for Task ID', { value: taskId })
  } catch (error) {
    logger.error('[saveContextHistory] Failed to save context history to DB', {
      taskId,
      error: error
    })
    logger.error('[saveContextHistory] Data that caused error', { dataLength: jsonDataString?.length })
    throw error
  }
}
